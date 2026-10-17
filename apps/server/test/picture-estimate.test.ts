import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import type { AiProvider } from '@volume/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockAiAdapter, MOCK_COST_PER_CALL_USD } from '../src/adapters/mock-ai.js';
import { createOpenRouterAi, IMAGE_OUTPUT_TOKENS, imagePriceUsd } from '../src/adapters/openrouter-ai.js';
import { storyInput } from '../src/jobs/picture-book.js';
import { IMAGE_HIGH_ESTIMATE_USD } from '../src/jobs/runner.js';
import type { AiPort, AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { str, testApp, type TestApp } from './helpers.js';

/**
 * Picture books: the gentle problem (template storyRules.conflict) reaches the story stage as {{story.conflict}}, and
 * POST /books/:id/picture-book/estimate prices a run (three text stages, one picture per spread and per main character)
 * from the AI port's estimate and the model list's image prices. Mock AI only, no network.
 */

type Obj = Record<string, unknown>;
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const IMAGE_MODEL = 'test/image-model';

async function pictureBook(t: TestApp, over: Obj = {}): Promise<string> {
  const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Nell Ashby', bioThirdPerson: 'Nell Ashby writes gentle bedtime stories.' });
  const b = await t.call<Obj>('POST', '/api/v1/books', {
    profileId: str(p.body['id']),
    idea: 'A small rabbit learns to be brave on a walk at dusk',
    title: 'Pip and the Quiet Meadow',
    bookTypeId: 'picture-book',
    ...over,
  });
  expect(b.status).toBe(201);
  return str(b.body['id']);
}

interface Estimate {
  lowUsd: number;
  highUsd: number;
  calls: number;
  spreads: number;
  characters: number;
  text: { lowUsd: number; highUsd: number; model: string | null };
  image: { lowUsd: number; highUsd: number; model: string | null; priced: boolean };
}

describe('imagePriceUsd', () => {
  const base = {
    inputPerMillion: 1,
    outputPerMillion: 5,
    imageInputPerMillion: null,
    imageOutputPerMillion: null,
    webSearchPerRequest: null,
    perRequest: null,
  };
  it('uses the request price when the model has one', () => {
    expect(imagePriceUsd({ ...base, perRequest: 0.05, imageOutputPerMillion: 30 }, '2K')).toBe(0.05);
  });
  it('else the image output price times the tokens one image uses at that resolution', () => {
    expect(imagePriceUsd({ ...base, imageOutputPerMillion: 30 }, '2K')).toBeCloseTo((30 * (IMAGE_OUTPUT_TOKENS['2K'] ?? 0)) / 1_000_000, 8);
    expect(imagePriceUsd({ ...base, imageOutputPerMillion: 30 }, '1K')).toBeCloseTo(0.0387, 8);
  });
  it('is null with no price', () => {
    expect(imagePriceUsd(undefined, '2K')).toBeNull();
    expect(imagePriceUsd(base, '2K')).toBeNull();
  });
});

describe('OpenRouter adapter: estimateImage', () => {
  interface MockLike {
    listModels(): Promise<unknown[]>;
  }
  const pkg = VolumeAi as unknown as {
    MockProvider: new (opts: { chunkDelayMs?: number; models?: unknown[] }) => MockLike;
    mockModelInfo: (slug: string) => unknown;
  };
  async function adapter() {
    const mock = new pkg.MockProvider({ chunkDelayMs: 0, models: [pkg.mockModelInfo(IMAGE_MODEL)] });
    const provider = {
      name: 'openrouter' as const,
      chat: () => Promise.reject(new Error('no chat in this test')),
      generateImage: () => Promise.reject(new Error('no images in this test')),
      listModels: () => mock.listModels(),
      keyStatus: () => Promise.resolve({ valid: true, label: null, limitUsd: null, limitRemainingUsd: null, usageUsd: null, isFreeTier: null }),
    };
    return createOpenRouterAi({ promptsDir: join(ROOT, 'prompts'), configDir: join(ROOT, 'config'), provider: provider as unknown as AiProvider });
  }

  it('prices the image model from the model list at the configured resolution (2K)', async () => {
    const ai = await adapter();
    const e = await ai.estimateImage({ model: IMAGE_MODEL });
    // mockModelInfo: image_output $30 per million; the config defaults' fallbacks are not in this list.
    const want = (30 * (IMAGE_OUTPUT_TOKENS['2K'] ?? 0)) / 1_000_000;
    expect(e).toMatchObject({ model: IMAGE_MODEL, priced: true });
    expect(e.lowUsd).toBeCloseTo(want, 8);
    expect(e.highUsd).toBeCloseTo(want, 8);
  });

  it('says so when no model in the chain has a price', async () => {
    const ai = await adapter();
    expect(await ai.estimateImage({ model: 'test/unlisted' })).toMatchObject({ priced: false, lowUsd: 0, highUsd: 0 });
  });
});

describe('story input: the gentle problem', () => {
  it('goes as its own conflict field and leaves the topic alone', () => {
    const out = storyInput({ story: { topic: 'Pip walks home', conflict: 'Pip cannot find his scarf.' } }, null, null, 10);
    expect(out['topic']).toBe('Pip walks home');
    expect(out['conflict']).toBe('Pip cannot find his scarf');
    const fromIdea = storyInput({ story: { conflict: 'A lost scarf' } }, null, 'The idea', 10);
    expect(fromIdea).toMatchObject({ topic: 'The idea', conflict: 'A lost scarf' });
    expect(storyInput({ story: { topic: 'Only a topic' } }, null, null, 10)).not.toHaveProperty('conflict');
    expect(storyInput({ story: { topic: 'Blank', conflict: '  ' } }, null, null, 10)).not.toHaveProperty('conflict');
  });
});

describe('POST /books/:id/picture-book with a conflict', () => {
  let t: TestApp;
  const stories: Obj[] = [];
  beforeAll(async () => {
    class Recording extends MockAiAdapter {
      override runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
        if (stage === 'picture_story') stories.push(input.variables['story'] as Obj);
        return super.runStage(stage, input, opts);
      }
    }
    t = await testApp({ ai: new Recording() });
  });
  afterAll(async () => t.close());

  it('saves the conflict and passes it to the story stage as its own field', async () => {
    const id = await pictureBook(t);
    const start = await t.call('POST', `/api/v1/books/${id}/picture-book`, {
      story: { topic: 'Pip walks home at dusk', conflict: 'Pip cannot find his scarf' },
    });
    expect(start.status).toBe(202);
    await t.services.runner.runUntilIdle();
    expect(stories).toHaveLength(1);
    expect(stories[0]).toMatchObject({ topic: 'Pip walks home at dusk', conflict: 'Pip cannot find his scarf' });
    const view = await t.call<{ story: Obj }>('GET', `/api/v1/books/${id}/spreads`);
    expect(view.body.story).toMatchObject({ topic: 'Pip walks home at dusk', conflict: 'Pip cannot find his scarf' });
  });

  it('refuses a conflict that is too long', async () => {
    const id = await pictureBook(t);
    const r = await t.call('POST', `/api/v1/books/${id}/picture-book`, { story: { conflict: 'x'.repeat(501) } });
    expect(r.status).toBe(400);
  });
});

describe('POST /books/:id/picture-book/estimate', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await testApp();
  });
  afterAll(async () => t.close());

  const text = { low: 3 * MOCK_COST_PER_CALL_USD, high: 3 * MOCK_COST_PER_CALL_USD * 1.5 };

  it('prices a new book from the page plan and the template character default', async () => {
    const id = await pictureBook(t);
    const r = await t.call<Estimate>('POST', `/api/v1/books/${id}/picture-book/estimate`, {});
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ spreads: 10, characters: 2, calls: 15, image: { priced: true, lowUsd: MOCK_COST_PER_CALL_USD } });
    expect(r.body.text.lowUsd).toBeCloseTo(text.low, 6);
    expect(r.body.lowUsd).toBeCloseTo(text.low + 12 * MOCK_COST_PER_CALL_USD, 6);
    // The high end per picture is what the job reserves (imageReservationUsd), never the bare listed price.
    expect(r.body.image.highUsd).toBeCloseTo(IMAGE_HIGH_ESTIMATE_USD, 6);
    expect(r.body.highUsd).toBeCloseTo(text.high + 12 * IMAGE_HIGH_ESTIMATE_USD, 6);
  });

  it('takes spreads and characters from the body, and from the book after a run', async () => {
    const id = await pictureBook(t);
    const r = await t.call<Estimate>('POST', `/api/v1/books/${id}/picture-book/estimate`, { spreads: 12, characters: 1 });
    expect(r.body).toMatchObject({ spreads: 12, characters: 1, calls: 16 });
    await t.call('POST', `/api/v1/books/${id}/picture-book`, {});
    await t.services.runner.runUntilIdle();
    const after = await t.call<Estimate>('POST', `/api/v1/books/${id}/picture-book/estimate`);
    expect(after.status).toBe(200);
    // The mock story has ten spreads and one main character (Pip).
    expect(after.body).toMatchObject({ spreads: 10, characters: 1 });
  });

  it('validates the body and refuses a book that is not a picture book', async () => {
    const id = await pictureBook(t);
    expect((await t.call('POST', `/api/v1/books/${id}/picture-book/estimate`, { spreads: 40 })).status).toBe(400);
    // The range comes from config/book-templates/picture-book.json (spreads.count 8 to 16).
    const over = await t.call<{ error: { details: Obj } }>('POST', `/api/v1/books/${id}/picture-book/estimate`, { spreads: 17 });
    expect(over.status).toBe(400);
    expect(over.body.error.details).toMatchObject({ min: 8, max: 16 });
    expect((await t.call('POST', `/api/v1/books/${id}/picture-book/estimate`, { spreads: 7 })).status).toBe(400);
    expect((await t.call('POST', `/api/v1/books/${id}/picture-book`, { spreads: 17 })).status).toBe(400);
    expect((await t.call('POST', `/api/v1/books/${id}/picture-book/estimate`, { extra: 1 })).status).toBe(400);
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Other', bioThirdPerson: 'Other writes.' });
    const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: str(p.body['id']), idea: 'Calm mornings' });
    expect((await t.call('POST', `/api/v1/books/${str(b.body['id'])}/picture-book/estimate`, {})).status).toBe(409);
  });
});

describe('estimate with an AI that cannot price pictures', () => {
  it("falls back to the job's budget reservation per picture and says it is not priced", async () => {
    const inner = new MockAiAdapter();
    const ai: AiPort = {
      provider: 'mock',
      runStage: (stage, input, opts) => inner.runStage(stage, input, opts),
      generateImage: (prompt, opts) => inner.generateImage(prompt, opts),
      estimate: () => inner.estimate(),
    };
    const t = await testApp({ ai });
    try {
      const id = await pictureBook(t);
      const r = await t.call<Estimate>('POST', `/api/v1/books/${id}/picture-book/estimate`, { spreads: 8, characters: 2 });
      expect(r.body.image).toMatchObject({ priced: false, lowUsd: IMAGE_HIGH_ESTIMATE_USD, highUsd: IMAGE_HIGH_ESTIMATE_USD });
      expect(r.body.highUsd).toBeCloseTo(r.body.text.highUsd + 10 * IMAGE_HIGH_ESTIMATE_USD, 6);
    } finally {
      await t.close();
    }
  });
});
