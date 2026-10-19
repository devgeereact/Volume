// Second live acceptance run, 19 October 2026: matter.back-cover v7 and matter.amazon-description v6 were never called
// by any job, so the listing came only from the blueprint drafts. The listing job runs the matter stage (AI-PIPELINE
// stage 7) after write_book and from POST /books/:id/listing. Mock provider only, no network.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import type { AiProvider } from '@volume/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { createOpenRouterAi, type OpenRouterAiAdapter } from '../src/adapters/openrouter-ai.js';
import { buildExportBook } from '../src/jobs/book-data.js';
import type { AiPort, AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { str, testApp, type TestApp } from './helpers.js';

type Obj = Record<string, unknown>;
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROMPTS = join(ROOT, 'prompts');
const CONFIG = join(ROOT, 'config');
const MODEL = 'test/model';

interface Req {
  model: string;
  messages: { role: string; content: string }[];
  meta?: { promptId?: string };
}
interface MockLike {
  chat(req: Req): Promise<{ text: string; usage: Obj; [k: string]: unknown }>;
  listModels(): Promise<unknown[]>;
}
const pkg = VolumeAi as unknown as {
  MockProvider: new (opts: { chunkDelayMs?: number; models?: unknown[] }) => MockLike;
  mockModelInfo: (slug: string) => unknown;
};

async function recordingAdapter(): Promise<{ ai: OpenRouterAiAdapter; seen: Req[] }> {
  const mock = new pkg.MockProvider({ chunkDelayMs: 0, models: [pkg.mockModelInfo(MODEL)] });
  const seen: Req[] = [];
  const provider = {
    name: 'openrouter' as const,
    async chat(req: Req) {
      seen.push(req);
      const r = await mock.chat(req);
      return { ...r, provider: 'openrouter', usage: { ...r.usage, costUsd: 0 } };
    },
    generateImage: () => Promise.reject(new Error('no images in this test')),
    listModels: () => mock.listModels(),
    keyStatus: () => Promise.resolve({ valid: true, label: null, limitUsd: null, limitRemainingUsd: null, usageUsd: null, isFreeTier: null }),
  };
  const ai = await createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider: provider as unknown as AiProvider });
  return { ai, seen };
}

/** The mock AI for every stage, recording the matter inputs; `real` answers the matter stage when given. */
class ListingAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly inner = new MockAiAdapter();
  readonly matter: AiStageInput[] = [];
  constructor(private readonly real: OpenRouterAiAdapter | null = null) {}
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    if (stage === 'matter_metadata') {
      this.matter.push(structuredClone(input));
      if (this.real) return this.real.runStage(stage, input, { ...opts, model: MODEL });
    }
    return this.inner.runStage(stage, input, opts);
  }
  generateImage: AiPort['generateImage'] = (prompt, opts) => this.inner.generateImage(prompt, opts);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function newBook(app: TestApp): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain guides.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', {
    profileId: p.body['id'],
    idea: 'Side projects',
    title: 'Side Projects',
    settings: { acknowledgements: 'Sam' },
  });
  expect(b.status).toBe(201);
  const id = str(b.body['id']);
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 });
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
  return id;
}

describe('4. the matter stage writes the listing', () => {
  it('runs after write_book from the written chapters, and the pack and wrap use its blurb and description', async () => {
    const ai = new ListingAi();
    t = await testApp({ ai });
    const id = await newBook(t);
    expect((await t.call<{ listing: unknown }>('GET', `/api/v1/books/${id}/listing`)).body.listing).toBeNull();

    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const jobs = await t.call<{ items: { kind: string; status: string }[] }>('GET', `/api/v1/books/${id}/jobs`);
    expect(jobs.body.items.find((j) => j.kind === 'listing')?.status).toBe('succeeded');
    expect(ai.matter).toHaveLength(1);
    const vars = ai.matter[0]?.variables ?? {};
    expect((vars['previousSummaries'] as unknown[]).length).toBeGreaterThan(0);
    expect(vars['pricesCheck']).toEqual(expect.any(String));

    const got = await t.call<{ listing: { backBlurb: string; descriptionHtml: string; keywords: string[]; categories: string[] } }>(
      'GET',
      `/api/v1/books/${id}/listing`,
    );
    expect(got.body.listing).toMatchObject({
      backBlurb: '[MOCK] Back blurb.',
      descriptionHtml: '<p>[MOCK] Description.</p>',
      categories: ['Mock 1', 'Mock 2', 'Mock 3'],
    });
    expect(got.body.listing.keywords).toHaveLength(7);

    const book = await buildExportBook(t.services.repos, t.owner, id, t.services.configDir);
    expect(book.listing).toMatchObject({
      backBlurb: '[MOCK] Back blurb.',
      description: '<p>[MOCK] Description.</p>',
      categories: ['Mock 1', 'Mock 2', 'Mock 3'],
    });
  });

  it('POST /books/:id/listing refuses an unwritten book and writes the listing again for a written one', async () => {
    const ai = new ListingAi();
    t = await testApp({ ai });
    const id = await newBook(t);
    const early = await t.call<{ error: { code: string } }>('POST', `/api/v1/books/${id}/listing`, {});
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('writing_incomplete');
    expect((await t.call('POST', `/api/v1/books/${id}/listing`, { extra: 1 })).status).toBe(400);

    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const again = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/listing`, {});
    expect(again.status).toBe(202);
    await t.services.runner.runUntilIdle();
    expect(ai.matter).toHaveLength(2);
    expect((await t.call<{ listing: Obj | null }>('GET', `/api/v1/books/${id}/listing`)).body.listing).not.toBeNull();
  });

  it('calls matter.back-cover v7 and matter.amazon-description v6 through the real adapter', async () => {
    const real = await recordingAdapter();
    const ai = new ListingAi(real.ai);
    t = await testApp({ ai });
    const id = await newBook(t);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const ids = real.seen.map((r) => r.meta?.promptId);
    expect(ids).toEqual(['matter.amazon-description', 'matter.keywords-categories', 'matter.back-cover']);
    const system = (r: Req | undefined) => r?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system(real.seen[2])).toContain('Sell what the book does for the reader.');
    expect(system(real.seen[0])).toContain('what the book does for the reader and the promise it makes');
    const jobs = await t.call<{ items: { kind: string; status: string }[] }>('GET', `/api/v1/books/${id}/jobs`);
    expect(jobs.body.items.find((j) => j.kind === 'listing')?.status).toBe('succeeded');
  });
});
