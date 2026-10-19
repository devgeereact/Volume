// house-style:off (fixtures quote AI text with dashes and US spellings on purpose)
// Fixes after the live acceptance run of 18 October 2026 (reports/volume/LIVE-ACCEPTANCE-2026-10-18.md).
// Mock provider only, no network.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import { StageInputs, type AiProvider } from '@volume/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import {
  BOOK_LINK_PLACEHOLDER,
  bookInput,
  createOpenRouterAi,
  dropNoneLines,
  fillPromptVariables,
  type OpenRouterAiAdapter,
} from '../src/adapters/openrouter-ai.js';
import { storyInput } from '../src/jobs/picture-book.js';
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
interface Res {
  text: string;
  usage: Obj;
  [k: string]: unknown;
}
interface MockLike {
  chat(req: Req): Promise<Res>;
  listModels(): Promise<unknown[]>;
}
const pkg = VolumeAi as unknown as {
  MockProvider: new (opts: { chunkDelayMs?: number; models?: unknown[] }) => MockLike;
  mockModelInfo: (slug: string) => unknown;
};

/** The OpenRouter adapter over the package's mock provider, recording every request; `answer` may replace a raw answer. */
async function recordingAdapter(answer?: (promptId: string, raw: string) => string): Promise<{ ai: OpenRouterAiAdapter; seen: Req[] }> {
  const mock = new pkg.MockProvider({ chunkDelayMs: 0, models: [pkg.mockModelInfo(MODEL)] });
  const seen: Req[] = [];
  const provider = {
    name: 'openrouter' as const,
    async chat(req: Req): Promise<Res> {
      seen.push(req);
      const r = await mock.chat(req);
      const text = answer ? answer(req.meta?.promptId ?? '?', r.text) : r.text;
      return { ...r, text, provider: 'openrouter', usage: { ...r.usage, costUsd: 0 } };
    },
    generateImage: () => Promise.reject(new Error('no images in this test')),
    listModels: () => mock.listModels(),
    keyStatus: () => Promise.resolve({ valid: true, label: null, limitUsd: null, limitRemainingUsd: null, usageUsd: null, isFreeTier: null }),
  };
  const ai = await createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider: provider as unknown as AiProvider });
  return { ai, seen };
}

/** The mock AI, recording every stage call. */
class RecordingAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly calls: { stage: AiStage; input: AiStageInput }[] = [];
  readonly inner = new MockAiAdapter();
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    this.calls.push({ stage, input: structuredClone(input) });
    return this.inner.runStage(stage, input, opts);
  }
  generateImage: AiPort['generateImage'] = (prompt, opts) => this.inner.generateImage(prompt, opts);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
  of(stage: AiStage): AiStageInput[] {
    return this.calls.filter((c) => c.stage === stage).map((c) => c.input);
  }
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function newBook(app: TestApp, book: Obj = {}): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain guides.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Side projects', ...book });
  expect(b.status).toBe(201);
  return str(b.body['id']);
}

const PICTURE_TEMPLATE = {
  audience: { defaultAgeRange: { min: 3, max: 7 } },
  spreads: { artStyleDefault: 'Soft watercolour' },
  storyRules: { wordLimit: { default: 600 } },
};

describe('1. picture-book story input matches the stage input schema', () => {
  it('sends goodnightMessage as text, on or off, and the whole input passes PictureBookStoryInput', () => {
    for (const goodnightMessage of [true, false, undefined]) {
      const story = storyInput(
        { story: { topic: 'Pip walks home', ...(goodnightMessage === undefined ? {} : { goodnightMessage }) } },
        PICTURE_TEMPLATE,
        null,
        10,
      );
      expect(story['goodnightMessage']).toBe(goodnightMessage === true ? 'on' : 'off');
      const parsed = StageInputs.PictureBookStoryInput.safeParse({ story });
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
    }
  });

  it('runs the story stage through the real adapter without an input error', async () => {
    const { ai, seen } = await recordingAdapter();
    const story = storyInput({ story: { topic: 'Pip walks home', goodnightMessage: true } }, PICTURE_TEMPLATE, 'Idea', 10);
    const r = await ai.runStage('picture_story', { promptId: 'children.picture-book-story', variables: { story, title: 'Pip' } }, { model: MODEL });
    expect(r.output).toBeTruthy();
    const prompt = seen.map((s) => s.messages.map((m) => m.content).join('\n')).join('\n');
    expect(prompt).toContain('Goodnight message: on.');
  });
});

const BRIEF = 'A careful 30-day plan for UK workers with five spare hours a week. Cover HMRC rules and safe AI use.';

describe('2. the author brief reaches titles and blueprint', () => {
  it('the titles, blueprint and regenerate jobs send the book notes', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await newBook(t, { notes: BRIEF });
    await t.call('POST', `/api/v1/books/${id}/title-sets`, {});
    await t.services.runner.runUntilIdle();
    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 });
    await t.services.runner.runUntilIdle();
    await t.call('POST', `/api/v1/books/${id}/blueprint/regenerate`, { part: 'summary' });
    await t.services.runner.runUntilIdle();
    for (const stage of ['titles', 'blueprint', 'blueprint_part'] as const) {
      expect(ai.of(stage).length, stage).toBeGreaterThan(0);
      for (const c of ai.of(stage)) expect(c.variables['notes'], stage).toBe(BRIEF);
    }
  });

  it('the adapter sends it as book.authorBrief, which the blueprint and titles inputs accept', () => {
    const book = bookInput({ idea: 'Side projects', notes: BRIEF });
    expect(book).toMatchObject({ idea: 'Side projects', authorBrief: BRIEF });
    for (const schema of [StageInputs.BlueprintInput, StageInputs.TopicDirectionsInput, StageInputs.TitleOptionsInput]) {
      const parsed = schema.safeParse({ book, direction: {} });
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.book?.authorBrief).toBe(BRIEF);
    }
  });

  it('a prompt that reads {{book.authorBrief}} gets it on its own; an older prompt gets it inside {{book.idea}}', () => {
    const input = { book: bookInput({ idea: 'Side projects', notes: BRIEF }) };
    const newer = fillPromptVariables(input, ['book.idea', 'book.authorBrief']);
    expect(newer['book']).toMatchObject({ idea: 'Side projects', authorBrief: BRIEF });
    const older = fillPromptVariables(input, ['book.idea']);
    expect(older['book']).toEqual({ idea: `Side projects\n\nOwner notes: ${BRIEF}` });
    // No brief: nothing is added.
    expect(fillPromptVariables({ book: bookInput({ idea: 'Side projects' }) }, ['book.idea'])['book']).toEqual({ idea: 'Side projects' });
  });

  it('the live titles stage puts the brief in the topic directions prompt', async () => {
    const { ai, seen } = await recordingAdapter();
    await ai.runStage('titles', { promptId: 'titles.title-options', variables: { idea: 'Side projects', notes: BRIEF, title: null } }, { model: MODEL });
    const directions = seen.find((r) => r.meta?.promptId === 'titles.topic-directions');
    expect(directions?.messages.map((m) => m.content).join('\n')).toContain(BRIEF);
  });
});

describe('4. no literal "None" in the launch email', () => {
  it('sends the launch facts the book does not have as words and a link placeholder, never "None"', async () => {
    const { ai, seen } = await recordingAdapter((id, raw) => {
      if (id !== 'marketing.launch-email') return raw;
      const o = JSON.parse(raw) as Obj;
      return JSON.stringify({ ...o, body: 'Hello,\n\nThe book is out.\n\nNone\n\nThanks for reading.' });
    });
    const r = await ai.runStage(
      'marketing',
      { promptId: 'marketing.launch-pack', variables: { title: 'Side Projects', subtitle: 'A plan', kinds: ['launch_email'] } },
      { model: MODEL },
    );
    const prompt =
      seen
        .find((q) => q.meta?.promptId === 'marketing.launch-email')
        ?.messages.map((m) => m.content)
        .join('\n') ?? '';
    expect(prompt).toContain(`plain link line \`${BOOK_LINK_PLACEHOLDER}\``);
    expect(prompt).not.toMatch(/goes live on None|KDP Select status: None|link line `None`/);
    const email = (r.output as { email: { body: string } }).email;
    expect(email.body).toBe('Hello,\n\nThe book is out.\n\nThanks for reading.');
  });

  it('drops only lines that are just "None"', () => {
    expect(dropNoneLines('A\nNone\nB')).toBe('A\nB');
    expect(dropNoneLines('A\n  None.  \n\nB')).toBe('A\n\nB');
    expect(dropNoneLines('None of this is hard.\nNone')).toBe('None of this is hard.');
  });
});
