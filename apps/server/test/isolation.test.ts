import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { ensureOwner, type RequestCtx } from '../src/auth/context.js';
import { readZip } from '../src/lib/zip.js';
import { registerRoutes } from '../src/routes/index.js';
import { buildCovers, HOST, ORIGIN, str, testApp, type TestApp } from './helpers.js';

/**
 * Workspace isolation, route by route (P8-3, D-047). Workspace A (the owner's) holds a full book; workspace B (a
 * separate self-publisher) calls every registered route with A's ids. The route list comes from Fastify's onRoute
 * hook over the same registerRoutes the server uses, so a new route cannot skip this test.
 */

type Obj = Record<string, unknown>;

let t: TestApp;
let other: FastifyInstance | undefined;
let a: RequestCtx;
let b: RequestCtx;
/** Every id stored in A's workspace, by table. */
const ids = new Map<string, string[]>();
const PEN = 'Isolation Pen Name A';
const TITLE = 'Private Title Of Workspace A';

async function tenantTables(): Promise<string[]> {
  const tables = await t.handle.db.introspection.getTables();
  return tables.filter((x) => x.columns.some((c) => c.name === 'workspace_id')).map((x) => x.name);
}

async function rowsOf(table: string, workspaceId: string): Promise<Obj[]> {
  const res = await sql<Obj>`select * from ${sql.table(table)} where workspace_id = ${workspaceId} order by 1, 2`.execute(t.handle.db.withoutPlugins());
  return res.rows;
}

/** A's rows, with blobs reduced to their length, so the snapshot shows any change made by B. */
async function snapshot(): Promise<string> {
  const out: Obj = {};
  for (const table of await tenantTables()) {
    out[table] = (await rowsOf(table, a.workspaceId)).map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Uint8Array ? `bytes:${v.length}` : v])),
    );
  }
  return JSON.stringify(out);
}

function first(table: string): string {
  return ids.get(table)?.[0] ?? '01ARZ3NDEKTSV4RRFFQ69G5FAV';
}

/** Fills a route's params with one of A's ids, chosen by the path segment before the param. */
function fill(url: string): string {
  const parts = url.split('/');
  return parts
    .map((seg, i) => {
      if (!seg.startsWith(':')) return seg;
      const prev = parts[i - 1] ?? '';
      const name = seg.slice(1);
      if (name === 'index') return '0';
      if (name === 'version') return '1';
      if (name === 'userId') return a.userId;
      if (name === 'versionId') return first('section_versions');
      if (name === 'itemId') return first('batch_items');
      if (name === 'subId') return parts.includes('samples') ? first('profile_samples') : first('profile_memory');
      const table: Record<string, string> = {
        books: 'projects',
        profiles: 'author_profiles',
        assets: 'assets',
        exports: 'exports',
        marketing: 'marketing_items',
        jobs: 'jobs',
        'research-runs': 'research_runs',
        'research-sources': 'research_sources',
        'title-sets': 'title_sets',
        sections: 'sections',
        // Picture-book spreads are sections (migration 0006).
        spreads: 'sections',
        notes: 'author_notes',
        suggestions: 'suggestions',
        claims: 'claims',
        invitations: 'invitations',
        batches: 'batches',
        slots: 'title_slots',
      };
      const tbl = table[prev];
      if (!tbl) throw new Error(`No id rule for ${url} (${seg}). Add one so the route is covered.`);
      return first(tbl);
    })
    .join('/');
}

async function asB(method: string, url: string, body?: unknown): Promise<{ status: number; raw: string }> {
  const headers: Record<string, string> = { host: HOST };
  if (!other) throw new Error('Workspace B app not built.');
  const res = await other.inject({
    method: method as 'GET',
    url,
    headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json', origin: ORIGIN },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
  return { status: res.statusCode, raw: res.body };
}

function leaks(raw: string): string[] {
  const secrets = [a.workspaceId, PEN, TITLE, ...[...ids.values()].flat()];
  return secrets.filter((s) => raw.includes(s));
}

async function routeTable(): Promise<{ method: string; url: string }[]> {
  const probe = Fastify({ logger: false });
  const out: { method: string; url: string }[] = [];
  probe.addHook('onRoute', (r) => {
    for (const m of [r.method].flat()) if (m !== 'HEAD') out.push({ method: m, url: r.url });
  });
  await probe.register((api) => Promise.resolve(registerRoutes(api, t.services)), { prefix: '/api/v1' });
  await probe.ready();
  await probe.close();
  return out;
}

beforeAll(async () => {
  t = await testApp();
  a = t.owner;
  // A: a pen name, a written book with research, titles, covers, exports, marketing, notes and jobs.
  const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: PEN, bioThirdPerson: `${PEN} writes plain books.` });
  const pid = str(p.body['id']);
  await t.call('POST', `/api/v1/profiles/${pid}/samples`, { kind: 'writing_sample', title: 'Sample', text: 'A short sample of the writing voice.' });
  await t.call('POST', `/api/v1/profiles/${pid}/memory`, { kind: 'preference', content: 'Short sentences.' });
  const book = await t.call<Obj>('POST', '/api/v1/books', { profileId: pid, idea: 'Calm mornings', title: TITLE, settings: { acknowledgements: 'Sam' } });
  const bookId = str(book.body['id']);
  await t.call('POST', `/api/v1/books/${bookId}/research`, {});
  await t.services.runner.runUntilIdle();
  await t.call('POST', `/api/v1/books/${bookId}/title-sets`, {});
  await t.services.runner.runUntilIdle();
  await t.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  await t.services.runner.runUntilIdle();
  await t.call('POST', `/api/v1/books/${bookId}/blueprint/approve`, {});
  await t.call('POST', `/api/v1/books/${bookId}/write`, {});
  await t.services.runner.runUntilIdle();
  const secs = await t.call<{ body: { id: string }[] }>('GET', `/api/v1/books/${bookId}/sections`);
  const sectionId = str(secs.body.body[0]?.id);
  await t.call('POST', `/api/v1/sections/${sectionId}/notes`, { note: 'Mention the canal walk.' });
  await buildCovers(t, bookId);
  await t.call('POST', `/api/v1/books/${bookId}/exports`, {});
  await t.call('POST', `/api/v1/books/${bookId}/marketing`, {});
  await t.services.runner.runUntilIdle();
  await t.services.repos.members.invite(a, { email: 'editor@example.test', role: 'editor' });
  // Volume mode (P8-2): a batch with the book, and a planned paperback slot.
  const batch = await t.call<Obj>('POST', '/api/v1/batches', { name: 'Batch of workspace A', bookIds: [bookId] });
  await t.call('POST', '/api/v1/schedule/slots', { bookId, format: 'paperback', plannedAt: Date.UTC(2027, 0, 4), batchId: str(batch.body['id']) });

  for (const table of await tenantTables()) {
    const rows = await rowsOf(table, a.workspaceId);
    ids.set(
      table,
      rows.map((r) => r['id']).filter((v): v is string => typeof v === 'string'),
    );
  }

  // B: a separate workspace (another self-publisher), served by a second app on the same database.
  b = await ensureOwner(t.handle.db, 'publisher-b', 'Publisher B');
  const built = await buildApp({
    config: t.services.config,
    handle: t.handle,
    startJobs: false,
    logger: false,
    auth: () => ({ resolve: () => Promise.resolve(b) }),
  });
  other = built.app;
  await other.ready();
  // B has a book of its own, so list routes have something to return.
  const bp = await asB('POST', '/api/v1/profiles', { penName: 'Publisher B' });
  await asB('POST', '/api/v1/books', { profileId: str((JSON.parse(bp.raw) as Obj)['id']), idea: 'B idea', title: 'B book' });
}, 60_000);

afterAll(async () => {
  await other?.close();
  await t.close();
});

describe('workspace isolation', () => {
  it('has the data the matrix needs in workspace A', () => {
    for (const table of [
      'projects',
      'author_profiles',
      'jobs',
      'assets',
      'exports',
      'sections',
      'section_versions',
      'marketing_items',
      'invitations',
      'batches',
      'batch_items',
      'title_slots',
    ]) {
      expect(ids.get(table)?.length ?? 0, table).toBeGreaterThan(0);
    }
  });

  it("never returns or changes workspace A's data on any route called as workspace B", async () => {
    const routes = await routeTable();
    expect(routes.length).toBeGreaterThan(90);
    expect(routes).toEqual(expect.arrayContaining([{ method: 'GET', url: '/api/v1/members' }]));
    const before = await snapshot();
    const problems: string[] = [];
    for (const r of routes) {
      let url = fill(r.url);
      // The workspace stream never ends; scoped to A's book it must refuse before streaming.
      if (r.url === '/api/v1/events') url += `?projectId=${first('projects')}`;
      const body = r.method === 'GET' ? undefined : {};
      const res = await asB(r.method, url, body);
      const leaked = leaks(res.raw);
      if (res.status >= 500) problems.push(`${r.method} ${r.url}: ${res.status}`);
      if (leaked.length > 0) problems.push(`${r.method} ${r.url}: leaked ${leaked.join(', ')}`);
      if (r.url.includes(':') && res.status < 300) problems.push(`${r.method} ${r.url}: ${res.status} on A's id`);
    }
    expect(problems).toEqual([]);
    expect(await snapshot()).toBe(before);
  });

  it('refuses valid writes and downloads against A by id, including ids in a body', async () => {
    const book = first('projects');
    const profile = first('author_profiles');
    const before = await snapshot();
    const tries: [string, string, unknown][] = [
      ['PATCH', `/api/v1/books/${book}`, { title: 'Taken' }],
      ['POST', `/api/v1/books/${book}/archive`, {}],
      ['DELETE', `/api/v1/books/${book}`, { confirm: TITLE }],
      ['PATCH', `/api/v1/profiles/${profile}`, { penName: 'Taken' }],
      ['POST', `/api/v1/jobs/${first('jobs')}/cancel`, {}],
      ['PATCH', `/api/v1/sections/${first('sections')}`, { title: 'Taken' }],
      ['GET', `/api/v1/assets/${first('assets')}/download`, undefined],
      ['GET', `/api/v1/exports/${first('exports')}/download`, undefined],
      ['POST', '/api/v1/books', { profileId: profile, idea: 'Borrowed pen name' }],
      ['PATCH', '/api/v1/settings', { default_profile_id: profile }],
      ['DELETE', `/api/v1/invitations/${first('invitations')}`, {}],
      ['DELETE', `/api/v1/members/${a.userId}`, { confirm: 'REMOVE' }],
    ];
    for (const [method, url, body] of tries) {
      const res = await asB(method, url, body);
      expect(res.status, `${method} ${url}`).toBe(404);
      expect(leaks(res.raw), `${method} ${url}`).toEqual([]);
    }
    expect(await snapshot()).toBe(before);
  });

  it("keeps B out of the owner's backups and OpenRouter key", async () => {
    expect((await asB('GET', '/api/v1/backups')).status).toBe(403);
    expect((await asB('POST', '/api/v1/backups', {})).status).toBe(403);
    expect((await asB('POST', '/api/v1/settings/openrouter/test', {})).status).toBe(403);
    expect((await asB('POST', '/api/v1/invitations', { email: 'new@example.test', role: 'owner' })).status).toBe(409);
    const s = JSON.parse((await asB('GET', '/api/v1/settings')).raw) as Obj;
    expect(s['openRouterCredit']).toBeNull();
  });
});

describe('data rights across workspaces (D-050)', () => {
  it("exports only B's own workspace, never a row or file of A", async () => {
    if (!other) throw new Error('Workspace B app not built.');
    const res = await other.inject({ method: 'GET', url: '/api/v1/workspace/export', headers: { host: HOST } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    const entries = readZip(res.rawPayload);
    const names = entries.map((e) => e.name);
    expect(names).toContain('workspace.json');
    expect(names).toContain('tables/projects.json');
    const text = entries.map((e) => `${e.name}\n${Buffer.from(e.data).toString('latin1')}`).join('\n');
    expect(leaks(text)).toEqual([]);
    expect(text).toContain('B book');
    expect(text).toContain(b.workspaceId);
  });

  it("deletes B's guest workspace with all its rows and leaves A untouched", async () => {
    const before = await snapshot();
    expect((await asB('DELETE', '/api/v1/workspace', { confirm: 'delete' })).status).toBe(409);
    expect((await asB('DELETE', '/api/v1/workspace', { confirm: 'DELETE' })).status).toBe(204);
    for (const table of await tenantTables()) expect(await rowsOf(table, b.workspaceId), table).toEqual([]);
    expect(await t.handle.db.selectFrom('workspaces').select('id').where('id', '=', b.workspaceId).execute()).toEqual([]);
    expect(await t.handle.db.selectFrom('users').select('id').where('id', '=', b.userId).execute()).toEqual([]);
    expect(await snapshot()).toBe(before);
  });

  it("refuses to delete the owner's own workspace", async () => {
    const before = await snapshot();
    const res = await t.call<{ error: { code: string } }>('DELETE', '/api/v1/workspace', { confirm: 'DELETE' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
    expect(await snapshot()).toBe(before);
  });
});
