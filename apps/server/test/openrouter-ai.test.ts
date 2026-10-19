import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import type { AiProvider } from '@volume/ai';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  AiOutputMismatchError,
  createOpenRouterAi,
  estimatePlan,
  mapVolumeAiError,
  selectAiAdapter,
  STAGE_TASKS,
  type OpenRouterAiAdapter,
} from '../src/adapters/openrouter-ai.js';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { ConfigError, loadConfig } from '../src/config/env.js';
import { JobFailed } from '../src/jobs/errors.js';
import { AI_STAGES, AiModelUnavailableError, AiRetryableError, partialUsageOf, type AiStage, type AiStageInput } from '../src/ports/ai.js';

// No network: every call goes to the @volume/ai MockProvider through a fake that reports itself as OpenRouter.

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROMPTS = join(ROOT, 'prompts');
const CONFIG = join(ROOT, 'config');
const MODEL = 'test/model';
const IMAGE_MODEL = 'test/image-model';

interface ChatReqLike {
  model: string;
  meta?: { promptId?: string };
}
interface ChatResultLike {
  text: string;
  usage: Record<string, unknown>;
  [k: string]: unknown;
}
interface MockLike {
  chat(req: ChatReqLike): Promise<ChatResultLike>;
  generateImage(req: unknown): Promise<Record<string, unknown>>;
  listModels(): Promise<unknown[]>;
}
type ErrCtor<A extends unknown[]> = new (...args: A) => Error;
interface PackageExtras {
  MockProvider: new (opts: { chunkDelayMs?: number; models?: unknown[] }) => MockLike;
  mockModelInfo: (slug: string) => unknown;
  AiError: ErrCtor<[kind: string, message: string, init?: { status?: number; cause?: unknown }]>;
  RateLimitError: ErrCtor<[message: string, retryAfterMs: number | undefined, init?: { status?: number }]>;
  ServerError: ErrCtor<[message: string, init?: { status?: number }]>;
  TimeoutError: ErrCtor<[message?: string]>;
  ModelUnavailableError: ErrCtor<[message: string, model: string, extra?: object, init?: { status?: number; retryable?: boolean }]>;
  AuthError: ErrCtor<[message?: string]>;
}

let pkg: PackageExtras;

beforeAll(() => {
  pkg = VolumeAi as unknown as PackageExtras;
});

interface FakeOptions {
  fail?: (promptId: string) => Error | null;
  edit?: (promptId: string, value: unknown) => unknown;
  keyValid?: boolean | 'throw';
}

function fakeProvider(o: FakeOptions = {}): { provider: AiProvider; seen: string[] } {
  const mock = new pkg.MockProvider({ chunkDelayMs: 0, models: [pkg.mockModelInfo(MODEL), pkg.mockModelInfo(IMAGE_MODEL)] });
  const seen: string[] = [];
  let n = 0;
  const provider = {
    name: 'openrouter' as const,
    async chat(req: ChatReqLike): Promise<ChatResultLike> {
      const id = req.meta?.promptId ?? '?';
      seen.push(id);
      const err = o.fail?.(id);
      if (err) throw err;
      const r = await mock.chat(req);
      n += 1;
      let out = r.text;
      if (o.edit && out.trim().startsWith('{')) out = JSON.stringify(o.edit(id, JSON.parse(out)));
      return { ...r, text: out, provider: 'openrouter', generationId: `gen-${n}`, usage: { ...r.usage, costUsd: 0.002 } };
    },
    async generateImage(req: unknown) {
      return { ...(await mock.generateImage(req)), provider: 'openrouter' };
    },
    listModels: () => mock.listModels(),
    keyStatus() {
      if (o.keyValid === 'throw') throw new TypeError('fetch failed');
      return Promise.resolve({ valid: o.keyValid ?? true, label: null, limitUsd: null, limitRemainingUsd: null, usageUsd: null, isFreeTier: null });
    },
  };
  // The fake speaks the provider protocol loosely (its request types are narrower), so it is cast once here.
  return { provider: provider as unknown as AiProvider, seen };
}

async function adapterWith(o: FakeOptions = {}): Promise<{ ai: OpenRouterAiAdapter; seen: string[] }> {
  const { provider, seen } = fakeProvider(o);
  const ai = await createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider });
  return { ai, seen };
}

const PROFILE = {
  penName: 'Test Author',
  isRealPerson: false,
  credentials: ['Former teacher'],
  voice: { tone: ['warm', 'plain'], pov: 'first person' },
  language: 'en-GB',
  memory: [{ kind: 'style', content: 'Short paragraphs.' }],
};
const MARKDOWN = 'First paragraph about mornings.\n\n## A subheading\n\nSecond paragraph with a claim that 40% of people wake early.\n\nThird paragraph.';
const SECTION = {
  id: 'sec1',
  kind: 'chapter',
  title: 'Waking Up',
  number: 1,
  word_target: 2000,
  subheadings: ['A subheading'],
  summary: 'Why mornings matter.',
};
const BLUEPRINT = {
  title: 'Calm Mornings',
  chapters: [{ number: 1, title: 'Waking Up', subheadings: [], summary: '', word_target: 2000, key_points: [], takeaways: false, bridge_note: '' }],
};

/** Variables shaped as the server's job handlers send them. */
const CASES: { stage: AiStage; input: AiStageInput; expect: string[]; fake?: FakeOptions }[] = [
  {
    stage: 'research',
    input: {
      promptId: 'research.title-research',
      variables: { idea: 'Calm mornings', notes: 'For shift workers', bookTypeId: 'nonfiction', template: 'nonfiction', profile: PROFILE },
    },
    expect: ['research.title-research'],
  },
  {
    stage: 'titles',
    input: {
      promptId: 'titles.title-options',
      variables: { idea: 'Calm mornings', title: null, research: { notes: 'x' }, profile: PROFILE, instruction: null },
    },
    expect: ['titles.topic-directions', 'titles.title-options'],
  },
  {
    stage: 'blueprint',
    input: {
      promptId: 'blueprint.blueprint',
      variables: {
        title: 'Calm Mornings',
        idea: 'Calm mornings',
        template: 'nonfiction',
        bookTypeId: 'nonfiction',
        chapterCount: 3,
        research: null,
        sources: [{ title: 'S', url: 'https://example.org/s', excerpt: 'e' }],
        profile: PROFILE,
      },
    },
    expect: ['blueprint.blueprint'],
  },
  {
    stage: 'blueprint_part',
    input: { promptId: 'blueprint.regenerate-part', variables: { part: 'chapter:1', instruction: 'Shorter', blueprint: BLUEPRINT } },
    expect: ['blueprint.regenerate-part'],
    // The package answers in the original field's shape; give it a chapter in the package's naming.
    fake: {
      edit: (_id, v) => ({
        ...(v as object),
        value: {
          number: 1,
          title: 'Waking Gently',
          subheadings: ['One'],
          summary: 'New plan.',
          wordTarget: 1800,
          keyTakeaways: ['Rest'],
          bridgeToNext: 'Next.',
        },
      }),
    },
  },
  {
    stage: 'writing',
    input: {
      promptId: 'writing.chapter',
      variables: {
        book: { title: 'Calm Mornings', subtitle: null, summary: null, audience: null },
        section: SECTION,
        instruction: null,
        previousSummaries: [{ title: 'Intro', summary: 'Set up.' }],
        ledger: [{ kind: 'metaphor', key: 'tide', detail: null, sectionId: null }],
        sources: [],
        profile: PROFILE,
      },
    },
    expect: ['writing.chapter'],
  },
  {
    stage: 'summarise',
    input: { promptId: 'checks.summarise-and-ledger', variables: { markdown: MARKDOWN, section: { title: 'Waking Up' } } },
    expect: ['checks.summarise-and-ledger'],
  },
  {
    stage: 'checks',
    input: { promptId: 'checks.claims-and-consistency', variables: { markdown: MARKDOWN, section: { title: 'Waking Up' } } },
    expect: ['checks.claims', 'checks.consistency'],
  },
  {
    stage: 'editing',
    input: { promptId: 'editing.line', variables: { pass: 'line', markdown: MARKDOWN, section: { title: 'Waking Up' }, instruction: null, selection: null } },
    expect: ['editing.line-edit-uk'],
  },
  {
    stage: 'weave',
    input: {
      promptId: 'editing.weave-notes',
      variables: {
        markdown: MARKDOWN,
        notes: [
          { id: 'n1', note: 'Mention my dog', position: 5, anchorText: null },
          { id: 'n2', note: 'Add the beach walk', position: null, anchorText: 'Third paragraph' },
        ],
        section: { title: 'Waking Up', kind: 'chapter' },
        profile: PROFILE,
      },
    },
    expect: ['writing.weave-note', 'writing.weave-note'],
  },
  {
    stage: 'matter_metadata',
    input: { variables: { title: 'Calm Mornings', subtitle: 'A guide', blueprint: BLUEPRINT, profile: PROFILE } },
    expect: ['matter.amazon-description', 'matter.keywords-categories', 'matter.back-cover'],
  },
  {
    stage: 'cover_brief',
    input: { promptId: 'cover.brief', variables: { title: 'Calm Mornings', subtitle: null, coverStyleId: 'minimal', brief: {}, profile: PROFILE } },
    expect: ['cover.cover-brief', 'cover.cover-image'],
  },
  {
    stage: 'marketing',
    input: {
      promptId: 'marketing.launch-pack',
      variables: {
        title: 'Calm Mornings',
        subtitle: null,
        summary: 'A book.',
        kinds: ['tiktok_script', 'instagram_caption', 'launch_email'],
        profile: PROFILE,
      },
    },
    // Distinct items, so the adapter makes no second call for duplicates.
    fake: {
      edit: (id, v) => {
        const o = v as Record<string, Record<string, unknown>[]>;
        if (id === 'marketing.tiktok-scripts') return { scripts: (o['scripts'] ?? []).map((x, i) => ({ ...x, hooks: [`Hook ${i + 1}`], beats: [] })) };
        if (id === 'marketing.instagram-captions')
          return { captions: (o['captions'] ?? []).map((x, i) => ({ ...x, firstLine: `First line ${i + 1}`, body: `Body ${i + 1}` })) };
        return v;
      },
    },
    expect: ['marketing.tiktok-scripts', 'marketing.instagram-captions', 'marketing.launch-email'],
  },
  {
    stage: 'picture_story',
    input: { promptId: 'children.picture-book-story', variables: { title: 'Pip', template: 'picture-book', story: {}, profile: PROFILE } },
    expect: ['children.picture-book-story'],
  },
  {
    stage: 'scene_prompts',
    input: { promptId: 'children.scene-prompts', variables: { title: 'Pip', template: 'picture-book', story: {}, storyResult: { title: 'Pip' } } },
    expect: ['children.scene-prompts'],
  },
  {
    stage: 'character_reference',
    input: {
      promptId: 'children.character-reference',
      variables: { title: 'Pip', template: 'picture-book', story: {}, storyResult: { title: 'Pip' }, scenePrompts: { characterSheets: [] } },
    },
    expect: ['children.character-reference'],
  },
  {
    stage: 'claim_fix',
    input: {
      promptId: 'editing.claim-fix',
      variables: {
        title: 'Calm Mornings',
        claim: { sentence: 'Most people wake at six.', category: 'statistic', checkNeeded: 'A sleep survey', before: 'Morning.', after: 'Then tea.' },
        sources: [],
        instruction: null,
      },
    },
    expect: ['editing.claim-fix'],
  },
];

describe('OpenRouter AI adapter: stage mapping', () => {
  it('covers every server stage', () => {
    expect(CASES.map((c) => c.stage).sort()).toEqual([...AI_STAGES].sort());
    for (const stage of AI_STAGES) expect(STAGE_TASKS[stage].length).toBeGreaterThan(0);
  });

  for (const c of CASES) {
    it(`maps ${c.stage} to ${c.expect.join(' + ')} and returns valid server output`, async () => {
      const { ai, seen } = await adapterWith(c.fake);
      const deltas: string[] = [];
      const res = await ai.runStage(c.stage, c.input, { model: MODEL, onDelta: (t) => deltas.push(t) });
      expect(seen).toEqual(c.expect);
      expect(res.stage).toBe(c.stage);
      expect(res.mock).toBe(false);
      expect(res.usage.provider).toBe('openrouter');
      expect(res.usage.model).toBe(MODEL);
      expect(res.usage.costUsd).toBeCloseTo(0.002 * c.expect.length, 6);
      expect(res.usage.generationId).toMatch(/^gen-\d+$/);
      expect(res.prompt.id).toContain(c.expect[0]);
      if (c.stage === 'research') {
        expect(res.sources.map((s) => s.url)).toEqual(['https://example.org/mock-source-one', 'https://example.org/mock-source-two']);
      } else {
        expect(res.sources).toEqual([]);
      }
      if (c.stage === 'writing' || c.stage === 'weave') expect(deltas.join('')).toBe((res.output as { markdown: string }).markdown);
      if (c.stage === 'blueprint_part')
        expect(res.output).toMatchObject({ part: 'chapter:1', data: { title: 'Waking Gently', word_target: 1800, key_points: ['Rest'], takeaways: true } });
      if (c.stage === 'weave') expect(res.output).toMatchObject({ woven_note_ids: ['n1', 'n2'] });
      if (c.stage === 'checks') expect((res.output as { claims: unknown[] }).claims[0]).toMatchObject({ category: 'statistical' });
    });
  }

  it('picks the writing prompt from the section kind', async () => {
    const { ai, seen } = await adapterWith();
    const res = await ai.runStage(
      'writing',
      { promptId: 'writing.front-matter', variables: { section: { kind: 'dedication', title: 'Dedication' }, profile: PROFILE } },
      { model: MODEL },
    );
    expect(seen).toEqual(['writing.front-matter']);
    expect(res.output.markdown.length).toBeGreaterThan(0);
    await ai.runStage('writing', { variables: { section: { kind: 'introduction', title: 'Introduction' } } }, { model: MODEL });
    await ai.runStage('writing', { variables: { section: { kind: 'review_request', title: 'A small favour' } } }, { model: MODEL });
    expect(seen).toEqual(['writing.front-matter', 'writing.introduction', 'writing.back-matter']);
  });

  it('picks the editing prompt from the pass', async () => {
    const { ai, seen } = await adapterWith();
    const v = { markdown: MARKDOWN, section: { title: 'Waking Up' } };
    await ai.runStage('editing', { variables: { ...v, pass: 'structure' } }, { model: MODEL });
    await ai.runStage('editing', { variables: { ...v, pass: 'voice' } }, { model: MODEL });
    const sel = await ai.runStage('editing', { variables: { ...v, pass: 'selection', selection: { start: 0, end: 15 } } }, { model: MODEL });
    expect(seen).toEqual(['editing.structural', 'editing.voice', 'writing.rewrite-selection']);
    expect(sel.output.suggestions[0]).toMatchObject({ original: MARKDOWN.slice(0, 15), start: 0, end: 15 });
  });

  it('returns a usable cost estimate once prices are known', async () => {
    const { ai } = await adapterWith();
    const est = await ai.estimate('checks', { variables: { markdown: MARKDOWN, section: { title: 'x' } } }, { model: MODEL });
    expect(est.lowUsd).toBeGreaterThan(0);
    expect(est.highUsd).toBeGreaterThanOrEqual(est.lowUsd);
    const empty = await ai.estimate('cover_brief', { variables: {} }, { model: MODEL });
    expect(empty.highUsd).toBeGreaterThan(0);
  });

  it('generates an image with openrouter usage', async () => {
    const { ai } = await adapterWith();
    const img = await ai.generateImage('A calm sea, no text', { model: IMAGE_MODEL, aspectRatio: '2:3' });
    expect(img.mime).toBe('image/png');
    expect(img.width).toBe(1);
    expect(img.usage.provider).toBe('openrouter');
    expect(img.mock).toBe(false);
  });
});

describe('OpenRouter AI adapter: output validation', () => {
  it('turns an answer the server cannot use into a clear error', async () => {
    const { ai } = await adapterWith({ edit: (id, v) => (id === 'cover.cover-brief' ? { ...(v as object), concepts: [] } : v) });
    const err = await ai.runStage('cover_brief', { variables: { title: 'Calm' } }, { model: MODEL }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiOutputMismatchError);
    expect(err).toBeInstanceOf(JobFailed);
    expect((err as JobFailed).code).toBe('invalid_output');
    expect((err as Error).message).toMatch(/cover_brief answer did not match.*concepts/);
    expect((err as AiOutputMismatchError).usage?.costUsd).toBeCloseTo(0.002, 6);
  });

  it('rejects a regenerated chapter without a title', async () => {
    const { ai } = await adapterWith({ edit: (id, v) => (id === 'blueprint.regenerate-part' ? { ...(v as object), value: { summary: 'no title' } } : v) });
    const err = await ai.runStage('blueprint_part', { variables: { part: 'chapter:1', blueprint: BLUEPRINT } }, { model: MODEL }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiOutputMismatchError);
    expect((err as Error).message).toMatch(/title/);
  });
});

describe('OpenRouter AI adapter: error mapping', () => {
  const variables = { markdown: MARKDOWN, section: { title: 'Waking Up' } };

  it('maps 429 to AiRetryableError with retryAfterMs', async () => {
    const { ai } = await adapterWith({ fail: () => new pkg.RateLimitError('slow down', 1500, { status: 429 }) });
    const err = await ai.runStage('summarise', { variables }, { model: MODEL }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiRetryableError);
    expect((err as AiRetryableError).retryAfterMs).toBe(1500);
  });

  it('maps 5xx, timeouts and 503 no-provider to AiRetryableError', async () => {
    for (const make of [
      () => new pkg.ServerError('boom', { status: 500 }),
      () => new pkg.TimeoutError(),
      () => new pkg.ModelUnavailableError('no provider', MODEL, {}, { status: 503, retryable: true }),
    ]) {
      const { ai } = await adapterWith({ fail: make });
      const err = await ai.runStage('summarise', { variables }, { model: MODEL }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AiRetryableError);
      expect((err as AiRetryableError).retryAfterMs).toBeNull();
    }
  });

  it('maps a missing model (404) to AiModelUnavailableError', async () => {
    const { ai } = await adapterWith({ fail: () => new pkg.ModelUnavailableError('not found', MODEL, {}, { status: 404 }) });
    const err = await ai.runStage('summarise', { variables }, { model: MODEL }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiModelUnavailableError);
    expect((err as AiModelUnavailableError).model).toBe(MODEL);
  });

  it('maps a model missing from the OpenRouter list to AiModelUnavailableError', async () => {
    const { ai } = await adapterWith();
    await ai.estimate('summarise', { variables }, { model: MODEL }); // loads the model list
    const err = await ai.runStage('summarise', { variables }, { model: 'gone/model' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiModelUnavailableError);
    expect((err as AiModelUnavailableError).model).toBe('gone/model');
  });

  it('carries what a multi-call stage already spent on the error when a later call fails', async () => {
    const { ai, seen } = await adapterWith({ fail: (id) => (id === 'checks.consistency' ? new pkg.ServerError('boom', { status: 500 }) : null) });
    const err = await ai.runStage('checks', { variables: { ...variables, markdown: MARKDOWN } }, { model: MODEL }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiRetryableError);
    expect(seen).toEqual(['checks.claims', 'checks.consistency']);
    const partial = partialUsageOf(err);
    expect(partial?.usage.costUsd).toBeCloseTo(0.002, 6); // the finished claims call, as the fake prices it
    expect(partial?.prompt?.id).toBe('checks.claims');
  });

  it('attaches nothing when the first call fails', async () => {
    const { ai } = await adapterWith({ fail: () => new pkg.ServerError('boom', { status: 500 }) });
    const err = await ai.runStage('summarise', { variables }, { model: MODEL }).catch((e: unknown) => e);
    expect(partialUsageOf(err)).toBeNull();
  });

  it('maps a rejected key to a failed job that is not retried', async () => {
    const { ai } = await adapterWith({ fail: () => new pkg.AuthError() });
    const err = await ai.runStage('summarise', { variables }, { model: MODEL }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobFailed);
    expect((err as JobFailed).code).toBe('ai_auth');
  });

  it('finds retryAfterMs on a wrapped error', () => {
    const wrapped = new pkg.AiError('rate_limit', 'slow', { status: 429, cause: new pkg.RateLimitError('slow', 3000) });
    const err = mapVolumeAiError(wrapped, { stage: 'writing', model: MODEL });
    expect(err).toBeInstanceOf(AiRetryableError);
    expect((err as AiRetryableError).retryAfterMs).toBe(3000);
  });

  it('stops before calling when the signal is already aborted', async () => {
    const { ai, seen } = await adapterWith();
    const ac = new AbortController();
    ac.abort();
    const err = await ai.runStage('summarise', { variables }, { model: MODEL, signal: ac.signal }).catch((e: unknown) => e);
    expect((err as Error).name).toBe('AbortError');
    expect(seen).toEqual([]);
  });
});

describe('AI provider selection', () => {
  const KEY = 'sk-or-v1-test-secret-value';
  const base = { promptsDir: PROMPTS, configDir: CONFIG };

  it('uses the mock with one log line when no key is set', async () => {
    for (const apiKey of [undefined, '', '   ']) {
      const lines: string[] = [];
      const sel = await selectAiAdapter({ ...base, choice: 'auto', apiKey, log: (l) => lines.push(l) });
      expect(sel.provider).toBe('mock');
      expect(sel.ai).toBeInstanceOf(MockAiAdapter);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/OPENROUTER_API_KEY is not set/);
    }
  });

  it('uses OpenRouter when the key is set and accepted, never logging the key', async () => {
    const lines: string[] = [];
    const { provider } = fakeProvider({ keyValid: true });
    const sel = await selectAiAdapter({ ...base, choice: 'auto', apiKey: KEY, provider, log: (l) => lines.push(l) });
    expect(sel.provider).toBe('openrouter');
    expect(sel.ai.provider).toBe('openrouter');
    expect(lines).toHaveLength(1);
    expect(lines.join(' ')).not.toContain(KEY);
  });

  it('falls back to the mock when the key is rejected or cannot be checked', async () => {
    for (const keyValid of [false, 'throw'] as const) {
      const lines: string[] = [];
      const { provider } = fakeProvider({ keyValid });
      const sel = await selectAiAdapter({ ...base, choice: 'auto', apiKey: KEY, provider, log: (l) => lines.push(l) });
      expect(sel.provider).toBe('mock');
      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toContain(KEY);
    }
  });

  it('honours AI_PROVIDER=mock and refuses AI_PROVIDER=openrouter without a key', async () => {
    const lines: string[] = [];
    const sel = await selectAiAdapter({ ...base, choice: 'mock', apiKey: KEY, log: (l) => lines.push(l) });
    expect(sel.provider).toBe('mock');
    await expect(selectAiAdapter({ ...base, choice: 'openrouter', apiKey: '', log: () => undefined })).rejects.toBeInstanceOf(ConfigError);
  });
});

describe('environment: blank settings', () => {
  it('treats blank values as unset', () => {
    const config = loadConfig({ dotenv: false, env: { AI_PROVIDER: '', MYSQL_HOST: '', MYSQL_SSL_CA: '  ', DB_CLIENT: 'sqlite', LOG_LEVEL: '' } });
    expect(config.aiProvider).toBe('auto');
    expect(config.db.client).toBe('sqlite');
    expect(config.logLevel).toBe('info');
  });

  it('counts a blank OPENROUTER_API_KEY as no key', () => {
    expect(loadConfig({ dotenv: false, env: { OPENROUTER_API_KEY: '   ' } }).openRouterKeyPresent).toBe(false);
    expect(loadConfig({ dotenv: false, env: { OPENROUTER_API_KEY: 'x' } }).openRouterKeyPresent).toBe(true);
  });

  it('reads AI_PROVIDER case-insensitively', () => {
    expect(loadConfig({ dotenv: false, env: { AI_PROVIDER: ' OpenRouter ' } }).aiProvider).toBe('openrouter');
  });
});

describe('OpenRouter AI adapter: round 2 fields', () => {
  const WEAVE = {
    markdown: MARKDOWN,
    notes: [{ id: 'n1', note: 'Mention my dog', position: 5, anchorText: null }],
    section: { title: 'Waking Up', kind: 'chapter' },
    profile: PROFILE,
  };

  it('expands a note with writing.expand-note into a subheading and paragraphs', async () => {
    const { ai, seen } = await adapterWith({
      edit: (id, v) =>
        id === 'writing.expand-note' ? { ...(v as object), heading: 'Walking the Dog at Dawn', text: 'First paragraph.\n\nSecond paragraph.' } : v,
    });
    const res = await ai.runStage('weave', { promptId: 'editing.weave-notes', variables: { ...WEAVE, mode: 'expand' } }, { model: MODEL });
    expect(seen).toEqual(['writing.expand-note']);
    expect(res.output.markdown).toContain('## Walking the Dog at Dawn\n\nFirst paragraph.\n\nSecond paragraph.');
    expect(res.output.woven_note_ids).toEqual(['n1']);
    const plan = estimatePlan('weave', { variables: { ...WEAVE, mode: 'expand' } });
    expect(plan.map((p) => p.task)).toEqual(['writing.expand-note']);
  });

  it('keeps the softer wording from checks.claims', async () => {
    const { ai } = await adapterWith({
      edit: (id, v) =>
        id === 'checks.claims'
          ? {
              claims: [
                {
                  quote: 'Second paragraph with a claim that 40% of people wake early.',
                  type: 'statistic',
                  risk: 'high',
                  harmIfWrong: false,
                  sourceMarker: null,
                  sourceSupports: 'no-marker',
                  check: 'Find a source.',
                  suggestion: 'soften',
                  softerVersion: 'Many people wake early.',
                },
              ],
            }
          : v,
    });
    const res = await ai.runStage('checks', { variables: { markdown: MARKDOWN, section: { title: 'Waking Up' } } }, { model: MODEL });
    expect(res.output.claims[0]).toMatchObject({ softer: 'Many people wake early.', category: 'statistical' });
  });

  it('keeps TikTok hashtags, the Instagram image idea and every email subject line', async () => {
    const { ai } = await adapterWith({
      edit: (id, v) => {
        const o = v as Record<string, unknown[]>;
        if (id === 'marketing.tiktok-scripts') return { scripts: (o['scripts'] ?? []).map((x) => ({ ...(x as object), hashtags: ['#booktok', '#mornings'] })) };
        if (id === 'marketing.instagram-captions') return { captions: (o['captions'] ?? []).map((x) => ({ ...(x as object), imageIdea: 'A mug on a sill' })) };
        if (id === 'marketing.launch-email') return { ...(v as object), subjectLines: ['One', 'Two', 'Three'] };
        return v;
      },
    });
    const res = await ai.runStage(
      'marketing',
      { variables: { title: 'Calm Mornings', summary: 'A book.', kinds: ['tiktok_script', 'instagram_caption', 'launch_email'], profile: PROFILE } },
      { model: MODEL },
    );
    expect(res.output.tiktok[0]?.hashtags).toEqual(['#booktok', '#mornings']);
    expect(res.output.instagram[0]?.image_idea).toBe('A mug on a sill');
    expect(res.output.email?.subjects).toEqual(['One', 'Two', 'Three']);
  });

  it('rewrites a selection with writing.rewrite-selection', async () => {
    const { ai, seen } = await adapterWith({
      edit: (id, v) => (id === 'writing.rewrite-selection' ? { text: 'Opening line, tidied.', changeNote: 'Tidied.', newClaims: [] } : v),
    });
    const res = await ai.runStage(
      'editing',
      { promptId: 'writing.rewrite-selection', variables: { pass: 'selection', markdown: MARKDOWN, selection: { start: 0, end: 31 }, instruction: 'Tidy it' } },
      { model: MODEL },
    );
    expect(seen).toEqual(['writing.rewrite-selection']);
    expect(res.output.suggestions[0]).toMatchObject({ original: 'First paragraph about mornings.', proposed: 'Opening line, tidied.', start: 0, end: 31 });
  });
});

describe('internal budget checks', () => {
  it('carries previous task spend into the next task check', async () => {
    const { ai, seen } = await adapterWith();
    const input = CASES.find((item) => item.stage === 'titles');
    if (!input) throw new Error('Missing titles fixture');
    const checks: number[] = [];
    await ai.runStage('titles', input.input, {
      model: MODEL,
      beforeCall: (spent) => {
        checks.push(spent);
        return Promise.resolve();
      },
    });
    expect(seen).toContain('titles.title-options');
    expect(checks.length).toBeGreaterThanOrEqual(2);
    expect(checks[0]).toBe(0);
    expect(checks[1]).toBeGreaterThan(0);
  });
});
