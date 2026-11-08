import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import {
  APP_PATH_PREFIXES,
  INDEXABLE_KEYS,
  PRODUCTION_ORIGIN,
  SEO_PAGES,
  STAGES,
  classifyPath,
  indexablePaths,
  renderPage,
  robotsTxt,
} from '../src/http/seo.js';
import { testApp, type TestApp } from './helpers.js';

const ORIGIN = 'https://volume.example.com';
const WEB = join(__dirname, '../../web');
const SHELL =
  '<!doctype html><html lang="en-GB"><head><meta name="description" content="x" /><meta name="robots" content="noindex, nofollow" /><title>Volume</title></head><body><div id="root"></div></body></html>';

let webDir: string;
let t: TestApp;

beforeAll(async () => {
  webDir = mkdtempSync(join(tmpdir(), 'volume-seo-'));
  mkdirSync(join(webDir, 'assets'));
  writeFileSync(join(webDir, 'index.html'), SHELL);
  writeFileSync(join(webDir, 'assets', 'literata-latin-opsz-normal-abc.woff2'), 'x');
  const config = loadConfig({
    dotenv: false,
    env: { AUTH_MODE: 'local', WEB_DIST_DIR: webDir, APP_ORIGIN: ORIGIN, LOG_LEVEL: 'silent', JOBS_ENABLED: 'false' },
  });
  t = await testApp({ config });
});

afterAll(async () => {
  await t.close();
  rmSync(webDir, { recursive: true, force: true });
});

describe('robots.txt and sitemap.xml', () => {
  it('allow only the landing page, How it works and the files they show, and point at the sitemap (D-068)', async () => {
    const res = await t.call('GET', '/robots.txt');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toMatch(/^text\/plain/);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.raw).toBe(robotsTxt(ORIGIN));
    for (const line of ['Allow: /$', 'Allow: /how-it-works$', 'Allow: /icon-512.png', 'Allow: /og-image.png', 'Disallow: /\n']) {
      expect(res.raw).toContain(line);
    }
    expect(res.raw).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(res.raw).not.toMatch(/Allow: \/(library|sign-in|api|books|settings)/);
  });

  it('keep the static fallback in public/ the same as the rules served on the live site', () => {
    expect(PRODUCTION_ORIGIN).toBe('https://volume.gakinz.com');
    expect(readFileSync(join(WEB, 'public/robots.txt'), 'utf8')).toBe(robotsTxt(PRODUCTION_ORIGIN));
  });

  it('serve a sitemap of exactly the two public pages', async () => {
    expect([...INDEXABLE_KEYS]).toEqual(['home', 'how-it-works']);
    const res = await t.call('GET', '/sitemap.xml');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toMatch(/^application\/xml/);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.raw).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(res.raw).toContain(`<loc>${ORIGIN}/how-it-works</loc>`);
    expect(res.raw.match(/<url>/g)).toHaveLength(2);
    expect(res.raw).not.toMatch(/welcome|library|sign-in/);
  });

  it('can still build the closed rules when nothing is indexable', () => {
    expect(robotsTxt(ORIGIN, [])).toBe('# Volume is a private studio. Nothing here is for search engines.\nUser-agent: *\nDisallow: /\n');
    expect(indexablePaths([])).toEqual(['/robots.txt']);
    expect(indexablePaths(['home'])).toEqual(['/robots.txt', '/sitemap.xml', '/icon-512.png', '/og-image.png', '/']);
    expect(renderPage(SHELL, { origin: ORIGIN, key: 'home', indexableKeys: [] })).toContain('content="noindex, nofollow"');
  });
});

function jsonLd(raw: string): { '@type': string; '@id'?: string; [k: string]: unknown }[] {
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(raw);
  return (JSON.parse(ld?.[1] ?? '{}') as { '@graph': { '@type': string; '@id'?: string }[] })['@graph'];
}

describe('public pages', () => {
  it('are indexable with a canonical, title, description, social tags and structured data', async () => {
    const res = await t.call('GET', '/');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.raw).toContain(`<title>${SEO_PAGES.home.title}</title>`);
    expect(res.raw).toContain('<meta name="robots" content="index, follow, max-image-preview:large">');
    expect(res.raw).toContain(`<link rel="canonical" href="${ORIGIN}/">`);
    expect(res.raw).toContain(`property="og:image" content="${ORIGIN}/og-image.png"`);
    expect(res.raw).toContain('name="twitter:card" content="summary_large_image"');
    expect(res.raw).toContain('rel="preload" href="/assets/literata-latin-opsz-normal-abc.woff2"');
    expect(res.raw).toContain('<noscript><main><h1>');
    const graph = jsonLd(res.raw);
    expect(graph.map((n) => n['@type'])).toEqual(['Organization', 'WebSite', 'WebApplication']);
    expect(JSON.stringify(graph)).not.toMatch(/aggregateRating|review|offers|price/i);
    expect(String(res.headers['content-security-policy'])).toContain("default-src 'self'");
  });

  it('give How it works its own title, canonical and breadcrumb, with every @id it points at defined on the page', async () => {
    const res = await t.call('GET', '/how-it-works');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.raw).toContain(`<title>${SEO_PAGES['how-it-works'].title}</title>`);
    expect(res.raw).toContain('<meta name="robots" content="index, follow, max-image-preview:large">');
    expect(res.raw).toContain(`<link rel="canonical" href="${ORIGIN}/how-it-works">`);
    for (const s of STAGES) expect(res.raw).toContain(s.name);
    const graph = jsonLd(res.raw);
    expect(graph.map((n) => n['@type'])).toEqual(['Organization', 'WebSite', 'WebPage', 'BreadcrumbList']);
    const ids = new Set(graph.map((n) => n['@id']).filter(Boolean));
    const refs = [...JSON.stringify(graph).matchAll(/\{"@id":"([^"]+)"\}/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const r of refs) expect(ids.has(r), r).toBe(true);
  });

  it('let crawlers use the logo and the share image', () => {
    for (const path of ['/icon-512.png', '/og-image.png']) expect(indexablePaths(), path).toContain(path);
  });

  it('keep one address per page', async () => {
    for (const [from, to] of [
      ['/how-it-works/', '/how-it-works'],
      ['/How-It-Works', '/how-it-works'],
      ['/welcome', '/'],
      ['/index.html', '/'],
    ] as const) {
      const res = await t.call('GET', from);
      expect(res.status, from).toBe(301);
      expect(res.headers['location'], from).toBe(to);
    }
  });
});

describe('everything else', () => {
  it('serves the app shell noindex for signed-in screens and sign-in', async () => {
    for (const path of ['/library', '/books/1/editor', '/settings/ai', '/sign-in']) {
      const res = await t.call('GET', path);
      expect(res.status, path).toBe(200);
      expect(res.headers['x-robots-tag'], path).toBe('noindex, nofollow');
      expect(res.raw, path).toContain('content="noindex, nofollow"');
      expect(res.raw, path).not.toContain('rel="canonical"');
    }
  });

  it('answers an address that matches nothing with status 404 and noindex', async () => {
    for (const path of ['/nope', '/nope/deeper', '/librar']) {
      const res = await t.call('GET', path);
      expect(res.status, path).toBe(404);
      expect(res.headers['x-robots-tag'], path).toBe('noindex, nofollow');
      expect(res.raw, path).toContain('<title>Page not found | Volume</title>');
      expect(res.raw, path).toContain('<div id="root">');
    }
    expect((await t.call('GET', '/missing.js')).status).toBe(404);
  });
});

describe('drift against the web app', () => {
  it('uses the same page titles and descriptions as apps/web/src/site/seo-pages.json', () => {
    const web = JSON.parse(readFileSync(join(WEB, 'src/site/seo-pages.json'), 'utf8')) as Record<string, { path: string; title: string; description: string }>;
    expect(web).toEqual(SEO_PAGES);
  });

  it('uses the same app path prefixes and stage copy as the web app', () => {
    const seo = readFileSync(join(WEB, 'src/site/seo.ts'), 'utf8');
    const list = /APP_PATH_PREFIXES: readonly string\[\] = \[([^\]]*)\]/.exec(seo)?.[1] ?? '';
    expect([...list.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual([...APP_PATH_PREFIXES]);
    const how = readFileSync(join(WEB, 'src/site/HowItWorksPage.tsx'), 'utf8');
    for (const s of STAGES) expect(how).toContain(s.detail.replace(/'/g, "'"));
  });

  it('classifies unknown first segments as not found', () => {
    expect(classifyPath('/zzz').kind).toBe('not-found');
    expect(classifyPath('/api/v1/books').kind).toBe('other');
  });
});
