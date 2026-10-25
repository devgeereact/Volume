import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { APP_PATH_PREFIXES, SEO_PAGES, STAGES, classifyPath, robotsTxt, sitemapXml } from '../src/http/seo.js';
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
  const config = loadConfig({ dotenv: false, env: { WEB_DIST_DIR: webDir, APP_ORIGIN: ORIGIN, LOG_LEVEL: 'silent', JOBS_ENABLED: 'false' } });
  t = await testApp({ config });
});

afterAll(async () => {
  await t.close();
  rmSync(webDir, { recursive: true, force: true });
});

describe('robots.txt and sitemap.xml', () => {
  it('allow only the public pages and name the sitemap', async () => {
    const res = await t.call('GET', '/robots.txt');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toMatch(/^text\/plain/);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.raw).toContain('Disallow: /\n');
    expect(res.raw).toContain('Allow: /$');
    expect(res.raw).toContain('Allow: /how-it-works$');
    expect(res.raw).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it('keep the static fallback in public/ the same as the served rules', () => {
    const served = robotsTxt(ORIGIN)
      .split('\n')
      .filter((l) => l.startsWith('Allow:') || l.startsWith('Disallow:'));
    const file = readFileSync(join(WEB, 'public/robots.txt'), 'utf8')
      .split('\n')
      .filter((l) => l.startsWith('Allow:') || l.startsWith('Disallow:'));
    expect(file).toEqual(served);
  });

  it('list the two public pages and nothing signed-in', async () => {
    const res = await t.call('GET', '/sitemap.xml');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toMatch(/^application\/xml/);
    expect(res.raw).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(res.raw).toContain(`<loc>${ORIGIN}/how-it-works</loc>`);
    expect(res.raw.match(/<url>/g)).toHaveLength(2);
    expect(sitemapXml(ORIGIN)).not.toContain('library');
  });
});

describe('public pages', () => {
  it('write title, description, canonical, social tags and structured data into the first response', async () => {
    const res = await t.call('GET', '/');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.raw).toContain(`<title>${SEO_PAGES.home.title}</title>`);
    expect(res.raw).toContain('content="index, follow, max-image-preview:large"');
    expect(res.raw).toContain(`<link rel="canonical" href="${ORIGIN}/">`);
    expect(res.raw).toContain(`property="og:image" content="${ORIGIN}/og-image.png"`);
    expect(res.raw).toContain('name="twitter:card" content="summary_large_image"');
    expect(res.raw).toContain('rel="preload" href="/assets/literata-latin-opsz-normal-abc.woff2"');
    expect(res.raw).toContain('<noscript><main><h1>');
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(res.raw);
    const graph = (JSON.parse(ld?.[1] ?? '{}') as { '@graph': { '@type': string }[] })['@graph'];
    expect(graph.map((n) => n['@type'])).toEqual(['Organization', 'WebSite', 'WebApplication']);
    expect(ld?.[1]).not.toMatch(/aggregateRating|review|offers|price/i);
    expect(String(res.headers['content-security-policy'])).toContain("default-src 'self'");
  });

  it('give How it works its own title, canonical and breadcrumb', async () => {
    const res = await t.call('GET', '/how-it-works');
    expect(res.status).toBe(200);
    expect(res.raw).toContain(`<title>${SEO_PAGES['how-it-works'].title}</title>`);
    expect(res.raw).toContain(`<link rel="canonical" href="${ORIGIN}/how-it-works">`);
    expect(res.raw).toContain('BreadcrumbList');
    for (const s of STAGES) expect(res.raw).toContain(s.name);
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
