import { createHash } from 'node:crypto';

export type JsonObject = Record<string, unknown>;

export function asObject(v: unknown): JsonObject | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as JsonObject) : undefined;
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Deterministic JSON (sorted keys) for hashing inputs. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const o = asObject(value);
  if (o) {
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Rough token estimate: about four characters per token for English prose. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function wordCount(text: string): number {
  const m = text.trim().match(/\S+/g);
  return m ? m.length : 0;
}

export function truncateWords(text: string, max: number): string {
  const words = text.trim().split(/\s+/);
  return words.length <= max ? text.trim() : `${words.slice(0, max).join(' ')}...`;
}

/** Any string, for open unions such as `'a' | 'b' | OpenString`: the known values stay as editor hints,
    which a plain `| string` would swallow. */
export type OpenString = string & Record<never, never>;
