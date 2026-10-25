import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { APP_PATH_PREFIXES, INDEXABLE_KEYS, SEO_PAGES, STAGES, classifyPath, indexablePaths, renderPage, robotsTxt, sitemapXml } from '../src/http/seo.js';
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
  it('disallow everything, with no sitemap, while nothing is indexable', async () => {
    const res = await t.call('GET', '/robots.txt');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toMatch(/^text\/plain/);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.raw).toBe('# Volume is a private studio. Nothing here is for search engines.\nUser-agent: *\nDisallow: /\n');
    expect(res.raw).not.toContain('Sitemap');
  });

  it('keep the static fallback in public/ the same as the served rules', () => {
    expect(readFileSync(join(WEB, 'public/robots.txt'), 'utf8')).toBe(robotsTxt(ORIGIN));
  });

  it('answers /sitemap.xml with a normal 404 while nothing is indexable', async () => {
    expect(INDEXABLE_KEYS).toEqual([]);
    const res = await t.call('GET', '/sitemap.xml');
    expect(res.status).toBe(404);
  });

  it('can still build the sitemap and robots rules for pages that are enabled', () => {
    const xml = sitemapXml(ORIGIN, ['home', 'how-it-works']);
    expect(xml).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/how-it-works</loc>`);
    expect(xml.match(/<url>/g)).toHaveLength(2);
    expect(xml).not.toContain('library');
    const robots = robotsTxt(ORIGIN, ['home', 'how-it-works']);
    expect(robots).toContain('Allow: /$');
    expect(robots).toContain('Allow: /how-it-works$');
    expect(robots).toContain('Disallow: /\n');
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(indexablePaths(['home'])).toEqual(['/robots.txt', '/sitemap.xml', '/']);
    expect(renderPage(SHELL, { origin: ORIGIN, key: 'home', indexableKeys: ['home'] })).toContain('content="index, follow, max-image-preview:large"');
  });
});

describe('public pages', () => {
  it('carry title, description, social tags and structured data, but stay noindex without a canonical', async () => {
    const res = await t.call('GET', '/');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(res.raw).toContain(`<title>${SEO_PAGES.home.title}</title>`);
    expect(res.raw).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(res.raw).not.toContain('rel="canonical"');
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

  it('give How it works its own title and breadcrumb, also noindex', async () => {
    const res = await t.call('GET', '/how-it-works');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(res.raw).toContain(`<title>${SEO_PAGES['how-it-works'].title}</title>`);
    expect(res.raw).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(res.raw).not.toContain('rel="canonical"');
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
