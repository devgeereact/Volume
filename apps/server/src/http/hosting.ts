import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { classifyPath, fontPreloads, isIndexablePath, renderPage, robotsTxt, siteOrigin, sitemapXml } from './seo.js';

/**
 * Public hosting helpers: the visitor's IP behind Cloudflare, security headers, and the built web app served by the
 * same process as /api (one Passenger app at the domain root).
 */

/**
 * The visitor's IP. Behind Cloudflare (TRUST_PROXY on) CF-Connecting-IP holds it; Cloudflare overwrites that header,
 * so a visitor cannot set it through the proxy. Otherwise Fastify's request IP.
 */
export function clientIp(req: FastifyRequest, trustProxy: boolean): string {
  if (trustProxy) {
    const cf = req.headers['cf-connecting-ip'];
    const value = Array.isArray(cf) ? cf[0] : cf;
    if (typeof value === 'string' && isIP(value.trim()) !== 0) return value.trim();
  }
  return req.ip || 'unknown';
}

/**
 * The path the router will match: query dropped, percent-encoding decoded and lower-cased. The router decodes
 * `%61pi` to `api` before matching, so sign-in and other path checks must look at the same decoded form.
 */
export function requestPath(url: string): string {
  const raw = url.split('?')[0] ?? url;
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/** True for /api paths (the JSON API), as opposed to the web app's pages and files. */
export function isApiPath(url: string): boolean {
  const path = requestPath(url);
  return path === '/api' || path.startsWith('/api/');
}

/** The public keep-alive health check: no sign-in, no details. */
export const PUBLIC_HEALTH_PATH = '/api/health';

export function isPublicHealth(url: string): boolean {
  return requestPath(url) === PUBLIC_HEALTH_PATH;
}

/** sha256 sources for the inline scripts in index.html (the theme script that runs before first paint). */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = m[1] ?? '';
    if (body.trim().length === 0) continue;
    out.push(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  return out;
}

/**
 * Content Security Policy for the web app's pages. Clerk (docs: guides/secure/best-practices/csp-headers) needs its
 * Frontend API host (decoded from the publishable key, e.g. clerk.volume.gakinz.com), img.clerk.com, blob workers,
 * Cloudflare Turnstile and its abuse and fraud protection hosts (*.protect.clerk.com, on ports other than 443).
 */
export function contentSecurityPolicy(config: AppConfig, scriptHashes: string[]): string {
  const fapi = config.clerk.frontendApiHost ? `https://${config.clerk.frontendApiHost}` : null;
  const clerkOn = config.authMode === 'clerk';
  const turnstile = 'https://challenges.cloudflare.com';
  const protect = 'https://*.protect.clerk.com';
  const src = (...parts: (string | null | false)[]) => parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
  return [
    `default-src 'self'`,
    `script-src ${src(`'self'`, ...scriptHashes, clerkOn && fapi, clerkOn && turnstile, clerkOn && protect)}`,
    `connect-src ${src(`'self'`, clerkOn && fapi, clerkOn && `${protect}:*`)}`,
    `img-src ${src(`'self'`, 'data:', 'blob:', clerkOn && 'https://img.clerk.com')}`,
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self' data:`,
    `frame-src ${src(`'self'`, clerkOn && turnstile, clerkOn && protect)}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

/** HSTS for the hosted app, subdomains included (D-050; the Clerk Frontend API host is a subdomain served over HTTPS). */
export const HSTS = 'max-age=31536000; includeSubDomains';

/**
 * The security headers every response carries, whatever its type. onSend applies them to normal replies; the SSE
 * streams, which write their own head after hijacking the reply, send the same set.
 */
export function baseSecurityHeaders(url: string, config: AppConfig): Record<string, string> {
  const h: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': isApiPath(url) ? 'no-referrer' : 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  };
  // Private app: keep every page, file and API answer out of search results. Only the public pages (and robots.txt
  // and sitemap.xml, which crawlers must read) go without the header; their own robots meta tag speaks for them.
  if (!isIndexablePath(url)) h['X-Robots-Tag'] = 'noindex, nofollow';
  if (config.production) h['Strict-Transport-Security'] = HSTS;
  return h;
}

/** Headers on every response. Pages get the CSP; the API keeps no-referrer and no-store. */
export function applySecurityHeaders(req: FastifyRequest, reply: FastifyReply, config: AppConfig, csp: string | null): void {
  const api = isApiPath(req.url);
  void reply.headers(baseSecurityHeaders(req.url, config));
  if (!reply.hasHeader('Cache-Control')) {
    // Hashed bundles never change; pages and everything else are checked on every load. The API is never cached.
    const path = req.url.split('?')[0] ?? '';
    void reply.header('Cache-Control', api ? 'no-store' : path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  }
  const type = String(reply.getHeader('content-type') ?? '');
  if (!api && csp && type.startsWith('text/html')) void reply.header('Content-Security-Policy', csp);
}

/**
 * Serves the built web app: files from webDistDir, and index.html for any other GET that is not /api (the router's
 * paths). Returns the CSP for pages, or null when there is no web build to serve.
 */
export async function registerWebApp(app: FastifyInstance, config: AppConfig): Promise<string | null> {
  const dir = config.webDistDir;
  if (!dir || !existsSync(join(dir, 'index.html'))) return null;
  const csp = contentSecurityPolicy(config, inlineScriptHashes(readFileSync(join(dir, 'index.html'), 'utf8')));
  await app.register(fastifyStatic, { root: dir, prefix: '/', wildcard: true, index: ['index.html'], cacheControl: false, dotfiles: 'deny' });
  registerSeoPages(app, config, readFileSync(join(dir, 'index.html'), 'utf8'));
  return csp;
}

/** SPA fallback for the not-found handler: true when it answered with index.html. */
export function sendSpaIndex(req: FastifyRequest, reply: FastifyReply, config: AppConfig): boolean {
  if (!config.webDistDir || isApiPath(req.url)) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const path = req.url.split('?')[0] ?? '';
  // A missing file (an old hashed bundle, say) is a real 404, not the app shell.
  if (path.startsWith('/assets/') || /\.[a-z0-9]{1,8}$/i.test(path)) return false;
  void reply.header('Cache-Control', 'no-cache').sendFile('index.html');
  return true;
}

/**
 * Answers the page addresses before the static handler: the public pages with their own head tags (200), the app
 * and sign-in with the shell (200, noindex), one address per page (301), an address that matches nothing with the
 * shell and status 404, plus robots.txt and sitemap.xml.
 */
function registerSeoPages(app: FastifyInstance, config: AppConfig, shell: string): void {
  const fonts = fontPreloads(config.webDistDir);
  app.addHook('onRequest', (req, reply, done) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return done();
    const page = classifyPath(req.url);
    const origin = () => siteOrigin(config, req);
    const html = (status: number, body: string) => {
      void reply.code(status).header('Cache-Control', 'no-cache').type('text/html; charset=utf-8').send(body);
    };
    switch (page.kind) {
      case 'robots':
        void reply.header('Cache-Control', 'public, max-age=3600').type('text/plain; charset=utf-8').send(robotsTxt(origin()));
        return;
      case 'sitemap':
        void reply.header('Cache-Control', 'public, max-age=3600').type('application/xml; charset=utf-8').send(sitemapXml(origin()));
        return;
      case 'redirect':
        void reply.redirect(page.to, 301);
        return;
      case 'public':
        html(200, renderPage(shell, { origin: origin(), key: page.key, indexable: true, fonts }));
        return;
      case 'app':
        html(200, page.key ? renderPage(shell, { origin: origin(), key: page.key, indexable: false }) : shell);
        return;
      case 'not-found':
        html(404, renderPage(shell, { origin: origin(), key: 'not-found', indexable: false }));
        return;
      default:
        return done();
    }
  });
}
