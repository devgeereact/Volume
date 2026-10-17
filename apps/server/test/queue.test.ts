import { describe, expect, it, vi } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { MockExportAdapter } from '../src/adapters/mock-export.js';
import { ensureOwner } from '../src/auth/context.js';
import { BlobStore } from '../src/files/blob-store.js';
import { JobCancelled, JobFailed } from '../src/jobs/errors.js';
import { JobQueue } from '../src/jobs/queue.js';
import { JobRunner, type HandlerMap, type JobServices } from '../src/jobs/runner.js';
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

  it('reserves the shared monthly allowance before overlapping calls', async () => {
    const { handle, ctx, queue, runner, services } = await setup({
      noop: async (jc) => {
        await jc.runAi('summarise', { variables: {} });
        return {};
      },
    });
    await services.repos.settings.set(ctx, { 'budget.monthly_cap_usd': 0.002 });
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = services.ai.runStage.bind(services.ai);
    const call = vi.spyOn(services.ai, 'runStage').mockImplementation(async (...args) => {
      await gate;
      return original(...args);
    });
    const first = await queue.enqueue(ctx, { kind: 'noop' });
    const second = await queue.enqueue(ctx, { kind: 'noop' });
    try {
      await runner.start();
      await vi.waitFor(async () => {
        const statuses = await Promise.all([first, second].map(async (job) => (await queue.require(ctx, job.id)).status));
        expect(statuses.sort()).toEqual(['paused_budget', 'running']);
      });
      expect(call).toHaveBeenCalledTimes(1);
      release();
      await vi.waitFor(async () => {
        const statuses = await Promise.all([first, second].map(async (job) => (await queue.require(ctx, job.id)).status));
        expect(statuses.sort()).toEqual(['paused_budget', 'succeeded']);
      });
    } finally {
      release();
      await runner.stop();
      await handle.close();
    }
  });

  it('pauses on budget and records events', async () => {
    const { handle, ctx, queue, runner, bus } = await setup({
      noop: async (jc) => {
        await jc.runAi('summarise', { variables: {} });
        return {};
      },
    });
    const repos = createRepos(handle.db);
    const profile = await repos.profiles.create(ctx, { penName: 'P' });
    const book = await repos.books.create(ctx, { profileId: profile.id, budgetUsd: 0 }, { budgetUsd: 0, illustrativeLine: false });
    const job = await queue.enqueue(ctx, { kind: 'noop', projectId: book.id });
    await runner.runUntilIdle();
    expect((await queue.require(ctx, job.id)).status).toBe('paused_budget');
    const events = await bus.replay(ctx.workspaceId, book.id, '0');
    expect(events.map((e) => e.type)).toContain('budget.paused');
    await handle.close();
  });
  it('cancels the jobs behind a parent that fails through its children (batch books queued for ever)', async () => {
    // batch_run -> batch_book A (waits on a child that fails) and batch_book B, which depends on A.
    const { handle, ctx, queue, runner } = await setup({
      batch_run: async (jc) => {
        const a = await jc.enqueueChild({ kind: 'batch_book', payload: { name: 'A' } });
        await jc.enqueueChild({ kind: 'batch_book', payload: { name: 'B' }, dependsOnJobId: a.id });
        return { waitForChildren: true };
      },
      batch_book: async (jc) => {
        await jc.enqueueChild({ kind: 'noop' });
        return { waitForChildren: true };
      },
      noop: () => Promise.reject(new JobFailed('The section failed.', 'job_failed')),
    });
    const parent = await queue.enqueue(ctx, { kind: 'batch_run' });
    await runner.runUntilIdle();
    const kids = await queue.list(ctx, { parentId: parent.id });
    const a = kids.find((k) => k.payload['name'] === 'A');
    const b = kids.find((k) => k.payload['name'] === 'B');
    expect(a?.status).toBe('failed');
    expect(b).toMatchObject({ status: 'cancelled', errorCode: 'dependency_failed' });
    const done = await queue.require(ctx, parent.id);
    expect(done.status).toBe('failed');
    expect(done.error).toMatch(/1 of 2 books failed\. 1 book after it was not started\./);
    await handle.close();
  });
});
