import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ClerkAuthProvider, type ClerkUserLookup, type ClerkVerifier } from '../src/auth/clerk.js';
import { ensureOwner } from '../src/auth/context.js';
import { qualityGate } from '../src/jobs/quality-gate.js';
import { newId, now } from '../src/lib/util.js';
import { acceptInvitation } from '../src/repos/members.js';
import { createRepos } from '../src/repos/index.js';
import { EventBus } from '../src/sse/bus.js';
import { openSseStream, type SseSink } from '../src/sse/stream.js';
import { HOST, memoryDb, ORIGIN, str, testApp, testConfig, type TestApp } from './helpers.js';

/**
 * Reviewer findings on phases 6 to 8: guest workspace AI cap, bios set by editors, the batch quality gate, invitations,
 * the title limit lock, Settings visibility and the SSE membership re-check. A fake Clerk ("Bearer ok:<userId>") and
 * the mock AI; no call leaves the process.
 */

type Obj = Record<string, unknown>;
const PK = `pk_test_${Buffer.from('clerk.example.com$').toString('base64')}`;
const CLERK = { AUTH_MODE: 'clerk', CLERK_PUBLISHABLE_KEY: PK, CLERK_SECRET_KEY: 'fake-secret', CLERK_ALLOWED_USER_IDS: 'user_owner', ACCOUNTS_MODE: 'invite' };
const CAP = 'budget.guest_workspaces_monthly_cap_usd';

const verifier: ClerkVerifier = {
  verify: (req) => {
    const m = /^Bearer ok:(\S+)$/.exec(req.headers.authorization ?? '');
    return Promise.resolve(m ? { userId: m[1] as string } : null);
  },
};
const lookup: ClerkUserLookup = { verifiedEmails: (userId) => Promise.resolve([`${userId.replace(/^user_/, '')}@example.test`]) };

async function invited(): Promise<TestApp> {
  const config = testConfig(CLERK);
  return testApp({ config, auth: (owner, db) => new ClerkAuthProvider(db, owner, config.clerk, verifier, lookup, config.accountsMode) });
}
const as = (userId: string): Record<string, string> => ({ authorization: `Bearer ok:${userId}` });

async function jobOf(t: TestApp, user: string, jobId: string): Promise<Obj> {
  return (await t.call<Obj>('GET', `/api/v1/jobs/${jobId}`, undefined, as(user))).body;
}

async function research(t: TestApp, user: string, bookId: string): Promise<Obj> {
  const r = await t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/research`, {}, as(user));
  expect(r.status).toBe(202);
  await t.services.runner.runUntilIdle();
  return jobOf(t, user, r.body.jobId);
}

describe('instance-owner cap for other workspaces (finding 1) and Settings visibility (finding 12)', () => {
  let t: TestApp;
  let ownerBook: string;
  let pubBook: string;
  beforeAll(async () => {
    t = await invited();
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Owner Pen', bioThirdPerson: 'Owner Pen writes.' }, as('user_owner'));
    ownerBook = str((await t.call<Obj>('POST', '/api/v1/books', { profileId: str(p.body['id']), idea: 'Owner idea' }, as('user_owner'))).body['id']);
    await t.call('POST', '/api/v1/invitations', { email: 'pub@example.test', role: 'owner' }, as('user_owner'));
    const pp = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Pub Pen', bioThirdPerson: 'Pub Pen writes.' }, as('user_pub'));
    pubBook = str((await t.call<Obj>('POST', '/api/v1/books', { profileId: str(pp.body['id']), idea: 'Pub idea' }, as('user_pub'))).body['id']);
  });
  afterAll(async () => t.close());

  it('refuses AI runs in another workspace until the instance owner sets a cap; the owner runs regardless', async () => {
    expect(await research(t, 'user_pub', pubBook)).toMatchObject({ status: 'failed', errorCode: 'guest_ai_disabled' });
    expect(await research(t, 'user_owner', ownerBook)).toMatchObject({ status: 'succeeded' });
  });

  it('lets only the instance owner see and set the cap; a self-publisher cannot lift it with their own settings', async () => {
    const pubPatch = await t.call<Obj>('PATCH', '/api/v1/settings', { [CAP]: 100 }, as('user_pub'));
    expect(pubPatch.status).toBe(403);
    // Their own monthly cap does not lift the instance owner's.
    expect((await t.call('PATCH', '/api/v1/settings', { 'budget.monthly_cap_usd': 1000 }, as('user_pub'))).status).toBe(200);
    const pubGet = await t.call<{ budgets: Obj; values: Obj; backups: unknown }>('GET', '/api/v1/settings', undefined, as('user_pub'));
    expect(pubGet.body.budgets).not.toHaveProperty('guestWorkspacesMonthlyCapUsd');
    expect(pubGet.body.values).not.toHaveProperty(CAP);
    expect(pubGet.body.backups).toBeNull();

    const ownerGet = await t.call<{ budgets: Obj; backups: unknown }>('GET', '/api/v1/settings', undefined, as('user_owner'));
    expect(ownerGet.body.budgets['guestWorkspacesMonthlyCapUsd']).toBe(0);
    expect(ownerGet.body.backups).not.toBeNull();
    const set = await t.call<{ budgets: Obj; values: Obj }>('PATCH', '/api/v1/settings', { [CAP]: 5 }, as('user_owner'));
    expect(set.status).toBe(200);
    expect(set.body.budgets['guestWorkspacesMonthlyCapUsd']).toBe(5);
    expect(set.body.values[CAP]).toBe(5);
    expect((await t.call('PATCH', '/api/v1/settings', { [CAP]: -1 }, as('user_owner'))).status).toBe(400);
  });

  it('runs guest AI within the cap and pauses it when the cap would be passed', async () => {
    expect(await research(t, 'user_pub', pubBook)).toMatchObject({ status: 'succeeded' });
    await t.call('PATCH', '/api/v1/settings', { [CAP]: 0.000001 }, as('user_owner'));
    expect(await research(t, 'user_pub', pubBook)).toMatchObject({ status: 'paused_budget', errorCode: 'budget_exceeded' });
  });
});

describe('pen name bios from editors (findings 3 and 15)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await invited();
    await t.call('POST', '/api/v1/invitations', { email: 'ed@example.test', role: 'editor' }, as('user_owner'));
  });
  afterAll(async () => t.close());

  it('creates an editor pen name without a bio as to_confirm, and an owner one as confirmed', async () => {
    const ed = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Editor Pen' }, as('user_ed'));
    expect(ed.status).toBe(201);
    expect(ed.body['bioStatus']).toBe('to_confirm');
    const own = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Owner Pen 2' }, as('user_owner'));
    expect(own.body['bioStatus']).toBe('confirmed');
  });

  it('imports a project for an editor with a new pen name whose bio waits for the owner', async () => {
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Exported Pen', bioThirdPerson: 'Exported Pen writes.' }, as('user_owner'));
    const profileId = str(p.body['id']);
    const bookId = str((await t.call<Obj>('POST', '/api/v1/books', { profileId, idea: 'Exported idea' }, as('user_owner'))).body['id']);
    const zip = await t.app.inject({
      method: 'POST',
      url: `/api/v1/books/${bookId}/export-project`,
      headers: { host: HOST, origin: ORIGIN, ...as('user_owner') },
    });
    expect(zip.statusCode).toBe(200);
    // Archive the source pen name so the import makes a copy instead of matching it.
    await t.call('POST', `/api/v1/profiles/${profileId}/archive`, {}, as('user_owner'));
    const imported = await t.app.inject({
      method: 'POST',
      url: '/api/v1/projects/import',
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/zip', ...as('user_ed') },
      payload: zip.rawPayload,
    });
    expect(imported.statusCode).toBe(201);
    const body = imported.json<{ profileId: string; profileCreated: boolean }>();
    expect(body.profileCreated).toBe(true);
    const copy = await t.call<Obj>('GET', `/api/v1/profiles/${body.profileId}`, undefined, as('user_owner'));
    expect(copy.body).toMatchObject({ bioStatus: 'to_confirm', bioThirdPerson: 'Exported Pen writes.' });
  });
});

describe('quality gate for books ever batched (finding 4)', () => {
  let t: TestApp;
  let profileId: string;
  beforeAll(async () => {
    t = await testApp();
    profileId = str((await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Gate Pen', bioThirdPerson: 'Gate Pen writes.' })).body['id']);
  });
  afterAll(async () => t.close());

  const newBook = async (): Promise<string> => str((await t.call<Obj>('POST', '/api/v1/books', { profileId, idea: 'Gate idea', title: 'Gate' })).body['id']);

  it('still gates publish and pack after the book is taken out of its batch', async () => {
    const bookId = await newBook();
    // A new book with no text fails preflight, so it fails the gate.
    expect((await qualityGate(t.services, t.owner, bookId)).ok).toBe(false);
    const batch = await t.call<Obj>('POST', '/api/v1/batches', { name: 'B', bookIds: [bookId] });
    expect(batch.status).toBe(201);
    const batchId = str(batch.body['id']);
    expect((await t.call('PATCH', `/api/v1/batches/${batchId}`, { removeBookIds: [bookId] })).status).toBe(200);
    expect(await t.services.repos.batches.itemOfBook(t.owner, bookId)).toBeNull();

    const publish = await t.call<{ error: { code: string } }>('POST', `/api/v1/books/${bookId}/publish`, {});
    expect(publish.status).toBe(409);
    expect(publish.body.error.code).toBe('quality_gate');
    expect((await t.call('POST', `/api/v1/books/${bookId}/exports`, { pack: true })).status).toBe(409);
  });

  it('re-checks a stale ready mark on publish and puts it back to planned', async () => {
    const bookId = await newBook();
    const batch = await t.call<Obj>('POST', '/api/v1/batches', { name: 'C', bookIds: [bookId] });
    expect(batch.status).toBe(201);
    const item = await t.services.repos.batches.itemOfBook(t.owner, bookId);
    if (!item) throw new Error('no batch item');
    await t.services.repos.batches.setItemStatus(t.owner, item.id, 'ready');
    // The ready mark is stale: the book does not pass the gate now.
    expect((await qualityGate(t.services, t.owner, bookId)).ok).toBe(false);
    expect((await t.call('POST', `/api/v1/books/${bookId}/publish`, {})).status).toBe(409);
    const after = await t.handle.db.selectFrom('batchItems').select('status').where('id', '=', item.id).executeTakeFirstOrThrow();
    expect(after.status).toBe('planned');
  });

  it('leaves a book that was never batched alone', async () => {
    const bookId = await newBook();
    expect((await t.call('POST', `/api/v1/books/${bookId}/publish`, {})).status).toBe(200);
  });
});

describe('invitations (findings 9 and 10)', () => {
  it('keeps one pending invitation per address per workspace, even for parallel invites', async () => {
    const handle = await memoryDb();
    const ctx = await ensureOwner(handle.db);
    const repos = createRepos(handle.db);
    const results = await Promise.all([
      repos.members.invite(ctx, { email: 'twin@example.test', role: 'viewer' }),
      repos.members.invite(ctx, { email: 'twin@example.test', role: 'editor' }),
      repos.members.invite(ctx, { email: 'twin@example.test', role: 'viewer' }),
    ]);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(await repos.members.listInvitations(ctx, 'pending')).toHaveLength(1);
    // The index refuses a second pending row written past the repository.
    const t = now();
    const row = {
      workspaceId: ctx.workspaceId,
      email: 'twin@example.test',
      pendingEmail: 'twin@example.test',
      role: 'viewer',
      status: 'pending',
      invitedBy: null,
      acceptedUserId: null,
      acceptedAt: null,
      createdAt: t,
      updatedAt: t,
    };
    await expect(
      handle.db
        .insertInto('invitations')
        .values({ id: newId(), ...row })
        .execute(),
    ).rejects.toThrow();
    // Withdrawn, the address can be invited again.
    await repos.members.revokeInvitation(ctx, str(results[0]?.id));
    const again = await repos.members.invite(ctx, { email: 'twin@example.test', role: 'viewer' });
    expect(again.id).not.toBe(results[0]?.id);
    await handle.close();
  });

  it("prefers the instance owner's pending invitation over an older one from another workspace", async () => {
    const handle = await memoryDb();
    const owner = await ensureOwner(handle.db);
    const other = await ensureOwner(handle.db, 'other', 'Other');
    const repos = createRepos(handle.db);
    await repos.members.invite(other, { email: 'both@example.test', role: 'editor' });
    await new Promise((r) => setTimeout(r, 5));
    await repos.members.invite(owner, { email: 'both@example.test', role: 'viewer' });
    const joined = await acceptInvitation(handle.db, 'user_both', ['both@example.test'], owner.workspaceId);
    expect(joined).toMatchObject({ workspaceId: owner.workspaceId, role: 'viewer' });
    // The other workspace's invitation stays pending; it does not add a second membership.
    expect(await repos.members.listInvitations(other, 'pending')).toHaveLength(1);
    await handle.close();
  });
});

describe('title limit under parallel adds (finding 11)', () => {
  it('lets only as many slots through as the limit allows', async () => {
    const handle = await memoryDb();
    const ctx = await ensureOwner(handle.db);
    const repos = createRepos(handle.db);
    const p = await repos.profiles.create(ctx, { penName: 'Slot Pen', bioThirdPerson: 'Slot Pen writes.' });
    const books = await Promise.all(
      [1, 2, 3].map((n) => repos.books.create(ctx, { profileId: p.id, idea: `Slot ${n}` }, { budgetUsd: 10, illustrativeLine: false })),
    );
    const limit = { maxNewTitlesPerFormat: 1, periodDays: 7, ruleId: 'titles.creationLimit', rulesVersion: 'test' };
    const at = Date.UTC(2027, 0, 10);
    const results = await Promise.allSettled(books.map((b) => repos.schedule.add(ctx, { bookId: b.id, format: 'ebook', plannedAt: at }, limit)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await repos.schedule.list(ctx)).toHaveLength(1);
    await handle.close();
  });
});

class FakeSink extends EventEmitter implements SseSink {
  ended = false;
  writeHead() {
    return this;
  }
  write() {
    return true;
  }
  end() {
    this.ended = true;
  }
}

describe('SSE membership re-check (finding 17)', () => {
  it('closes the stream once the caller is no longer a member', async () => {
    const handle = await memoryDb();
    const ctx = await ensureOwner(handle.db);
    const bus = new EventBus(handle.db);
    let allowed = true;
    const sink = new FakeSink();
    await openSseStream(sink, {
      bus,
      workspaceId: ctx.workspaceId,
      projectId: null,
      lastEventId: null,
      pingMs: 60_000,
      recheckMs: 10,
      stillAllowed: () => Promise.resolve(allowed),
    });
    await new Promise((r) => setTimeout(r, 40));
    expect(sink.ended).toBe(false);
    allowed = false;
    await new Promise((r) => setTimeout(r, 40));
    expect(sink.ended).toBe(true);
    expect(bus.listenerCount()).toBe(0);
    await handle.close();
  });

  it('checks the membership row the route uses, which removal deletes', async () => {
    const t = await invited();
    try {
      await t.call('POST', '/api/v1/invitations', { email: 'gone@example.test', role: 'viewer' }, as('user_owner'));
      expect((await t.call('GET', '/api/v1/me', undefined, as('user_gone'))).status).toBe(200);
      const user = await t.handle.db.selectFrom('users').select('id').where('clerkUserId', '=', 'user_gone').executeTakeFirstOrThrow();
      const memberCtx = { workspaceId: t.owner.workspaceId, userId: user.id, role: 'viewer' as const };
      expect(await t.services.repos.members.isMember(memberCtx)).toBe(true);
      expect((await t.call('DELETE', `/api/v1/members/${user.id}`, {}, as('user_owner'))).status).toBe(204);
      expect(await t.services.repos.members.isMember(memberCtx)).toBe(false);
    } finally {
      await t.close();
    }
  });
});
