// Research source clean-up. Gemini's web search returns url_citation links that point at a Google
// grounding redirect (vertexaisearch.cloud.google.com/grounding-api-redirect/...). Those links are not
// readable and expire, so the owner cannot check them. For links on an allow-listed redirect host only,
// this sends ONE request with redirect: 'manual' and a short timeout, reads the Location header and never
// fetches the target page. Sources are then deduplicated by their final URL and numbered S1, S2... again.

import { ConfigError } from './errors.ts';
import type { Source } from './types.ts';

/** The setting that switches redirect lookups off: RESOLVE_SOURCE_REDIRECTS=false. */
export const RESOLVE_SOURCE_REDIRECTS_SETTING = 'RESOLVE_SOURCE_REDIRECTS';

/**
 * Read a true/false setting. Blank or missing counts as unset (undefined). Case and spaces are ignored.
 * Anything else throws a ConfigError naming the setting.
 */
export function parseBooleanSetting(name: string, value: string | undefined): boolean | undefined {
  const v = (value ?? '').trim().toLowerCase();
  if (v === '') return undefined;
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new ConfigError(`${name} must be true or false (or left blank); it is "${value ?? ''}".`);
}

/** Hosts whose links are redirects to the real page. Nothing else is ever requested. */
export const GROUNDING_REDIRECT_HOSTS: readonly string[] = ['vertexaisearch.cloud.google.com'];

export const DEFAULT_RESOLVE_TIMEOUT_MS = 5_000;
const MAX_PARALLEL = 6;

export interface ResolveSourcesOptions {
  /** fetch to use (tests stub it). Default: global fetch. */
  fetch?: typeof fetch | undefined;
  /** Per-request timeout in ms (default 5 s). */
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  /** False: send no lookups; redirect links are kept and marked unresolved. Default true. */
  resolveRedirects?: boolean | undefined;
}

export interface ResolveSourcesResult {
  sources: Source[];
  /** Redirect links resolved to a real URL. */
  resolved: number;
  /** Redirect links that could not be resolved (kept as they were, marked unresolved). */
  unresolved: number;
  /** Sources dropped because another source had the same final URL. */
  merged: number;
  /** False when lookups were switched off. */
  lookedUp: boolean;
}

function hostname(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Host name without a leading "www.", for showing next to a source. */
export function domainOf(url: string): string | undefined {
  const h = hostname(url);
  return h ? h.replace(/^www\./, '') : undefined;
}

export function isGroundingRedirect(url: string): boolean {
  const h = hostname(url);
  return h !== null && GROUNDING_REDIRECT_HOSTS.includes(h);
}

/**
 * Read the Location header of one redirect link. Returns the absolute http(s) target, or null when the
 * request fails, times out, is not a redirect, or points back at a redirect host.
 */
export async function resolveRedirect(url: string, opts: ResolveSourcesOptions = {}): Promise<string | null> {
  if (!isGroundingRedirect(url)) return null;
  const fetchImpl = opts.fetch ?? fetch;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  try {
    const res = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal });
    // Only the headers are wanted; drop the body without reading it.
    await res.body?.cancel().catch(() => undefined);
    if (res.status < 300 || res.status > 399) return null;
    const location = res.headers.get('location');
    if (!location) return null;
    const target = new URL(location, url);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;
    if (isGroundingRedirect(target.href)) return null;
    return target.href;
  } catch {
    return null;
  }
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

/**
 * Resolve grounding redirect links, add each source's domain, merge sources with the same final URL
 * (the first keeps its title; an empty snippet takes the duplicate's) and renumber ids S1, S2...
 * Links on other hosts are left exactly as they are and never requested.
 */
export async function resolveSources(sources: Source[], opts: ResolveSourcesOptions = {}): Promise<ResolveSourcesResult> {
  const lookup = opts.resolveRedirects !== false;
  let resolved = 0;
  let unresolved = 0;
  const updated = await mapLimited(sources, MAX_PARALLEL, async (s): Promise<Source> => {
    if (!isGroundingRedirect(s.url)) return { ...s, domain: s.domain ?? domainOf(s.url) };
    const target = lookup ? await resolveRedirect(s.url, opts) : null;
    if (target === null) {
      unresolved += 1;
      const { domain: _drop, ...rest } = s;
      return { ...rest, unresolved: true };
    }
    resolved += 1;
    const { unresolved: _u, ...rest } = s;
    return { ...rest, url: target, domain: domainOf(target), redirectUrl: s.url };
  });

  const merged: Source[] = [];
  for (const s of updated) {
    const dup = merged.find((m) => m.url === s.url);
    if (dup) {
      if (!dup.snippet && s.snippet) dup.snippet = s.snippet;
      continue;
    }
    merged.push({ ...s, id: `S${merged.length + 1}` });
  }
  return { sources: merged, resolved, unresolved, merged: updated.length - merged.length, lookedUp: lookup };
}
