import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { JobsTable } from '../db/schema.js';
import { AppError, notFound } from '../http/errors.js';
import { affected, bool, fromJson, newId, now, toJson } from '../lib/util.js';
import type { EventBus } from '../sse/bus.js';

/**
 * Database-backed job queue (SQLite or MySQL). Claiming is an atomic
 * compare-and-set (`UPDATE ... WHERE id = ? AND status = 'queued'`), which is
 * safe on both dialects without row locks.
 */

export const JOB_KINDS = [
  'research',
  'titles',
  'blueprint',
  'blueprint_part',
  'write_book',
  'write_section',
  'weave_notes',
  'edit_pass',
  'cover_concepts',
  'cover_build',
  'marketing',
  'export_pack',
  'rewrite_selection',
  // Volume mode (P8-2): a batch parent and one child per book.
  'batch_run',
  'batch_book',
  // Picture books (P7-5, D-044, D-045): a parent, then the story and scene prompts, the character references, one
  // image per spread, and the print export on its own.
  'picture_book',
  'picture_story',
  'picture_characters',
  'spread_image',
  'picture_export',
  'noop',
] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const JOB_STATUSES = ['queued', 'running', 'waiting', 'paused', 'paused_budget', 'succeeded', 'needs_attention', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const TERMINAL: ReadonlySet<string> = new Set(['succeeded', 'needs_attention', 'failed', 'cancelled']);
const DONE_OK: ReadonlySet<string> = new Set(['succeeded', 'needs_attention']);

/** One plain sentence for a parent whose children did not all finish. */
export function parentFailure(kind: string, failed: number, notStarted: number, total: number): string {
  const noun = kind === 'write_book' ? 'section' : kind === 'batch_run' ? 'book' : kind === 'picture_book' ? 'step' : 'part';
  let out = `${failed} of ${total} ${noun}${total === 1 ? '' : 's'} failed.`;
  if (notStarted > 0)
    out += ` ${notStarted} ${noun}${notStarted === 1 ? '' : 's'} after ${failed === 1 ? 'it' : 'them'} ${notStarted === 1 ? 'was' : 'were'} not started.`;
  if (kind === 'batch_run') return out + ' Fix the failed book, then start the batch again: finished books are skipped.';
  return out + (kind === 'write_book' ? ' Retry the failed section, then write the rest.' : ' Try again.');
}

/** Backoff before attempt 2, 3, 4 ... (docs: 2 s, 10 s, 60 s plus up to 20% jitter). */
export const BACKOFF_MS = [2000, 10000, 60000];

export interface Job {
  id: string;
  workspaceId: string;
  projectId: string | null;
  parentId: string | null;
  dependsOnJobId: string | null;
  kind: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAfter: number;
  lockedAt: number | null;
  cancelRequested: boolean;
  pauseRequested: boolean;
  payload: Record<string, unknown>;
  result: unknown;
  progress: number;
  costUsd: number;
  error: string | null;
  errorCode: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

const PayloadSchema = z.record(z.string(), z.unknown());

export function toJob(r: JobsTable): Job {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    projectId: r.projectId,
    parentId: r.parentId,
    dependsOnJobId: r.dependsOnJobId,
    kind: r.kind,
    status: r.status as JobStatus,
    priority: r.priority,
    attempts: r.attempts,
    maxAttempts: r.maxAttempts,
    runAfter: Number(r.runAfter),
    lockedAt: r.lockedAt === null ? null : Number(r.lockedAt),
    cancelRequested: bool(r.cancelRequested),
    pauseRequested: bool(r.pauseRequested),
    payload: fromJson(PayloadSchema, r.payload, {}),
    result: fromJson(z.unknown(), r.result, null),
    progress: Number(r.progress),
    costUsd: Number(r.costUsd),
    error: r.error,
    errorCode: r.errorCode,
    startedAt: r.startedAt === null ? null : Number(r.startedAt),
    finishedAt: r.finishedAt === null ? null : Number(r.finishedAt),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  };
}

export interface EnqueueInput {
  kind: JobKind;
  projectId?: string | null;
  payload?: Record<string, unknown>;
  parentId?: string | null;
  dependsOnJobId?: string | null;
  priority?: number;
  maxAttempts?: number;
  runAfter?: number;
}

export interface ClaimedJob extends Job {
  lockToken: string;
}

export class JobQueue {
  private wake: (() => void) | null = null;

  constructor(
    private readonly db: Db,
    private readonly bus: EventBus,
    private readonly rand: () => number = Math.random,
  ) {}

  /** The runner registers a callback so new jobs start without waiting for the next poll. */
  onEnqueue(fn: () => void): void {
    this.wake = fn;
  }

  async enqueue(ctx: RequestCtx, input: EnqueueInput): Promise<Job> {
    const t = now();
    const id = newId();
    await this.db
      .insertInto('jobs')
      .values({
        id,
        workspaceId: ctx.workspaceId,
        projectId: input.projectId ?? null,
        parentId: input.parentId ?? null,
        dependsOnJobId: input.dependsOnJobId ?? null,
        kind: input.kind,
        status: 'queued',
        priority: input.priority ?? 100,
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        runAfter: input.runAfter ?? t,
        lockedAt: null,
        lockToken: null,
        cancelRequested: 0,
        pauseRequested: 0,
        payload: toJson(input.payload ?? {}),
        result: null,
        progress: 0,
        costUsd: 0,
        error: null,
        errorCode: null,
        startedAt: null,
        finishedAt: null,
        createdAt: t,
        updatedAt: t,
      })
      .execute();
    const job = await this.require(ctx, id);
    await this.emitStatus(job);
    this.wake?.();
    return job;
  }

  async get(ctx: RequestCtx, id: string): Promise<Job | null> {
    const row = await this.db.selectFrom('jobs').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    return row ? toJob(row) : null;
  }

  async require(ctx: RequestCtx, id: string): Promise<Job> {
    const job = await this.get(ctx, id);
    if (!job) throw notFound('Job');
    return job;
  }

  async list(ctx: RequestCtx, filter: { projectId?: string; parentId?: string; status?: string; limit?: number }): Promise<Job[]> {
    let q = this.db.selectFrom('jobs').selectAll().where('workspaceId', '=', ctx.workspaceId);
    if (filter.projectId) q = q.where('projectId', '=', filter.projectId);
    if (filter.parentId) q = q.where('parentId', '=', filter.parentId);
    if (filter.status) q = q.where('status', '=', filter.status);
    const rows = await q
      .orderBy('id', 'desc')
      .limit(filter.limit ?? 100)
      .execute();
    return rows.map(toJob);
  }

  /** Internal lookup for the runner (no workspace filter: the runner serves every workspace). */
  async getById(id: string): Promise<Job | null> {
    const row = await this.db.selectFrom('jobs').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toJob(row) : null;
  }

  /**
   * Claims the next runnable job of the given kinds. Ready means queued,
   * run_after reached, and any dependency finished well.
   */
  async claim(kinds: readonly string[], at = now()): Promise<ClaimedJob | null> {
    if (kinds.length === 0) return null;
    const candidates = await this.db
      .selectFrom('jobs as j')
      .select(['j.id'])
      .where('j.status', '=', 'queued')
      .where('j.runAfter', '<=', at)
      .where('j.kind', 'in', [...kinds])
      .where((eb) =>
        eb.or([
          eb('j.dependsOnJobId', 'is', null),
          eb.exists(
            eb
              .selectFrom('jobs as d')
              .select('d.id')
              .whereRef('d.id', '=', 'j.dependsOnJobId')
              .where('d.status', 'in', [...DONE_OK]),
          ),
        ]),
      )
      .orderBy('j.priority')
      .orderBy('j.id')
      .limit(5)
      .execute();

    for (const c of candidates) {
      const token = newId();
      const res = await this.db
        .updateTable('jobs')
        .set((eb) => ({
          status: 'running',
          lockToken: token,
          lockedAt: at,
          attempts: eb('attempts', '+', 1),
          startedAt: eb.fn.coalesce('startedAt', eb.val(at)),
          updatedAt: at,
        }))
        .where('id', '=', c.id)
        .where('status', '=', 'queued')
        .executeTakeFirst();
      if (affected(res) === 1) {
        const job = await this.getById(c.id);
        if (!job) continue;
        await this.emitStatus(job);
        return { ...job, lockToken: token };
      }
    }
    return null;
  }

  /** Heartbeat. Returns the flags the runner must act on, or null if the lock was lost. */
  async heartbeat(id: string, token: string, at = now()): Promise<{ cancelRequested: boolean; pauseRequested: boolean } | null> {
    const res = await this.db
      .updateTable('jobs')
      .set({ lockedAt: at })
      .where('id', '=', id)
      .where('lockToken', '=', token)
      .where('status', '=', 'running')
      .executeTakeFirst();
    if (affected(res) !== 1) return null;
    const row = await this.db.selectFrom('jobs').select(['cancelRequested', 'pauseRequested']).where('id', '=', id).executeTakeFirst();
    return row ? { cancelRequested: bool(row.cancelRequested), pauseRequested: bool(row.pauseRequested) } : null;
  }

  async setProgress(id: string, token: string, progress: number): Promise<void> {
    await this.db
      .updateTable('jobs')
      .set({ progress: Math.max(0, Math.min(1, progress)), updatedAt: now() })
      .where('id', '=', id)
      .where('lockToken', '=', token)
      .execute();
  }

  async addCost(id: string, usd: number): Promise<void> {
    await this.db
      .updateTable('jobs')
      .set((eb) => ({ costUsd: eb('costUsd', '+', usd), updatedAt: now() }))
      .where('id', '=', id)
      .execute();
  }

  /** Finishes a running job held by `token`. */
  async finish(
    id: string,
    token: string,
    outcome: {
      status: 'succeeded' | 'needs_attention' | 'failed' | 'cancelled' | 'waiting' | 'paused' | 'paused_budget';
      result?: unknown;
      error?: string | null;
      errorCode?: string | null;
    },
  ): Promise<Job | null> {
    const t = now();
    const terminal = TERMINAL.has(outcome.status);
    const res = await this.db
      .updateTable('jobs')
      .set({
        status: outcome.status,
        result: outcome.result === undefined ? null : toJson(outcome.result),
        error: outcome.error ?? null,
        errorCode: outcome.errorCode ?? null,
        progress: outcome.status === 'succeeded' ? 1 : undefined,
        lockToken: null,
        lockedAt: null,
        finishedAt: terminal ? t : null,
        // A paused job keeps its attempt count; resuming re-queues it.
        cancelRequested: outcome.status === 'cancelled' ? 1 : undefined,
        pauseRequested: 0,
        updatedAt: t,
      })
      .where('id', '=', id)
      .where('lockToken', '=', token)
      .executeTakeFirst();
    if (affected(res) !== 1) return null;
    const job = await this.getById(id);
    if (job) {
      await this.emitStatus(job);
      // Jobs waiting on this one can never run now: end them so the parent can finish.
      if (job.status === 'failed' || job.status === 'cancelled') {
        await this.endedListener?.(job);
        await this.cancelDependents(job);
      }
      if (job.parentId && terminal) await this.refreshParent(job.parentId);
    }
    return job;
  }

  /**
   * Cancels the jobs that depend on a job that failed or was cancelled (and theirs in turn), with a plain reason.
   * A dependency that did not finish well would otherwise leave them queued for ever (claim() never picks them).
   */
  async cancelDependents(job: Job): Promise<Job[]> {
    const ended: Job[] = [];
    let frontier = [job.id];
    const reason = job.kind === 'write_section' ? 'Not started: an earlier section failed.' : 'Not started: the job it depends on did not finish.';
    while (frontier.length > 0) {
      const rows = await this.db
        .selectFrom('jobs')
        .selectAll()
        .where('dependsOnJobId', 'in', frontier)
        .where('status', 'in', ['queued', 'paused', 'paused_budget'])
        .execute();
      frontier = [];
      for (const r of rows) {
        const t = now();
        const res = await this.db
          .updateTable('jobs')
          .set({ status: 'cancelled', error: reason, errorCode: 'dependency_failed', finishedAt: t, lockToken: null, updatedAt: t })
          .where('id', '=', r.id)
          .where('status', 'in', ['queued', 'paused', 'paused_budget'])
          .executeTakeFirst();
        if (affected(res) !== 1) continue;
        const d = await this.getById(r.id);
        if (!d) continue;
        await this.emitStatus(d);
        await this.endedListener?.(d);
        ended.push(d);
        frontier.push(d.id);
      }
    }
    return ended;
  }

  private endedListener: ((job: Job) => Promise<void> | void) | null = null;

  /** Called for every job that ends without finishing well (failed or cancelled), for clean-up such as section status. */
  onJobEndedBadly(fn: (job: Job) => Promise<void> | void): void {
    this.endedListener = fn;
  }

  /** Puts a failed attempt back in the queue with backoff, or fails it for good. */
  async retryOrFail(
    id: string,
    token: string,
    error: string,
    opts: { retryable: boolean; retryAfterMs?: number | null; errorCode?: string },
  ): Promise<Job | null> {
    const job = await this.getById(id);
    if (!job) return null;
    if (!opts.retryable || job.attempts >= job.maxAttempts) {
      return this.finish(id, token, { status: 'failed', error, errorCode: opts.errorCode ?? (opts.retryable ? 'retries_exhausted' : 'job_failed') });
    }
    const base = BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)] ?? 60000;
    const delay = opts.retryAfterMs ?? Math.round(base * (1 + 0.2 * this.rand()));
    const t = now();
    const res = await this.db
      .updateTable('jobs')
      .set({ status: 'queued', runAfter: t + delay, lockToken: null, lockedAt: null, error, errorCode: 'retrying', updatedAt: t })
      .where('id', '=', id)
      .where('lockToken', '=', token)
      .executeTakeFirst();
    if (affected(res) !== 1) return null;
    const updated = await this.getById(id);
    if (updated) await this.emitStatus(updated);
    return updated;
  }

  /** Re-queues running jobs whose heartbeat is older than `staleMs` (crash or restart). */
  async recoverStale(staleMs = 60000, at = now()): Promise<number> {
    const res = await this.db
      .updateTable('jobs')
      .set({ status: 'queued', lockToken: null, lockedAt: null, runAfter: Math.min(at, now()), updatedAt: now() })
      .where('status', '=', 'running')
      .where((eb) => eb.or([eb('lockedAt', 'is', null), eb('lockedAt', '<', at - staleMs)]))
      .executeTakeFirst();
    return affected(res);
  }

  async cancel(ctx: RequestCtx, id: string): Promise<Job> {
    const job = await this.require(ctx, id);
    if (TERMINAL.has(job.status)) return job;
    const t = now();
    if (job.status === 'running') {
      await this.db.updateTable('jobs').set({ cancelRequested: 1, updatedAt: t }).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    } else {
      await this.db
        .updateTable('jobs')
        .set({ status: 'cancelled', cancelRequested: 1, finishedAt: t, lockToken: null, updatedAt: t })
        .where('id', '=', id)
        .where('workspaceId', '=', ctx.workspaceId)
        .where('status', 'in', ['queued', 'waiting', 'paused', 'paused_budget'])
        .execute();
    }
    // Children go with the parent.
    const children = await this.list(ctx, { parentId: id, limit: 1000 });
    for (const c of children) if (!TERMINAL.has(c.status)) await this.cancel(ctx, c.id);
    const updated = await this.require(ctx, id);
    await this.emitStatus(updated);
    if (updated.status === 'cancelled') {
      await this.endedListener?.(updated);
      await this.cancelDependents(updated);
    }
    if (updated.parentId && TERMINAL.has(updated.status)) await this.refreshParent(updated.parentId);
    return updated;
  }

  async pause(ctx: RequestCtx, id: string): Promise<Job> {
    const job = await this.require(ctx, id);
    const t = now();
    if (job.status === 'queued') {
      await this.db
        .updateTable('jobs')
        .set({ status: 'paused', updatedAt: t })
        .where('id', '=', id)
        .where('workspaceId', '=', ctx.workspaceId)
        .where('status', '=', 'queued')
        .execute();
    } else if (job.status === 'running') {
      await this.db.updateTable('jobs').set({ pauseRequested: 1, updatedAt: t }).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    } else if (job.status !== 'waiting') {
      throw new AppError('invalid_state', `A ${job.status} job cannot be paused.`);
    }
    const children = await this.list(ctx, { parentId: id, limit: 1000 });
    for (const c of children) if (c.status === 'queued' || c.status === 'running') await this.pause(ctx, c.id);
    const updated = await this.require(ctx, id);
    await this.emitStatus(updated);
    return updated;
  }

  async resume(ctx: RequestCtx, id: string): Promise<Job> {
    const job = await this.require(ctx, id);
    const t = now();
    if (job.status === 'paused' || job.status === 'paused_budget') {
      await this.db
        .updateTable('jobs')
        .set({ status: 'queued', runAfter: t, pauseRequested: 0, updatedAt: t })
        .where('id', '=', id)
        .where('workspaceId', '=', ctx.workspaceId)
        .execute();
    } else if (job.status === 'running' && job.pauseRequested) {
      await this.db.updateTable('jobs').set({ pauseRequested: 0, updatedAt: t }).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    } else if (job.status !== 'waiting') {
      throw new AppError('invalid_state', `A ${job.status} job cannot be resumed.`);
    }
    const children = await this.list(ctx, { parentId: id, limit: 1000 });
    for (const c of children) if (c.status === 'paused' || c.status === 'paused_budget') await this.resume(ctx, c.id);
    const updated = await this.require(ctx, id);
    await this.emitStatus(updated);
    this.wake?.();
    return updated;
  }

  /** Recomputes a waiting parent from its children: progress, then a final status once all are done. */
  async refreshParent(parentId: string): Promise<void> {
    const parent = await this.getById(parentId);
    if (!parent || parent.status !== 'waiting') return;
    const children = await this.db.selectFrom('jobs').select(['status']).where('parentId', '=', parentId).execute();
    if (children.length === 0) return;
    const done = children.filter((c) => TERMINAL.has(c.status)).length;
    const t = now();
    if (done < children.length) {
      await this.db
        .updateTable('jobs')
        .set({ progress: done / children.length, updatedAt: t })
        .where('id', '=', parentId)
        .execute();
      await this.bus.publish(parent.workspaceId, {
        projectId: parent.projectId,
        jobId: parentId,
        type: 'job.progress',
        data: { jobId: parentId, progress: done / children.length, done, total: children.length },
      });
      return;
    }
    const statuses = children.map((c) => c.status);
    const failedN = statuses.filter((x) => x === 'failed').length;
    const notStarted = (await this.db.selectFrom('jobs').select('id').where('parentId', '=', parentId).where('errorCode', '=', 'dependency_failed').execute())
      .length;
    const final = statuses.includes('failed')
      ? 'failed'
      : statuses.includes('cancelled')
        ? 'cancelled'
        : statuses.includes('needs_attention')
          ? 'needs_attention'
          : 'succeeded';
    await this.db
      .updateTable('jobs')
      .set({
        status: final,
        progress: 1,
        finishedAt: t,
        updatedAt: t,
        error: final === 'failed' ? parentFailure(parent.kind, failedN, notStarted, children.length) : null,
        errorCode: final === 'failed' ? 'child_failed' : null,
      })
      .where('id', '=', parentId)
      .where('status', '=', 'waiting')
      .execute();
    const updated = await this.getById(parentId);
    if (updated) {
      await this.emitStatus(updated);
      // A parent that ends badly through its children (a batch_book whose sections failed) must end the jobs that
      // depend on it too, as finish() does; otherwise the books behind it in a batch stay queued for ever.
      if (updated.status === 'failed' || updated.status === 'cancelled') {
        await this.endedListener?.(updated);
        await this.cancelDependents(updated);
      }
      if (updated.parentId) await this.refreshParent(updated.parentId);
    }
  }

  async emitStatus(job: Job): Promise<void> {
    await this.bus.publish(job.workspaceId, {
      projectId: job.projectId,
      jobId: job.id,
      type: 'job.status',
      data: {
        jobId: job.id,
        kind: job.kind,
        status: job.status,
        progress: job.progress,
        attempts: job.attempts,
        error: job.error,
        errorCode: job.errorCode,
        parentId: job.parentId,
        // Writing children name their section, so the UI can clear streamed text on a restart.
        ...((job.kind === 'write_section' || job.kind === 'spread_image') && typeof job.payload['sectionId'] === 'string'
          ? { sectionId: job.payload['sectionId'] }
          : {}),
      },
    });
  }
}
