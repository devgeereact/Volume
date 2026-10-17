// OpenRouter client. Chat completions go through the official OpenAI SDK with the OpenRouter base URL
// (docs/02-architecture/ARCHITECTURE.md). Images, models and key status use plain fetch, because those endpoints are
// OpenRouter-only. The SDK's own retries are off; this client retries with the schedule in
// docs/02-architecture/AI-PIPELINE.md and maps every failure to a typed AiError.

import OpenAI, { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from 'openai';
import {
  AbortedError,
  AiError,
  AuthError,
  BadRequestError,
  BudgetError,
  ModelUnavailableError,
  NetworkError,
  OutputTruncatedError,
  RateLimitError,
  RefusalError,
  ServerError,
  StreamCutError,
  TimeoutError,
} from '../errors.ts';
import type {
  AiProvider,
  ChatRequest,
  ChatResult,
  ImageRequest,
  ImageResult,
  KeyStatus,
  ModelInfo,
  ModelPricing,
  Source,
  GeneratedImage,
  Usage,
} from '../types.ts';
import { asArray, asNumber, asObject, asString } from '../util.ts';
import { mapModel, mapUsage } from './models.ts';
import { parseRetryAfter, withRetry, type RetryOptions } from './retry.ts';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterClientOptions {
  /** The OpenRouter key, passed in by the server. Never read from disk here. */
  apiKey: string;
  baseUrl?: string | undefined;
  /** Attribution: sent as HTTP-Referer. */
  appUrl?: string | undefined;
  /** Attribution: sent as X-OpenRouter-Title (current header name; X-Title is the older alias). */
  appTitle?: string | undefined;
  /** Default whole-request timeout in ms (10 minutes). */
  timeoutMs?: number | undefined;
  /** Default stream idle timeout in ms (120 s). */
  idleTimeoutMs?: number | undefined;
  retry?: RetryOptions | undefined;
  /** Prices for computing a cost when OpenRouter does not report one. */
  pricingLookup?: ((slug: string) => ModelPricing | undefined) | undefined;
  /** Custom fetch, for tests. */
  fetch?: typeof fetch | undefined;
}

interface CallState {
  partialText: string;
  timedOut: boolean;
  userAborted: boolean;
}

type ChatBody = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming & {
  plugins?: Array<Record<string, unknown>>;
  reasoning?: Record<string, unknown>;
  provider?: Record<string, unknown>;
};
type ChatStreamBody = OpenAI.Chat.ChatCompletionCreateParamsStreaming & {
  plugins?: Array<Record<string, unknown>>;
  reasoning?: Record<string, unknown>;
  provider?: Record<string, unknown>;
};

/** Map an HTTP status plus OpenRouter error body to a typed error. */
export function errorFromStatus(status: number, message: string, model: string | undefined, headers?: Headers, metadata?: Record<string, unknown>): AiError {
  const init = { status, details: metadata };
  switch (true) {
    case status === 400:
      if (/model/i.test(message) && /(not a valid|not found|does not exist|unknown|no endpoints|unavailable)/i.test(message)) {
        return new ModelUnavailableError(message, model ?? 'unknown', {}, init);
      }
      return new BadRequestError(message, init);
    case status === 401:
      return new AuthError(message || 'OpenRouter rejected the API key.', init);
    case status === 402:
      return new BudgetError(message || 'The OpenRouter account has too few credits.', 'credits', {}, init);
    case status === 403:
      return new RefusalError(message || 'The request was blocked by moderation.', init);
    case status === 404:
      return new ModelUnavailableError(message || 'Model not found.', model ?? 'unknown', {}, init);
    case status === 408:
      return new TimeoutError(message || 'OpenRouter timed out.', init);
    case status === 429:
      return new RateLimitError(message || 'Rate limited.', parseRetryAfter(headers?.get('retry-after')), init);
    case status === 502 || status === 503:
      return new ModelUnavailableError(
        message || 'No provider is available for this model.',
        model ?? 'unknown',
        {},
        {
          ...init,
          retryable: true,
        },
      );
    case status >= 500:
      return new ServerError(message || `OpenRouter server error ${status}.`, init);
    default:
      return new BadRequestError(message || `HTTP ${status}`, init);
  }
}

/** Pull the readable message out of a provider's raw error payload (a JSON string or an object). */
function messageFromRaw(raw: unknown, depth = 0): string | undefined {
  if (depth > 4 || raw === undefined || raw === null) return undefined;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return undefined;
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return messageFromRaw(JSON.parse(t), depth + 1) ?? t;
      } catch {
        return t;
      }
    }
    return t;
  }
  if (Array.isArray(raw)) {
    const parts = raw.map((r) => messageFromRaw(r, depth + 1)).filter((m): m is string => typeof m === 'string' && m.length > 0);
    return parts.length ? parts.join('; ') : undefined;
  }
  const o = asObject(raw);
  if (!o) return undefined;
  const nested = messageFromRaw(o['error'], depth + 1);
  if (nested) return nested;
  const msg = asString(o['message']);
  if (!msg) return undefined;
  // zod-style issue lists name the field in `path`.
  const path = asArray(o['path']).filter((p) => typeof p === 'string' || typeof p === 'number');
  return path.length ? `${path.join('.')}: ${msg}` : msg;
}

/** One line of plain words, at most `max` characters. */
function oneLine(text: string, max = 400): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Read an OpenRouter error body. The provider's own words (metadata.raw, with metadata.provider_name) are
 * added to the message, because OpenRouter's message alone is often just "Provider returned error".
 * See https://openrouter.ai/docs/api/reference/errors-and-debugging.
 */
export function errorBodyParts(body: unknown): { message: string; code: number | undefined; metadata: Record<string, unknown> | undefined } {
  const o = asObject(body);
  const inner = asObject(o?.['error']) ?? o;
  const metadata = asObject(inner?.['metadata']);
  const base = messageFromRaw(asString(inner?.['message']) ?? '') ?? '';
  const provider = asString(metadata?.['provider_name']);
  const raw = messageFromRaw(metadata?.['raw']);
  let message = oneLine(base);
  if (raw && !message.includes(oneLine(raw, 200))) {
    message = `${message || 'The provider returned an error'} (${provider ? `${provider} said: ` : ''}${oneLine(raw, 300)})`;
  } else if (provider && message && !message.includes(provider)) {
    message = `${message} (provider: ${provider})`;
  }
  return { message, code: asNumber(inner?.['code']), metadata };
}

/** OpenRouter provider slug from a provider_name such as "Azure" or "Amazon Bedrock" (azure, amazon-bedrock). */
export function providerSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** finish_reason "length", or a native stop reason meaning the token limit was hit. */
export function isTruncated(finishReason: string | null, nativeFinishReason: string | null): boolean {
  if (finishReason === 'length') return true;
  return nativeFinishReason !== null && /^(length|max_tokens|max_output_tokens)$/i.test(nativeFinishReason);
}

function mapThrown(e: unknown, state: CallState, model: string | undefined): AiError {
  if (e instanceof AiError) return e;
  if (state.userAborted) return new AbortedError();
  if (state.timedOut) {
    return state.partialText ? new StreamCutError('The stream went quiet and was stopped.', state.partialText) : new TimeoutError();
  }
  if (e instanceof APIUserAbortError) return new AbortedError();
  if (e instanceof APIConnectionTimeoutError) return new TimeoutError();
  if (e instanceof APIConnectionError) {
    return state.partialText
      ? new StreamCutError('The connection dropped mid-stream.', state.partialText, { cause: e })
      : new NetworkError(e.message, { cause: e });
  }
  if (e instanceof APIError) {
    const parts = errorBodyParts(e.error);
    // instanceof gives APIError<any, ...>, so name the field types here.
    const status = (e.status as number | undefined) ?? parts.code;
    const headers = e.headers as Headers | undefined;
    if (status === undefined) {
      return state.partialText
        ? new StreamCutError(parts.message || 'The stream stopped with an error.', state.partialText)
        : new ServerError(parts.message || e.message);
    }
    const mapped = errorFromStatus(status, parts.message || e.message, model, headers, parts.metadata);
    // A retryable failure after text arrived means the partial text must be discarded.
    if (state.partialText && mapped.retryable) {
      return new StreamCutError(mapped.message, state.partialText, { status, cause: mapped });
    }
    return mapped;
  }
  if (e instanceof Error && e.name === 'AbortError') return new AbortedError();
  const msg = e instanceof Error ? e.message : String(e);
  return state.partialText ? new StreamCutError(msg, state.partialText) : new NetworkError(msg, { cause: e });
}

/** Read url_citation annotations into sources, deduplicated by URL, ids S1.. in order of first appearance. */
export function sourcesFromAnnotations(annotations: unknown[], into: Source[] = []): Source[] {
  for (const a of annotations) {
    const o = asObject(a);
    if (!o || o['type'] !== 'url_citation') continue;
    const c = asObject(o['url_citation']) ?? o;
    const url = asString(c['url']);
    if (!url) continue;
    const existing = into.find((s) => s.url === url);
    const snippet = asString(c['content']) ?? '';
    if (existing) {
      if (!existing.snippet && snippet) existing.snippet = snippet;
      continue;
    }
    into.push({
      id: `S${into.length + 1}`,
      url,
      title: asString(c['title']) ?? url,
      snippet,
      startIndex: asNumber(c['start_index']),
      endIndex: asNumber(c['end_index']),
    });
  }
  return into;
}

export class OpenRouterClient implements AiProvider {
  readonly name = 'openrouter' as const;
  private readonly sdk: OpenAI;
  private readonly opts: OpenRouterClientOptions;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenRouterClientOptions) {
    if (!opts.apiKey) throw new AuthError('No OpenRouter API key was given to the client.');
    this.opts = opts;
    this.baseUrl = (opts.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/$/, '');
    this.headers = {
      'HTTP-Referer': opts.appUrl ?? 'http://127.0.0.1',
      'X-OpenRouter-Title': opts.appTitle ?? 'Volume',
    };
    this.fetchImpl = opts.fetch ?? fetch;
    this.sdk = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: this.baseUrl,
      defaultHeaders: this.headers,
      maxRetries: 0,
      timeout: opts.timeoutMs ?? 600_000,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  private retryOpts(extra: Partial<RetryOptions> = {}): RetryOptions {
    return { ...this.opts.retry, ...extra };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    // Stream cuts are not retried here: the caller has already shown partial text and must reset first.
    return withRetry(() => this.chatOnce(req), this.retryOpts({ retryIf: (e) => e.kind !== 'stream_cut' }), req.signal);
  }

  private buildBody(req: ChatRequest): ChatBody {
    const body: ChatBody = {
      model: req.model,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (req.temperature !== undefined && req.temperature !== null) body.temperature = req.temperature;
    if (req.maxTokens !== undefined && req.maxTokens !== null) body.max_tokens = req.maxTokens;
    if (req.providerIgnore && req.providerIgnore.length > 0) body.provider = { ignore: [...req.providerIgnore] };
    if (req.reasoning) {
      const r: Record<string, unknown> = {};
      if (req.reasoning.effort) r['effort'] = req.reasoning.effort;
      if (req.reasoning.maxTokens !== undefined) r['max_tokens'] = req.reasoning.maxTokens;
      if (req.reasoning.exclude !== undefined) r['exclude'] = req.reasoning.exclude;
      if (Object.keys(r).length > 0) body.reasoning = r;
    }
    if (req.responseFormat?.type === 'json_schema') {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: req.responseFormat.name,
          schema: req.responseFormat.schema,
          strict: req.responseFormat.strict ?? false,
        },
      };
    } else if (req.responseFormat?.type === 'json_object') {
      body.response_format = { type: 'json_object' };
    }
    if (req.webSearch) {
      const plugin: Record<string, unknown> = { id: 'web' };
      if (req.webSearch.engine) plugin['engine'] = req.webSearch.engine;
      if (req.webSearch.maxResults !== undefined) plugin['max_results'] = req.webSearch.maxResults;
      if (req.webSearch.searchPrompt) plugin['search_prompt'] = req.webSearch.searchPrompt;
      body.plugins = [plugin];
    }
    return body;
  }

  private async chatOnce(req: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    const state: CallState = { partialText: '', timedOut: false, userAborted: false };
    const controller = new AbortController();
    const onUserAbort = (): void => {
      state.userAborted = true;
      controller.abort();
    };
    if (req.signal?.aborted) throw new AbortedError();
    req.signal?.addEventListener('abort', onUserAbort, { once: true });
    const totalMs = req.timeoutMs ?? this.opts.timeoutMs ?? 600_000;
    const totalTimer = setTimeout(() => {
      state.timedOut = true;
      controller.abort();
    }, totalMs);
    const idleMs = req.idleTimeoutMs ?? this.opts.idleTimeoutMs ?? 120_000;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const armIdle = (): void => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        state.timedOut = true;
        controller.abort();
      }, idleMs);
    };
    const pricing = this.opts.pricingLookup;
    try {
      const body = this.buildBody(req);
      if (!req.stream) {
        const completion = await this.sdk.chat.completions.create(body, {
          signal: controller.signal,
          timeout: totalMs,
        });
        const raw = asObject(completion) ?? {};
        const choice = asObject(asArray(raw['choices'])[0]) ?? {};
        const message = asObject(choice['message']) ?? {};
        const text = asString(message['content']) ?? '';
        const finishReason = asString(choice['finish_reason']) ?? null;
        const nativeFinishReason = asString(choice['native_finish_reason']) ?? null;
        const model = asString(raw['model']) ?? req.model;
        checkRefusal(finishReason, asString(message['refusal']), text);
        const usage = mapUsage(raw['usage'], pricing?.(model) ?? pricing?.(req.model));
        checkTruncated(req, finishReason, nativeFinishReason, text, usage);
        return {
          text,
          model,
          finishReason,
          nativeFinishReason,
          usage,
          sources: sourcesFromAnnotations(asArray(message['annotations'])),
          generationId: asString(raw['id']) ?? null,
          latencyMs: Date.now() - started,
          provider: 'openrouter',
        };
      }

      const streamBody: ChatStreamBody = { ...body, stream: true, stream_options: { include_usage: true } };
      armIdle();
      const stream = await this.sdk.chat.completions.create(streamBody, {
        signal: controller.signal,
        timeout: totalMs,
      });
      let text = '';
      let finishReason: string | null = null;
      let nativeFinishReason: string | null = null;
      let model = req.model;
      let usageRaw: unknown;
      let generationId: string | null = null;
      let refusal: string | undefined;
      const sources: Source[] = [];
      for await (const chunk of stream) {
        armIdle();
        const raw = asObject(chunk) ?? {};
        model = asString(raw['model']) ?? model;
        generationId = asString(raw['id']) ?? generationId;
        if (raw['usage'] !== undefined && raw['usage'] !== null) usageRaw = raw['usage'];
        const choice = asObject(asArray(raw['choices'])[0]);
        if (!choice) continue;
        const delta = asObject(choice['delta']) ?? {};
        const piece = asString(delta['content']);
        if (piece) {
          text += piece;
          state.partialText = text;
          req.onDelta?.(piece);
        }
        refusal = asString(delta['refusal']) ?? refusal;
        sourcesFromAnnotations(asArray(delta['annotations']), sources);
        const msg = asObject(choice['message']);
        if (msg) sourcesFromAnnotations(asArray(msg['annotations']), sources);
        const fr = asString(choice['finish_reason']);
        if (fr) finishReason = fr;
        const nfr = asString(choice['native_finish_reason']);
        if (nfr) nativeFinishReason = nfr;
      }
      // The SDK can end the iterator quietly on abort, so check why the loop stopped.
      if (state.userAborted) throw new AbortedError();
      if (state.timedOut) {
        throw text ? new StreamCutError('The stream went quiet and was stopped.', text) : new TimeoutError();
      }
      const streamUsage = mapUsage(usageRaw, pricing?.(model) ?? pricing?.(req.model));
      if (finishReason === null && isTruncated(null, nativeFinishReason)) finishReason = 'length';
      if (finishReason === null) {
        throw text ? new StreamCutError('The stream ended without a finish reason.', text) : new ServerError('The stream ended with no answer.');
      }
      if (finishReason === 'error') {
        throw text ? new StreamCutError('The stream ended with an error.', text) : new ServerError('The stream ended with an error.');
      }
      checkRefusal(finishReason, refusal, text);
      checkTruncated(req, finishReason, nativeFinishReason, text, streamUsage);
      return {
        text,
        model,
        finishReason,
        nativeFinishReason,
        usage: streamUsage,
        sources,
        generationId,
        latencyMs: Date.now() - started,
        provider: 'openrouter',
      };
    } catch (e) {
      throw mapThrown(e, state, req.model);
    } finally {
      clearTimeout(totalTimer);
      if (idleTimer) clearTimeout(idleTimer);
      req.signal?.removeEventListener('abort', onUserAbort);
    }
  }

  /** Plain fetch for OpenRouter-only endpoints, with timeout, abort and typed errors. */
  private async requestJson(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    signal: AbortSignal | undefined,
    timeoutMs: number,
    model?: string,
  ): Promise<unknown> {
    const state: CallState = { partialText: '', timedOut: false, userAborted: false };
    const controller = new AbortController();
    const onUserAbort = (): void => {
      state.userAborted = true;
      controller.abort();
    };
    if (signal?.aborted) throw new AbortedError();
    signal?.addEventListener('abort', onUserAbort, { once: true });
    const timer = setTimeout(() => {
      state.timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...this.headers,
          Authorization: `Bearer ${this.opts.apiKey}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      const textBody = await res.text();
      let parsed: unknown;
      try {
        parsed = textBody ? JSON.parse(textBody) : {};
      } catch {
        parsed = { error: { message: textBody.slice(0, 300) } };
      }
      if (!res.ok) {
        const parts = errorBodyParts(parsed);
        throw errorFromStatus(res.status, parts.message, model, res.headers, parts.metadata);
      }
      return parsed;
    } catch (e) {
      throw mapThrown(e, state, model);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onUserAbort);
    }
  }

  async generateImage(req: ImageRequest): Promise<ImageResult> {
    const started = Date.now();
    const body: Record<string, unknown> = { model: req.model, prompt: req.prompt };
    if (req.n !== undefined) body['n'] = req.n;
    if (req.aspectRatio) body['aspect_ratio'] = req.aspectRatio;
    if (req.resolution) body['resolution'] = req.resolution;
    if (req.outputFormat) body['output_format'] = req.outputFormat;
    if (req.inputReferences?.length) {
      body['input_references'] = req.inputReferences.map((r) => ({ type: 'image_url', image_url: { url: r.url } }));
    }
    if (req.seed !== undefined) body['seed'] = req.seed;
    const parsed = await withRetry(
      () => this.requestJson('POST', '/images', body, req.signal, req.timeoutMs ?? this.opts.timeoutMs ?? 300_000, req.model),
      this.retryOpts(),
      req.signal,
    );
    const o = asObject(parsed) ?? {};
    const images: GeneratedImage[] = [];
    for (const item of asArray(o['data'])) {
      const d = asObject(item);
      const b64 = asString(d?.['b64_json']);
      if (!b64) continue;
      images.push({ data: Buffer.from(b64, 'base64'), mediaType: asString(d?.['media_type']) ?? 'image/png' });
    }
    if (images.length === 0) throw new ServerError('The image endpoint returned no images.');
    const model = asString(o['model']) ?? req.model;
    return {
      images,
      model,
      usage: mapUsage(o['usage']),
      latencyMs: Date.now() - started,
      provider: 'openrouter',
    };
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const parsed = await withRetry(() => this.requestJson('GET', '/models', undefined, signal, this.opts.timeoutMs ?? 60_000), this.retryOpts(), signal);
    const out: ModelInfo[] = [];
    for (const raw of asArray(asObject(parsed)?.['data'])) {
      const m = mapModel(raw);
      if (m) out.push(m);
    }
    return out;
  }

  async keyStatus(signal?: AbortSignal): Promise<KeyStatus> {
    try {
      const parsed = await this.requestJson('GET', '/key', undefined, signal, 30_000);
      const d = asObject(asObject(parsed)?.['data']) ?? {};
      const free = d['is_free_tier'];
      return {
        valid: true,
        label: asString(d['label']) ?? null,
        limitUsd: asNumber(d['limit']) ?? null,
        limitRemainingUsd: asNumber(d['limit_remaining']) ?? null,
        usageUsd: asNumber(d['usage']) ?? null,
        isFreeTier: typeof free === 'boolean' ? free : null,
      };
    } catch (e) {
      if (e instanceof AuthError) {
        return { valid: false, label: null, limitUsd: null, limitRemainingUsd: null, usageUsd: null, isFreeTier: null };
      }
      throw e;
    }
  }
}

/** A cut-off answer is never returned as text: it would be parsed, repaired or saved as if it were whole. */
function checkTruncated(req: ChatRequest, finishReason: string | null, nativeFinishReason: string | null, text: string, usage: Usage): void {
  if (!isTruncated(finishReason, nativeFinishReason)) return;
  const reasoning = usage.reasoningTokens;
  const limit = req.maxTokens ?? null;
  const why = reasoning > 0 && reasoning >= usage.completionTokens * 0.5 ? ` Reasoning used ${reasoning} of ${usage.completionTokens} output tokens.` : '';
  throw new OutputTruncatedError(
    `The answer was cut off at the output limit${limit !== null ? ` of ${limit} tokens` : ''}.${why}`,
    { partialText: text, maxTokens: limit, finishReason, nativeFinishReason },
    { usage },
  );
}

function checkRefusal(finishReason: string | null, refusal: string | undefined, text: string): void {
  if (refusal) throw new RefusalError(refusal);
  if (finishReason === 'content_filter') {
    throw new RefusalError(text ? `The model stopped for content reasons: ${text.slice(0, 200)}` : 'The model refused this request.');
  }
}
