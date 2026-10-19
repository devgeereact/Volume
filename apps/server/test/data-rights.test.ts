import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClerkAuthProvider, type ClerkUserLookup, type ClerkVerifier } from '../src/auth/clerk.js';
import { readZip, writeZip, zipStream } from '../src/lib/zip.js';
import { newId } from '../src/lib/util.js';
import { WORKSPACE_TABLES } from '../src/repos/workspace-data.js';
import { HOST, ORIGIN, str, testApp, testConfig, type TestApp } from './helpers.js';

/**
 * Data rights (D-050) with a fake Clerk: "Bearer ok:<userId>" is a valid session and each account has one verified
 * address. Whole-workspace export, leaving, removal with account deletion, and deleting a guest workspace.
 */

type Obj = Record<string, unknown>;
const PK = `pk_test_${Buffer.from('clerk.example.com$').toString('base64')}`;
const verifier: ClerkVerifier = {
  verify: (req) => {
    const m = /^Bearer ok:(\S+)$/.exec(req.headers.authorization ?? '');
    return Promise.resolve(m ? { userId: m[1] as string } : null);
  },
};
const lookup: ClerkUserLookup = { verifiedEmails: (userId) => Promise.resolve([`${userId.replace(/^user_/, '')}@example.test`]) };
const as = (userId: string): Record<string, string> => ({ authorization: `Bearer ok:${userId}` });
// A 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let t: TestApp;
let bookId: string;
const userIdOf = async (clerkUserId: string): Promise<string | null> =>
  (await t.handle.db.selectFrom('users').select('id').where('clerkUserId', '=', clerkUserId).executeTakeFirst())?.id ?? null;

/** The export limit is per client IP, so each test uses its own address. */
async function download(userId: string, ip: string): Promise<{ status: number; body: Buffer; headers: Record<string, unknown> }> {
  const res = await t.app.inject({ method: 'GET', url: '/api/v1/workspace/export', headers: { host: HOST, ...as(userId) }, remoteAddress: ip });
  return { status: res.statusCode, body: res.rawPayload, headers: res.headers };
}

beforeAll(async () => {
  const config = testConfig({
    AUTH_MODE: 'clerk',
    CLERK_PUBLISHABLE_KEY: PK,
    CLERK_SECRET_KEY: 'fake-secret',
    CLERK_ALLOWED_USER_IDS: 'user_owner',
    ACCOUNTS_MODE: 'invite',
  });
  t = await testApp({ config, auth: (owner, db) => new ClerkAuthProvider(db, owner, config.clerk, verifier, lookup, config.accountsMode) });
  const p = await t.call<Obj>(
    'POST',
    '/api/v1/profiles',
    { penName: 'Owner Pen', bioThirdPerson: 'Owner Pen writes.', legalName: 'Olive Legal' },
    as('user_owner'),
  );
  const profileId = str(p.body['id']);
  const b = await t.call<Obj>('POST', '/api/v1/books', { profileId, idea: 'Owner idea', title: 'Owner Book' }, as('user_owner'));
  bookId = str(b.body['id']);
  const up = await t.app.inject({
    method: 'POST',
    url: `/api/v1/assets?kind=other&filename=${encodeURIComponent('../dot.png')}&projectId=${bookId}`,
    headers: { host: HOST, origin: ORIGIN, 'content-type': 'image/png', ...as('user_owner') },
    payload: PNG,
  });
  expect(up.statusCode).toBe(201);
  for (const [email, role] of [
    ['editor@example.test', 'editor'],
    ['viewer@example.test', 'viewer'],
    ['leaver@example.test', 'viewer'],
    ['pub@example.test', 'owner'],
  ] as const) {
    expect((await t.call('POST', '/api/v1/invitations', { email, role }, as('user_owner'))).status).toBe(201);
  }
  for (const u of ['user_editor', 'user_viewer', 'user_leaver', 'user_pub']) {
    expect((await t.call('GET', '/api/v1/me', undefined, as(u))).status).toBe(200);
  }
});
afterAll(async () => t.close());

describe('streamed zip writer', () => {
  it('writes entries the reader (and any zip tool) can read, piece by piece', async () => {
    const big = Buffer.alloc(300_000, 7);
    const parts: Buffer[] = [];
    const entries = [
      { name: 'a.json', source: () => ['{"x":', '1}'] },
      { name: 'empty.txt', source: () => [] as Uint8Array[] },
      { name: 'files/big.bin', source: () => [big.subarray(0, 100_000), big.subarray(100_000)] },
    ];
    for await (const b of zipStream(entries)) parts.push(b);
    const read = readZip(Buffer.concat(parts));
    expect(read.map((e) => e.name)).toEqual(['a.json', 'empty.txt', 'files/big.bin']);
    expect(Buffer.from(read[0]!.data).toString()).toBe('{"x":1}');
    expect(read[1]!.data.byteLength).toBe(0);
    expect(Buffer.from(read[2]!.data).equals(big)).toBe(true);
    // Same content as the in-memory writer.
    expect(readZip(writeZip([{ name: 'a.json', data: Buffer.from('{"x":1}') }]))[0]!.data).toEqual(read[0]!.data);
  });
});

describe('GET /workspace/export', () => {
  it('covers every migrated table that has a workspace_id', async () => {
    const tables = await t.handle.db.introspection.getTables();
    const tenant = tables
      .filter((x) => x.columns.some((c) => c.name === 'workspace_id'))
      .map((x) => x.name.replace(/_([a-z])/g, (_, l: string) => l.toUpperCase()))
      .filter((n) => n !== 'assetChunks')
      .sort();
    expect([...WORKSPACE_TABLES].sort()).toEqual(tenant);
  });

  it("gives the owner a zip of every row and file in the owner's workspace", async () => {
    const res = await download('user_owner', '10.0.0.1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(String(res.headers['content-disposition'])).toMatch(/^attachment; filename="volume-workspace-\d{4}-\d{2}-\d{2}\.zip"$/);
    expect(res.headers['cache-control']).toBe('no-store');
    const entries = readZip(res.body);
    const byName = new Map(entries.map((e) => [e.name, Buffer.from(e.data)]));
    const manifest = JSON.parse(byName.get('workspace.json')!.toString()) as Obj;
    expect(manifest).toMatchObject({ format: 'volume-workspace', version: 1, workspace: { id: t.owner.workspaceId } });
    for (const table of WORKSPACE_TABLES) expect(byName.has(`tables/${table}.json`), table).toBe(true);
    const projects = JSON.parse(byName.get('tables/projects.json')!.toString()) as Obj[];
    expect(projects.map((p) => p['id'])).toEqual([bookId]);
    // The owner's own copy carries the private profile fields.
    expect(byName.get('tables/authorProfiles.json')!.toString()).toContain('Olive Legal');
    const file = entries.find((e) => e.name.startsWith('files/'));
    expect(file?.name).toMatch(/^files\/[0-9A-Z]{26}\/\.\._dot\.png$|^files\/[0-9A-Z]{26}\/_+dot\.png$/);
    expect(Buffer.from(file!.data).equals(PNG)).toBe(true);
    // The invited self-publisher's workspace is not in it.
    const pubWorkspace = (await t.call<Obj>('GET', '/api/v1/me', undefined, as('user_pub'))).body['workspaceId'];
    // Checked on the inflated entries: the raw bytes are deflated and would hide a leak.
    for (const e of entries) {
      expect(e.name).not.toContain(str(pubWorkspace));
      expect(Buffer.from(e.data).toString('latin1'), e.name).not.toContain(str(pubWorkspace));
    }
  });

  it('pages through large tables without losing or repeating rows', async () => {
    const at = Date.now();
    const ids: string[] = [];
    for (let i = 0; i < 60; i += 1) {
      const id = newId();
      ids.push(id);
      await t.handle.db
        .insertInto('promptRuns')
        .values({
          id,
          workspaceId: t.owner.workspaceId,
          projectId: null,
          jobId: null,
          stage: 'writing',
          promptId: null,
          promptVersion: null,
          promptHash: null,
          provider: 'mock',
          modelSlug: 'mock/model',
          generationId: null,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: 0,
          status: 'ok',
          error: null,
          output: `output ${i}`,
          guardrails: null,
          createdAt: at,
          updatedAt: at,
        })
        .execute();
    }
    const res = await download('user_owner', '10.0.0.6');
    expect(res.status).toBe(200);
    const runs = JSON.parse(Buffer.from(readZip(res.body).find((e) => e.name === 'tables/promptRuns.json')!.data).toString()) as Obj[];
    const exported = runs.map((r) => str(r['id']));
    expect(new Set(exported).size).toBe(exported.length);
    for (const id of ids) expect(exported).toContain(id);
  });

  it('refuses editors and viewers', async () => {
    expect((await download('user_editor', '10.0.0.2')).status).toBe(403);
    expect((await download('user_viewer', '10.0.0.3')).status).toBe(403);
  });

  it('is rate limited per client', async () => {
    // Two allowed per minute from one address; the third gets 429 with the usual error shape.
    const statuses: number[] = [];
    for (let i = 0; i < 3; i += 1) statuses.push((await download('user_pub', '10.0.0.4')).status);
    expect(statuses).toEqual([200, 200, 429]);
    expect((await download('user_pub', '10.0.0.5')).status).toBe(200);
  });
});

describe('leaving and removal', () => {
  it('lets an invited member leave with a typed confirmation, deleting the account', async () => {
    const leaver = await userIdOf('user_leaver');
    expect(leaver).not.toBeNull();
    const invId = (await t.handle.db.selectFrom('invitations').select('id').where('email', '=', 'leaver@example.test').executeTakeFirstOrThrow()).id;
    expect((await t.call('POST', '/api/v1/me/leave', {}, as('user_leaver'))).status).toBe(400);
    expect((await t.call('POST', '/api/v1/me/leave', { confirm: 'leave' }, as('user_leaver'))).status).toBe(409);
    expect((await t.call('POST', '/api/v1/me/leave', { confirm: 'LEAVE' }, as('user_leaver'))).status).toBe(204);
    expect(await userIdOf('user_leaver')).toBeNull();
    expect((await t.call('GET', '/api/v1/books', undefined, as('user_leaver'))).status).toBe(403);
    // The invitation is revoked and the deleted person's address is gone.
    const inv = await t.handle.db.selectFrom('invitations').select(['status', 'email', 'acceptedUserId']).where('id', '=', invId).executeTakeFirstOrThrow();
    expect(inv).toEqual({ status: 'revoked', email: '', acceptedUserId: null });
    expect(await t.handle.db.selectFrom('invitations').select('id').where('email', '=', 'leaver@example.test').execute()).toEqual([]);
    // The owner's book is untouched.
    expect((await t.call('GET', `/api/v1/books/${bookId}`, undefined, as('user_owner'))).status).toBe(200);
  });

  it('does not let an owner leave', async () => {
    const res = await t.call<{ error: { code: string } }>('POST', '/api/v1/me/leave', { confirm: 'LEAVE' }, as('user_owner'));
    expect(res.status).toBe(409);
    expect((await t.call('POST', '/api/v1/me/leave', { confirm: 'LEAVE' }, as('user_pub'))).status).toBe(409);
  });

  it('lets the owner remove a member with a typed confirmation, deleting the account', async () => {
    const viewer = str(await userIdOf('user_viewer'));
    expect((await t.call('DELETE', `/api/v1/members/${viewer}`, {}, as('user_owner'))).status).toBe(400);
    expect((await t.call('DELETE', `/api/v1/members/${viewer}`, { confirm: 'REMOVE' }, as('user_editor'))).status).toBe(403);
    expect((await t.call('DELETE', `/api/v1/members/${viewer}`, { confirm: 'REMOVE' }, as('user_owner'))).status).toBe(204);
    expect(await userIdOf('user_viewer')).toBeNull();
    expect((await t.call('GET', '/api/v1/books', undefined, as('user_viewer'))).status).toBe(403);
  });
});

describe('DELETE /workspace', () => {
  it('refuses the instance owner, editors and a wrong confirmation', async () => {
    expect((await t.call('DELETE', '/api/v1/workspace', { confirm: 'DELETE' }, as('user_owner'))).status).toBe(403);
    expect((await t.call('DELETE', '/api/v1/workspace', { confirm: 'DELETE' }, as('user_editor'))).status).toBe(403);
    expect((await t.call('DELETE', '/api/v1/workspace', { confirm: 'yes' }, as('user_pub'))).status).toBe(409);
    expect((await t.call('DELETE', '/api/v1/workspace', {}, as('user_pub'))).status).toBe(400);
  });

  it("deletes a guest workspace with all its data and its owner's account, and nothing of the owner's", async () => {
    const pub = str(await userIdOf('user_pub'));
    const ws = str((await t.call<Obj>('GET', '/api/v1/me', undefined, as('user_pub'))).body['workspaceId']);
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Guest Pen', bioThirdPerson: 'Guest writes.' }, as('user_pub'));
    const gb = await t.call<Obj>('POST', '/api/v1/books', { profileId: str(p.body['id']), idea: 'Guest idea', title: 'Guest Book' }, as('user_pub'));
    await t.call('POST', `/api/v1/books/${str(gb.body['id'])}/blueprints`, { chapterCount: 1 }, as('user_pub'));
    await t.services.runner.runUntilIdle();
    const up = await t.app.inject({
      method: 'POST',
      url: `/api/v1/assets?kind=other&filename=g.png&projectId=${str(gb.body['id'])}`,
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'image/png', ...as('user_pub') },
      payload: PNG,
    });
    expect(up.statusCode).toBe(201);
    const ownerCount = async (): Promise<number> => {
      let n = 0;
      for (const table of WORKSPACE_TABLES)
        n += (await t.handle.db.selectFrom(table).select('id').where('workspaceId', '=', t.owner.workspaceId).execute()).length;
      return n;
    };
    const before = await ownerCount();
    const invId = (await t.handle.db.selectFrom('invitations').select('id').where('email', '=', 'pub@example.test').executeTakeFirstOrThrow()).id;

    // A queued job blocks the delete, and nothing is touched.
    const job = await t.services.queue.enqueue({ workspaceId: ws, userId: pub, role: 'owner' }, { kind: 'noop', projectId: null, payload: {} });
    expect((await t.call('DELETE', '/api/v1/workspace', { confirm: 'DELETE' }, as('user_pub'))).status).toBe(409);
    const asset = await t.handle.db.selectFrom('assets').select(['status', 'chunkCount']).where('workspaceId', '=', ws).executeTakeFirstOrThrow();
    expect(asset.status).toBe('ready');
    expect(asset.chunkCount).toBeGreaterThan(0);
    await t.handle.db.updateTable('jobs').set({ status: 'cancelled' }).where('id', '=', job.id).execute();

    expect((await t.call('DELETE', '/api/v1/workspace', { confirm: 'DELETE' }, as('user_pub'))).status).toBe(204);

    for (const table of WORKSPACE_TABLES) expect(await t.handle.db.selectFrom(table).select('id').where('workspaceId', '=', ws).execute(), table).toEqual([]);
    expect(await t.handle.db.selectFrom('assetChunks').select('assetId').where('workspaceId', '=', ws).execute()).toEqual([]);
    expect(await t.handle.db.selectFrom('workspaces').select('id').where('id', '=', ws).execute()).toEqual([]);
    expect(await userIdOf('user_pub')).toBeNull();
    expect(await t.handle.db.selectFrom('users').select('id').where('id', '=', pub).execute()).toEqual([]);
    const inv = await t.handle.db.selectFrom('invitations').select(['status', 'email']).where('id', '=', invId).executeTakeFirstOrThrow();
    expect(inv).toEqual({ status: 'revoked', email: '' });
    expect(await ownerCount()).toBe(before);
    expect((await t.call('GET', '/api/v1/me', undefined, as('user_pub'))).status).toBe(403);
    expect((await t.call('GET', `/api/v1/books/${bookId}`, undefined, as('user_owner'))).status).toBe(200);
  });
});
