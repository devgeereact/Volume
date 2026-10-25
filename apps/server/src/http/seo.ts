import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';

/**
 * Search-engine facing pages of the hosted app: robots.txt, sitemap.xml, the head tags of the public pages in the
 * first response, and honest status codes (a real 404 for an address that matches nothing).
 *
 * Volume is a private studio (D-053). Only the landing page and How it works are public and indexable; every
 * other page, file and API answer stays noindex and is disallowed in robots.txt. The page copy below mirrors
 * apps/web/src/site/seo-pages.json (the web app keeps the tags right while a visitor moves between pages);
 * test/seo.test.ts fails when the two drift apart.
 */

export interface SeoPage {
  path: string;
  title: string;
  description: string;
}

export const SEO_PAGES = {
  home: {
    path: '/',
    title: 'Volume | Book production studio for independent authors',
    description:
      "Volume researches your topic with linked sources, writes in your author's voice, edits, designs the cover and builds an upload pack for Amazon KDP.",
  },
  'how-it-works': {
    path: '/how-it-works',
    title: 'How Volume works | Seven stages from title to upload pack',
    description:
      'Research, titles, blueprint, manuscript, editing, cover and upload pack. You choose the title and approve the plan. Nothing is published for you.',
  },
  'sign-in': {
    path: '/sign-in',
    title: 'Sign in | Volume',
    description: 'Volume is a private book studio. Access is by invitation.',
  },
  'not-found': {
    path: '/404',
    title: 'Page not found | Volume',
    description: 'There is nothing at this address.',
  },
} as const satisfies Record<string, SeoPage>;

type SeoKey = keyof typeof SEO_PAGES;

/** The pages search engines may index, in sitemap order. */
export type PublicKey = 'home' | 'how-it-works';

// D-053 item 5: noindex stays. To index the landing page and How it works, add 'home' and 'how-it-works' here and in the web seo.ts, after a superseding decision.
export const INDEXABLE_KEYS: readonly PublicKey[] = [];

/** Paths whose answers carry no noindex header: the indexable pages, plus the files crawlers must read. */
export function indexablePaths(keys: readonly PublicKey[] = INDEXABLE_KEYS): string[] {
  return ['/robots.txt', ...(keys.length > 0 ? ['/sitemap.xml', ...keys.map((k) => SEO_PAGES[k].path)] : [])];
}

/** First path segments that belong to the signed-in app (and sign-in). They answer 200 with the app shell, noindex. */
export const APP_PATH_PREFIXES: readonly string[] = [
  'sign-in',
  'library',
  'published',
  'profiles',
  'books',
  'settings',
  'archive',
  'volume',
  'new-book',
  'components',
];

/** The seven stages, for the no-script copy of How it works. Matches apps/web/src/site/HowItWorksPage.tsx. */
export const STAGES: readonly { name: string; detail: string }[] = [
  { name: 'Research', detail: 'Sources gathered and linked. Claims the sources do not back are flagged for you.' },
  { name: 'Title options', detail: 'Titles proposed. You choose the one you want.' },
  { name: 'Blueprint', detail: 'The chapter plan, ready before writing starts.' },
  { name: 'Manuscript', detail: "Written in your author's voice, chapter by chapter." },
  { name: 'Editing', detail: 'Edit passes. Claims to check go to their own report.' },
  { name: 'Cover', detail: 'Front cover and full wrap, spine sized to the page count.' },
  { name: 'Upload pack', detail: 'Interior files, covers and listing copy for your KDP upload.' },
];

const HEADLINE = 'Bring a working title. Leave with a finished book.';

export type PageKind =
  | { kind: 'public'; key: PublicKey }
  | { kind: 'app'; key: 'sign-in' | null }
  | { kind: 'redirect'; to: string }
  | { kind: 'not-found' }
  | { kind: 'robots' }
  | { kind: 'sitemap' }
  | { kind: 'other' };

/**
 * What a GET to this URL is. `other` means "not a page": the API, /assets and any path with a file extension, which
 * the static handler serves or answers with a plain 404.
 */
export function classifyPath(url: string): PageKind {
  const raw = url.split('?')[0] ?? '';
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return { kind: 'not-found' };
  }
  const lower = path.toLowerCase();
  if (lower === '/api' || lower.startsWith('/api/') || lower.startsWith('/assets/')) return { kind: 'other' };
  if (lower === '/robots.txt') return { kind: 'robots' };
  // No sitemap while nothing is indexable: a normal 404.
  if (lower === '/sitemap.xml') return INDEXABLE_KEYS.length > 0 ? { kind: 'sitemap' } : { kind: 'other' };
  if (lower === '/index.html') return { kind: 'redirect', to: '/' };
  if (/\.[a-z0-9]{1,8}$/i.test(path)) return { kind: 'other' };
  // One address per page: trailing slash, other letter case and /welcome all lead to the page itself.
  if (lower === '/welcome' || lower === '/welcome/') return { kind: 'redirect', to: '/' };
  const trimmed = lower.length > 1 ? lower.replace(/\/+$/, '') : lower;
  if (trimmed === '/' || trimmed === '/how-it-works') {
    if (path !== trimmed) return { kind: 'redirect', to: trimmed };
    return { kind: 'public', key: trimmed === '/' ? 'home' : 'how-it-works' };
  }
  const first = lower.split('/')[1] ?? '';
  if (first === 'sign-in') return { kind: 'app', key: 'sign-in' };
  if (APP_PATH_PREFIXES.includes(first)) return { kind: 'app', key: null };
  return { kind: 'not-found' };
}

/** True when the response at this URL may be indexed (no X-Robots-Tag header). */
export function isIndexablePath(url: string): boolean {
  const raw = url.split('?')[0] ?? '';
  return indexablePaths().includes(raw);
}

/**
 * The public origin: APP_ORIGIN in production (required there). In development it falls back to the request's own host,
 * accepted only when it looks like a plain host name, so a forged Host header cannot put markup in a page.
 */
export function siteOrigin(config: AppConfig, req: FastifyRequest): string {
  if (config.appOrigin) return config.appOrigin;
  const host = req.headers.host ?? '';
  return /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? `${req.protocol}://${host}` : 'http://127.0.0.1';
}

export function robotsTxt(origin: string, keys: readonly PublicKey[] = INDEXABLE_KEYS): string {
  if (keys.length === 0) return ['# Volume is a private studio. Nothing here is for search engines.', 'User-agent: *', 'Disallow: /', ''].join('\n');
  return [
    '# Volume is a private studio. Only the listed public pages may be indexed.',
    'User-agent: *',
    ...keys.map((k) => `Allow: ${SEO_PAGES[k].path === '/' ? '/$' : `${SEO_PAGES[k].path}$`}`),
    'Allow: /assets/',
    'Allow: /favicon.ico',
    'Allow: /favicon.svg',
    'Allow: /og-image.png',
    'Disallow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

export function sitemapXml(origin: string, keys: readonly PublicKey[] = INDEXABLE_KEYS): string {
  const urls = keys.map((k) => `  <url><loc>${escapeXml(origin + SEO_PAGES[k].path)}</loc></url>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', ...urls, '</urlset>', ''].join('\n');
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function escapeHtml(s: string): string {
  return escapeXml(s);
}

/** JSON for a script block: "<" is escaped so the data can never close the tag. */
function jsonForScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** Structured data that says only what is true of the pages: a name, a description and where things are. No ratings, prices or reviews. */
export function structuredData(key: PublicKey, origin: string): Record<string, unknown> {
  const home = SEO_PAGES.home;
  const org = { '@type': 'Organization', '@id': `${origin}/#organization`, name: 'Volume', url: `${origin}/`, logo: `${origin}/icon-512.png` };
  const site = {
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    url: `${origin}/`,
    name: 'Volume',
    description: home.description,
    inLanguage: 'en-GB',
    publisher: { '@id': org['@id'] },
  };
  if (key === 'home') {
    const app = {
      '@type': 'WebApplication',
      '@id': `${origin}/#app`,
      name: 'Volume',
      url: `${origin}/`,
      description: home.description,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires a modern web browser',
      inLanguage: 'en-GB',
      publisher: { '@id': org['@id'] },
    };
    return { '@context': 'https://schema.org', '@graph': [org, site, app] };
  }
  const page = SEO_PAGES['how-it-works'];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${origin}${page.path}#webpage`,
        url: `${origin}${page.path}`,
        name: page.title,
        description: page.description,
        inLanguage: 'en-GB',
        isPartOf: { '@id': site['@id'] },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Volume', item: `${origin}/` },
          { '@type': 'ListItem', position: 2, name: 'How it works', item: `${origin}${page.path}` },
        ],
      },
    ],
  };
}

/** The copy of a public page for visitors and crawlers that run no scripts (the web app is client-rendered). */
export function noscriptBody(key: PublicKey): string {
  const page = SEO_PAGES[key];
  const links = '<p><a href="/">Home</a> | <a href="/how-it-works">How it works</a> | <a href="/sign-in">Sign in</a></p>';
  if (key === 'home') {
    return `<noscript><main><h1>${escapeHtml(HEADLINE)}</h1><p>${escapeHtml(page.description)} You choose the title and approve the plan. Nothing is published for you.</p>${links}</main></noscript>`;
  }
  const stages = STAGES.map((s) => `<li><strong>${escapeHtml(s.name)}.</strong> ${escapeHtml(s.detail)}</li>`).join('');
  return `<noscript><main><h1>Seven stages from title to upload pack.</h1><p>${escapeHtml(page.description)}</p><ol>${stages}</ol>${links}</main></noscript>`;
}

/** Hashed font files the public pages show above the fold, as preload links (the stylesheet only reveals them after the script runs). */
export function fontPreloads(webDistDir: string | null): string {
  if (!webDistDir) return '';
  const dir = join(webDistDir, 'assets');
  if (!existsSync(dir)) return '';
  const files = readdirSync(dir);
  const wanted = ['literata-latin-opsz-normal-', 'literata-latin-opsz-italic-', 'schibsted-grotesk-latin-wght-normal-'];
  return wanted
    .map((prefix) => files.find((f) => f.startsWith(prefix) && f.endsWith('.woff2')))
    .filter((f): f is string => typeof f === 'string')
    .map((f) => `<link rel="preload" href="/assets/${escapeHtml(f)}" as="font" type="font/woff2" crossorigin>`)
    .join('');
}

export interface RenderOptions {
  origin: string;
  /** Page-specific head: title, description, robots and the tags that follow from them. */
  key: SeoKey;
  /** The pages search engines may index (default INDEXABLE_KEYS). Any other page is noindex, nofollow and has no canonical. */
  indexableKeys?: readonly PublicKey[];
  /** Font preload links, for the public pages. */
  fonts?: string;
}

/** The app shell (index.html) with the head tags of one page written in. Everything else in the file is left as built. */
export function renderPage(html: string, o: RenderOptions): string {
  const page = SEO_PAGES[o.key];
  const indexable = (o.indexableKeys ?? INDEXABLE_KEYS).includes(o.key as PublicKey);
  const robots = indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow';
  const url = `${o.origin}${page.path}`;
  const extra: string[] = [];
  const key = o.key;
  // The landing page and How it works carry social tags and structured data even while they are noindex.
  if (key === 'home' || key === 'how-it-works') {
    const image = `${o.origin}/og-image.png`;
    const alt = 'Volume, a book production studio';
    const og: [string, string][] = [
      ['og:type', 'website'],
      ['og:site_name', 'Volume'],
      ['og:locale', 'en_GB'],
      ['og:title', page.title],
      ['og:description', page.description],
      ['og:url', url],
      ['og:image', image],
      ['og:image:width', '1200'],
      ['og:image:height', '630'],
      ['og:image:alt', alt],
    ];
    const tw: [string, string][] = [
      ['twitter:card', 'summary_large_image'],
      ['twitter:title', page.title],
      ['twitter:description', page.description],
      ['twitter:image', image],
      ['twitter:image:alt', alt],
    ];
    if (indexable) extra.push(`<link rel="canonical" href="${escapeHtml(url)}">`);
    for (const [p, c] of og) extra.push(`<meta property="${p}" content="${escapeHtml(c)}">`);
    for (const [n, c] of tw) extra.push(`<meta name="${n}" content="${escapeHtml(c)}">`);
    extra.push(`<script type="application/ld+json">${jsonForScript(structuredData(key, o.origin))}</script>`);
    if (o.fonts) extra.push(o.fonts);
  }
  let out = html
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, () => `<meta name="description" content="${escapeHtml(page.description)}">`)
    .replace(/<meta\s+name="robots"[^>]*>/i, () => `<meta name="robots" content="${robots}">`);
  if (extra.length > 0) out = out.replace(/<\/head>/i, () => `${extra.join('\n')}\n</head>`);
  if (key === 'home' || key === 'how-it-works') out = out.replace(/(<div id="root"><\/div>)/i, (m) => `${m}\n${noscriptBody(key)}`);
  return out;
}
