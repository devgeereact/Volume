import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClerkAuthProvider, type ClerkUserLookup, type ClerkVerifier } from '../src/auth/clerk.js';
import { clerkFrontendApiHost, loadConfig } from '../src/config/env.js';
import { inlineScriptHashes } from '../src/http/hosting.js';
import { buildApp } from '../src/app.js';
import { memoryDb, testApp, type TestApp } from './helpers.js';

const SITE = 'volume.example.com';
const ORIGIN = `https://${SITE}`;
// pk_test_ + base64("clerk.example.com$"): the shape of a real publishable key, with a made-up host.
const PK = `pk_test_${Buffer.from('clerk.example.com$').toString('base64')}`;
const THEME_SCRIPT = 'document.documentElement.dataset.theme = "light";';

/** Production settings as the cPanel host has them, with fake Clerk values. */
function prodEnv(webDir: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV: 'production',
    APP_ORIGIN: ORIGIN,
    AUTH_MODE: 'clerk',
    CLERK_PUBLISHABLE_KEY: PK,
    CLERK_JWT_KEY: 'fake-public-key',
    CLERK_SECRET_KEY: 'fake-secret',
    CLERK_ALLOWED_USER_IDS: 'user_owner',
    OWNER_EMAILS: 'Owner@Example.com',
    WEB_DIST_DIR: webDir,
    LOG_LEVEL: 'silent',
    JOBS_ENABLED: 'false',
    ...extra,
  };
}

/** "Bearer ok:<userId>" is a valid session for that user; anything else is signed out. */
const verifier: ClerkVerifier = {
  verify: (req) => {
    const m = /^Bearer ok:(\S+)$/.exec(req.headers.authorization ?? '');
    return Promise.resolve(m ? { userId: m[1] as string } : null);
  },
};
const lookups: string[] = [];
const lookup: ClerkUserLookup = {
  verifiedEmails: (userId) => {
    lookups.push(userId);
    return Promise.resolve(userId === 'user_email' ? ['owner@example.com'] : ['someone@else.test']);
  },
};

let webDir: string;
let t: TestApp;

const as = (userId: string | null, extra: Record<string, string> = {}): Record<string, string> => ({
  host: SITE,
  ...(userId ? { authorization: `Bearer ok:${userId}` } : {}),
  ...extra,
});

beforeAll(async () => {
  webDir = mkdtempSync(join(tmpdir(), 'volume-web-'));
  mkdirSync(join(webDir, 'assets'));
  writeFileSync(join(webDir, 'index.html'), `<!doctype html><html><head><script>${THEME_SCRIPT}</script></head><body><div id="root"></div></body></html>`);
  writeFileSync(join(webDir, 'assets', 'app-abc123.js'), 'console.log(1);');
  const config = loadConfig({ dotenv: false, env: prodEnv(webDir) });
  t = await testApp({ config, auth: (owner, db) => new ClerkAuthProvider(db, owner, config.clerk, verifier, lookup) });
});

afterAll(async () => {
  await t.close();
  rmSync(webDir, { recursive: true, force: true });
});

describe('production settings', () => {
  it('refuse AUTH_MODE=local, a missing APP_ORIGIN and incomplete Clerk settings', () => {
    expect(() => loadConfig({ dotenv: false, env: prodEnv(webDir, { AUTH_MODE: 'local' }) })).toThrow(/development only/);
    expect(() => loadConfig({ dotenv: false, env: { ...prodEnv(webDir), APP_ORIGIN: '' } })).toThrow(/APP_ORIGIN/);
    expect(() => loadConfig({ dotenv: false, env: { ...prodEnv(webDir), CLERK_ALLOWED_USER_IDS: '', OWNER_EMAILS: '' } })).toThrow(
      /OWNER_EMAILS or CLERK_ALLOWED_USER_IDS/,
    );
    expect(() => loadConfig({ dotenv: false, env: { ...prodEnv(webDir), CLERK_SECRET_KEY: '' } })).toThrow(/CLERK_SECRET_KEY/);
    expect(() => loadConfig({ dotenv: false, env: { ...prodEnv(webDir), APP_ORIGIN: 'https://volume.example.com/app' } })).toThrow(/no path/);
  });

  it('default to Clerk, no auto-migrate, proxy trust and APP_ORIGIN only', () => {
    const { AUTH_MODE: _unused, ...rest } = prodEnv(webDir);
    void _unused;
    const c = loadConfig({ dotenv: false, env: rest });
    expect(c.authMode).toBe('clerk');
    expect(c.autoMigrate).toBe(false);
    expect(c.trustProxy).toBe(true);
    expect(c.rateLimit).toEqual({ max: 600, writeMax: 300, healthMax: 30 });
    expect(c.allowedOrigins).toEqual([ORIGIN]);
    expect(c.allowedHosts).toEqual([SITE]);
    expect(c.clerk.authorizedParties).toEqual([ORIGIN]);
    expect(c.clerk.ownerEmails).toEqual(['owner@example.com']);
    expect(c.clerk.frontendApiHost).toBe('clerk.example.com');
    expect(JSON.stringify(c)).not.toContain('fake-secret');
    expect(JSON.stringify(c)).not.toContain('fake-public-key');
  });

  it('keep development on local sign-in and loopback, and default MySQL TLS by host', () => {
    const dev = loadConfig({ dotenv: false, env: {} });
    expect(dev.authMode).toBe('local');
    expect(dev.production).toBe(false);
    expect(dev.trustProxy).toBe(false);
    expect(dev.rateLimit.writeMax).toBeGreaterThan(100000);
    const local = loadConfig({ dotenv: false, env: { DB_CLIENT: 'mysql', MYSQL_HOST: 'localhost', MYSQL_DATABASE: 'd', MYSQL_USER: 'u' } });
    expect(local.db.client === 'mysql' && local.db.mysql.ssl).toBe('off');
    const remote = loadConfig({ dotenv: false, env: { DB_CLIENT: 'mysql', MYSQL_HOST: 'db.example.com', MYSQL_DATABASE: 'd', MYSQL_USER: 'u' } });
    expect(remote.db.client === 'mysql' && remote.db.mysql.ssl).toBe('verify');
    const socket = loadConfig({ dotenv: false, env: { DB_CLIENT: 'mysql', MYSQL_SOCKET: '/var/lib/mysql/mysql.sock', MYSQL_DATABASE: 'd', MYSQL_USER: 'u' } });
    expect(socket.db.client === 'mysql' && socket.db.mysql.socketPath).toBe('/var/lib/mysql/mysql.sock');
  });

  it('expand ~ in path settings', () => {
    const c = loadConfig({ dotenv: false, env: { DATA_DIR: '~/apps/volume/shared/data' } });
    expect(c.dataDir).toBe(join(homedir(), 'apps/volume/shared/data'));
  });

  it('read the Frontend API host from a publishable key', () => {
    expect(clerkFrontendApiHost(PK)).toBe('clerk.example.com');
    // The shape of the live key for the hosted app (pk_live_ + base64 of "clerk.volume.gakinz.com$").
    expect(clerkFrontendApiHost(`pk_live_${Buffer.from('clerk.volume.gakinz.com$').toString('base64')}`)).toBe('clerk.volume.gakinz.com');
    expect(clerkFrontendApiHost('nonsense')).toBeNull();
    expect(clerkFrontendApiHost(undefined)).toBeNull();
  });
});

describe('Clerk sign-in on /api', () => {
  it('answers 401 JSON without a valid session', async () => {
    const none = await t.call('GET', '/api/v1/books', undefined, as(null));
    expect(none.status).toBe(401);
    expect(none.body).toEqual({ error: { code: 'unauthorized', message: 'Sign in to continue.' } });
    const bad = await t.call('GET', '/api/v1/books', undefined, as(null, { authorization: 'Bearer forged' }));
    expect(bad.status).toBe(401);
  });

  it('answers 403 to a signed-in account that is not on the allowlist', async () => {
    const res = await t.call('GET', '/api/v1/books', undefined, as('user_stranger'));
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: { code: 'forbidden', message: 'This account is not allowed to use Volume.' } });
  });

  it('lets the owner in and binds the Clerk user to the existing owner workspace', async () => {
    const res = await t.call<{ items: unknown[] }>('GET', '/api/v1/books', undefined, as('user_owner'));
    expect(res.status).toBe(200);
    const row = await t.handle.db.selectFrom('users').select(['id', 'clerkUserId', 'authProvider']).where('id', '=', t.owner.userId).executeTakeFirstOrThrow();
    expect(row).toEqual({ id: t.owner.userId, clerkUserId: 'user_owner', authProvider: 'clerk' });
    // Writes work too, from the app's own origin.
    const made = await t.call('PATCH', '/api/v1/settings', { 'budget.warn_ratio': 0.7 }, as('user_owner', { origin: ORIGIN }));
    expect(made.status).toBe(200);
  });

  it('lets an OWNER_EMAILS account in as its own user in the same workspace, looking it up once', async () => {
    lookups.length = 0;
    expect((await t.call('GET', '/api/v1/books', undefined, as('user_email'))).status).toBe(200);
    expect((await t.call('GET', '/api/v1/books', undefined, as('user_email'))).status).toBe(200);
    expect(lookups).toEqual(['user_email']);
    const m = await t.handle.db
      .selectFrom('users')
      .innerJoin('memberships', 'memberships.userId', 'users.id')
      .select(['memberships.workspaceId', 'memberships.role'])
      .where('users.clerkUserId', '=', 'user_email')
      .executeTakeFirstOrThrow();
    expect(m).toEqual({ workspaceId: t.owner.workspaceId, role: 'owner' });
  });

  it('refuses writes from another origin, even when signed in', async () => {
    const res = await t.call('PATCH', '/api/v1/settings', { 'budget.warn_ratio': 0.7 }, as('user_owner', { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'bad_origin' } });
  });
});

describe('public hosting', () => {
  it('keeps /api/health public and says only up or down', async () => {
    const res = await t.call('GET', '/api/health', undefined, as(null));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['cache-control']).toBe('no-store');
    // The detailed health stays behind sign-in.
    expect((await t.call('GET', '/api/v1/health', undefined, as(null))).status).toBe(401);
  });

  it('keeps sign-in on percent-encoded and upper-case API paths', async () => {
    for (const url of ['/%61pi/v1/health', '/%61%70%69/v1/books', '/api/%761/books', '/API/v1/books', '/%41PI/v1/health']) {
      const res = await t.call('GET', url, undefined, as(null));
      expect(res.status, url).not.toBe(200);
      expect([401, 404], url).toContain(res.status);
    }
    expect((await t.call('GET', '/%61pi/v1/health', undefined, as(null))).status).toBe(401);
  });

  it('answers only the configured host, including loopback', async () => {
    expect((await t.call('GET', '/api/health', undefined, { host: 'evil.example' })).status).toBe(421);
    expect((await t.call('GET', '/api/health', undefined, { host: '127.0.0.1:5181' })).status).toBe(421);
  });

  it('serves the web app with security headers, a CSP and an SPA fallback', async () => {
    const page = await t.call('GET', '/books/123/editor', undefined, as(null));
    expect(page.status).toBe(200);
    expect(page.raw).toContain('<div id="root">');
    expect(page.headers['cache-control']).toBe('no-cache');
    expect(page.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    expect(page.headers['x-frame-options']).toBe('DENY');
    expect(page.headers['x-robots-tag']).toBe('noindex, nofollow');
    const csp = String(page.headers['content-security-policy']);
    expect(csp).toContain(inlineScriptHashes(`<script>${THEME_SCRIPT}</script>`)[0]);
    expect(csp).toContain("connect-src 'self' https://clerk.example.com https://*.protect.clerk.com:*");
    expect(csp).toContain("img-src 'self' data: blob: https://img.clerk.com");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("frame-src 'self' https://challenges.cloudflare.com https://*.protect.clerk.com");
    expect(csp).toContain("frame-ancestors 'none'");
    const root = await t.call('GET', '/', undefined, as(null));
    expect(root.status).toBe(200);
    const asset = await t.call('GET', '/assets/app-abc123.js', undefined, as(null));
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(asset.headers['content-security-policy']).toBeUndefined();
    // A missing hashed file and an unknown API path are real 404s, not the app shell.
    expect((await t.call('GET', '/assets/gone-111.js', undefined, as(null))).status).toBe(404);
    const api404 = await t.call('GET', '/api/v1/nope', undefined, as('user_owner'));
    expect(api404.status).toBe(404);
    expect(api404.body).toMatchObject({ error: { code: 'not_found' } });
  });

  it('never sends a stack trace or error message in a 500', async () => {
    const config = loadConfig({ dotenv: false, env: prodEnv(webDir) });
    const handle = await memoryDb();
    const { app } = await buildApp({
      config,
      handle,
      startJobs: false,
      logger: false,
      auth: (owner, db) => new ClerkAuthProvider(db, owner, config.clerk, verifier, null),
    });
    app.get('/api/v1/__boom', () => {
      throw new Error('secret internals at /home/user/file.ts:12');
    });
    try {
      const res = await app.inject({ method: 'GET', url: '/api/v1/__boom', headers: as('user_owner') });
      expect(res.statusCode).toBe(500);
      expect(res.body).not.toContain('secret internals');
      expect(res.body).not.toContain('file.ts');
      expect(JSON.parse(res.body)).toEqual({ error: { code: 'internal_error', message: 'Something went wrong on the server. Try again.' } });
    } finally {
      await app.close();
      await handle.close();
    }
  });
});

describe('event streams', () => {
  it('carry the same security headers as every other answer, HSTS included', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/events', headers: as('user_owner'), payloadAsStream: true });
    try {
      expect(res.statusCode).toBe(200);
      expect(String(res.headers['content-type'])).toMatch(/^text\/event-stream/);
      expect(res.headers['cache-control']).toBe('no-cache, no-transform');
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.headers['permissions-policy']).toContain('camera=()');
    } finally {
      res.stream().destroy();
    }
  });
});

describe('origin lock (CLOUDFLARE_ONLY)', () => {
  // 104.16.0.1 is in Cloudflare's 104.16.0.0/13; 203.0.113.7 is a documentation address outside every range.
  const lockedApp = (mode: string) => {
    const config = loadConfig({ dotenv: false, env: prodEnv(webDir, { CLOUDFLARE_ONLY: mode }) });
    return testApp({ config, auth: (owner, db) => new ClerkAuthProvider(db, owner, config.clerk, verifier, null) });
  };
  const hit = (r: TestApp, url: string, remoteAddress: string, xff?: string) =>
    r.app.inject({
      method: 'GET',
      url,
      remoteAddress,
      headers: { host: SITE, 'cf-connecting-ip': '198.51.100.9', ...(xff ? { 'x-forwarded-for': xff } : {}) },
    });

  it('is off by default', () => {
    expect(loadConfig({ dotenv: false, env: prodEnv(webDir) }).cloudflareOnly).toBe('off');
    expect(() => loadConfig({ dotenv: false, env: prodEnv(webDir, { CLOUDFLARE_ONLY: 'maybe' }) })).toThrow();
  });

  it('on: refuses a direct hit, even with a forged CF-RAY or X-Forwarded-For, and lets Cloudflare through', async () => {
    const r = await lockedApp('on');
    try {
      // Direct to the origin: the host proxy on loopback appends the caller's real address last.
      const direct = await hit(r, '/api/health', '127.0.0.1', '104.16.0.1, 203.0.113.7');
      expect(direct.statusCode).toBe(403);
      expect(JSON.parse(direct.body)).toMatchObject({ error: { code: 'not_via_cloudflare' } });
      expect((await hit(r, '/', '203.0.113.7')).statusCode).toBe(403);
      // No outside hop at all (only loopback): refused, so a missing proxy header never opens the lock.
      expect((await hit(r, '/api/health', '127.0.0.1')).statusCode).toBe(403);
      // Through Cloudflare: the visitor is first, Cloudflare's edge is the hop the host proxy saw.
      expect((await hit(r, '/api/health', '127.0.0.1', '198.51.100.9, 104.16.0.1')).statusCode).toBe(200);
      expect((await hit(r, '/api/health', '::ffff:104.16.0.1')).statusCode).toBe(200);
      expect((await hit(r, '/api/health', '2606:4700::1')).statusCode).toBe(200);
      // Certificate checks pass, as in the docroot .htaccess.
      expect((await hit(r, '/.well-known/acme-challenge/x', '203.0.113.7')).statusCode).not.toBe(403);
    } finally {
      await r.close();
    }
  });

  it('report: logs but does not refuse', async () => {
    const r = await lockedApp('report');
    try {
      expect((await hit(r, '/api/health', '203.0.113.7')).statusCode).toBe(200);
    } finally {
      await r.close();
    }
  });
});

describe('rate limits', () => {
  it('limit the public health check per visitor IP from CF-Connecting-IP', async () => {
    const config = loadConfig({ dotenv: false, env: prodEnv(webDir, { RATE_LIMIT_HEALTH_MAX: '2' }) });
    const r = await testApp({ config, auth: (owner, db) => new ClerkAuthProvider(db, owner, config.clerk, verifier, null) });
    try {
      const hit = (ip: string) => r.call('GET', '/api/health', undefined, { host: SITE, 'cf-connecting-ip': ip });
      expect((await hit('203.0.113.7')).status).toBe(200);
      expect((await hit('203.0.113.7')).status).toBe(200);
      const third = await hit('203.0.113.7');
      expect(third.status).toBe(429);
      expect(third.body).toMatchObject({ error: { code: 'rate_limited' } });
      // Another visitor has its own allowance.
      expect((await hit('198.51.100.9')).status).toBe(200);
    } finally {
      await r.close();
    }
  });
});
