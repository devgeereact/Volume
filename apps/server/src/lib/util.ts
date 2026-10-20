import { createHash } from 'node:crypto';
import { monotonicFactory } from 'ulid';
import type { z } from 'zod';

const nextUlid = monotonicFactory();

/** Monotonic ULID: sortable, so job_events ids double as SSE event ids. */
export function newId(): string {
  return nextUlid();
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

export function affected(result: { numUpdatedRows?: bigint; numDeletedRows?: bigint } | undefined): number {
  if (!result) return 0;
  return Number(result.numUpdatedRows ?? result.numDeletedRows ?? 0n);
}

/** Any string, for open unions such as `'a' | 'b' | OpenString`: the known values stay as editor hints,
    which a plain `| string` would swallow. */
export type OpenString = string & Record<never, never>;

/** Text folded for a duplicate test: lower case, letters and digits only, single spaces. */
export function dedupeKey(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
