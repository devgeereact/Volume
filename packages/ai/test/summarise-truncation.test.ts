// The summary after each chapter must not stop a writing run by being cut off at the output limit.
// Free live run, 6 October 2026: checks.summarise-and-ledger was cut off twice (4,000 then 8,000 max tokens,
// 6,078 reasoning tokens on the retry), so the chapter was never saved and later sections were cancelled.
// No network: the mock provider and a stubbed fetch stand in for OpenRouter.
import { describe, expect, it } from 'vitest';
import {
  AiError,
  createAiService,
  jsonSchemaOf,
  loadConfig,
  mockModelInfo,
  MockProvider,
  OutputTruncatedError,
  PromptLoader,
  sampleFromSchema,
  TASKS,
  type ModelInfo,
} from '../src/index.ts';
import { CONFIG_DIR, FIXTURES_DIR, FULL_INPUT, PROMPTS_DIR } from './helpers.ts';

type Json = Record<string, unknown>;

const TASK = 'checks.summarise-and-ledger';
const config = loadConfig(CONFIG_DIR);
const loader = new PromptLoader(PROMPTS_DIR);
const SUMMARY_MAX = config.defaults.stages['summarise']?.maxTokens ?? 0;

function mockService() {
  return createAiService({ promptsDir: PROMPTS_DIR, configDir: CONFIG_DIR, mock: { fixturesDirs: [FIXTURES_DIR], chunkDelayMs: 0 } });
}

/** A fetch that answers with the next scripted chat completion and records every request body. */
function stubFetch(replies: Json[]): { fetch: typeof fetch; bodies: Json[] } {
  const bodies: Json[] = [];
  let i = 0;
  const fn = ((_url: string | URL | Request, init?: RequestInit) => {
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body) as Json);
    const reply = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return Promise.resolve(new Response(JSON.stringify(reply ?? {}), { status: 200, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;
  return { fetch: fn, bodies };
}

function completion(content: string, o: { finish?: string; native?: string; completion?: number; reasoning?: number; cost?: number } = {}): Json {
  return {
    id: 'gen-x',
    object: 'chat.completion',
    created: 1,
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    choices: [{ index: 0, finish_reason: o.finish ?? 'stop', native_finish_reason: o.native ?? 'stop', message: { role: 'assistant', content } }],
    usage: {
      prompt_tokens: 3000,
      completion_tokens: o.completion ?? 900,
      total_tokens: 3000 + (o.completion ?? 900),
      cost: o.cost ?? 0,
      completion_tokens_details: { reasoning_tokens: o.reasoning ?? 0 },
    },
  };
}

const NVIDIA: ModelInfo = mockModelInfo('nvidia/nemotron-3-super-120b-a12b:free', {
  supportedParameters: ['max_tokens', 'temperature', 'reasoning', 'response_format', 'structured_outputs'],
  maxCompletionTokens: 64_000,
});

const VALID_SUMMARY = JSON.stringify(sampleFromSchema(jsonSchemaOf(TASKS[TASK].output)));
const CUT_OFF_SUMMARY = '{"summary": "The chapter follows the second night shift, from the handover at eight to the quiet ward at three, and';

describe('summarise budget and prompt', () => {
  it('gives the summarise stage room for reasoning models: 16,000 tokens, 32,000 on the retry', () => {
    // The live failure was at 8,000 after the retry, with 6,078 tokens spent on reasoning.
    expect(SUMMARY_MAX).toBeGreaterThanOrEqual(16_000);
  });

  it('uses the bounded v4 prompt by default and keeps v3 for pinned books', () => {
    const v4 = loader.load(TASK);
    expect(v4.meta.version).toBe(4);
    expect(v4.system).toContain('at most 10');
    expect(v4.system).toContain('15 words or fewer');
    expect(v4.system).toContain('keep any private reasoning short');
    expect(v4.system).toContain('warning, caution, safety or privacy note');
    expect(v4.system).toContain('British English with no em dashes');
    expect(loader.load(TASK, 3).meta.version).toBe(3);
  });
});

describe('a cut-off summary does not stop the run (mock provider)', () => {
  it('retries once with twice the room and returns a valid summary', async () => {
    const s = mockService();
    const r = await s.runStage(TASK, FULL_INPUT, { scenario: 'truncated' });
    const requests = (s.provider as MockProvider).requests;
    expect(requests).toHaveLength(2);
    expect(requests[0]?.maxTokens).toBe(SUMMARY_MAX);
    expect(requests[1]?.maxTokens).toBe(SUMMARY_MAX * 2);
    expect(TASKS[TASK].output.safeParse(r.output).success).toBe(true);
    expect(r.repaired).toBe(false);
    expect(r.calls.map((c) => c.finishReason)).toEqual(['length', 'stop']);
    // Both calls were paid for and both are counted.
    expect(r.usage.costUsd).toBeCloseTo(0.0002);
    expect(r.notes.join(' ')).toMatch(/cut off at the output limit; tried once more with max tokens 16000 to 32000/);
    // The model is never switched: both calls went to the stage's own model.
    expect(requests[1]?.model).toBe(requests[0]?.model);
  });

  it('never parses, repairs or resends the cut-off text', async () => {
    const s = mockService();
    await s.runStage(TASK, FULL_INPUT, { scenario: 'truncated' });
    const requests = (s.provider as MockProvider).requests;
    expect(requests.every((q) => q.meta?.purpose !== 'json-repair')).toBe(true);
    expect(requests.every((q) => q.messages.every((m) => m.role !== 'assistant'))).toBe(true);
  });

  it('when every answer is cut off, fails as output_truncated after two calls with the spend of both', async () => {
    const s = mockService();
    const err = await s.runStage(TASK, FULL_INPUT, { scenario: 'truncated_always' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OutputTruncatedError);
    expect((err as AiError).kind).toBe('output_truncated');
    expect((err as Error).message).toMatch(/summarise stage in Settings/);
    expect((err as AiError).usage?.costUsd).toBeCloseTo(0.0002);
    expect((s.provider as MockProvider).requests).toHaveLength(2);
  });
});

describe('the live failure, replayed through the OpenRouter client (stubbed fetch)', () => {
  it('a cut-off JSON summary with reasoning using most of the room recovers on the wider retry', async () => {
    const stub = stubFetch([
      completion(CUT_OFF_SUMMARY, { finish: 'length', native: 'length', completion: SUMMARY_MAX, reasoning: Math.floor(SUMMARY_MAX * 0.76) }),
      completion(VALID_SUMMARY, { completion: 7_800, reasoning: 6_078 }),
    ]);
    const s = createAiService({
      apiKey: 'test-key-not-real',
      promptsDir: PROMPTS_DIR,
      configDir: CONFIG_DIR,
      fetch: stub.fetch,
      retry: { maxRetries: 0 },
      resolveSourceRedirects: false,
    });
    s.registry.setModels([NVIDIA]);
    const r = await s.runStage(TASK, FULL_INPUT, { model: NVIDIA.slug });
    expect(stub.bodies).toHaveLength(2);
    expect(stub.bodies[0]?.['max_tokens']).toBe(SUMMARY_MAX);
    expect(stub.bodies[1]?.['max_tokens']).toBe(SUMMARY_MAX * 2);
    expect(stub.bodies[1]?.['reasoning']).toEqual({ effort: 'low' });
    expect(stub.bodies.every((b) => !JSON.stringify(b['messages']).includes('second night shift'))).toBe(true);
    expect(TASKS[TASK].output.safeParse(r.output).success).toBe(true);
    expect(r.repaired).toBe(false);
  });
});
