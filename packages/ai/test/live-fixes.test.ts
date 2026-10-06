// Fixes from the first live book run (5 October 2026): sampling settings a model refuses, provider error
// words, cut-off answers, spend on failed calls, high estimates, and search calls with no sources.
// No network: every call goes to a stubbed fetch.
import { describe, expect, it } from 'vitest';
import {
  AiError,
  BadRequestError,
  InvalidOutputError,
  OpenRouterClient,
  OutputTruncatedError,
  PromptLoader,
  TASKS,
  chatStructured,
  createAiService,
  emptyUsage,
  errorFromStatus,
  jsonSchemaOf,
  mockModelInfo,
  sampleFromSchema,
  type AiProvider,
  type ChatRequest,
  type ChatResult,
  type ModelInfo,
} from '../src/index.ts';
import { errorBodyParts, isTruncated } from '../src/provider/openrouter.ts';
import { unsupportedParam } from '../src/service.ts';
import { CONFIG_DIR, FULL_INPUT, PROMPTS_DIR } from './helpers.ts';

type Json = Record<string, unknown>;

interface Stub {
  fetch: typeof fetch;
  bodies: Json[];
}

/** A fetch that answers chat completions with the next scripted reply and records every request body. */
function stubFetch(replies: Array<{ status?: number; body: unknown }>): Stub {
  const bodies: Json[] = [];
  let i = 0;
  const fn = ((_url: string | URL | Request, init?: RequestInit) => {
    if (typeof init?.body === 'string') bodies.push(JSON.parse(init.body) as Json);
    const reply = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return Promise.resolve(new Response(JSON.stringify(reply?.body ?? {}), { status: reply?.status ?? 200, headers: { 'content-type': 'application/json' } }));
  }) as typeof fetch;
  return { fetch: fn, bodies };
}

function completion(
  content: string,
  o: { finish?: string; native?: string; cost?: number; completion?: number; reasoning?: number; annotations?: unknown[]; model?: string } = {},
): Json {
  return {
    id: 'gen-x',
    object: 'chat.completion',
    created: 1,
    model: o.model ?? 'anthropic/claude-sonnet-5.5',
    choices: [
      {
        index: 0,
        finish_reason: o.finish ?? 'stop',
        native_finish_reason: o.native ?? 'end_turn',
        message: { role: 'assistant', content, ...(o.annotations ? { annotations: o.annotations } : {}) },
      },
    ],
    usage: {
      prompt_tokens: 1000,
      completion_tokens: o.completion ?? 500,
      total_tokens: 1000 + (o.completion ?? 500),
      cost: o.cost ?? 0.01,
      completion_tokens_details: { reasoning_tokens: o.reasoning ?? 0 },
    },
  };
}

const sample = (task: keyof typeof TASKS): string => JSON.stringify(sampleFromSchema(jsonSchemaOf(TASKS[task].output)));

function service(stub: Stub, models: ModelInfo[] = []) {
  const s = createAiService({
    apiKey: 'test-key-not-real',
    promptsDir: PROMPTS_DIR,
    configDir: CONFIG_DIR,
    fetch: stub.fetch,
    retry: { maxRetries: 0 },
    resolveSourceRedirects: false,
  });
  if (models.length) s.registry.setModels(models);
  return s;
}

const REASONING_MODEL = (slug: string, extra: Partial<ModelInfo> = {}): ModelInfo =>
  mockModelInfo(slug, {
    supportedParameters: ['max_tokens', 'temperature', 'reasoning', 'response_format', 'structured_outputs'],
    maxCompletionTokens: 128_000,
    ...extra,
  });

describe('1. sampling settings a model refuses', () => {
  it('leaves temperature out for the Claude Opus alias (config modelRules), even though the model list offers it', async () => {
    const stub = stubFetch([{ body: completion(sample('titles.topic-directions')) }]);
    const s = service(stub, [REASONING_MODEL('~anthropic/claude-opus-latest', { aliasTarget: 'anthropic/claude-opus-5.5' })]);
    await s.runStage('titles.topic-directions', FULL_INPUT, { model: '~anthropic/claude-opus-latest' });
    expect(stub.bodies[0]).not.toHaveProperty('temperature');
    expect(s.registry.omittedParams('anthropic/claude-opus-5.5').has('temperature')).toBe(true);
    expect(s.registry.omittedParams('anthropic/claude-haiku-4.5').size).toBe(0);
  });

  it('still sends temperature to a model with no rule', async () => {
    const stub = stubFetch([{ body: completion(sample('titles.topic-directions')) }]);
    const s = service(stub, [REASONING_MODEL('~google/gemini-pro-latest')]);
    await s.runStage('titles.topic-directions', FULL_INPUT, { model: '~google/gemini-pro-latest' });
    expect(stub.bodies[0]?.['temperature']).toBe(0.9);
  });

  it('retries once without temperature when a 400 names it, and says so in the notes', async () => {
    const providerError = {
      error: {
        code: 400,
        message: 'Provider returned error',
        metadata: {
          provider_name: 'Anthropic',
          raw: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'temperature: not supported for this model' } }),
        },
      },
    };
    const stub = stubFetch([{ status: 400, body: providerError }, { body: completion(sample('titles.topic-directions')) }]);
    const s = service(stub, [REASONING_MODEL('~google/gemini-pro-latest')]);
    const r = await s.runStage('titles.topic-directions', FULL_INPUT, { model: '~google/gemini-pro-latest' });
    expect(stub.bodies).toHaveLength(2);
    expect(stub.bodies[0]).toHaveProperty('temperature');
    expect(stub.bodies[1]).not.toHaveProperty('temperature');
    expect(r.notes.join(' ')).toMatch(/rejected the temperature setting/);
  });

  it('does not retry a 400 that names no parameter', () => {
    const req: ChatRequest = { model: 'x', messages: [], temperature: 0.7 };
    expect(unsupportedParam('Provider returned error', req)).toBeNull();
    expect(unsupportedParam('top_p and temperature cannot both be set', req)).toBe('temperature');
    expect(unsupportedParam('temperature is invalid', { ...req, temperature: undefined })).toBeNull();
  });
});

describe('1a. schema too large for the provider', () => {
  const tooLarge = {
    error: {
      code: 400,
      message: 'Provider returned error',
      metadata: {
        provider_name: 'Azure',
        raw: '{"error":{"message":"The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools."}}',
      },
    },
  };

  it('first sends the same request with OpenRouter told to skip that provider, keeping the schema', async () => {
    const stub = stubFetch([{ status: 400, body: tooLarge }, { body: completion(sample('titles.topic-directions')) }]);
    const s = service(stub, [REASONING_MODEL('~anthropic/claude-opus-latest')]);
    const r = await s.runStage('titles.topic-directions', FULL_INPUT, { model: '~anthropic/claude-opus-latest' });
    expect(stub.bodies).toHaveLength(2);
    expect(stub.bodies[0]).not.toHaveProperty('provider');
    expect(stub.bodies[1]).toHaveProperty('response_format');
    expect(stub.bodies[1]?.['provider']).toEqual({ ignore: ['azure'] });
    expect(r.notes.join(' ')).toMatch(/Azure refused the JSON schema/);
  });

  it('then asks for JSON by instruction, and the repair carries the schema', async () => {
    const stub = stubFetch([
      { status: 400, body: tooLarge },
      { status: 400, body: tooLarge },
      { body: completion('{"ideaAnalysis": "x"}') },
      { body: completion(sample('titles.topic-directions')) },
    ]);
    const s = service(stub, [REASONING_MODEL('~anthropic/claude-opus-latest')]);
    const r = await s.runStage('titles.topic-directions', FULL_INPUT, { model: '~anthropic/claude-opus-latest' });
    expect(stub.bodies[2]).not.toHaveProperty('response_format');
    expect(r.notes.join(' ')).toMatch(/rejected the JSON schema/);
    expect(r.repaired).toBe(true);
    const repairText = JSON.stringify(stub.bodies[3]?.['messages']);
    expect(repairText).toContain('workingTitle');
    expect(repairText).toContain('follows the schema exactly');
  });
});

describe('1b. provider error words reach the message', () => {
  it('adds metadata.raw and provider_name to "Provider returned error"', () => {
    const parts = errorBodyParts({
      error: {
        code: 400,
        message: 'Provider returned error',
        metadata: { provider_name: 'Google', raw: '{"error":{"message":"Tool use with a response mime type is unsupported"}}' },
      },
    });
    expect(parts.message).toBe('Provider returned error (Google said: Tool use with a response mime type is unsupported)');
    expect(errorFromStatus(400, parts.message, 'm')).toBeInstanceOf(BadRequestError);
  });

  it('turns a JSON issue list into plain words', () => {
    const issues = JSON.stringify(
      [{ code: 'invalid_value', values: ['1:1', '2:3'], path: ['aspect_ratio'], message: 'Invalid option: expected one of "1:1"|"2:3"' }],
      null,
      2,
    );
    expect(errorBodyParts({ error: { code: 400, message: issues } }).message).toBe('aspect_ratio: Invalid option: expected one of "1:1"|"2:3"');
  });

  it('surfaces the provider words on a chat 400', async () => {
    const stub = stubFetch([
      {
        status: 400,
        body: { error: { code: 400, message: 'Provider returned error', metadata: { provider_name: 'Anthropic', raw: 'max_tokens: must be at most 64000' } } },
      },
    ]);
    const c = new OpenRouterClient({ apiKey: 'test-key-not-real', fetch: stub.fetch, retry: { maxRetries: 0 } });
    await expect(c.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }] })).rejects.toThrow(/Anthropic said: max_tokens: must be at most 64000/);
  });
});

describe('2. cut-off answers', () => {
  it('detects finish_reason length and native max_tokens', () => {
    expect(isTruncated('length', null)).toBe(true);
    expect(isTruncated('stop', 'max_tokens')).toBe(true);
    expect(isTruncated('stop', 'MAX_TOKENS')).toBe(true);
    expect(isTruncated('stop', 'end_turn')).toBe(false);
  });

  it('the client throws OutputTruncatedError with the usage instead of returning the partial text', async () => {
    const stub = stubFetch([
      { body: completion('{"directions": [{"wor', { finish: 'length', native: 'max_tokens', cost: 0.03, completion: 4000, reasoning: 3900 }) },
    ]);
    const c = new OpenRouterClient({ apiKey: 'test-key-not-real', fetch: stub.fetch, retry: { maxRetries: 0 } });
    const err = await c.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], maxTokens: 4000 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OutputTruncatedError);
    const t = err as OutputTruncatedError;
    expect(t.usage?.costUsd).toBe(0.03);
    expect(t.message).toMatch(/4000 tokens.*Reasoning used 3900 of 4000/);
  });

  it('retries once with twice the room and low reasoning effort, never repairs the cut-off text, and counts both calls', async () => {
    const stub = stubFetch([
      { body: completion('{"directions": [', { finish: 'length', native: 'max_tokens', cost: 0.03 }) },
      { body: completion(sample('titles.topic-directions'), { cost: 0.05 }) },
    ]);
    const s = service(stub, [REASONING_MODEL('~anthropic/claude-sonnet-latest')]);
    const r = await s.runStage('titles.topic-directions', FULL_INPUT, { model: '~anthropic/claude-sonnet-latest' });
    expect(stub.bodies).toHaveLength(2);
    const firstMax = stub.bodies[0]?.['max_tokens'] as number;
    expect(stub.bodies[1]?.['max_tokens']).toBe(firstMax * 2);
    expect(stub.bodies[1]?.['reasoning']).toEqual({ effort: 'low' });
    expect(r.repaired).toBe(false);
    expect(r.usage.costUsd).toBeCloseTo(0.08);
    expect(r.calls.map((c) => c.finishReason)).toEqual(['length', 'stop']);
    expect(r.notes.join(' ')).toMatch(/cut off/);
  });

  it('checks paid usage before a truncation retry and stops before sending it', async () => {
    const stub = stubFetch([
      { body: completion('{"directions": [', { finish: 'length', cost: 0.03 }) },
      { body: completion(sample('titles.topic-directions')) },
    ]);
    const s = service(stub, [REASONING_MODEL('~anthropic/claude-sonnet-latest')]);
    const checks: number[] = [];
    await expect(
      s.runStage('titles.topic-directions', FULL_INPUT, {
        model: '~anthropic/claude-sonnet-latest',
        beforeCall: (spent) => {
          checks.push(spent);
          if (spent > 0) throw new Error('Book budget reached');
          return Promise.resolve();
        },
      }),
    ).rejects.toThrow('Book budget reached');
    expect(checks).toEqual([0, 0.03]);
    expect(stub.bodies).toHaveLength(1);
  });

  it('gives up after the second cut-off with output_truncated and the spend of both calls', async () => {
    const cut = { body: completion('{"dir', { finish: 'length', cost: 0.02 }) };
    const stub = stubFetch([cut, cut, cut]);
    const s = service(stub, [REASONING_MODEL('~anthropic/claude-sonnet-latest')]);
    const err = await s.runStage('titles.topic-directions', FULL_INPUT as never, { model: '~anthropic/claude-sonnet-latest' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OutputTruncatedError);
    expect((err as AiError).kind).toBe('output_truncated');
    expect((err as AiError).usage?.costUsd).toBeCloseTo(0.04);
    expect(stub.bodies).toHaveLength(2);
    // No JSON repair was asked for: the cut-off text never reached the repair step.
    expect(stub.bodies.every((b) => !JSON.stringify(b['messages']).includes('{"dir'))).toBe(true);
  });

  it('a cut-off streamed chapter resets the streamed text before the retry', async () => {
    const chunks = (text: string, finish: string): string =>
      [
        `data: ${JSON.stringify({ id: 'g', model: 'm', choices: [{ index: 0, delta: { content: text } }] })}\n\n`,
        `data: ${JSON.stringify({ id: 'g', model: 'm', choices: [{ index: 0, delta: {}, finish_reason: finish }] })}\n\n`,
        `data: ${JSON.stringify({ id: 'g', model: 'm', choices: [], usage: { prompt_tokens: 10, completion_tokens: 20, cost: 0.01 } })}\n\n`,
        'data: [DONE]\n\n',
      ].join('');
    let n = 0;
    const fetchFn = (() => {
      n += 1;
      const body = n === 1 ? chunks('# Chapter\n\nHalf a sent', 'length') : chunks('# Chapter\n\nA whole chapter.', 'stop');
      return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    }) as typeof fetch;
    const s = createAiService({ apiKey: 'test-key-not-real', promptsDir: PROMPTS_DIR, configDir: CONFIG_DIR, fetch: fetchFn, retry: { maxRetries: 0 } });
    s.registry.setModels([REASONING_MODEL('~anthropic/claude-sonnet-latest')]);
    let shown = '';
    let resets = 0;
    const r = await s.runStage('writing.chapter', FULL_INPUT, {
      model: '~anthropic/claude-sonnet-latest',
      onDelta: (t) => (shown += t),
      onReset: () => {
        resets += 1;
        shown = '';
      },
    });
    expect(resets).toBeGreaterThanOrEqual(1);
    expect(shown).not.toContain('Half a sent');
    expect(r.output).toContain('A whole chapter.');
    expect(r.usage.costUsd).toBeCloseTo(0.02);
  });
});

describe('3. spend on failed calls', () => {
  it('InvalidOutputError carries the usage of the answer and the repair', async () => {
    let n = 0;
    const provider: AiProvider = {
      name: 'mock',
      chat(req: ChatRequest): Promise<ChatResult> {
        n += 1;
        return Promise.resolve({
          text: 'not json',
          model: req.model,
          finishReason: 'stop',
          usage: { ...emptyUsage(), promptTokens: 10, completionTokens: 5, costUsd: 0.01 * n },
          sources: [],
          generationId: null,
          latencyMs: 1,
          provider: 'mock',
        });
      },
      generateImage: () => Promise.reject(new Error('unused')),
      listModels: () => Promise.resolve([]),
      keyStatus: () => Promise.reject(new Error('unused')),
    };
    const err = await chatStructured(
      provider,
      { model: 'm', messages: [{ role: 'user', content: 'x' }] },
      TASKS['titles.topic-directions'].output,
      new PromptLoader(PROMPTS_DIR),
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidOutputError);
    expect((err as InvalidOutputError).usage?.costUsd).toBeCloseTo(0.03);
    expect((err as InvalidOutputError).usage?.promptTokens).toBe(20);
  });

  it('runStage keeps the error type and adds the usage of every call', async () => {
    const stub = stubFetch([{ body: completion('not json', { cost: 0.01 }) }, { body: completion('still not json', { cost: 0.02 }) }]);
    const s = service(stub, [REASONING_MODEL('~anthropic/claude-sonnet-latest')]);
    const err = await s.runStage('titles.topic-directions', FULL_INPUT as never, { model: '~anthropic/claude-sonnet-latest' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InvalidOutputError);
    expect((err as AiError).usage?.costUsd).toBeCloseTo(0.03);
  });
});

describe('4. high estimates', () => {
  it('cover the full output allowance (reasoning included) and the web searches of a search stage', () => {
    const s = service(stubFetch([]), [
      REASONING_MODEL('~google/gemini-pro-latest', {
        pricing: {
          inputPerMillion: 2,
          outputPerMillion: 12,
          imageInputPerMillion: null,
          imageOutputPerMillion: null,
          webSearchPerRequest: 0.014,
          perRequest: null,
        },
      }),
    ]);
    const est = s.estimate('research.title-research', FULL_INPUT, { model: '~google/gemini-pro-latest' });
    const stage = s.registry.resolve('research');
    const searches = s.config.defaults.webSearch?.highSearchesPerCall ?? 1;
    const floor = (est.inputTokens * 2 + (stage.highOutputTokens ?? 0) * 12) / 1_000_000 + 0.014 * searches;
    expect(est.highUsd ?? 0).toBeCloseTo(floor, 6);
    // The live research call that went 2.5 times past the old high: 5,008 in, 11,951 out.
    const live = (5008 * 2 + 11951 * 12) / 1_000_000;
    expect(est.highUsd ?? 0).toBeGreaterThan(live);
  });
});

describe('5. search calls with no sources', () => {
  it('searches once more with the configured engine and keeps its url_citation sources', async () => {
    const stub = stubFetch([
      { body: completion(sample('research.title-research'), { model: 'google/gemini-3.1-pro-preview' }) },
      {
        body: completion(sample('research.title-research'), {
          model: 'google/gemini-3.1-pro-preview',
          annotations: [
            { type: 'url_citation', url_citation: { url: 'https://www.gov.uk/working-for-yourself', title: 'Working for yourself', content: 'x' } },
          ],
        }),
      },
    ]);
    const s = service(stub, [REASONING_MODEL('~google/gemini-pro-latest')]);
    const r = await s.runStage('research.title-research', FULL_INPUT, { model: '~google/gemini-pro-latest' });
    const engines = stub.bodies.map((b) => (b['plugins'] as Json[] | undefined)?.[0]?.['engine']);
    expect(engines).toEqual(['native', 'exa']);
    expect(r.sources.map((x) => x.domain)).toEqual(['gov.uk']);
    expect(r.notes.join(' ')).toMatch(/searched again with exa and found 1/);
  });

  it('does not search again when the first call has sources', async () => {
    const stub = stubFetch([
      {
        body: completion(sample('research.title-research'), {
          annotations: [{ type: 'url_citation', url_citation: { url: 'https://www.nhs.uk/a', title: 'A' } }],
        }),
      },
    ]);
    const s = service(stub, [REASONING_MODEL('~google/gemini-pro-latest')]);
    const r = await s.runStage('research.title-research', FULL_INPUT, { model: '~google/gemini-pro-latest' });
    expect(stub.bodies).toHaveLength(1);
    expect(r.sources).toHaveLength(1);
  });
});

describe('6. image requests', () => {
  it('sends n 1 and 2:3 by default from the config', async () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64');
    const stub = stubFetch([{ body: { model: 'google/gemini-2.5-flash-image', data: [{ b64_json: png, media_type: 'image/png' }], usage: { cost: 0.039 } } }]);
    const s = service(stub);
    const r = await s.generateImage('A calm sea, no text');
    expect(stub.bodies[0]).toMatchObject({ n: 1, aspect_ratio: '2:3' });
    expect(r.usage.costUsd).toBe(0.039);
  });
});
