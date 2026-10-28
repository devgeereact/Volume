import { titleCreationLimit } from '@volume/core';
import { loadKdpRules } from '@volume/core/node';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { ensureOwner, type RequestCtx } from '../src/auth/context.js';
import { buildCovers, HOST, ORIGIN, str, testApp, type TestApp } from './helpers.js';

/**
 * Volume mode (P8-2, D-046). Acceptance (ROADMAP phase 8): a batch of 5 books across 3 pen names runs with the mock
 * AI, and the scheduler blocks the third new title per format in a week. The limit is read from config/kdp-rules,
 * here as in the server, so no number is typed in.
 */

type Obj = Record<string, unknown>;
interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}
interface SlotView {
  id: string;
  bookId: string;
  format: string;
  plannedAt: number;
  status: string;
  book: { penName: string };
}
interface ItemView {
  id: string;
  bookId: string;
  status: string;
  run: { status: string } | null;
  slots: SlotView[];
  book: { penName: string };
}
interface BatchDetail {
  id: string;
  status: string;
  itemCount: number;
  penNames: string[];
  items: ItemView[];
}

const DAY = 86_400_000;
const T0 = Date.UTC(2027, 0, 4, 9, 0, 0);
const LIMIT = titleCreationLimit(loadKdpRules());

let t: TestApp;
const books: string[] = [];
let batchId: string;

async function app(ctx: RequestCtx): Promise<FastifyInstance> {
  const built = await buildApp({
    config: t.services.config,
    handle: t.handle,
    startJobs: false,
    logger: false,
    auth: () => ({ resolve: () => Promise.resolve(ctx) }),
  });
  await built.app.ready();
  return built.app;
}

async function callOn<T = unknown>(a: FastifyInstance, method: string, url: string, body?: unknown): Promise<{ status: number; body: T; raw: string }> {
  const res = await a.inject({
    method: method as 'GET',
    url,
    headers: body === undefined ? { host: HOST } : { host: HOST, 'content-type': 'application/json', origin: ORIGIN },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
  return { status: res.statusCode, body: (res.body ? JSON.parse(res.body) : null) as T, raw: res.body };
}

async function resolveClaims(bookId: string): Promise<void> {
  const claims = await t.call<{ items: { id: string }[] }>('GET', `/api/v1/books/${bookId}/claims?status=open`);
  for (const c of claims.body.items) await t.call('POST', `/api/v1/claims/${c.id}/verify`, { sourceUrl: 'https://example.org/source' });
}

beforeAll(async () => {
  t = await testApp();
  const pens = ['Ada North', 'Ben South', 'Cleo West'];
  const profileIds: string[] = [];
  for (const penName of pens) {
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName, bioThirdPerson: `${penName} writes plain books.` });
    profileIds.push(str(p.body['id']));
  }
  // 5 books across 3 pen names: 2, 2 and 1.
  for (const [i, pid] of [profileIds[0], profileIds[0], profileIds[1], profileIds[1], profileIds[2]].entries()) {
    const b = await t.call<Obj>('POST', '/api/v1/books', {
      profileId: pid,
      idea: `Batch idea ${i + 1}`,
      title: `Batch Book ${i + 1}`,
      settings: { acknowledgements: 'Sam' },
    });
    expect(b.status).toBe(201);
    books.push(str(b.body['id']));
  }
}, 60_000);

afterAll(async () => t.close());

describe('Volume mode: batch of 5 books across 3 pen names', () => {
  it('plans the batch and runs every book through the existing pipeline with the mock AI', async () => {
    const created = await t.call<BatchDetail>('POST', '/api/v1/batches', { name: 'January batch', bookIds: books });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'draft', itemCount: 5, penNames: ['Ada North', 'Ben South', 'Cleo West'] });
    batchId = created.body.id;
    // A book can be in one batch at a time.
    expect((await t.call<ErrorBody>('POST', '/api/v1/batches', { name: 'Again', bookIds: [books[0]] })).status).toBe(409);

    const start = await t.call<{ jobId: string; batch: BatchDetail }>('POST', `/api/v1/batches/${batchId}/start`, { chapterCount: 2 });
    expect(start.status).toBe(202);
    expect(start.body.batch.status).toBe('queued');
    expect((await t.call('POST', `/api/v1/batches/${batchId}/start`, {})).status).toBe(409);
    expect((await t.call('PATCH', `/api/v1/batches/${batchId}`, { name: 'Renamed' })).status).toBe(409);

    await t.services.runner.runUntilIdle(2000);
    const done = await t.call<BatchDetail>('GET', `/api/v1/batches/${batchId}`);
    expect(done.body.status).toBe('succeeded');
    expect(done.body.items.map((i) => i.run?.status)).toEqual(Array(5).fill('succeeded'));
    // One book at a time: each batch_book child waits for the one before.
    const children = await t.services.queue.list(t.owner, { parentId: start.body.jobId, limit: 10 });
    expect(children.filter((c) => c.dependsOnJobId !== null)).toHaveLength(4);
    for (const id of books) {
      const tree = await t.call<{ body: { kind: string; status: string }[] }>('GET', `/api/v1/books/${id}/sections`);
      expect(tree.body.body.filter((s) => s.kind === 'chapter')).toHaveLength(2);
      expect(tree.body.body.every((s) => s.status === 'done')).toBe(true);
    }
    const list = await t.call<{ items: { id: string; status: string; itemCount: number }[] }>('GET', '/api/v1/batches');
    expect(list.body.items).toEqual([expect.objectContaining({ id: batchId, status: 'succeeded', itemCount: 5 })]);
  }, 120_000);

  it('blocks the third new title per format in a week, across pen names, and names the next free time', async () => {
    const sched = await t.call<{ limit: { maxNewTitlesPerFormat: number; periodDays: number; ruleId: string } }>('GET', '/api/v1/schedule');
    expect(sched.body.limit).toMatchObject({ ...LIMIT, ruleId: 'titles.creationLimit' });
    const max = LIMIT.maxNewTitlesPerFormat;
    const period = LIMIT.periodDays * DAY;
    expect(books.length).toBeGreaterThan(max);

    // The first `max` paperbacks in one week fit (books 1 and 2 are Ada North's, then Ben South's).
    for (let i = 0; i < max; i += 1) {
      const ok = await t.call<SlotView>('POST', '/api/v1/schedule/slots', { bookId: books[i * 2], format: 'paperback', plannedAt: T0 + i * DAY, batchId });
      expect(ok.status).toBe(201);
      expect(ok.body.status).toBe('planned');
    }
    // The next paperback in the same week is refused, even under a third pen name: one workspace is one KDP account.
    const third = await t.call<ErrorBody>('POST', '/api/v1/schedule/slots', { bookId: books[4], format: 'paperback', plannedAt: T0 + max * DAY });
    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe('title_limit');
    const details = third.body.error.details as { conflicts: SlotView[]; nextFreeAt: number; limit: { maxNewTitlesPerFormat: number } };
    expect(details.conflicts).toHaveLength(max);
    expect(details.conflicts.map((c) => c.book.penName)).not.toContain('Cleo West');
    expect(details.nextFreeAt).toBe(T0 + period);
    expect(details.limit.maxNewTitlesPerFormat).toBe(max);

    // Another format has its own limit; the refused paperback fits at the next free time.
    expect((await t.call('POST', '/api/v1/schedule/slots', { bookId: books[4], format: 'ebook', plannedAt: T0 + max * DAY })).status).toBe(201);
    expect((await t.call('POST', '/api/v1/schedule/slots', { bookId: books[4], format: 'paperback', plannedAt: details.nextFreeAt })).status).toBe(201);
    // One slot per book and format; move it by deleting it first.
    expect(
      (await t.call<ErrorBody>('POST', '/api/v1/schedule/slots', { bookId: books[4], format: 'paperback', plannedAt: T0 + 30 * DAY })).body.error.code,
    ).toBe('conflict');

    const week = await t.call<{ items: SlotView[] }>('GET', `/api/v1/schedule?from=${T0}&to=${T0 + period - 1}`);
    expect(week.body.items.filter((s) => s.format === 'paperback')).toHaveLength(max);
    const batch = await t.call<BatchDetail>('GET', `/api/v1/batches/${batchId}`);
    expect(
      batch.body.items
        .find((i) => i.bookId === books[4])
        ?.slots.map((s) => s.format)
        .sort(),
    ).toEqual(['ebook', 'paperback']);
  });

  it('validates slot input and frees capacity when a slot is deleted', async () => {
    expect((await t.call('POST', '/api/v1/schedule/slots', { bookId: books[1], format: 'audiobook', plannedAt: T0 })).status).toBe(400);
    expect((await t.call('POST', '/api/v1/schedule/slots', { bookId: books[1], format: 'paperback', plannedAt: 'soon' })).status).toBe(400);
    expect((await t.call('GET', '/api/v1/schedule?from=10&to=5')).status).toBe(400);
    expect((await t.call('POST', '/api/v1/schedule/slots', { bookId: '01ARZ3NDEKTSV4RRFFQ69G5FAV', format: 'paperback', plannedAt: T0 })).status).toBe(404);
    // Three days before the full week: its window still holds both paperbacks.
    const early = T0 - 3 * DAY;
    const blocked = await t.call<ErrorBody>('POST', '/api/v1/schedule/slots', { bookId: books[1], format: 'paperback', plannedAt: early });
    expect(blocked.body.error.code).toBe('title_limit');
    const conflicts = (blocked.body.error.details as { conflicts: SlotView[] }).conflicts;
    const gone = str(conflicts.find((c) => c.bookId === books[2])?.id);
    expect((await t.call('DELETE', `/api/v1/schedule/slots/${gone}`, {})).status).toBe(204);
    expect((await t.call('DELETE', `/api/v1/schedule/slots/${gone}`, {})).status).toBe(404);
    const now = await t.call<SlotView>('POST', '/api/v1/schedule/slots', { bookId: books[1], format: 'paperback', plannedAt: early });
    expect(now.status).toBe(201);
  });
});

describe('Volume mode quality gates', () => {
  it('refuses to mark ready, schedule, pack or publish a batch book until preflight passes and every claim is reviewed', async () => {
    const bookId = str(books[0]);
    const open = await t.call<{ items: unknown[] }>('GET', `/api/v1/books/${bookId}/claims?status=open`);
    expect(open.body.items.length).toBeGreaterThan(0);
    const batch = await t.call<BatchDetail>('GET', `/api/v1/batches/${batchId}`);
    const item = batch.body.items.find((i) => i.bookId === bookId);
    const slot = item?.slots.find((s) => s.format === 'paperback');
    expect(slot).toBeDefined();

    const tries: [string, string][] = [
      ['POST', `/api/v1/schedule/slots/${str(slot?.id)}/confirm`],
      ['POST', `/api/v1/batches/${batchId}/items/${str(item?.id)}/ready`],
      ['POST', `/api/v1/books/${bookId}/exports`],
      ['POST', `/api/v1/books/${bookId}/publish`],
    ];
    for (const [method, url] of tries) {
      const res = await t.call<ErrorBody>(method as 'POST', url, {});
      expect(res.status, url).toBe(409);
      expect(res.body.error.code, url).toBe('quality_gate');
      expect((res.body.error.details as { openClaims: number }).openClaims, url).toBeGreaterThan(0);
      expect(res.body.error.message, url).toMatch(/\d+ open claims? needs? your check/);
    }

    // Claims reviewed, but preflight still blocks (no cover files yet).
    await resolveClaims(bookId);
    const blocked = await t.call<ErrorBody>('POST', `/api/v1/schedule/slots/${str(slot?.id)}/confirm`, {});
    expect(blocked.body.error.code).toBe('quality_gate');
    const gate = blocked.body.error.details as { openClaims: number; blocks: { id: string }[] };
    expect(gate.openClaims).toBe(0);
    expect(gate.blocks.map((b) => b.id)).toContain('cover.files');

    // Claim tiers (owner, 21 October 2026): an open claim listed for the record does not hold the book back, and the
    // gate says how many there are. Nothing is resolved for the owner.
    const [firstSection] = await t.services.repos.manuscript.listSections(t.owner, bookId);
    const versionId = firstSection?.currentVersionId ?? '';
    await t.services.repos.manuscript.addClaims(t.owner, bookId, str(firstSection?.id), versionId, [
      {
        sentence: 'The example brand Acme sells mugs.',
        category: 'other',
        checkNeeded: 'Harmless detail.',
        start: null,
        end: null,
        risk: 'low',
        harmIfWrong: false,
      },
    ]);
    const stillOpen = await t.call<{ items: unknown[] }>('GET', `/api/v1/books/${bookId}/claims?status=open`);
    expect(stillOpen.body.items).toHaveLength(1);
    const recordOnly = await t.call<ErrorBody>('POST', `/api/v1/schedule/slots/${str(slot?.id)}/confirm`, {});
    const recordGate = recordOnly.body.error.details as { openClaims: number; claimsForRecord: number };
    expect(recordGate.openClaims).toBe(0);
    expect(recordGate.claimsForRecord).toBe(1);

    await buildCovers(t, bookId);
    const gates = await t.call<{ items: { bookId: string; gate: { ok: boolean } }[] }>('GET', `/api/v1/batches/${batchId}/gates`);
    expect(gates.body.items.find((g) => g.bookId === bookId)?.gate.ok).toBe(true);
    expect(gates.body.items.filter((g) => g.gate.ok)).toHaveLength(1);
    const confirmed = await t.call<SlotView>('POST', `/api/v1/schedule/slots/${str(slot?.id)}/confirm`, {});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('confirmed');
    const ready = await t.call<ItemView>('POST', `/api/v1/batches/${batchId}/items/${str(item?.id)}/ready`, {});
    expect(ready.status).toBe(200);
    expect(ready.body.status).toBe('ready');
    expect((await t.call('POST', `/api/v1/books/${bookId}/exports`, {})).status).toBe(202);
    expect((await t.call('POST', `/api/v1/books/${bookId}/publish`, {})).status).toBe(200);
    const summary = await t.call<{ readyCount: number }>('GET', `/api/v1/batches/${batchId}`);
    expect(summary.body.readyCount).toBe(1);
  }, 60_000);
});

describe('Volume mode roles and isolation', () => {
  it('lets a viewer read batches and the schedule but change nothing; an editor can plan', async () => {
    const viewer = await app({ ...t.owner, userId: 'viewer-user', role: 'viewer' });
    const editor = await app({ ...t.owner, userId: 'editor-user', role: 'editor' });
    try {
      expect((await callOn(viewer, 'GET', '/api/v1/batches')).status).toBe(200);
      expect((await callOn(viewer, 'GET', `/api/v1/batches/${batchId}`)).status).toBe(200);
      expect((await callOn(viewer, 'GET', '/api/v1/schedule')).status).toBe(200);
      const slots = await callOn<{ items: SlotView[] }>(viewer, 'GET', '/api/v1/schedule');
      const slotId = str(slots.body.items[0]?.id);
      const writes: [string, string, unknown][] = [
        ['POST', '/api/v1/batches', { name: 'Viewer batch', bookIds: [books[0]] }],
        ['PATCH', `/api/v1/batches/${batchId}`, { name: 'x' }],
        ['DELETE', `/api/v1/batches/${batchId}`, {}],
        ['POST', `/api/v1/batches/${batchId}/start`, {}],
        ['POST', '/api/v1/schedule/slots', { bookId: books[2], format: 'hardcover', plannedAt: T0 }],
        ['POST', `/api/v1/schedule/slots/${slotId}/confirm`, {}],
        ['DELETE', `/api/v1/schedule/slots/${slotId}`, {}],
      ];
      for (const [method, url, body] of writes) expect((await callOn(viewer, method, url, body)).status, `${method} ${url}`).toBe(403);
      expect((await callOn(editor, 'POST', '/api/v1/schedule/slots', { bookId: books[2], format: 'hardcover', plannedAt: T0 })).status).toBe(201);
      const nb = await callOn<{ id: string }>(editor, 'POST', '/api/v1/batches', { name: 'Editor batch', bookIds: [] });
      expect(nb.status).toBe(400);
    } finally {
      await viewer.close();
      await editor.close();
    }
  });

  it("keeps workspace B out of A's batches and slots, and gives B a limit of its own", async () => {
    const b = await ensureOwner(t.handle.db, 'volume-b', 'Publisher B');
    const other = await app(b);
    try {
      expect((await callOn<{ items: unknown[] }>(other, 'GET', '/api/v1/batches')).body.items).toEqual([]);
      expect((await callOn(other, 'GET', `/api/v1/batches/${batchId}`)).status).toBe(404);
      expect((await callOn(other, 'GET', `/api/v1/batches/${batchId}/gates`)).status).toBe(404);
      expect((await callOn(other, 'POST', `/api/v1/batches/${batchId}/start`, {})).status).toBe(404);
      const sched = await callOn<{ items: unknown[] }>(other, 'GET', '/api/v1/schedule');
      expect(sched.body.items).toEqual([]);
      expect((await callOn(other, 'POST', '/api/v1/batches', { name: 'Borrowed', bookIds: [books[0]] })).status).toBe(404);
      expect((await callOn(other, 'POST', '/api/v1/schedule/slots', { bookId: books[3], format: 'paperback', plannedAt: T0 })).status).toBe(404);
      const aSlot = str((await t.call<{ items: SlotView[] }>('GET', '/api/v1/schedule')).body.items[0]?.id);
      expect((await callOn(other, 'POST', `/api/v1/schedule/slots/${aSlot}/confirm`, {})).status).toBe(404);
      expect((await callOn(other, 'DELETE', `/api/v1/schedule/slots/${aSlot}`, {})).status).toBe(404);

      // A's full week does not count against B.
      const p = await callOn<{ id: string }>(other, 'POST', '/api/v1/profiles', { penName: 'B Pen', bioThirdPerson: 'B Pen writes.' });
      const bk = await callOn<{ id: string }>(other, 'POST', '/api/v1/books', { profileId: p.body.id, idea: 'B idea', title: 'B book' });
      const mine = await callOn<SlotView>(other, 'POST', '/api/v1/schedule/slots', { bookId: bk.body.id, format: 'paperback', plannedAt: T0 });
      expect(mine.status).toBe(201);
      expect((await t.call<{ items: SlotView[] }>('GET', '/api/v1/schedule')).body.items.map((s) => s.id)).not.toContain(mine.body.id);
    } finally {
      await other.close();
    }
  });
});

describe('Volume mode resume after a restart', () => {
  it('re-queues a batch book that was running and does not enqueue its writing twice', async () => {
    // Nothing else queued (the export from the gate test), so the steps below run exactly the batch's jobs.
    await t.services.runner.runUntilIdle(2000);
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Dee East', bioThirdPerson: 'Dee East writes plain books.' });
    const bk = await t.call<Obj>('POST', '/api/v1/books', {
      profileId: str(p.body['id']),
      idea: 'Resume idea',
      title: 'Resume Book',
      settings: { acknowledgements: 'Sam' },
    });
    const bookId = str(bk.body['id']);
    const created = await t.call<BatchDetail>('POST', '/api/v1/batches', { name: 'Resume batch', bookIds: [bookId] });
    const start = await t.call<{ jobId: string }>('POST', `/api/v1/batches/${created.body.id}/start`, { chapterCount: 2 });

    // batch_run, then batch_book (blueprint, approval, write_section children enqueued; now waiting).
    await t.services.runner.runUntilIdle(2);
    const [child] = await t.services.queue.list(t.owner, { parentId: start.body.jobId });
    const bookJob = str(child?.id);
    const before = await t.services.queue.list(t.owner, { parentId: bookJob, limit: 1000 });
    expect(before.length).toBeGreaterThan(0);

    // The process died while the batch book was running: its heartbeat is old, so start-up recovery re-queues it.
    const old = Date.now() - 10 * 60_000;
    await t.handle.db.updateTable('jobs').set({ status: 'running', lockedAt: old, lockToken: 'dead' }).where('id', '=', bookJob).execute();
    expect(await t.services.queue.recoverStale(60_000)).toBe(1);
    await t.services.runner.runUntilIdle(2000);

    const after = await t.services.queue.list(t.owner, { parentId: bookJob, limit: 1000 });
    expect(after).toHaveLength(before.length);
    expect((await t.services.queue.get(t.owner, bookJob))?.status).toBe('succeeded');
    const batch = await t.call<BatchDetail>('GET', `/api/v1/batches/${created.body.id}`);
    expect(batch.body.status).toBe('succeeded');
    const tree = await t.call<{ body: { status: string }[] }>('GET', `/api/v1/books/${bookId}/sections`);
    expect(tree.body.body.every((s) => s.status === 'done')).toBe(true);
  }, 60_000);
});
