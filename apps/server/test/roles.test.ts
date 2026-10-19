import Fastify from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClerkAuthProvider, type ClerkUserLookup, type ClerkVerifier } from '../src/auth/clerk.js';
import { registerRoutes } from '../src/routes/index.js';
import { str, testApp, testConfig, type TestApp } from './helpers.js';

/**
 * Accounts and roles (P8-3, D-047) with a fake Clerk: "Bearer ok:<userId>" is a valid session, and the lookup gives
 * each test account one verified address. No call leaves the process.
 */

type Obj = Record<string, unknown>;
const PK = `pk_test_${Buffer.from('clerk.example.com$').toString('base64')}`;
const CLERK = {
  AUTH_MODE: 'clerk',
  CLERK_PUBLISHABLE_KEY: PK,
  CLERK_SECRET_KEY: 'fake-secret',
  CLERK_ALLOWED_USER_IDS: 'user_owner',
};

const verifier: ClerkVerifier = {
  verify: (req) => {
    const m = /^Bearer ok:(\S+)$/.exec(req.headers.authorization ?? '');
    return Promise.resolve(m ? { userId: m[1] as string } : null);
  },
};
const lookup: ClerkUserLookup = {
  verifiedEmails: (userId) => Promise.resolve([`${userId.replace(/^user_/, '')}@example.test`]),
};

async function withAccounts(mode: 'owner-only' | 'invite' | null): Promise<TestApp> {
  const config = testConfig({ ...CLERK, ...(mode ? { ACCOUNTS_MODE: mode } : {}) });
  return testApp({ config, auth: (owner, db) => new ClerkAuthProvider(db, owner, config.clerk, verifier, lookup, config.accountsMode) });
}

const as = (userId: string | null): Record<string, string> => (userId ? { authorization: `Bearer ok:${userId}` } : {});

describe('ACCOUNTS_MODE=owner-only (the default)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await withAccounts(null);
  });
  afterAll(async () => t.close());

  it('defaults to owner-only and admits nobody through an invitation', async () => {
    expect(t.services.config.accountsMode).toBe('owner-only');
    await t.services.repos.members.invite(t.owner, { email: 'guest@example.test', role: 'editor' });
    expect((await t.call('GET', '/api/v1/books', undefined, as('user_guest'))).status).toBe(403);
    const me = await t.call<Obj>('GET', '/api/v1/me', undefined, as('user_owner'));
    expect(me.body).toMatchObject({ role: 'owner', workspaceId: t.owner.workspaceId, instanceOwner: true, accountsMode: 'owner-only' });
    const inv = await t.call<Obj>('POST', '/api/v1/invitations', { email: 'x@example.test', role: 'viewer' }, as('user_owner'));
    expect(inv.status).toBe(409);
    expect((await t.call('GET', '/api/v1/members', undefined, as('user_owner'))).status).toBe(200);
  });

  it('refuses a bad ACCOUNTS_MODE value', () => {
    expect(() => testConfig({ ACCOUNTS_MODE: 'open' })).toThrow(/ACCOUNTS_MODE/);
    expect(testConfig({ ACCOUNTS_MODE: ' Invite ' }).accountsMode).toBe('invite');
  });
});

describe('ACCOUNTS_MODE=invite', () => {
  let t: TestApp;
  let bookId: string;
  let profileId: string;
  const userIdOf = async (clerkUserId: string): Promise<string> =>
    str((await t.handle.db.selectFrom('users').select('id').where('clerkUserId', '=', clerkUserId).executeTakeFirstOrThrow()).id);

  beforeAll(async () => {
    t = await withAccounts('invite');
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Owner Pen', bioThirdPerson: 'Owner Pen writes.' }, as('user_owner'));
    profileId = str(p.body['id']);
    const b = await t.call<Obj>('POST', '/api/v1/books', { profileId, idea: 'Owner idea', title: 'Owner Book' }, as('user_owner'));
    bookId = str(b.body['id']);
    for (const [email, role] of [
      ['editor@example.test', 'editor'],
      ['viewer@example.test', 'viewer'],
      ['pub@example.test', 'owner'],
      ['late@example.test', 'viewer'],
    ] as const) {
      const r = await t.call('POST', '/api/v1/invitations', { email: email.toUpperCase(), role }, as('user_owner'));
      expect(r.status).toBe(201);
    }
  });
  afterAll(async () => t.close());

  it('answers 401 without a session and 403 to an account with no invitation', async () => {
    expect((await t.call('GET', '/api/v1/books', undefined, as(null))).status).toBe(401);
    expect((await t.call('GET', '/api/v1/books', undefined, as('user_stranger'))).status).toBe(403);
  });

  it("lands invited editors and viewers in the owner's workspace with their role, never as owner", async () => {
    const ed = await t.call<Obj>('GET', '/api/v1/me', undefined, as('user_editor'));
    expect(ed.body).toMatchObject({ role: 'editor', workspaceId: t.owner.workspaceId, instanceOwner: false });
    const vw = await t.call<Obj>('GET', '/api/v1/me', undefined, as('user_viewer'));
    expect(vw.body).toMatchObject({ role: 'viewer', workspaceId: t.owner.workspaceId });
    expect((await t.call<{ items: unknown[] }>('GET', '/api/v1/books', undefined, as('user_viewer'))).body.items).toHaveLength(1);
    const members = await t.call<{ items: { role: string; email: string | null }[]; invitations: { email: string }[] }>(
      'GET',
      '/api/v1/members',
      undefined,
      as('user_owner'),
    );
    expect(members.body.items.map((m) => [m.role, m.email])).toEqual([
      ['owner', null],
      ['editor', 'editor@example.test'],
      ['viewer', 'viewer@example.test'],
    ]);
    expect(members.body.invitations.map((i) => i.email).sort()).toEqual(['late@example.test', 'pub@example.test']);
  });

  it('gives an invited self-publisher a new workspace of their own', async () => {
    const me = await t.call<Obj>('GET', '/api/v1/me', undefined, as('user_pub'));
    expect(me.body).toMatchObject({ role: 'owner', instanceOwner: false });
    expect(me.body['workspaceId']).not.toBe(t.owner.workspaceId);
    expect((await t.call<{ items: unknown[] }>('GET', '/api/v1/books', undefined, as('user_pub'))).body.items).toEqual([]);
    expect((await t.call('GET', `/api/v1/books/${bookId}`, undefined, as('user_pub'))).status).toBe(404);
    // Owner of their own workspace, not of this Volume.
    expect((await t.call('GET', '/api/v1/backups', undefined, as('user_pub'))).status).toBe(403);
    expect((await t.call('POST', '/api/v1/invitations', { email: 'next@example.test', role: 'owner' }, as('user_pub'))).status).toBe(403);
    const own = await t.call<Obj>('POST', '/api/v1/invitations', { email: 'helper@example.test', role: 'editor' }, as('user_pub'));
    expect(own.status).toBe(201);
    const ownerList = await t.call<{ invitations: { email: string }[] }>('GET', '/api/v1/members', undefined, as('user_owner'));
    expect(ownerList.body.invitations.map((i) => i.email)).not.toContain('helper@example.test');
  });

  it('lets an editor write books but not settings, budgets, members, bios or backups', async () => {
    const e = as('user_editor');
    expect((await t.call('POST', '/api/v1/books', { profileId, idea: 'Editor idea' }, e)).status).toBe(201);
    expect((await t.call('PATCH', `/api/v1/books/${bookId}`, { subtitle: 'Edited' }, e)).status).toBe(200);
    expect((await t.call('PATCH', `/api/v1/profiles/${profileId}`, { penName: 'Owner Pen' }, e)).status).toBe(200);
    const refused: [string, string, unknown][] = [
      ['POST', '/api/v1/books', { profileId, idea: 'x', budgetUsd: 99 }],
      ['PATCH', `/api/v1/books/${bookId}`, { budgetUsd: 99 }],
      ['PATCH', '/api/v1/settings', { 'ui.theme': 'dark' }],
      ['PUT', '/api/v1/settings/models', { stages: {} }],
      ['PATCH', `/api/v1/profiles/${profileId}`, { bioThirdPerson: 'Changed bio.' }],
      ['POST', '/api/v1/profiles', { penName: 'New', bioThirdPerson: 'Bio.' }],
      ['GET', '/api/v1/members', undefined],
      ['POST', '/api/v1/invitations', { email: 'e@example.test', role: 'viewer' }],
      ['GET', '/api/v1/backups', undefined],
      ['POST', '/api/v1/backups', {}],
      ['POST', '/api/v1/settings/openrouter/test', {}],
    ];
    for (const [method, url, body] of refused) {
      const res = await t.call<Obj>(method as 'GET', url, body, e);
      expect(res.status, `${method} ${url}`).toBe(403);
    }
  });

  it('listing routes: a viewer reads but cannot write it, another workspace gets 404 on both', async () => {
    const v = as('user_viewer');
    expect((await t.call<{ listing: unknown }>('GET', `/api/v1/books/${bookId}/listing`, undefined, v)).status).toBe(200);
    expect((await t.call('POST', `/api/v1/books/${bookId}/listing`, {}, v)).status).toBe(403);
    const pub = as('user_pub');
    await t.call('GET', '/api/v1/me', undefined, pub);
    expect((await t.call('GET', `/api/v1/books/${bookId}/listing`, undefined, pub)).status).toBe(404);
    expect((await t.call('POST', `/api/v1/books/${bookId}/listing`, {}, pub)).status).toBe(404);
  });

  it('lets a viewer read but refuses every write route', async () => {
    const v = as('user_viewer');
    expect((await t.call('GET', `/api/v1/books/${bookId}`, undefined, v)).status).toBe(200);
    const probe = Fastify({ logger: false });
    const routes: { method: string; url: string }[] = [];
    probe.addHook('onRoute', (r) => {
      for (const m of [r.method].flat()) if (!['GET', 'HEAD'].includes(m)) routes.push({ method: m, url: r.url });
    });
    await probe.register((api) => Promise.resolve(registerRoutes(api, t.services)), { prefix: '/api/v1' });
    await probe.ready();
    await probe.close();
    expect(routes.length).toBeGreaterThan(60);
    const snap = async (): Promise<string> => {
      const out: unknown[] = [];
      for (const table of ['projects', 'author_profiles', 'settings', 'memberships', 'invitations', 'jobs', 'sections']) {
        out.push(
          (await sql`select * from ${sql.table(table)} where workspace_id = ${t.owner.workspaceId} order by id`.execute(t.handle.db.withoutPlugins())).rows,
        );
      }
      return JSON.stringify(out);
    };
    const before = await snap();
    const allowed: string[] = [];
    for (const r of routes) {
      const url = r.url.replace(/:id\b/, bookId).replace(/:[A-Za-z]+/g, '0');
      const res = await t.call(r.method as 'POST', url, {}, v);
      if (res.status < 300 || res.status >= 500) allowed.push(`${r.method} ${r.url}: ${res.status}`);
    }
    expect(allowed).toEqual([]);
    expect(await snap()).toBe(before);
  });

  it('applies a role change and a removal on the next request', async () => {
    const editorId = await userIdOf('user_editor');
    const ch = await t.call<Obj>('PATCH', `/api/v1/members/${editorId}`, { role: 'viewer' }, as('user_owner'));
    expect(ch.status).toBe(200);
    expect(ch.body).toMatchObject({ role: 'viewer', email: 'editor@example.test' });
    expect((await t.call<Obj>('GET', '/api/v1/me', undefined, as('user_editor'))).body['role']).toBe('viewer');
    expect((await t.call('PATCH', `/api/v1/books/${bookId}`, { subtitle: 'x' }, as('user_editor'))).status).toBe(403);
    expect((await t.call('DELETE', `/api/v1/members/${editorId}`, {}, as('user_owner'))).status).toBe(204);
    expect((await t.call('GET', '/api/v1/books', undefined, as('user_editor'))).status).toBe(403);
  });

  it("does not let the owner change or remove an owner's account, or a member of another workspace", async () => {
    expect((await t.call('PATCH', `/api/v1/members/${t.owner.userId}`, { role: 'viewer' }, as('user_owner'))).status).toBe(409);
    expect((await t.call('DELETE', `/api/v1/members/${t.owner.userId}`, {}, as('user_owner'))).status).toBe(409);
    expect((await t.call('DELETE', `/api/v1/members/${await userIdOf('user_pub')}`, {}, as('user_owner'))).status).toBe(404);
    expect((await t.call('PATCH', `/api/v1/members/${await userIdOf('user_viewer')}`, { role: 'owner' }, as('user_owner'))).status).toBe(400);
  });

  it('withdraws a pending invitation so it cannot be used', async () => {
    const list = await t.call<{ invitations: { id: string; email: string }[] }>('GET', '/api/v1/members', undefined, as('user_owner'));
    const late = list.body.invitations.find((i) => i.email === 'late@example.test');
    expect((await t.call('DELETE', `/api/v1/invitations/${str(late?.id)}`, {}, as('user_owner'))).status).toBe(204);
    expect((await t.call('GET', '/api/v1/books', undefined, as('user_late'))).status).toBe(403);
    expect((await t.call('POST', '/api/v1/invitations', { email: 'not-an-email', role: 'viewer' }, as('user_owner'))).status).toBe(400);
  });
});
