// house-style:off (test data quotes banned phrases, ISBNs and claims on purpose)
import { afterEach, describe, expect, it } from 'vitest';
import {
  AbortedError,
  AuthError,
  BudgetError,
  ModelUnavailableError,
  OpenRouterClient,
  RateLimitError,
  RefusalError,
  ServerError,
  StreamCutError,
  TimeoutError,
  createAiService,
  type OpenRouterClientOptions,
} from '../src/index.ts';
import { CONFIG_DIR, FULL_INPUT, PROMPTS_DIR, sendJson, sseChunk, startFakeServer, type FakeServer } from './helpers.ts';

let server: FakeServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const FAST_RETRY = { delaysMs: [5, 5, 5], jitter: 0 };

function client(url: string, extra: Partial<OpenRouterClientOptions> = {}): OpenRouterClient {
  return new OpenRouterClient({ apiKey: 'test-key-not-real', baseUrl: url, retry: FAST_RETRY, ...extra });
}

const completion = (content: string, extra: Record<string, unknown> = {}) => ({
  id: 'gen-1',
  object: 'chat.completion',
  created: 1,
  model: 'anthropic/claude-sonnet-5.5',
  choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content, ...extra } }],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    cost: 0.0012,
    completion_tokens_details: { reasoning_tokens: 2 },
    prompt_tokens_details: { cached_tokens: 1 },
  },
});

describe('OpenRouterClient against a local fake server', () => {
  it('sends attribution headers, the web plugin and the JSON schema, and maps usage and sources', async () => {
    server = await startFakeServer((_req, res) =>
      sendJson(
        res,
        200,
        completion('{"ok":true}', {
          annotations: [
            { type: 'url_citation', url_citation: { url: 'https://a.example.org/x', title: 'A', content: 'Excerpt A', start_index: 0, end_index: 5 } },
            { type: 'url_citation', url_citation: { url: 'https://a.example.org/x', title: 'A again' } },
            { type: 'url_citation', url_citation: { url: 'https://b.example.org/y', title: 'B' } },
          ],
        }),
      ),
    );
    const r = await client(server.url, { appUrl: 'http://127.0.0.1:5173', appTitle: 'Volume' }).chat({
      model: '~google/gemini-pro-latest',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
      ],
      temperature: 0.3,
      maxTokens: 100,
      webSearch: { engine: 'native', maxResults: 8 },
      responseFormat: { type: 'json_schema', name: 'x', schema: { type: 'object' } },
    });
    const req = server.requests[0];
    expect(req?.url).toBe('/api/v1/chat/completions');
    expect(req?.headers['authorization']).toBe('Bearer test-key-not-real');
    expect(req?.headers['http-referer']).toBe('http://127.0.0.1:5173');
    expect(req?.headers['x-openrouter-title']).toBe('Volume');
    expect(req?.body).toMatchObject({
      model: '~google/gemini-pro-latest',
      temperature: 0.3,
      max_tokens: 100,
      plugins: [{ id: 'web', engine: 'native', max_results: 8 }],
      response_format: { type: 'json_schema', json_schema: { name: 'x', schema: { type: 'object' }, strict: false } },
    });
    expect(r.text).toBe('{"ok":true}');
    expect(r.model).toBe('anthropic/claude-sonnet-5.5');
    expect(r.usage).toMatchObject({ promptTokens: 10, completionTokens: 5, costUsd: 0.0012, costSource: 'openrouter', reasoningTokens: 2, cachedTokens: 1 });
    expect(r.sources).toEqual([
      { id: 'S1', url: 'https://a.example.org/x', title: 'A', snippet: 'Excerpt A', startIndex: 0, endIndex: 5 },
      { id: 'S2', url: 'https://b.example.org/y', title: 'B', snippet: '', startIndex: undefined, endIndex: undefined },
    ]);
    expect(r.generationId).toBe('gen-1');
  });

  it('streams deltas, skips keep-alive comments and reads the final usage chunk', async () => {
    server = await startFakeServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(': OPENROUTER PROCESSING\n\n');
      res.write(sseChunk({ id: 'gen-s', model: 'google/gemini-3-pro', choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello ' } }] }));
      res.write(
        sseChunk({
          id: 'gen-s',
          model: 'google/gemini-3-pro',
          choices: [
            {
              index: 0,
              delta: { content: 'world', annotations: [{ type: 'url_citation', url_citation: { url: 'https://c.example.org', title: 'C', content: 'cc' } }] },
            },
          ],
        }),
      );
      res.write(sseChunk({ id: 'gen-s', model: 'google/gemini-3-pro', choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }] }));
      res.write(
        sseChunk({
          id: 'gen-s',
          model: 'google/gemini-3-pro',
          choices: [{ index: 0, delta: { content: '' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5, cost: 0.0004 },
        }),
      );
      res.end(sseChunk('[DONE]'));
    });
    const deltas: string[] = [];
    const r = await client(server.url).chat({
      model: 'm',
      messages: [{ role: 'user', content: 'x' }],
      stream: true,
      onDelta: (t) => deltas.push(t),
    });
    expect(deltas).toEqual(['Hello ', 'world']);
    expect(r.text).toBe('Hello world');
    expect(r.finishReason).toBe('stop');
    expect(r.usage.costUsd).toBe(0.0004);
    expect(r.sources[0]?.url).toBe('https://c.example.org');
    expect(server.requests[0]?.body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it('turns a mid-stream error after text into StreamCutError (not retried)', async () => {
    server = await startFakeServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sseChunk({ id: 'g', model: 'm', choices: [{ index: 0, delta: { content: 'Part' } }] }));
      res.end(
        sseChunk({
          id: 'g',
          model: 'm',
          error: { code: 502, message: 'Provider disconnected' },
          choices: [{ index: 0, delta: { content: '' }, finish_reason: 'error' }],
        }),
      );
    });
    const err = await client(server.url)
      .chat({ model: 'm', messages: [{ role: 'user', content: 'x' }], stream: true })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StreamCutError);
    expect((err as StreamCutError).partialText).toBe('Part');
    expect(server.requests).toHaveLength(1);
  });

  it.each([
    [401, AuthError],
    [402, BudgetError],
    [403, RefusalError],
    [404, ModelUnavailableError],
  ])('maps HTTP %i to a typed error without retrying', async (status, cls) => {
    server = await startFakeServer((_req, res) => sendJson(res, status, { error: { code: status, message: `fail ${status}` } }));
    await expect(client(server.url).chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(cls);
    expect(server.requests).toHaveLength(1);
  });

  it('maps an invalid model id (400) to ModelUnavailableError', async () => {
    server = await startFakeServer((_req, res) => sendJson(res, 400, { error: { code: 400, message: 'nope/model is not a valid model ID' } }));
    const err = await client(server.url)
      .chat({ model: 'nope/model', messages: [{ role: 'user', content: 'x' }] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ModelUnavailableError);
    expect((err as ModelUnavailableError).model).toBe('nope/model');
  });

  it('retries 429 honouring Retry-After, then succeeds', async () => {
    server = await startFakeServer((_req, res, n) =>
      n === 1 ? sendJson(res, 429, { error: { code: 429, message: 'slow down' } }, { 'Retry-After': '0' }) : sendJson(res, 200, completion('done')),
    );
    const retries: number[] = [];
    const c = client(server.url, { retry: { ...FAST_RETRY, onRetry: (i) => retries.push(i.delayMs) } });
    const r = await c.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
    expect(r.text).toBe('done');
    expect(server.requests).toHaveLength(2);
    expect(retries).toEqual([0]);
  });

  it('retries 5xx three times, then throws ServerError', async () => {
    server = await startFakeServer((_req, res) => sendJson(res, 500, { error: { code: 500, message: 'boom' } }));
    await expect(client(server.url).chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] })).rejects.toBeInstanceOf(ServerError);
    expect(server.requests).toHaveLength(4);
  });

  it('gives up on a rate limit after the retries with RateLimitError', async () => {
    server = await startFakeServer((_req, res) => sendJson(res, 429, { error: { code: 429, message: 'limit' } }));
    await expect(
      client(server.url, { retry: { delaysMs: [1], maxRetries: 1, jitter: 0 } }).chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toBeInstanceOf(RateLimitError);
    expect(server.requests).toHaveLength(2);
  });

  it('times out a request that never answers', async () => {
    server = await startFakeServer(() => {
      /* never respond */
    });
    const c = client(server.url, { retry: { maxRetries: 0 } });
    await expect(c.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }], timeoutMs: 150 })).rejects.toBeInstanceOf(TimeoutError);
  });

  it('stops a stream that goes quiet (idle timeout)', async () => {
    server = await startFakeServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sseChunk({ id: 'g', model: 'm', choices: [{ index: 0, delta: { content: 'start' } }] }));
    });
    const c = client(server.url, { retry: { maxRetries: 0 } });
    const err = await c.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }], stream: true, idleTimeoutMs: 150 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StreamCutError);
  });

  it('cancels when the caller aborts', async () => {
    server = await startFakeServer(() => {
      /* never respond */
    });
    const ac = new AbortController();
    const p = client(server.url).chat({ model: 'm', messages: [{ role: 'user', content: 'x' }], signal: ac.signal });
    setTimeout(() => ac.abort(), 50);
    await expect(p).rejects.toBeInstanceOf(AbortedError);
  });

  it('generates images from POST /images as Buffers with media type and cost', async () => {
    const png = Buffer.from('fake-png-bytes').toString('base64');
    server = await startFakeServer((_req, res) =>
      sendJson(res, 200, {
        created: 1,
        data: [
          { b64_json: png, media_type: 'image/png' },
          { b64_json: png, media_type: 'image/jpeg' },
        ],
        usage: { cost: 0.04 },
      }),
    );
    const r = await client(server.url).generateImage({
      model: 'google/gemini-2.5-flash-image',
      prompt: 'a window',
      n: 2,
      aspectRatio: '2:3',
      resolution: '2K',
      outputFormat: 'png',
    });
    expect(server.requests[0]?.url).toBe('/api/v1/images');
    expect(server.requests[0]?.body).toEqual({
      model: 'google/gemini-2.5-flash-image',
      prompt: 'a window',
      n: 2,
      aspect_ratio: '2:3',
      resolution: '2K',
      output_format: 'png',
    });
    expect(r.images).toHaveLength(2);
    expect(r.images[0]?.data.toString()).toBe('fake-png-bytes');
    expect(r.images[1]?.mediaType).toBe('image/jpeg');
    expect(r.usage.costUsd).toBe(0.04);
  });

  it('maps GET /models into ModelInfo with prices per million tokens', async () => {
    server = await startFakeServer((_req, res) =>
      sendJson(res, 200, {
        data: [
          {
            id: '~anthropic/claude-sonnet-latest',
            name: 'Anthropic: Claude Sonnet Latest',
            context_length: 1000000,
            alias_target: { slug: 'anthropic/claude-sonnet-5.5' },
            architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
            pricing: { prompt: '0.000002', completion: '0.00001', web_search: '0.01' },
            top_provider: { max_completion_tokens: 128000 },
            supported_parameters: ['max_tokens', 'temperature', 'structured_outputs', 'tools'],
          },
          {
            id: 'google/gemini-2.5-flash-image',
            name: 'Gemini image',
            context_length: 32768,
            architecture: { output_modalities: ['image', 'text'] },
            pricing: { prompt: '0.0000003', completion: '0.0000025', image: '0.0000003', image_output: '0.00003' },
            supported_parameters: ['max_tokens', 'response_format'],
          },
        ],
      }),
    );
    const models = await client(server.url).listModels();
    expect(models[0]).toMatchObject({
      slug: '~anthropic/claude-sonnet-latest',
      contextLength: 1000000,
      maxCompletionTokens: 128000,
      pricing: { inputPerMillion: 2, outputPerMillion: 10, webSearchPerRequest: 0.01 },
      supportsTools: true,
      supportsStructured: true,
      supportsSearch: true,
      aliasTarget: 'anthropic/claude-sonnet-5.5',
    });
    expect(models[1]).toMatchObject({ supportsImageOutput: true, supportsTools: false, pricing: { imageOutputPerMillion: 30 } });
  });

  it('reports key status, and an invalid key as valid: false', async () => {
    server = await startFakeServer((req, res) =>
      req.headers['authorization'] === 'Bearer test-key-not-real'
        ? sendJson(res, 200, { data: { label: 'volume', limit: 10, limit_remaining: 9.5, usage: 0.5, is_free_tier: false } })
        : sendJson(res, 401, { error: { code: 401, message: 'bad key' } }),
    );
    expect(await client(server.url).keyStatus()).toEqual({
      valid: true,
      label: 'volume',
      limitUsd: 10,
      limitRemainingUsd: 9.5,
      usageUsd: 0.5,
      isFreeTier: false,
    });
    expect((await client(server.url, { apiKey: 'wrong' }).keyStatus()).valid).toBe(false);
  });

  it('computes cost from registry prices when OpenRouter omits it', async () => {
    server = await startFakeServer((_req, res) =>
      sendJson(res, 200, { ...completion('x'), usage: { prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000 } }),
    );
    const c = client(server.url, {
      pricingLookup: () => ({
        inputPerMillion: 3,
        outputPerMillion: 15,
        imageInputPerMillion: null,
        imageOutputPerMillion: null,
        webSearchPerRequest: null,
        perRequest: null,
      }),
    });
    const r = await c.chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
    expect(r.usage).toMatchObject({ costUsd: 3, costSource: 'computed' });
  });

  it('runs a whole stage through createAiService against the fake server', async () => {
    const titleJson = JSON.stringify({
      ideaAnalysis: 'A short analysis.',
      directions: [{ workingTitle: 'Quiet Hours', focus: 'f', whyItWorks: 'w', targetReaders: 't', authorFit: 'a', evidence: ['S1'], risk: 'r' }],
    });
    server = await startFakeServer((_req, res) => sendJson(res, 200, completion(titleJson)));
    const s = createAiService({ apiKey: 'test-key-not-real', baseUrl: server.url, promptsDir: PROMPTS_DIR, configDir: CONFIG_DIR, retry: FAST_RETRY });
    const r = await s.runStage('titles.topic-directions', FULL_INPUT);
    expect(r.provider).toBe('openrouter');
    expect(r.model).toBe('anthropic/claude-sonnet-5.5');
    expect(r.sentModel).toBe('~anthropic/claude-sonnet-latest');
    expect(r.output.directions[0]?.workingTitle).toBe('Quiet Hours');
    expect(r.usage.costUsd).toBe(0.0012);
    const body = server.requests[0]?.body as { response_format?: { type?: string }; temperature?: number };
    expect(body.response_format?.type).toBe('json_schema');
    // The Sonnet alias points at Claude Sonnet 5.5, which refuses non-default sampling (config modelRules).
    expect(body.temperature).toBeUndefined();
  });
});
