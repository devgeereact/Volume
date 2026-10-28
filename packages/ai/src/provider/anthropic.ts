// Anthropic client and the Anthropic-first provider (D-058). Text calls for Claude models go to the Anthropic
// Messages API with the owner's own key first. When Anthropic reports an empty balance, the same call runs on
// OpenRouter and the wrapper remembers it, so the app can tell the owner to top up. Images, model lists, key checks,
// web search calls and every non-Claude model stay on OpenRouter.

import Anthropic from '@anthropic-ai/sdk';
import {
  AbortedError,
  AiError,
  AuthError,
  BadRequestError,
  BudgetError,
  ModelUnavailableError,
  NetworkError,
  RateLimitError,
  RefusalError,
  ServerError,
  StreamCutError,
  TimeoutError,
} from '../errors.ts';
import type { AiProvider, ChatRequest, ChatResult, ImageRequest, ImageResult, KeyStatus, ModelInfo, Usage } from '../types.ts';
import { checkTruncated } from './openrouter.ts';
import { parseRetryAfter, withRetry, type RetryOptions } from './retry.ts';

interface ClaudePrice {
  /** USD per million tokens. */
  input: number;
  output: number;
  cacheRead: number;
}

/** Anthropic API model ids Volume maps to, with first-party prices (claude-api reference, read 22 October 2026). */
const CLAUDE_MODELS: Record<string, ClaudePrice> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
};

/** What "latest" means for each family today. */
const LATEST: Record<string, string> = {
  fable: 'claude-fable-5-1',
  opus: 'claude-opus-5-5',
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
};

/**
 * The Anthropic model id for an OpenRouter slug, or null when the slug is not a Claude model Volume can call
 * directly: 'anthropic/claude-sonnet-4.6' and '~anthropic/claude-sonnet-latest' map, 'openai/gpt-5' does not.
 */
export function anthropicModelFor(slug: string): string | null {
  const m = /^~?anthropic\/(claude-[a-z0-9.-]+?)(?::[a-z]+)?$/i.exec(slug.trim());
  if (!m?.[1]) return null;
  const name = m[1].toLowerCase().replace(/\./g, '-');
  const latest = /^claude-(fable|opus|sonnet|haiku)-latest$/.exec(name);
  if (latest?.[1]) return LATEST[latest[1]] ?? null;
  return CLAUDE_MODELS[name] ? name : null;
}

/** Anthropic's "your balance is too low" answer: HTTP 400 or 402 with a billing message. */
export function isFundsError(status: number | undefined, message: string): boolean {
  if (status !== 400 && status !== 402) return false;
  return /credit balance|billing|insufficient (funds|credit)|payment/i.test(message);
}

export interface AnthropicClientOptions {
  /** ANTHROPIC_API_KEY, passed in by the server. Never read from disk here. */
  apiKey: string;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
  idleTimeoutMs?: number | undefined;
  retry?: RetryOptions | undefined;
  /** Custom fetch, for tests. */
  fetch?: typeof fetch | undefined;
}

interface CallState {
  partialText: string;
  timedOut: boolean;
  userAborted: boolean;
}

function mapError(e: unknown, state: CallState, model: string): AiError {
  if (e instanceof AiError) return e;
  if (state.userAborted) return new AbortedError();
  if (state.timedOut) return state.partialText ? new StreamCutError('The stream went quiet and was stopped.', state.partialText) : new TimeoutError();
  if (e instanceof Anthropic.APIUserAbortError) return new AbortedError();
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new TimeoutError();
  if (e instanceof Anthropic.APIConnectionError) {
    return state.partialText
      ? new StreamCutError('The connection dropped mid-stream.', state.partialText, { cause: e })
      : new NetworkError(e.message, { cause: e });
  }
  if (e instanceof Anthropic.APIError) {
    const status = e.status as number | undefined;
    const message = e.message || `Anthropic error ${status ?? ''}`.trim();
    const headers = e.headers as Headers | undefined;
    const init = { status };
    if (isFundsError(status, message)) return new BudgetError('The Anthropic account has too few credits.', 'credits', {}, init);
    let mapped: AiError;
    switch (true) {
      case status === 401 || status === 403:
        mapped = new AuthError('Anthropic did not accept the API key.', init);
        break;
      case status === 404:
        mapped = new ModelUnavailableError(message, model, {}, init);
        break;
      case status === 429:
        mapped = new RateLimitError(message, parseRetryAfter(headers?.get('retry-after')), init);
        break;
      case status !== undefined && status >= 500:
        mapped = new ServerError(message, init);
        break;
      case status === undefined:
        return state.partialText ? new StreamCutError(message, state.partialText) : new ServerError(message);
      default:
        mapped = new BadRequestError(message, init);
    }
    if (state.partialText && mapped.retryable) return new StreamCutError(mapped.message, state.partialText, { status, cause: mapped });
    return mapped;
  }
  if (e instanceof Error && e.name === 'AbortError') return new AbortedError();
  const msg = e instanceof Error ? e.message : String(e);
  return state.partialText ? new StreamCutError(msg, state.partialText) : new NetworkError(msg, { cause: e });
}

function costOf(model: string, input: number, output: number, cacheRead: number, cacheWrite: number): number | null {
  const p = CLAUDE_MODELS[model];
  if (!p) return null;
  // Cache writes cost 1.25 times the input price; cache reads use the model's own read price.
  return (input * p.input + output * p.output + cacheRead * p.cacheRead + cacheWrite * p.input * 1.25) / 1_000_000;
}

export class AnthropicClient {
  private readonly sdk: Anthropic;
  private readonly opts: AnthropicClientOptions;

  constructor(opts: AnthropicClientOptions) {
    this.opts = opts;
    this.sdk = new Anthropic({
      apiKey: opts.apiKey,
      ...(opts.baseUrl ? { baseURL: opts.baseUrl } : {}),
      maxRetries: 0,
      timeout: opts.timeoutMs ?? 600_000,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    });
  }

  /** Same contract as OpenRouterClient.chat: retries, typed errors, streaming deltas, truncation and refusal checks. */
  async chat(req: ChatRequest, model: string): Promise<ChatResult> {
    return withRetry(() => this.chatOnce(req, model), { ...this.opts.retry, retryIf: (e) => e.kind !== 'stream_cut' }, req.signal);
  }

  private async chatOnce(req: ChatRequest, model: string): Promise<ChatResult> {
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
    try {
      const system = req.messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n');
      const jsonHint =
        req.responseFormat?.type === 'json_schema'
          ? `\n\nReply with one JSON value only, no prose and no code fence, matching this JSON Schema:\n${JSON.stringify(req.responseFormat.schema)}`
          : req.responseFormat?.type === 'json_object'
            ? '\n\nReply with one JSON object only, no prose and no code fence.'
            : '';
      let marked = false;
      const messages: Anthropic.MessageParam[] = req.messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
          const role = m.role === 'assistant' ? 'assistant' : 'user';
          const cut = m.cachePrefix;
          // A user message with a shared start (a prompt's "# Per call" split) gets a second cache marker after
          // that start, so the book-wide material is read back on the next chapter. Only the first one is marked.
          if (marked || role !== 'user' || cut === undefined || cut <= 0 || cut >= m.content.length) return { role, content: m.content };
          marked = true;
          return {
            role,
            content: [
              { type: 'text', text: m.content.slice(0, cut), cache_control: { type: 'ephemeral' } },
              { type: 'text', text: m.content.slice(cut) },
            ],
          };
        });
      if (messages.length === 0) messages.push({ role: 'user', content: system || 'Continue.' });
      const effort = req.reasoning?.effort;
      // temperature is never sent: the Messages API stopped accepting sampling parameters on 21 October 2026.
      const params: Anthropic.MessageStreamParams = {
        model,
        max_tokens: req.maxTokens ?? 16000,
        messages,
        // The system part is the reusable start of each prompt, so it carries the cache marker. The rest of the user
        // part differs on every call and is left unmarked: marking it would pay the cache write price for text never read back.
        ...(system || jsonHint ? { system: [{ type: 'text', text: `${system}${jsonHint}`.trim(), cache_control: { type: 'ephemeral' } }] } : {}),
        ...(effort && effort !== 'none' ? { output_config: { effort: effort === 'minimal' ? 'low' : effort } } : {}),
      };
      armIdle();
      const stream = this.sdk.messages.stream(params, { signal: controller.signal, timeout: totalMs });
      stream.on('text', (piece: string) => {
        armIdle();
        state.partialText += piece;
        req.onDelta?.(piece);
      });
      const final = await stream.finalMessage();
      if (state.userAborted) throw new AbortedError();
      let text = '';
      for (const block of final.content) if (block.type === 'text') text += block.text;
      const stop = final.stop_reason ?? null;
      if (stop === 'refusal') throw new RefusalError(text || 'The model refused this request.');
      const input = final.usage.input_tokens;
      const output = final.usage.output_tokens;
      const cacheRead = final.usage.cache_read_input_tokens ?? 0;
      const cacheWrite = final.usage.cache_creation_input_tokens ?? 0;
      const usage: Usage = {
        promptTokens: input + cacheRead + cacheWrite,
        completionTokens: output,
        totalTokens: input + cacheRead + cacheWrite + output,
        reasoningTokens: 0,
        cachedTokens: cacheRead,
        costUsd: costOf(model, input, output, cacheRead, cacheWrite),
        costSource: 'computed',
      };
      const finishReason = stop === 'max_tokens' ? 'length' : 'stop';
      checkTruncated(req, finishReason, stop, text, usage);
      return {
        text,
        model: final.model || model,
        finishReason,
        nativeFinishReason: stop,
        usage,
        sources: [],
        generationId: final.id,
        latencyMs: Date.now() - started,
        provider: 'anthropic',
      };
    } catch (e) {
      throw mapError(e, state, model);
    } finally {
      clearTimeout(totalTimer);
      if (idleTimer) clearTimeout(idleTimer);
      req.signal?.removeEventListener('abort', onUserAbort);
    }
  }
}

export interface AnthropicFirstOptions {
  /** Called each time the wrapper moves a call to OpenRouter because Anthropic is out of funds. */
  onFallback?: ((info: { model: string; at: number }) => void) | undefined;
  /** How long to skip Anthropic after an out-of-funds answer before trying it again (default 10 minutes). */
  retryAfterMs?: number | undefined;
  now?: (() => number) | undefined;
}

export interface AnthropicStatus {
  configured: boolean;
  /** When Anthropic last said the balance was empty, or null if it has not (or has been used since). */
  outOfFundsAt: number | null;
}

/**
 * Wraps the OpenRouter provider. Same interface, so the rest of Volume does not change. Only chat() differs: a Claude
 * model with no web search goes to Anthropic first; a funds error moves that call (and the next ones, for a while)
 * to OpenRouter. Any other Anthropic failure surfaces as usual, so a bad key or an outage is never hidden.
 */
export class AnthropicFirstProvider implements AiProvider {
  readonly name = 'openrouter' as const;
  private outOfFundsAt: number | null = null;
  private readonly retryAfterMs: number;
  private readonly now: () => number;
  private readonly openrouter: AiProvider;
  private readonly anthropic: AnthropicClient;
  private readonly opts: AnthropicFirstOptions;

  constructor(openrouter: AiProvider, anthropic: AnthropicClient, opts: AnthropicFirstOptions = {}) {
    this.openrouter = openrouter;
    this.anthropic = anthropic;
    this.opts = opts;
    this.retryAfterMs = opts.retryAfterMs ?? 10 * 60_000;
    this.now = opts.now ?? Date.now;
  }

  status(): AnthropicStatus {
    return { configured: true, outOfFundsAt: this.outOfFundsAt };
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const model = req.webSearch ? null : anthropicModelFor(req.model);
    const skip = this.outOfFundsAt !== null && this.now() - this.outOfFundsAt < this.retryAfterMs;
    if (!model || skip) return this.openrouter.chat(req);
    try {
      const result = await this.anthropic.chat(req, model);
      this.outOfFundsAt = null;
      return result;
    } catch (e) {
      if (!(e instanceof BudgetError) || e.reason !== 'credits') throw e;
      this.outOfFundsAt = this.now();
      this.opts.onFallback?.({ model: req.model, at: this.outOfFundsAt });
      return this.openrouter.chat(req);
    }
  }

  generateImage(req: ImageRequest): Promise<ImageResult> {
    return this.openrouter.generateImage(req);
  }

  listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    return this.openrouter.listModels(signal);
  }

  keyStatus(signal?: AbortSignal): Promise<KeyStatus> {
    return this.openrouter.keyStatus(signal);
  }
}
