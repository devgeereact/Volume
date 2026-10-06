// Grounding redirect resolution with a stubbed fetch. No network.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigError, createAiService, isGroundingRedirect, parseBooleanSetting, resolveSources, type Source } from '../src/index.ts';
import { CONFIG_DIR, FIXTURES_DIR, FULL_INPUT, PROMPTS_DIR } from './helpers.ts';

const REDIRECT = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQtest';

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** A fetch stub: maps request URL to a Location target (string), an HTTP status (number) or an error. */
function stubFetch(routes: Record<string, string | number | Error>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const route = routes[url];
    if (route === undefined) throw new Error(`stub: no route for ${url}`);
    if (route instanceof Error) throw route;
    if (typeof route === 'number') return Promise.resolve(new Response('body', { status: route }));
    return Promise.resolve(new Response('redirect body', { status: 302, headers: { location: route } }));
  };
  return { fetch: impl, calls };
}

function src(id: string, url: string, title = `Title ${id}`, snippet = ''): Source {
  return { id, url, title, snippet };
}

describe('resolveSources', () => {
  it('resolves an allow-listed redirect from its Location header without fetching the target', async () => {
    const { fetch, calls } = stubFetch({ [REDIRECT]: 'https://www.nhs.uk/conditions/reading/' });
    const r = await resolveSources([src('S1', REDIRECT, 'nhs.uk', 'Reading with children.')], { fetch });
    expect(r.resolved).toBe(1);
    expect(r.unresolved).toBe(0);
    expect(r.sources).toEqual([
      {
        id: 'S1',
        url: 'https://www.nhs.uk/conditions/reading/',
        title: 'nhs.uk',
        snippet: 'Reading with children.',
        domain: 'nhs.uk',
        redirectUrl: REDIRECT,
      },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(REDIRECT);
    expect(calls[0]?.init?.redirect).toBe('manual');
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps the original link and marks it unresolved when the lookup fails, is not a redirect or times out', async () => {
    const failing = `${REDIRECT}-error`;
    const notRedirect = `${REDIRECT}-200`;
    const slow = `${REDIRECT}-slow`;
    const { fetch: base, calls } = stubFetch({ [failing]: new Error('connection refused'), [notRedirect]: 200 });
    const fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url !== slow) return base(input, init);
      calls.push({ url: slow, init });
      return new Promise<Response>((_ok, fail) => init?.signal?.addEventListener('abort', () => fail(new Error('aborted'))));
    }) as typeof globalThis.fetch;
    const r = await resolveSources([src('S1', failing), src('S2', notRedirect), src('S3', slow)], { fetch, timeoutMs: 30 });
    expect(r.resolved).toBe(0);
    expect(r.unresolved).toBe(3);
    expect(r.sources.map((s) => [s.url, s.unresolved, s.domain])).toEqual([
      [failing, true, undefined],
      [notRedirect, true, undefined],
      [slow, true, undefined],
    ]);
    expect(calls).toHaveLength(3);
  });

  it('never requests links on other hosts, lookalike hosts included', async () => {
    const { fetch, calls } = stubFetch({});
    const r = await resolveSources(
      [
        src('S1', 'https://www.example.org/night-shift-sleep'),
        src('S2', 'https://vertexaisearch.cloud.google.com.evil.example/grounding-api-redirect/x'),
        src('S3', 'http://cloud.google.com/vertexaisearch'),
      ],
      { fetch },
    );
    expect(calls).toHaveLength(0);
    expect(r.resolved + r.unresolved).toBe(0);
    expect(r.sources.map((s) => s.url)).toEqual([
      'https://www.example.org/night-shift-sleep',
      'https://vertexaisearch.cloud.google.com.evil.example/grounding-api-redirect/x',
      'http://cloud.google.com/vertexaisearch',
    ]);
    expect(r.sources[0]?.domain).toBe('example.org');
    expect(isGroundingRedirect('https://vertexaisearch.cloud.google.com.evil.example/x')).toBe(false);
  });

  it('merges sources that lead to the same final URL and renumbers the ids', async () => {
    const a = `${REDIRECT}-a`;
    const b = `${REDIRECT}-b`;
    const c = `${REDIRECT}-c`;
    const { fetch } = stubFetch({
      [a]: 'https://booktrust.org.uk/reading-tips',
      [b]: 'https://booktrust.org.uk/reading-tips',
      [c]: 'https://literacytrust.org.uk/parents',
    });
    const r = await resolveSources(
      [
        src('S1', a, 'booktrust.org.uk'),
        src('S2', b, 'booktrust.org.uk (again)', 'An excerpt only the duplicate had.'),
        src('S3', 'https://booktrust.org.uk/reading-tips', 'Direct link'),
        src('S4', c, 'literacytrust.org.uk'),
      ],
      { fetch },
    );
    expect(r.merged).toBe(2);
    expect(r.sources.map((s) => [s.id, s.url, s.title])).toEqual([
      ['S1', 'https://booktrust.org.uk/reading-tips', 'booktrust.org.uk'],
      ['S2', 'https://literacytrust.org.uk/parents', 'literacytrust.org.uk'],
    ]);
    expect(r.sources[0]?.snippet).toBe('An excerpt only the duplicate had.');
  });

  it('runs inside runStage for research and reports what it did in the notes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'volume-sources-'));
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, 'research.title-research.json'), 'utf8')) as Record<string, unknown>;
    fixture['annotations'] = [
      { url: `${REDIRECT}-1`, title: 'nhs.uk', content: 'Sleep advice.' },
      { url: `${REDIRECT}-2`, title: 'rcn.org.uk', content: 'New nurse guides.' },
      { url: `${REDIRECT}-3`, title: 'nhs.uk', content: '' },
      { url: `${REDIRECT}-4`, title: 'gone.example', content: '' },
    ];
    writeFileSync(join(dir, 'research.title-research.json'), JSON.stringify(fixture));
    const { fetch, calls } = stubFetch({
      [`${REDIRECT}-1`]: 'https://www.nhs.uk/live-well/sleep/',
      [`${REDIRECT}-2`]: 'https://www.rcn.org.uk/new-nurses',
      [`${REDIRECT}-3`]: 'https://www.nhs.uk/live-well/sleep/',
      [`${REDIRECT}-4`]: 404,
    });
    const ai = createAiService({
      promptsDir: PROMPTS_DIR,
      configDir: CONFIG_DIR,
      mock: { fixturesDirs: [dir], chunkDelayMs: 0 },
      sourceFetch: fetch,
      resolveSourceRedirects: true,
    });
    const r = await ai.runStage('research.title-research', FULL_INPUT);
    expect(calls).toHaveLength(4);
    expect(r.sources.map((s) => [s.id, s.domain ?? null, s.unresolved ?? false])).toEqual([
      ['S1', 'nhs.uk', false],
      ['S2', 'rcn.org.uk', false],
      ['S3', null, true],
    ]);
    expect(r.notes.join(' ')).toContain('Resolved 3 of 4 search redirect links');
    expect(r.notes.join(' ')).toContain('Merged 1 duplicate source');
  });

  it('sends no lookup when redirect lookups are off, and marks redirect links unresolved', async () => {
    const { fetch, calls } = stubFetch({ [REDIRECT]: 'https://www.nhs.uk/' });
    const r = await resolveSources([src('S1', REDIRECT, 'nhs.uk'), src('S2', 'https://www.example.org/a')], { fetch, resolveRedirects: false });
    expect(calls).toHaveLength(0);
    expect(r.lookedUp).toBe(false);
    expect(r.sources.map((s) => [s.url, s.unresolved ?? false, s.domain ?? null])).toEqual([
      [REDIRECT, true, null],
      ['https://www.example.org/a', false, 'example.org'],
    ]);
  });
});

describe('RESOLVE_SOURCE_REDIRECTS setting', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function researchService(dir: string, fetch: typeof globalThis.fetch, option?: boolean) {
    return createAiService({
      promptsDir: PROMPTS_DIR,
      configDir: CONFIG_DIR,
      mock: { fixturesDirs: [dir], chunkDelayMs: 0 },
      sourceFetch: fetch,
      ...(option === undefined ? {} : { resolveSourceRedirects: option }),
    });
  }

  function redirectFixtureDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'volume-sources-off-'));
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, 'research.title-research.json'), 'utf8')) as Record<string, unknown>;
    fixture['annotations'] = [{ url: REDIRECT, title: 'nhs.uk', content: 'Sleep advice.' }];
    writeFileSync(join(dir, 'research.title-research.json'), JSON.stringify(fixture));
    return dir;
  }

  it('reads true, false and blank (blank counts as unset) and refuses anything else', () => {
    expect(parseBooleanSetting('X', 'true')).toBe(true);
    expect(parseBooleanSetting('X', ' FALSE ')).toBe(false);
    expect(parseBooleanSetting('X', '')).toBeUndefined();
    expect(parseBooleanSetting('X', '   ')).toBeUndefined();
    expect(parseBooleanSetting('X', undefined)).toBeUndefined();
    expect(() => parseBooleanSetting('X', 'yes')).toThrow(ConfigError);
  });

  it('false switches the lookups off: the redirect link is kept and marked unresolved', async () => {
    vi.stubEnv('RESOLVE_SOURCE_REDIRECTS', 'false');
    const { fetch, calls } = stubFetch({ [REDIRECT]: 'https://www.nhs.uk/live-well/sleep/' });
    const r = await researchService(redirectFixtureDir(), fetch).runStage('research.title-research', FULL_INPUT);
    expect(calls).toHaveLength(0);
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0]).toMatchObject({ id: 'S1', url: REDIRECT, title: 'nhs.uk', unresolved: true });
    expect(r.notes.join(' ')).toContain('redirect lookups are switched off (RESOLVE_SOURCE_REDIRECTS=false)');
  });

  it('blank counts as unset, so lookups stay off until approved', async () => {
    vi.stubEnv('RESOLVE_SOURCE_REDIRECTS', '');
    const { fetch, calls } = stubFetch({ [REDIRECT]: 'https://www.nhs.uk/live-well/sleep/' });
    const r = await researchService(redirectFixtureDir(), fetch).runStage('research.title-research', FULL_INPUT);
    expect(calls).toHaveLength(0);
    expect(r.sources[0]).toMatchObject({ url: REDIRECT, unresolved: true });
  });

  it('the service option wins over the setting', async () => {
    vi.stubEnv('RESOLVE_SOURCE_REDIRECTS', 'false');
    const { fetch, calls } = stubFetch({ [REDIRECT]: 'https://www.nhs.uk/live-well/sleep/' });
    const r = await researchService(redirectFixtureDir(), fetch, true).runStage('research.title-research', FULL_INPUT);
    expect(calls).toHaveLength(1);
    expect(r.sources[0]?.domain).toBe('nhs.uk');
  });

  it('an invalid setting fails when the service is created, naming the setting', () => {
    vi.stubEnv('RESOLVE_SOURCE_REDIRECTS', 'maybe');
    const { fetch } = stubFetch({});
    expect(() => researchService(redirectFixtureDir(), fetch)).toThrow(/RESOLVE_SOURCE_REDIRECTS must be true or false/);
  });
});
