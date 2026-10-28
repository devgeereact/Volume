import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { BlockList, isIP } from 'node:net';
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
 * Cloudflare's published edge ranges (https://www.cloudflare.com/ips-v4 and /ips-v6, fetched 27 October 2026).
 * Check them again when Cloudflare announces a change.
 */
export const CLOUDFLARE_RANGES = {
  v4: [
    '173.245.48.0/20',
    '103.21.244.0/22',
    '103.22.200.0/22',
    '103.31.4.0/22',
    '141.101.64.0/18',
    '108.162.192.0/18',
    '190.93.240.0/20',
    '188.114.96.0/20',
    '197.234.240.0/22',
    '198.41.128.0/17',
    '162.158.0.0/15',
    '104.16.0.0/13',
    '104.24.0.0/14',
    '172.64.0.0/13',
    '131.0.72.0/22',
  ],
  v6: ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'],
} as const;

function blockList(v4: readonly string[], v6: readonly string[]): BlockList {
  const list = new BlockList();
  for (const r of v4) list.addSubnet(r.split('/')[0] as string, Number(r.split('/')[1]), 'ipv4');
  for (const r of v6) list.addSubnet(r.split('/')[0] as string, Number(r.split('/')[1]), 'ipv6');
  return list;
}

const cloudflare = blockList(CLOUDFLARE_RANGES.v4, CLOUDFLARE_RANGES.v6);
// The host's own proxies (LiteSpeed, Passenger) sit on loopback or a private network.
const hostLocal = blockList(['127.0.0.0/8', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'], ['::1/128', 'fc00::/7']);

/** A bare IP from a socket or header value, IPv4-mapped IPv6 unwrapped; null when it is not an IP. */
function bareIp(value: string | undefined): { ip: string; family: 'ipv4' | 'ipv6' } | null {
  const v = (value ?? '').trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, '');
  const kind = isIP(v);
  return kind === 4 ? { ip: v, family: 'ipv4' } : kind === 6 ? { ip: v, family: 'ipv6' } : null;
}

/**
 * The address that connected to the host from outside: walking back from the socket through X-Forwarded-For (each
 * proxy appends the peer it saw), the first hop that is not loopback or private. Null when there is none.
 */
export function edgeIp(req: FastifyRequest): string | null {
  const xff = req.headers['x-forwarded-for'];
  const chain = (Array.isArray(xff) ? xff.join(',') : (xff ?? '')).split(',').reverse();
  for (const hop of [req.socket.remoteAddress, ...chain]) {
    const a = bareIp(hop);
    if (a && !hostLocal.check(a.ip, a.family)) return a.ip;
  }
  return null;
}

/** True when the request reached the host through Cloudflare's network. */
export function viaCloudflare(req: FastifyRequest): boolean {
  const a = bareIp(edgeIp(req) ?? undefined);
  return a !== null && cloudflare.check(a.ip, a.family);
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
        html(200, renderPage(shell, { origin: origin(), key: page.key, fonts }));
        return;
      case 'app':
        html(200, page.key ? renderPage(shell, { origin: origin(), key: page.key }) : shell);
        return;
      case 'not-found':
        html(404, renderPage(shell, { origin: origin(), key: 'not-found' }));
        return;
      default:
        return done();
    }
  });
}
