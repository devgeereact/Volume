import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { Job } from './queue.js';
import type { JobRunner } from './runner.js';

/**
 * Time left and the model in use for writing jobs (write_book and its write_section children).
 * The estimate is the average run time of the finished sibling sections; with none finished yet
 * there is nothing honest to say, so etaMs is null.
 */

export const WRITING_KINDS: ReadonlySet<string> = new Set(['write_book', 'rebuild_book', 'write_section']);
const DONE = new Set(['succeeded', 'needs_attention']);
const ACTIVE = new Set(['queued', 'running', 'waiting', 'paused', 'paused_budget']);

export interface JobExtras {
  /** Milliseconds left, from finished sibling sections. Null when not a writing job, finished, or nothing to go on. */
  etaMs: number | null;
  /** The model writing the text: the last writing call's model, else the model the settings pick. */
  model: string | null;
}

interface ChildRow {
  id: string;
  parentId: string | null;
  status: string;
  startedAt: number | null;
  finishedAt: number | null;
}

function averageMs(children: readonly ChildRow[]): number | null {
  const times = children
    .filter((c) => DONE.has(c.status) && c.startedAt !== null && c.finishedAt !== null)
    .map((c) => (c.finishedAt as number) - (c.startedAt as number))
    .filter((d) => d >= 0);
  if (times.length === 0) return null;
  return times.reduce((a, b) => a + b, 0) / times.length;
}

/** Time left for one child given its siblings' average. */
function childEta(c: ChildRow, avg: number | null, at: number): number | null {
  if (avg === null || !ACTIVE.has(c.status)) return null;
  if (c.status === 'running' && c.startedAt !== null) return Math.max(0, Math.round(avg - (at - c.startedAt)));
  return Math.round(avg);
}

export class JobInsights {
  constructor(
    private readonly db: Db,
    private readonly runner: Pick<JobRunner, 'resolveModel'>,
  ) {}

  /** Extras for each job (non-writing jobs get nulls), keyed by id. */
  async forJobs(ctx: RequestCtx, jobs: readonly Job[], at = Date.now()): Promise<Map<string, JobExtras>> {
    const out = new Map<string, JobExtras>();
    const writing = jobs.filter((j) => WRITING_KINDS.has(j.kind));
    for (const j of jobs) out.set(j.id, { etaMs: null, model: null });
    if (writing.length === 0) return out;

    // Sibling groups: a parent's children, or a child's siblings.
    const parentIds = [...new Set(writing.map((j) => (j.kind === 'write_book' ? j.id : j.parentId)).filter((x): x is string => !!x))];
    const children: ChildRow[] =
      parentIds.length > 0
        ? (
            await this.db
              .selectFrom('jobs')
              .select(['id', 'parentId', 'status', 'startedAt', 'finishedAt'])
              .where('workspaceId', '=', ctx.workspaceId)
              .where('parentId', 'in', parentIds)
              .execute()
          ).map((r) => ({
            ...r,
            startedAt: r.startedAt === null ? null : Number(r.startedAt),
            finishedAt: r.finishedAt === null ? null : Number(r.finishedAt),
          }))
        : [];
    const byParent = new Map<string, ChildRow[]>();
    for (const c of children) {
      const list = byParent.get(c.parentId as string) ?? [];
      list.push(c);
      byParent.set(c.parentId as string, list);
    }

    // Latest writing-stage model per job (a parent takes its children's latest call).
    const jobIds = [...new Set([...writing.map((j) => j.id), ...children.map((c) => c.id)])];
    const runs = await this.db
      .selectFrom('promptRuns')
      .select(['jobId', 'modelSlug'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('jobId', 'in', jobIds)
      .where('stage', 'in', ['writing', 'weave'])
      .orderBy('id', 'desc')
      .execute();
    const modelOfJob = new Map<string, string>();
    for (const r of runs) if (r.jobId && !modelOfJob.has(r.jobId)) modelOfJob.set(r.jobId, r.modelSlug);

    const fallback = new Map<string, string | null>();
    const settingsModel = async (projectId: string | null): Promise<string | null> => {
      const key = projectId ?? '';
      if (!fallback.has(key)) fallback.set(key, await this.runner.resolveModel(ctx, projectId, 'writing'));
      return fallback.get(key) ?? null;
    };

    for (const j of writing) {
      const terminal = !ACTIVE.has(j.status);
      if (j.kind === 'write_book') {
        const kids = byParent.get(j.id) ?? [];
        const avg = averageMs(kids);
        const left = kids.map((c) => childEta(c, avg, at)).filter((x): x is number => x !== null);
        const etaMs = terminal || avg === null ? null : left.reduce((a, b) => a + b, 0);
        let model: string | null = null;
        // Newest child with a writing call (children are ULIDs, so id order is creation order).
        for (const c of [...kids].sort((a, b) => (a.id < b.id ? 1 : -1))) {
          const m = modelOfJob.get(c.id);
          if (m) {
            model = m;
            break;
          }
        }
        out.set(j.id, { etaMs, model: model ?? (await settingsModel(j.projectId)) });
      } else {
        const siblings = j.parentId ? (byParent.get(j.parentId) ?? []) : [];
        const avg = averageMs(siblings.filter((c) => c.id !== j.id));
        const etaMs = terminal ? null : childEta(j, avg, at);
        out.set(j.id, { etaMs, model: modelOfJob.get(j.id) ?? (await settingsModel(j.projectId)) });
      }
    }
    return out;
  }
}
