import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/env.js';

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

/** True for /api paths (the JSON API), as opposed to the web app's pages and files. */
export function isApiPath(url: string): boolean {
  return url === '/api' || url.startsWith('/api/') || url.startsWith('/api?');
}

/** The public keep-alive health check: no sign-in, no details. */
export const PUBLIC_HEALTH_PATH = '/api/health';

export function isPublicHealth(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return path === PUBLIC_HEALTH_PATH;
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

/** Content Security Policy for the web app's pages. Clerk needs its Frontend API host, its image host and Turnstile. */
export function contentSecurityPolicy(config: AppConfig, scriptHashes: string[]): string {
  const fapi = config.clerk.frontendApiHost ? `https://${config.clerk.frontendApiHost}` : null;
  const clerkOn = config.authMode === 'clerk';
  const turnstile = 'https://challenges.cloudflare.com';
  const src = (...parts: (string | null | false)[]) => parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
  return [
    `default-src 'self'`,
    `script-src ${src(`'self'`, ...scriptHashes, clerkOn && fapi, clerkOn && turnstile)}`,
    `connect-src ${src(`'self'`, clerkOn && fapi)}`,
    `img-src ${src(`'self'`, 'data:', 'blob:', clerkOn && 'https://img.clerk.com')}`,
    `style-src 'self' 'unsafe-inline'`,
    `font-src 'self' data:`,
    `frame-src ${src(`'self'`, clerkOn && turnstile)}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');
}

/** Headers on every response. Pages get the CSP; the API keeps no-referrer and no-store. */
export function applySecurityHeaders(req: FastifyRequest, reply: FastifyReply, config: AppConfig, csp: string | null): void {
  const api = isApiPath(req.url);
  void reply.header('X-Content-Type-Options', 'nosniff');
  void reply.header('X-Frame-Options', 'DENY');
  void reply.header('Referrer-Policy', api ? 'no-referrer' : 'strict-origin-when-cross-origin');
  void reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  void reply.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  if (config.production) void reply.header('Strict-Transport-Security', 'max-age=31536000');
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
