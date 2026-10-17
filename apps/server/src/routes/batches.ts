import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import type { RequestCtx } from '../auth/context.js';
import { AppError, parse } from '../http/errors.js';
import { assertQualityGate, qualityGate, type QualityGate } from '../jobs/quality-gate.js';
import { TERMINAL, type Job, type JobStatus } from '../jobs/queue.js';
import { BatchInputSchema, BatchPatchSchema, type Batch, type BatchItem } from '../repos/batches.js';
import type { TitleSlotView } from '../repos/schedule.js';
import { accepted, idOf, writer } from './common.js';

/** draft until the first start; then the status of the latest batch_run job. */
export type BatchStatus = 'draft' | JobStatus;

export interface BatchRun {
  status: JobStatus;
  progress: number;
  error: string | null;
}

export interface BatchSummary extends Batch {
  status: BatchStatus;
  progress: number;
  itemCount: number;
  readyCount: number;
  penNames: string[];
}

export interface BatchItemView extends BatchItem {
  /** The latest batch_book job for this book, or null before the first start. */
  run: BatchRun | null;
  slots: TitleSlotView[];
}

export interface BatchDetail extends BatchSummary {
  items: BatchItemView[];
  job: Job | null;
}

const ItemParams = z.object({ id: z.string().min(1).max(64), itemId: z.string().min(1).max(64) });
const StartBody = z
  .object({ chapterCount: z.number().int().min(1).max(60).optional() })
  .strict()
  .optional();

/** Volume mode batches (P8-2). Owner and editor plan and start; a viewer reads only. */
export function batchRoutes(app: FastifyInstance, s: AppServices): void {
  const r = s.repos.batches;

  const jobOf = async (ctx: RequestCtx, id: string | null): Promise<Job | null> => (id ? s.queue.get(ctx, id) : null);

  const summary = (batch: Batch, job: Job | null, items: BatchItem[]): BatchSummary => ({
    ...batch,
    status: job ? job.status : 'draft',
    progress: job ? job.progress : 0,
    itemCount: items.length,
    readyCount: items.filter((i) => i.status === 'ready').length,
    penNames: [...new Set(items.map((i) => i.book.penName))].sort(),
  });

  const detail = async (ctx: RequestCtx, batch: Batch): Promise<BatchDetail> => {
    const items = await r.items(ctx, batch.id);
    const job = await jobOf(ctx, batch.jobId);
    const slots = await s.repos.schedule.list(ctx, { bookIds: items.map((i) => i.bookId) });
    const views: BatchItemView[] = [];
    for (const item of items) {
      const run = await jobOf(ctx, item.jobId);
      views.push({
        ...item,
        run: run ? { status: run.status, progress: run.progress, error: run.error } : null,
        slots: slots.filter((x) => x.bookId === item.bookId),
      });
    }
    return { ...summary(batch, job, items), items: views, job };
  };

  /** Refuses changes while the batch's run is not finished. */
  const assertIdle = async (ctx: RequestCtx, batch: Batch): Promise<void> => {
    const job = await jobOf(ctx, batch.jobId);
    if (job && !TERMINAL.has(job.status)) throw new AppError('invalid_state', 'This batch is running. Cancel or wait for the run first.');
  };

  app.get('/batches', async (req) => {
    const batches = await r.list(req.ctx);
    const items = await r.items(req.ctx, null);
    const out: BatchSummary[] = [];
    for (const b of batches) {
      out.push(
        summary(
          b,
          await jobOf(req.ctx, b.jobId),
          items.filter((i) => i.batchId === b.id),
        ),
      );
    }
    return { items: out };
  });

  app.post('/batches', async (req, reply) => {
    writer(req);
    const batch = await r.create(req.ctx, parse(BatchInputSchema, req.body));
    void reply.code(201);
    return detail(req.ctx, batch);
  });

  app.get('/batches/:id', async (req) => detail(req.ctx, await r.require(req.ctx, idOf(req))));

  app.patch('/batches/:id', async (req) => {
    writer(req);
    const id = idOf(req);
    const patch = parse(BatchPatchSchema, req.body);
    await assertIdle(req.ctx, await r.require(req.ctx, id));
    return detail(req.ctx, await r.update(req.ctx, id, patch));
  });

  app.delete('/batches/:id', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    await assertIdle(req.ctx, await r.require(req.ctx, id));
    await r.remove(req.ctx, id);
    return reply.code(204).send();
  });

  // Runs every book that is not ready, one at a time, with the existing pipeline and the mock or live AI port.
  // Starting again after a failure skips finished work.
  app.post('/batches/:id/start', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(StartBody, req.body) ?? {};
    const batch = await r.require(req.ctx, id);
    await assertIdle(req.ctx, batch);
    const items = await r.items(req.ctx, id);
    if (items.length === 0) throw new AppError('invalid_state', 'Add books to the batch first.');
    const job = await s.queue.enqueue(req.ctx, { kind: 'batch_run', projectId: null, payload: { batchId: id, chapterCount: body.chapterCount ?? null } });
    await r.setJob(req.ctx, id, job.id);
    return { ...accepted(reply, job), batch: await detail(req.ctx, await r.require(req.ctx, id)) };
  });

  // The quality gate for every book in the batch (preflight blocks and open claims).
  app.get('/batches/:id/gates', async (req) => {
    const batch = await r.require(req.ctx, idOf(req));
    const out: { itemId: string; bookId: string; gate: QualityGate }[] = [];
    for (const item of await r.items(req.ctx, batch.id)) out.push({ itemId: item.id, bookId: item.bookId, gate: await qualityGate(s, req.ctx, item.bookId) });
    return { items: out };
  });

  // Marks a book ready only when preflight has no block and no claim is open (409 quality_gate otherwise).
  app.post('/batches/:id/items/:itemId/ready', async (req) => {
    writer(req);
    const p = parse(ItemParams, req.params);
    const item = await r.requireItem(req.ctx, p.id, p.itemId);
    await assertQualityGate(s, req.ctx, item.bookId, 'marked ready');
    await r.setItemStatus(req.ctx, item.id, 'ready');
    return r.requireItem(req.ctx, p.id, p.itemId);
  });
}
