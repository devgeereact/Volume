// house-style:off (test data quotes banned phrases, ISBNs and claims on purpose)
import { describe, expect, it } from 'vitest';
import {
  BudgetError,
  ContextTooLargeError,
  MockProvider,
  ModelUnavailableError,
  RateLimitError,
  TASKS,
  TASK_IDS,
  createAiService,
  mockModelInfo,
  type AiService,
  type MockProviderOptions,
  type TaskId,
  type TaskInput,
} from '../src/index.ts';
import { CONFIG_DIR, FIXTURES_DIR, FULL_INPUT, PROMPTS_DIR } from './helpers.ts';

function service(mock: MockProviderOptions = {}): AiService {
  return createAiService({ promptsDir: PROMPTS_DIR, configDir: CONFIG_DIR, mock: { fixturesDirs: [FIXTURES_DIR], chunkDelayMs: 0, ...mock } });
}

function run(s: AiService, task: TaskId, input: unknown = FULL_INPUT, opts = {}) {
  return s.runStage(task, input as TaskInput<typeof task>, opts);
}

describe('stage runners with the mock provider', () => {
  it('covers all 38 tasks', () => {
    expect(TASK_IDS).toHaveLength(38);
  });

  for (const task of TASK_IDS) {
    it(`runs ${task}`, async () => {
      const s = service();
      const r = await run(s, task);
      expect(r.task).toBe(task);
      expect(r.promptId).toBe(TASKS[task].promptId);
      expect(r.promptVersion).toBeGreaterThanOrEqual(1);
      expect(r.promptHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.provider).toBe('mock');
      expect(r.fallbackUsed).toBe(false);
      expect(r.usage.costUsd).toBeCloseTo(0.0001);
      expect(r.usage.costSource).toBe('mock');
      expect(r.calls).toHaveLength(1);
      expect(TASKS[task].output.safeParse(r.output).success).toBe(true);
      expect(r.stage).toBe(s.prompts.load(TASKS[task].promptId).meta.stage);
    });
  }

  it('research returns sources only from url_citation annotations', async () => {
    const r = await service().runStage('research.title-research', FULL_INPUT);
    expect(r.sources.map((x) => x.id)).toEqual(['S1', 'S2']);
    expect(r.sources[0]?.url).toBe('https://www.example.org/night-shift-sleep');
    expect(r.output.audience.wordsTheyUse).toContain('night shift fatigue');
    expect(r.guardrails.warnings.filter((w) => w.rule === 'evidence-id-not-a-source')).toEqual([]);
  });

  it('research notes when search returned no sources', async () => {
    const r = await run(service({ scenario: 'no_sources' }), 'research.title-research');
    expect(r.sources).toEqual([]);
    expect(r.notes.join(' ')).toContain('no url_citation sources');
    expect(r.guardrails.warnings.some((w) => w.rule === 'evidence-id-not-a-source')).toBe(true);
  });

  it('streams a chapter through onDelta and passes guardrails', async () => {
    const s = service();
    let streamed = '';
    const r = await run(s, 'writing.chapter', FULL_INPUT, { onDelta: (t: string) => (streamed += t) });
    expect(streamed).toBe(r.raw);
    expect(r.output).toContain('## The Hours Nobody Warns You About');
    expect(r.guardrails.passed).toBe(true);
    const req = (s.provider as MockProvider).requests[0];
    expect(req?.stream).toBe(true);
    expect(req?.messages[0]?.content).toContain('You are Amira Hale');
    expect(req?.messages[1]?.content).toContain('<data label="research.sources">');
  });

  it('restarts a cut stream once and tells the caller to reset', async () => {
    let resets = 0;
    let streamed = '';
    const r = await run(service({ scenario: 'stream_cut' }), 'writing.chapter', FULL_INPUT, {
      onDelta: (t: string) => (streamed += t),
      onReset: () => {
        resets += 1;
        streamed = '';
      },
    });
    expect(resets).toBe(1);
    expect(streamed).toBe(r.raw);
    expect(r.notes.join(' ')).toContain('restarted');
  });

  it('repairs invalid JSON once and reports both calls', async () => {
    const r = await run(service({ scenario: 'invalid_json' }), 'titles.title-options');
    expect(r.repaired).toBe(true);
    expect(r.calls).toHaveLength(2);
    expect(r.usage.costUsd).toBeCloseTo(0.0002);
  });

  it('computes patternHits for the claims check when the caller leaves them out', async () => {
    const s = service();
    await run(s, 'checks.claims');
    const all = (s.provider as MockProvider).requests[0]?.messages.map((m) => m.content).join('\n') ?? '';
    expect(all).toContain('studies-show');
    expect(all).toContain('percent-of');
  });

  it('weave-note keeps the author note in a fenced data block', async () => {
    const s = service();
    const r = await run(s, 'writing.weave-note');
    expect(r.stage).toBe('writing');
    const user = (s.provider as MockProvider).requests[0]?.messages[1]?.content ?? '';
    expect(user).toContain('<data label="note.text">\nbit about the vending machine');
  });

  it('surfaces a rate limit as a retryable typed error', async () => {
    const s = service({ scenario: 'rate_limit' });
    await expect(run(s, 'titles.topic-directions')).rejects.toBeInstanceOf(RateLimitError);
    const ok = await s.runStage('titles.topic-directions', FULL_INPUT);
    expect(ok.output.directions.length).toBeGreaterThan(0);
  });

  it('offers the next fallback instead of switching when a model is missing', async () => {
    const s = service({ scenario: 'model_missing' });
    try {
      await run(s, 'titles.title-options');
      throw new Error('expected a throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ModelUnavailableError);
      expect((e as ModelUnavailableError).nextFallback).toBe('~google/gemini-pro-latest');
    }
    expect((s.provider as MockProvider).requests).toHaveLength(1);
  });

  it('uses the fallback with permission and flags it', async () => {
    const titles = ['~anthropic/claude-sonnet-latest', '~google/gemini-pro-latest', '~openai/gpt-mini-latest'];
    const s = service({ models: titles.slice(1).map((m) => mockModelInfo(m)) });
    await s.listModels();
    const r = await run(s, 'titles.title-options', FULL_INPUT, { allowFallback: true });
    expect(r.fallbackUsed).toBe(true);
    expect(r.fallbackFrom).toBe(titles[0]);
    expect(r.sentModel).toBe(titles[1]);
    await expect(run(s, 'titles.title-options')).rejects.toBeInstanceOf(ModelUnavailableError);
  });

  it('does not send a call that would pass the budget', async () => {
    const s = service();
    await s.listModels();
    const est = s.estimate('writing.chapter', FULL_INPUT);
    expect(est.estimateUsd).toBeGreaterThan(0);
    // The high end covers the whole output allowance (reasoning included), never less than 1.5 x the estimate.
    expect(est.highUsd ?? 0).toBeGreaterThanOrEqual((est.estimateUsd ?? 0) * 1.5);
    await expect(run(s, 'writing.chapter', FULL_INPUT, { budget: { remainingUsd: 0.000001 } })).rejects.toBeInstanceOf(BudgetError);
    expect((s.provider as MockProvider).requests).toHaveLength(0);
    const ok = await run(s, 'writing.chapter', FULL_INPUT, { budget: { remainingUsd: 1 } });
    expect(ok.estimate.estimateUsd).toBe(est.estimateUsd);
  });

  it('trims context to fit, then stops with ContextTooLargeError', async () => {
    const bigSummary = 'word '.repeat(600);
    const input = {
      ...FULL_INPUT,
      previousSummaries: Array.from({ length: 6 }, (_, i) => ({ number: i + 1, title: `C${i + 1}`, summary: bigSummary })),
    };
    const slug = '~anthropic/claude-sonnet-latest';
    const s1 = service({ models: [mockModelInfo(slug, { contextLength: 9500 })] });
    await s1.listModels();
    const r = await run(s1, 'writing.chapter', input);
    expect(r.notes.join(' ')).toContain('older chapter summaries shortened');
    const s2 = service({ models: [mockModelInfo(slug, { contextLength: 1000 })] });
    await s2.listModels();
    await expect(run(s2, 'writing.chapter', input)).rejects.toBeInstanceOf(ContextTooLargeError);
  });

  it('rejects input with the wrong shape before any call', async () => {
    const s = service();
    await expect(run(s, 'writing.rewrite-selection', { ...FULL_INPUT, rewrite: { mode: 'shout' } })).rejects.toThrow(/not valid/);
  });

  it('generates images through the cover_image stage', async () => {
    const s = service();
    const r = await s.generateImage('A ward window at night, soft lamp glow, no text', { n: 2 });
    expect(r.images).toHaveLength(2);
    expect(r.images[0]?.mediaType).toBe('image/png');
    expect(r.images[0]?.data.subarray(1, 4).toString()).toBe('PNG');
    expect(r.model).toBe('google/gemini-2.5-flash-image');
    expect(r.usage.costUsd).toBeCloseTo(0.002);
    const req = (s.provider as MockProvider).imageRequests[0];
    expect(req?.aspectRatio).toBe('2:3');
    expect(req?.resolution).toBe('2K');
  });
});

describe('marketing counts with the mock provider', () => {
  it('returns as many TikTok scripts and Instagram captions as the input asks for', async () => {
    const s = service();
    const tiktok = await run(s, 'marketing.tiktok-scripts', { ...FULL_INPUT, count: 5, lengthSeconds: 30 });
    expect((tiktok.output as { scripts: unknown[] }).scripts).toHaveLength(5);
    const instagram = await run(s, 'marketing.instagram-captions', { ...FULL_INPUT, count: 5 });
    expect((instagram.output as { captions: unknown[] }).captions).toHaveLength(5);
    const seven = await run(s, 'marketing.tiktok-scripts', { ...FULL_INPUT, count: 7, lengthSeconds: 45 });
    expect((seven.output as { scripts: unknown[] }).scripts).toHaveLength(7);
  });
});
