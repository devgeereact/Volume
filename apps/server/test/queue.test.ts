import { describe, expect, it, vi } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { MockExportAdapter } from '../src/adapters/mock-export.js';
import { ensureOwner } from '../src/auth/context.js';
import { BlobStore } from '../src/files/blob-store.js';
import { BudgetPaused, JobCancelled, JobFailed } from '../src/jobs/errors.js';
import { JobQueue, MAX_ACTIVE_EXPORT_JOBS, MAX_ACTIVE_JOBS, MAX_ACTIVE_SECTION_JOBS } from '../src/jobs/queue.js';
import { JobRunner, UNEXPECTED_JOB_ERROR, type HandlerMap, type JobServices } from '../src/jobs/runner.js';
import { AiRetryableError } from '../src/ports/ai.js';
import { createRepos } from '../src/repos/index.js';
import { EventBus } from '../src/sse/bus.js';
import { memoryDb, testConfig } from './helpers.js';

async function setup(handlers: HandlerMap) {
  const handle = await memoryDb();
  const ctx = await ensureOwner(handle.db);
  const bus = new EventBus(handle.db);
  const queue = new JobQueue(handle.db, bus, () => 0);
  const services: JobServices = {
    db: handle.db,
    repos: createRepos(handle.db),
    queue,
    bus,
    blobs: new BlobStore(handle.db),
    ai: new MockAiAdapter(),
    exporter: new MockExportAdapter(),
    configDir: testConfig().configDir,
    instanceWorkspaceId: ctx.workspaceId,
  };
  const runner = new JobRunner(services, handlers);
  return { handle, ctx, queue, runner, bus, services };
}

describe('job queue', () => {
  it('claims each job once, even when two claims race', async () => {
    const { handle, ctx, queue } = await setup({});
    const job = await queue.enqueue(ctx, { kind: 'noop' });
    const [a, b] = await Promise.all([queue.claim(['noop']), queue.claim(['noop'])]);
    const winners = [a, b].filter((x) => x !== null);
    expect(winners).toHaveLength(1);
    expect(winners[0]?.id).toBe(job.id);
    expect(winners[0]?.attempts).toBe(1);
    expect(await queue.claim(['noop'])).toBeNull();
    await handle.close();
  });

  it('retries with backoff, then fails after max attempts', async () => {
    let calls = 0;
    const { handle, ctx, queue, runner } = await setup({
      noop: () => {
        calls += 1;
        return Promise.reject(new AiRetryableError('busy'));
      },
    });
    const job = await queue.enqueue(ctx, { kind: 'noop', maxAttempts: 2 });
    await runner.runUntilIdle();
    let j = await queue.require(ctx, job.id);
    expect(j.status).toBe('queued');
    expect(j.attempts).toBe(1);
    expect(j.runAfter).toBeGreaterThanOrEqual(Date.now() + 1500); // 2 s backoff, no jitter in this test
    expect(await queue.claim(['noop'])).toBeNull(); // not ready yet

    // Pretend the backoff passed.
    await handle.db.updateTable('jobs').set({ runAfter: 0 }).where('id', '=', job.id).execute();
    await runner.runUntilIdle();
    j = await queue.require(ctx, job.id);
    expect(j.status).toBe('failed');
    expect(j.errorCode).toBe('provider_error');
    expect(calls).toBe(2);
    await handle.close();
  });

  it('re-queues jobs left running by a crash (resume after restart)', async () => {
    const { handle, ctx, queue, runner } = await setup({ noop: () => Promise.resolve({ result: { ok: true } }) });
    const job = await queue.enqueue(ctx, { kind: 'noop' });
    const claimed = await queue.claim(['noop']);
    expect(claimed?.status).toBe('running');
    // The process dies here. A fresh heartbeat is not stale yet:
    expect(await queue.recoverStale(60_000)).toBe(0);
    // Two minutes later, on restart:
    expect(await queue.recoverStale(60_000, Date.now() + 120_000)).toBe(1);
    expect((await queue.require(ctx, job.id)).status).toBe('queued');
    await runner.runUntilIdle();
    const done = await queue.require(ctx, job.id);
    expect(done.status).toBe('succeeded');
    expect(done.attempts).toBe(2); // attempt count is kept across the restart
    await handle.close();
  });

  it('cancels queued and running jobs, and pauses and resumes', async () => {
    const { handle, ctx, queue, runner } = await setup({
      noop: async (jc) => {
        // The owner presses Cancel while this runs.
        if (jc.payload['cancelMe']) await queue.cancel(ctx, jc.job.id);
        await jc.checkpoint();
        return {};
      },
    });
    const queued = await queue.enqueue(ctx, { kind: 'noop' });
    expect((await queue.cancel(ctx, queued.id)).status).toBe('cancelled');

    const running = await queue.enqueue(ctx, { kind: 'noop', payload: { cancelMe: true } });
    await runner.runUntilIdle();
    const r = await queue.require(ctx, running.id);
    expect(r.status).toBe('cancelled');
    expect(r.cancelRequested).toBe(true);

    const p = await queue.enqueue(ctx, { kind: 'noop' });
    expect((await queue.pause(ctx, p.id)).status).toBe('paused');
    expect(await runner.runUntilIdle()).toBe(0);
    expect((await queue.resume(ctx, p.id)).status).toBe('queued');
    await runner.runUntilIdle();
    expect((await queue.require(ctx, p.id)).status).toBe('succeeded');
    expect(new JobCancelled().name).toBe('JobCancelled');
    await handle.close();
  });

  it('runs children in order and finishes the parent when they are done', async () => {
    const order: number[] = [];
    const { handle, ctx, queue, runner } = await setup({
      write_book: async (jc) => {
        let prev: string | null = null;
        for (const n of [1, 2, 3]) {
          const child = await jc.enqueueChild({ kind: 'noop', payload: { n }, dependsOnJobId: prev, priority: 10 - n });
          prev = child.id;
        }
        return { waitForChildren: true };
      },
      noop: (jc) => {
        order.push(Number(jc.payload['n']));
        return Promise.resolve({});
      },
    });
    const parent = await queue.enqueue(ctx, { kind: 'write_book' });
    await runner.runUntilIdle();
    expect(order).toEqual([1, 2, 3]); // dependency chain wins over priority
    const p = await queue.require(ctx, parent.id);
    expect(p.status).toBe('succeeded');
    expect(p.progress).toBe(1);
    expect(await queue.list(ctx, { parentId: parent.id })).toHaveLength(3);
    await handle.close();
  });

  it('does not hold calls to a monthly cap or a book budget (D-057)', async () => {
    const { handle, ctx, queue, runner, services, bus } = await setup({
      noop: async (jc) => {
        await jc.runAi('summarise', { variables: {} });
        return {};
      },
    });
    await services.repos.settings.set(ctx, { 'budget.monthly_cap_usd': 0.002 });
    const repos = createRepos(handle.db);
    const profile = await repos.profiles.create(ctx, { penName: 'P' });
    const book = await repos.books.create(ctx, { profileId: profile.id, budgetUsd: 0 }, { budgetUsd: 0, illustrativeLine: false });
    const first = await queue.enqueue(ctx, { kind: 'noop', projectId: book.id });
    const second = await queue.enqueue(ctx, { kind: 'noop', projectId: book.id });
    await runner.runUntilIdle();
    expect((await queue.require(ctx, first.id)).status).toBe('succeeded');
    expect((await queue.require(ctx, second.id)).status).toBe('succeeded');
    const events = await bus.replay(ctx.workspaceId, book.id, '0');
    expect(events.map((e) => e.type)).not.toContain('budget.paused');
    await handle.close();
  });

  it('pauses for a top-up when the provider is out of credits and records the event', async () => {
    const { handle, ctx, queue, runner, bus } = await setup({
      noop: () => Promise.reject(new BudgetPaused('OpenRouter has run out of credits.', { scope: 'credits', limitUsd: 0, spentUsd: 0, estimateUsd: 0 })),
    });
    const repos = createRepos(handle.db);
    const profile = await repos.profiles.create(ctx, { penName: 'P' });
    const book = await repos.books.create(ctx, { profileId: profile.id }, { budgetUsd: 15, illustrativeLine: false });
    const job = await queue.enqueue(ctx, { kind: 'noop', projectId: book.id });
    await runner.runUntilIdle();
    expect(await queue.require(ctx, job.id)).toMatchObject({ status: 'paused_budget', errorCode: 'credits_exhausted' });
    const events = await bus.replay(ctx.workspaceId, book.id, '0');
    expect(events.map((e) => e.type)).toContain('budget.paused');
    await handle.close();
  });

  it('keeps going after a failed book: the next book in a batch still runs', async () => {
    // batch_run -> batch_book A (waits on a child that fails) and batch_book B, which only waits its turn behind A.
    const { handle, ctx, queue, runner } = await setup({
      batch_run: async (jc) => {
        const a = await jc.enqueueChild({ kind: 'batch_book', payload: { name: 'A' } });
        await jc.enqueueChild({ kind: 'batch_book', payload: { name: 'B' }, dependsOnJobId: a.id });
        return { waitForChildren: true };
      },
      batch_book: async (jc) => {
        if (jc.payload['name'] === 'B') return { result: { written: true } };
        await jc.enqueueChild({ kind: 'noop' });
        return { waitForChildren: true };
      },
      noop: () => Promise.reject(new JobFailed('The section failed.', 'job_failed')),
    });
    const parent = await queue.enqueue(ctx, { kind: 'batch_run' });
    await runner.runUntilIdle();
    const kids = await queue.list(ctx, { parentId: parent.id });
    expect(kids.find((k) => k.payload['name'] === 'A')?.status).toBe('failed');
    expect(kids.find((k) => k.payload['name'] === 'B')?.status).toBe('succeeded');
    const done = await queue.require(ctx, parent.id);
    expect(done.status).toBe('failed');
    expect(done.error).toMatch(/1 of 2 books failed\./);
    expect(done.error).not.toMatch(/not started/);
    await handle.close();
  });

  it('cancels the jobs behind a job that fails (other kinds still wait for the job before them)', async () => {
    // A parent runs noop A (fails) and noop B, which depends on A: B is cancelled with a plain reason, not left queued for ever.
    const { handle, ctx, queue, runner } = await setup({
      batch_run: async (jc) => {
        const a = await jc.enqueueChild({ kind: 'noop', payload: { name: 'A' } });
        await jc.enqueueChild({ kind: 'noop', payload: { name: 'B' }, dependsOnJobId: a.id });
        return { waitForChildren: true };
      },
      noop: () => Promise.reject(new JobFailed('The section failed.', 'job_failed')),
    });
    const parent = await queue.enqueue(ctx, { kind: 'batch_run' });
    await runner.runUntilIdle();
    const kids = await queue.list(ctx, { parentId: parent.id });
    expect(kids.find((k) => k.payload['name'] === 'A')?.status).toBe('failed');
    expect(kids.find((k) => k.payload['name'] === 'B')).toMatchObject({ status: 'cancelled', errorCode: 'dependency_failed' });
    expect((await queue.require(ctx, parent.id)).status).toBe('failed');
    await handle.close();
  });

  it('runs an on-screen job (cover concepts) while a book being written fills the ai lane', async () => {
    let release = () => {};
    const blocked = new Promise<void>((res) => (release = res));
    const { handle, ctx, queue, runner } = await setup({
      write_section: async () => {
        await blocked;
        return {};
      },
      cover_concepts: () => Promise.resolve({ result: { ok: true } }),
    });
    for (let i = 0; i < 6; i++) await queue.enqueue(ctx, { kind: 'write_section' });
    const cover = await queue.enqueue(ctx, { kind: 'cover_concepts' });
    expect(cover.priority).toBeLessThan(100);
    await runner.start();
    await vi.waitFor(async () => expect((await queue.require(ctx, cover.id)).status).toBe('succeeded'));
    release();
    await runner.stop();
    await handle.close();
  });
});

describe('active jobs per workspace (audit M4, 1 November 2026)', () => {
  it('refuses a workspace that already has too many jobs started by people, and never counts child jobs', async () => {
    const { memoryDb } = await import('./helpers.js');
    const { EventBus } = await import('../src/sse/bus.js');
    const handle = await memoryDb();
    const ctx = await ensureOwner(handle.db);
    const other = await ensureOwner(handle.db, 'other', 'Other');
    const queue = new JobQueue(handle.db, new EventBus(handle.db));
    for (let i = 0; i < MAX_ACTIVE_EXPORT_JOBS; i += 1) await queue.enqueue(ctx, { kind: 'export_pack', projectId: null });
    await expect(queue.enqueue(ctx, { kind: 'cover_build', projectId: null })).rejects.toMatchObject({ code: 'rate_limited' });
    // Another workspace is not held up, and a job's own children are never refused.
    await queue.enqueue(other, { kind: 'export_pack', projectId: null });
    const parent = await queue.enqueue(ctx, { kind: 'write_book', projectId: null });
    for (let i = 0; i < MAX_ACTIVE_JOBS + 5; i += 1) await queue.enqueue(ctx, { kind: 'write_section', projectId: null, parentId: parent.id });
    while (
      (await handle.db.selectFrom('jobs').select('id').where('workspaceId', '=', ctx.workspaceId).where('parentId', 'is', null).execute()).length <
      MAX_ACTIVE_JOBS
    )
      await queue.enqueue(ctx, { kind: 'research', projectId: null });
    await expect(queue.enqueue(ctx, { kind: 'titles', projectId: null })).rejects.toMatchObject({ code: 'rate_limited' });
    // Finished jobs free their place.
    await handle.db.updateTable('jobs').set({ status: 'succeeded' }).where('workspaceId', '=', ctx.workspaceId).where('kind', '=', 'research').execute();
    await queue.enqueue(ctx, { kind: 'titles', projectId: null });
  });
});

describe('unexpected job errors (audit L5, 1 November 2026)', () => {
  it('stores and streams a plain message, never the internal error text', async () => {
    const secretish = 'ER_ACCESS_DENIED_ERROR: Access denied for user vol_app@localhost (using password: YES) at /home/x/apps/volume/server.mjs:1';
    const driverError = Object.assign(new Error(secretish), { code: 'ER_ACCESS_DENIED_ERROR', errno: 1045 });
    const { handle, ctx, queue, runner, bus } = await setup({ noop: () => Promise.reject(driverError) });
    const seen: unknown[] = [];
    bus.subscribe(ctx.workspaceId, null, (e) => seen.push(e.data));
    const job = await queue.enqueue(ctx, { kind: 'noop', maxAttempts: 1 });
    await runner.runUntilIdle();
    const j = await queue.require(ctx, job.id);
    expect(j.status).toBe('failed');
    expect(j.error).toBe(UNEXPECTED_JOB_ERROR);
    expect(JSON.stringify(seen)).not.toContain('ER_ACCESS_DENIED');
    await handle.close();
  });
});

describe('readable job errors stay readable (review of audit L5)', () => {
  it('keeps the message of an error Volume itself raised', async () => {
    const { handle, ctx, queue, runner } = await setup({ noop: () => Promise.reject(new Error('The EPUB cover must be a JPEG.')) });
    const job = await queue.enqueue(ctx, { kind: 'noop', maxAttempts: 1 });
    await runner.runUntilIdle();
    expect((await queue.require(ctx, job.id)).error).toBe('The EPUB cover must be a JPEG.');
    await handle.close();
  });
});

describe('section reruns and the job limit (review of audit M4)', () => {
  it('lets "Fix everything" rerun every section of a long book, and still bounds a flood', async () => {
    const { memoryDb } = await import('./helpers.js');
    const { EventBus } = await import('../src/sse/bus.js');
    const handle = await memoryDb();
    const ctx = await ensureOwner(handle.db);
    const queue = new JobQueue(handle.db, new EventBus(handle.db));
    for (let i = 0; i < 60; i += 1) await queue.enqueue(ctx, { kind: 'write_section', projectId: null });
    // Section reruns do not use up the room for other work.
    await queue.enqueue(ctx, { kind: 'research', projectId: null });
    while ((await handle.db.selectFrom('jobs').select('id').where('kind', '=', 'write_section').execute()).length < MAX_ACTIVE_SECTION_JOBS)
      await queue.enqueue(ctx, { kind: 'write_section', projectId: null });
    await expect(queue.enqueue(ctx, { kind: 'write_section', projectId: null })).rejects.toMatchObject({ code: 'rate_limited' });
    await handle.close();
  });
});
