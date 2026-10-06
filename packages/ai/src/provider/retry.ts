import { AbortedError, AiError } from '../errors.ts';

export interface RetryOptions {
  /** Retries after the first attempt (default 3). */
  maxRetries?: number | undefined;
  /** Delay before each retry in ms (default 2 s, 10 s, 60 s, per docs/04-AI-PIPELINE.md). */
  delaysMs?: number[] | undefined;
  /** Random extra delay as a fraction of the delay (default 0.2). */
  jitter?: number | undefined;
  /** Upper bound for a Retry-After value in ms (default 120 s). */
  maxRetryAfterMs?: number | undefined;
  /** Called before each retry, for logs and progress. */
  onRetry?: ((info: { attempt: number; delayMs: number; error: AiError }) => void) | undefined;
  /** Extra filter: return false to stop retrying a retryable error at this level. */
  retryIf?: ((error: AiError) => boolean) | undefined;
}

export const DEFAULT_DELAYS_MS = [2000, 10000, 60000];

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortedError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Parse a Retry-After header (seconds or HTTP date) into ms. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (value === null || value === undefined || value.trim() === '') return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - now);
  return undefined;
}

function retryAfterOf(error: AiError): number | undefined {
  const v = (error as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof v === 'number' ? v : undefined;
}

/** Run fn with retries for retryable AiErrors. Retry-After wins over the schedule. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}, signal?: AbortSignal): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const delays = opts.delaysMs ?? DEFAULT_DELAYS_MS;
  const jitter = opts.jitter ?? 0.2;
  const maxRetryAfter = opts.maxRetryAfterMs ?? 120_000;
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (!(e instanceof AiError) || !e.retryable || attempt >= maxRetries || signal?.aborted) throw e;
      if (opts.retryIf && !opts.retryIf(e)) throw e;
      const base = delays[Math.min(attempt, delays.length - 1)] ?? 0;
      const ra = retryAfterOf(e);
      const delayMs = ra !== undefined ? Math.min(ra, maxRetryAfter) : Math.round(base * (1 + Math.random() * jitter));
      attempt += 1;
      opts.onRetry?.({ attempt, delayMs, error: e });
      await sleep(delayMs, signal);
    }
  }
}
