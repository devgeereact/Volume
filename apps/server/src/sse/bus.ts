import type { Db } from '../db/connect.js';
import { newId, now, toJson, type OpenString } from '../lib/util.js';

/**
 * Event types sent over SSE (docs/02-architecture/ARCHITECTURE.md, Live progress).
 * Persisted events go to job_events and can be replayed with Last-Event-ID;
 * section.delta is streamed text and is never stored.
 */
export type EventType =
  | 'job.status'
  | 'job.progress'
  | 'section.delta'
  | 'section.started'
  | 'section.saved'
  | 'check.result'
  | 'claim.added'
  | 'cost.update'
  | 'budget.paused'
  | 'export.ready'
  | 'note.woven'
  | 'cover.updated'
  | 'book.updated'
  | 'batch.updated';

export interface BusEvent {
  /** ULID from job_events, or null for ephemeral events (no replay). */
  id: string | null;
  workspaceId: string;
  projectId: string | null;
  jobId: string | null;
  type: EventType | OpenString;
  data: unknown;
  createdAt: number;
}

export interface PublishInput {
  projectId?: string | null;
  jobId?: string | null;
  type: EventType;
  data: unknown;
}

type Listener = (e: BusEvent) => void;

/** Stored job events older than this are deleted daily (D-050). */
export const JOB_EVENT_RETENTION_DAYS = 90;

export class EventBus {
  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(private readonly db: Db) {}

  private key(workspaceId: string, projectId: string | null): string {
    return `${workspaceId}:${projectId ?? '*'}`;
  }

  subscribe(workspaceId: string, projectId: string | null, fn: Listener): () => void {
    const k = this.key(workspaceId, projectId);
    let set = this.listeners.get(k);
    if (!set) {
      set = new Set();
      this.listeners.set(k, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.listeners.delete(k);
    };
  }

  listenerCount(): number {
    let n = 0;
    for (const s of this.listeners.values()) n += s.size;
    return n;
  }

  private dispatch(e: BusEvent): void {
    const targets = [this.listeners.get(this.key(e.workspaceId, e.projectId))];
    // Workspace-wide streams get every stored event (Library cards, budgets).
    if (e.projectId !== null && e.id !== null) targets.push(this.listeners.get(this.key(e.workspaceId, null)));
    for (const set of targets) {
      if (!set) continue;
      for (const fn of set) {
        try {
          fn(e);
        } catch {
          // a broken listener must not stop the others
        }
      }
    }
  }

  /** Stores the event in job_events, then sends it to live listeners. */
  async publish(workspaceId: string, input: PublishInput): Promise<BusEvent> {
    const e: BusEvent = {
      id: newId(),
      workspaceId,
      projectId: input.projectId ?? null,
      jobId: input.jobId ?? null,
      type: input.type,
      data: input.data,
      createdAt: now(),
    };
    await this.db
      .insertInto('jobEvents')
      .values({ id: e.id as string, workspaceId, projectId: e.projectId, jobId: e.jobId, type: e.type, data: toJson(e.data), createdAt: e.createdAt })
      .execute();
    this.dispatch(e);
    return e;
  }

  /** Sends without storing (streamed text). */
  publishEphemeral(workspaceId: string, input: PublishInput): void {
    this.dispatch({
      id: null,
      workspaceId,
      projectId: input.projectId ?? null,
      jobId: input.jobId ?? null,
      type: input.type,
      data: input.data,
      createdAt: now(),
    });
  }

  /** Stored events after `afterId` (exclusive), oldest first. */
  async replay(workspaceId: string, projectId: string | null, afterId: string, limit = 1000): Promise<BusEvent[]> {
    let q = this.db.selectFrom('jobEvents').selectAll().where('workspaceId', '=', workspaceId).where('id', '>', afterId);
    if (projectId !== null) q = q.where('projectId', '=', projectId);
    const rows = await q.orderBy('id').limit(limit).execute();
    return rows.map((r) => {
      let data: unknown;
      try {
        data = JSON.parse(r.data);
      } catch {
        data = null;
      }
      return { id: r.id, workspaceId: r.workspaceId, projectId: r.projectId, jobId: r.jobId, type: r.type, data, createdAt: Number(r.createdAt) };
    });
  }

  /**
   * Retention (D-050): removes every stored event older than `days` (default 90), in every workspace. Job status
   * lives on the jobs row, so nothing needs an old event; a stream resuming from a pruned id simply replays less.
   */
  async prune(days = JOB_EVENT_RETENTION_DAYS, at = now()): Promise<number> {
    const cutoff = at - days * 24 * 60 * 60 * 1000;
    const res = await this.db.deleteFrom('jobEvents').where('createdAt', '<', cutoff).executeTakeFirst();
    return Number(res.numDeletedRows);
  }
}
