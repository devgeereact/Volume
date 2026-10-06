import { createHash } from 'node:crypto';
import { isValid, monotonicFactory } from 'ulid';
import type { z } from 'zod';

const nextUlid = monotonicFactory();

/** Monotonic ULID: sortable, so job_events ids double as SSE event ids. */
export function newId(): string {
  return nextUlid();
}

export function isUlid(value: string): boolean {
  return value.length === 26 && isValid(value);
}

export function now(): number {
  return Date.now();
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/**
 * Parses a JSON TEXT column with a zod schema. A broken or unexpected value
 * falls back instead of failing the whole request, and is reported once.
 */
export function fromJson<S extends z.ZodType>(schema: S, text: string | null | undefined, fallback: z.output<S>): z.output<S> {
  if (text === null || text === undefined || text === '') return fallback;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fallback;
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : fallback;
}

export function bool(v: number | boolean | null | undefined): boolean {
  return v === true || v === 1;
}

export function flag(v: boolean | undefined | null): 0 | 1 {
  return v ? 1 : 0;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Removes keys whose value is undefined (keeps exactOptionalPropertyTypes happy). */
export function compact<T extends Record<string, unknown>>(obj: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as { [K in keyof T]?: Exclude<T[K], undefined> };
}

export function affected(result: { numUpdatedRows?: bigint; numDeletedRows?: bigint } | undefined): number {
  if (!result) return 0;
  return Number(result.numUpdatedRows ?? result.numDeletedRows ?? 0n);
}

/** Any string, for open unions such as `'a' | 'b' | OpenString`: the known values stay as editor hints,
    which a plain `| string` would swallow. */
export type OpenString = string & Record<never, never>;
