// Deterministic mock provider with the same interface as OpenRouterClient. Used in tests, offline UI work
// and whenever no key is set. Answers come from fixture files chosen by prompt id and input hash, with a
// generic valid answer built from the request's JSON schema when no fixture exists. No network, fixed cost.
//
// Fixture lookup, in each fixtures directory in order:
//   <dir>/<promptId>.<inputHash>.json, <dir>/<promptId>.json, <dir>/<stage>/<promptId>.json
// The automatic style rewrite (meta.purpose 'style-rewrite') first tries <dir>/<promptId>.style-rewrite.json,
// so a test can give a clean second answer; without that file it gets the first answer again.
// Fixture file: { "content": string | object, "annotations"?: [{ "url", "title", "content" }], "model"?: string }
//
// Fault scenarios (options.scenario or request meta.scenario): rate_limit and server_error fail the first
// call per prompt then succeed; invalid_json returns broken JSON on the first call per prompt;
// invalid_json_always always does; stream_cut stops a stream half way on the first call; refusal and
// model_missing always fail; slow waits before answering; no_sources returns no citations.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AbortedError, ModelUnavailableError, RateLimitError, RefusalError, ServerError, StreamCutError } from '../errors.ts';
import type { AiProvider, ChatRequest, ChatResult, ImageRequest, ImageResult, KeyStatus, MockScenario, ModelInfo, Usage } from '../types.ts';
import { asArray, asObject, asString, estimateTokens } from '../util.ts';
import { sleep } from './retry.ts';
import { sampleFromSchema } from './sample.ts';
import { sourcesFromAnnotations } from './openrouter.ts';

export interface MockProviderOptions {
  fixturesDirs?: string[] | undefined;
  scenario?: MockScenario | undefined;
  /** Delay between streamed chunks in ms (default 2). */
  chunkDelayMs?: number | undefined;
  /** Characters per streamed chunk (default 40). */
  chunkSize?: number | undefined;
  /** Fixed fake cost per call in USD (default 0.0001). */
  costUsd?: number | undefined;
  /** Fixed fake cost per image in USD (default 0.001). */
  imageCostUsd?: number | undefined;
  /** Delay for the 'slow' scenario in ms (default 300). */
  slowMs?: number | undefined;
  /** Models returned by listModels. */
  models?: ModelInfo[] | undefined;
}

// A 1 x 1 transparent PNG.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const MOCK_MARKDOWN = [
  'The kettle clicked off and the kitchen went quiet. I remember that quiet better than anything I said that night, because it was the first time I stopped to listen.',
  '## What I Noticed First',
  'Most of us rush past the moment when something small goes wrong. I did, for years. Then one evening I let the silence sit, and the answer I needed was already there.',
  '## Why It Matters',
  'You do not need a grand plan to change how a day feels. You need one honest look at what is in front of you, and the patience to look again tomorrow.',
  '## A Way To Start',
  'Try it tonight. Pick one moment, slow it down, and notice what you would normally miss. That habit carries straight into the next chapter.',
].join('\n\n');

export function mockModelInfo(slug: string, extra: Partial<ModelInfo> = {}): ModelInfo {
  const isImage = /image/.test(slug);
  return {
    slug,
    name: `Mock ${slug}`,
    contextLength: 200_000,
    maxCompletionTokens: 64_000,
    pricing: {
      inputPerMillion: 1,
      outputPerMillion: 5,
      imageInputPerMillion: isImage ? 1 : null,
      imageOutputPerMillion: isImage ? 30 : null,
      webSearchPerRequest: 0.01,
      perRequest: null,
    },
    inputModalities: ['text'],
    outputModalities: isImage ? ['image', 'text'] : ['text'],
    supportedParameters: ['max_tokens', 'temperature', 'response_format', 'structured_outputs', 'tools'],
    supportsTools: true,
    supportsStructured: true,
    supportsSearch: true,
    supportsImageOutput: isImage,
    aliasTarget: null,
    ...extra,
  };
}

interface Fixture {
  content: unknown;
  annotations?: unknown[] | undefined;
  model?: string | undefined;
}

export class MockProvider implements AiProvider {
  readonly name = 'mock' as const;
  private readonly opts: MockProviderOptions;
  private readonly counters = new Map<string, number>();
  /** Every request received, for assertions in tests. */
  readonly requests: ChatRequest[] = [];
  readonly imageRequests: ImageRequest[] = [];

  constructor(opts: MockProviderOptions = {}) {
    this.opts = opts;
  }

  private bump(key: string): number {
    const n = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, n);
    return n;
  }

  private loadFixture(req: ChatRequest): Fixture | undefined {
    const id = req.meta?.promptId;
    if (!id) return undefined;
    const names = [
      ...(req.meta?.purpose === 'style-rewrite' ? [`${id}.style-rewrite.json`] : []),
      ...(req.meta?.inputHash ? [`${id}.${req.meta.inputHash}.json`] : []),
      `${id}.json`,
      ...(req.meta?.stage ? [join(req.meta.stage, `${id}.json`)] : []),
    ];
    for (const dir of this.opts.fixturesDirs ?? []) {
      for (const name of names) {
        const p = join(dir, name);
        if (!existsSync(p)) continue;
        const raw = asObject(JSON.parse(readFileSync(p, 'utf8')));
        if (raw && 'content' in raw) {
          return { content: raw['content'], annotations: asArray(raw['annotations']), model: asString(raw['model']) };
        }
      }
    }
    return undefined;
  }

  private usage(prompt: string, completion: string): Usage {
    const promptTokens = estimateTokens(prompt);
    const completionTokens = estimateTokens(completion);
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      reasoningTokens: 0,
      cachedTokens: 0,
      costUsd: this.opts.costUsd ?? 0.0001,
      costSource: 'mock',
    };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    this.requests.push(req);
    const started = Date.now();
    if (req.signal?.aborted) throw new AbortedError();
    const scenario = req.meta?.scenario ?? this.opts.scenario;
    const key = `${scenario ?? 'none'}:${req.meta?.promptId ?? req.model}`;
    const call = this.bump(key);

    if (scenario === 'model_missing') {
      throw new ModelUnavailableError(`Mock: model ${req.model} not found.`, req.model, {}, { status: 404 });
    }
    if (scenario === 'refusal') throw new RefusalError('Mock: the model refused this request.', { status: 403 });
    if (scenario === 'rate_limit' && call === 1) throw new RateLimitError('Mock: rate limited.', 0, { status: 429 });
    if (scenario === 'server_error' && call === 1) throw new ServerError('Mock: server error.', { status: 500 });
    if (scenario === 'slow') await sleep(this.opts.slowMs ?? 300, req.signal);

    const fixture = this.loadFixture(req);
    let text: string;
    if (fixture) {
      text = typeof fixture.content === 'string' ? fixture.content : JSON.stringify(fixture.content, null, 2);
    } else if (req.responseFormat?.type === 'json_schema') {
      text = JSON.stringify(sampleFromSchema(req.responseFormat.schema), null, 2);
    } else if (req.responseFormat?.type === 'json_object') {
      text = '{}';
    } else {
      text = MOCK_MARKDOWN;
    }
    if (scenario === 'invalid_json_always' || (scenario === 'invalid_json' && call === 1)) {
      text = '{"this is": not valid json';
    }

    const sources =
      req.webSearch && scenario !== 'no_sources'
        ? sourcesFromAnnotations(
            fixture?.annotations?.length
              ? fixture.annotations.map((a) => ({ type: 'url_citation', url_citation: a }))
              : [
                  {
                    type: 'url_citation',
                    url_citation: { url: 'https://example.org/mock-source-one', title: 'Mock source one', content: 'A mock excerpt for tests.' },
                  },
                  {
                    type: 'url_citation',
                    url_citation: { url: 'https://example.org/mock-source-two', title: 'Mock source two', content: 'A second mock excerpt.' },
                  },
                ],
          )
        : [];

    if (req.stream) {
      const size = this.opts.chunkSize ?? 40;
      const cutAt = scenario === 'stream_cut' && call === 1 ? Math.floor(text.length / 2) : -1;
      let sent = '';
      for (let i = 0; i < text.length; i += size) {
        if (req.signal?.aborted) throw new AbortedError();
        if (cutAt >= 0 && i >= cutAt) throw new StreamCutError('Mock: the stream was cut.', sent);
        const piece = text.slice(i, i + size);
        sent += piece;
        req.onDelta?.(piece);
        await sleep(this.opts.chunkDelayMs ?? 2, req.signal);
      }
    }

    const promptText = req.messages.map((m) => m.content).join('\n');
    return {
      text,
      model: fixture?.model ?? req.model,
      finishReason: 'stop',
      usage: this.usage(promptText, text),
      sources,
      generationId: `mock-${req.meta?.promptId ?? 'chat'}-${call}`,
      latencyMs: Date.now() - started,
      provider: 'mock',
    };
  }

  generateImage(req: ImageRequest): Promise<ImageResult> {
    this.imageRequests.push(req);
    const scenario = req.meta?.scenario ?? this.opts.scenario;
    if (scenario === 'model_missing') throw new ModelUnavailableError(`Mock: model ${req.model} not found.`, req.model, {}, { status: 404 });
    if (scenario === 'refusal') throw new RefusalError('Mock: image refused.', { status: 403 });
    const n = req.n ?? 1;
    const each = this.opts.imageCostUsd ?? 0.001;
    return Promise.resolve({
      images: Array.from({ length: n }, () => ({ data: Buffer.from(TINY_PNG, 'base64'), mediaType: 'image/png' })),
      model: req.model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, reasoningTokens: 0, cachedTokens: 0, costUsd: each * n, costSource: 'mock' },
      latencyMs: 1,
      provider: 'mock',
    });
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve(this.opts.models ?? []);
  }

  keyStatus(): Promise<KeyStatus> {
    return Promise.resolve({ valid: true, label: 'mock', limitUsd: null, limitRemainingUsd: null, usageUsd: 0, isFreeTier: false });
  }
}
