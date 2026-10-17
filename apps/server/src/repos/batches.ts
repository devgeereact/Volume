import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { BatchesTable, BatchItemsTable } from '../db/schema.js';
import { AppError, notFound } from '../http/errors.js';
import { newId, now } from '../lib/util.js';

/** Volume mode batches (P8-2). Every method stays inside ctx.workspaceId. */

export const BATCH_ITEM_STATUSES = ['planned', 'ready'] as const;
export type BatchItemStatus = (typeof BATCH_ITEM_STATUSES)[number];
/** Upper bound per batch: batches run one book at a time in the one server process (plan section 6). */
export const MAX_BATCH_BOOKS = 50;

const BookIds = z.array(z.string().min(1).max(64)).max(MAX_BATCH_BOOKS);

export const BatchInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    notes: z.string().max(4000).nullable().optional(),
    bookIds: BookIds.min(1),
  })
  .strict();

export const BatchPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(4000).nullable().optional(),
    addBookIds: BookIds.optional(),
    removeBookIds: BookIds.optional(),
  })
  .strict();

export interface Batch {
  id: string;
  name: string;
  notes: string | null;
  jobId: string | null;
  startedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface BatchItem {
  id: string;
  batchId: string;
  bookId: string;
  position: number;
  status: BatchItemStatus;
  jobId: string | null;
  readyAt: number | null;
  /** What the planner shows per book; never another workspace's data (joined inside the workspace). */
  book: { title: string | null; idea: string | null; stage: string; status: string; profileId: string; penName: string };
}

function toBatch(r: BatchesTable): Batch {
  return {
    id: r.id,
    name: r.name,
    notes: r.notes,
    jobId: r.jobId,
    startedAt: r.startedAt === null ? null : Number(r.startedAt),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  };
}

type ItemRow = Pick<BatchItemsTable, 'id' | 'batchId' | 'projectId' | 'position' | 'status' | 'jobId' | 'readyAt'> & {
  title: string | null;
  idea: string | null;
  stage: string;
  bookStatus: string;
  profileId: string;
  penName: string;
};

function toItem(r: ItemRow): BatchItem {
  return {
    id: r.id,
    batchId: r.batchId,
    bookId: r.projectId,
    position: Number(r.position),
    status: r.status as BatchItemStatus,
    jobId: r.jobId,
    readyAt: r.readyAt === null ? null : Number(r.readyAt),
    book: { title: r.title, idea: r.idea, stage: r.stage, status: r.bookStatus, profileId: r.profileId, penName: r.penName },
  };
}

/** Records once, on the book itself, that it joined a batch (never cleared). */
async function markBatched(trx: Db, ctx: RequestCtx, bookIds: string[], t: number): Promise<void> {
  if (bookIds.length === 0) return;
  await trx
    .updateTable('projects')
    .set({ batchedAt: t })
    .where('workspaceId', '=', ctx.workspaceId)
    .where('id', 'in', bookIds)
    .where('batchedAt', 'is', null)
    .execute();
}

export class BatchesRepo {
  constructor(private readonly db: Db) {}

  async list(ctx: RequestCtx): Promise<Batch[]> {
    const rows = await this.db
      .selectFrom('batches')
      .selectAll()
      .where('workspaceId', '=', ctx.workspaceId)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .execute();
    return rows.map(toBatch);
  }

  async get(ctx: RequestCtx, id: string): Promise<Batch | null> {
    const row = await this.db.selectFrom('batches').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    return row ? toBatch(row) : null;
  }

  async require(ctx: RequestCtx, id: string): Promise<Batch> {
    const b = await this.get(ctx, id);
    if (!b) throw notFound('Batch');
    return b;
  }

  /** Items of one batch, or of every batch when batchId is null, in batch order. */
  async items(ctx: RequestCtx, batchId: string | null): Promise<BatchItem[]> {
    let q = this.db
      .selectFrom('batchItems as i')
      .innerJoin('projects as p', (j) => j.onRef('p.id', '=', 'i.projectId').onRef('p.workspaceId', '=', 'i.workspaceId'))
      .innerJoin('authorProfiles as a', (j) => j.onRef('a.id', '=', 'p.profileId').onRef('a.workspaceId', '=', 'p.workspaceId'))
      .select([
        'i.id',
        'i.batchId',
        'i.projectId',
        'i.position',
        'i.status',
        'i.jobId',
        'i.readyAt',
        'p.title',
        'p.idea',
        'p.stage',
        'p.status as bookStatus',
        'p.profileId',
        'a.penName',
      ])
      .where('i.workspaceId', '=', ctx.workspaceId);
    if (batchId !== null) q = q.where('i.batchId', '=', batchId);
    const rows = await q.orderBy('i.batchId').orderBy('i.position').execute();
    return rows.map(toItem);
  }

  async requireItem(ctx: RequestCtx, batchId: string, itemId: string): Promise<BatchItem> {
    const item = (await this.items(ctx, batchId)).find((i) => i.id === itemId);
    if (!item) throw notFound('Batch item');
    return item;
  }

  /** The batch item for a book, or null when the book is in no batch. */
  async itemOfBook(ctx: RequestCtx, bookId: string): Promise<{ id: string; batchId: string } | null> {
    const row = await this.db
      .selectFrom('batchItems')
      .select(['id', 'batchId'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', bookId)
      .executeTakeFirst();
    return row ?? null;
  }

  /**
   * True when the book is in a batch now or ever was (projects.batched_at). Publish and pack run the quality gate for
   * every such book, so taking a book out of its batch cannot skip preflight or the claims review.
   */
  async everBatched(ctx: RequestCtx, bookId: string): Promise<boolean> {
    const row = await this.db.selectFrom('projects').select('batchedAt').where('workspaceId', '=', ctx.workspaceId).where('id', '=', bookId).executeTakeFirst();
    if (row && row.batchedAt !== null) return true;
    return (await this.itemOfBook(ctx, bookId)) !== null;
  }

  /** Every id must be a book of this workspace (404 otherwise) and in no other batch (409 otherwise). */
  private async checkBooks(ctx: RequestCtx, bookIds: string[], batchId: string | null): Promise<void> {
    const unique = [...new Set(bookIds)];
    if (unique.length !== bookIds.length) throw new AppError('validation_failed', 'A book is listed twice.');
    if (unique.length === 0) return;
    const found = await this.db.selectFrom('projects').select(['id', 'status']).where('workspaceId', '=', ctx.workspaceId).where('id', 'in', unique).execute();
    if (found.length !== unique.length) throw notFound('Book');
    if (found.some((b) => b.status === 'archived')) throw new AppError('invalid_state', 'Restore archived books before adding them to a batch.');
    const taken = await this.db
      .selectFrom('batchItems')
      .select(['projectId', 'batchId'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', 'in', unique)
      .execute();
    const elsewhere = taken.filter((t) => t.batchId !== batchId);
    if (elsewhere.length > 0) {
      throw new AppError('conflict', 'A book can be in one batch at a time.', { bookIds: elsewhere.map((t) => t.projectId) });
    }
  }

  async create(ctx: RequestCtx, input: z.infer<typeof BatchInputSchema>): Promise<Batch> {
    await this.checkBooks(ctx, input.bookIds, null);
    const t = now();
    const id = newId();
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('batches')
        .values({
          id,
          workspaceId: ctx.workspaceId,
          name: input.name,
          notes: input.notes ?? null,
          jobId: null,
          createdBy: ctx.userId,
          startedAt: null,
          createdAt: t,
          updatedAt: t,
        })
        .execute();
      let position = 0;
      for (const projectId of input.bookIds) {
        position += 1;
        await trx
          .insertInto('batchItems')
          .values({
            id: newId(),
            workspaceId: ctx.workspaceId,
            batchId: id,
            projectId,
            position,
            status: 'planned',
            jobId: null,
            readyAt: null,
            createdAt: t,
            updatedAt: t,
          })
          .execute();
      }
      await markBatched(trx, ctx, input.bookIds, t);
    });
    return this.require(ctx, id);
  }

  async update(ctx: RequestCtx, id: string, patch: z.infer<typeof BatchPatchSchema>): Promise<Batch> {
    await this.require(ctx, id);
    const add = patch.addBookIds ?? [];
    const remove = new Set(patch.removeBookIds ?? []);
    if (add.some((b) => remove.has(b))) throw new AppError('validation_failed', 'A book cannot be added and removed at once.');
    const current = await this.items(ctx, id);
    const already = new Set(current.map((i) => i.bookId));
    const fresh = add.filter((b) => !already.has(b));
    await this.checkBooks(ctx, fresh, id);
    const t = now();
    await this.db.transaction().execute(async (trx) => {
      const set: Partial<BatchesTable> = { updatedAt: t };
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.notes !== undefined) set.notes = patch.notes;
      await trx.updateTable('batches').set(set).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
      if (remove.size > 0) {
        await trx
          .deleteFrom('batchItems')
          .where('workspaceId', '=', ctx.workspaceId)
          .where('batchId', '=', id)
          .where('projectId', 'in', [...remove])
          .execute();
      }
      let position = Math.max(0, ...current.map((i) => i.position));
      for (const projectId of fresh) {
        position += 1;
        await trx
          .insertInto('batchItems')
          .values({
            id: newId(),
            workspaceId: ctx.workspaceId,
            batchId: id,
            projectId,
            position,
            status: 'planned',
            jobId: null,
            readyAt: null,
            createdAt: t,
            updatedAt: t,
          })
          .execute();
      }
      await markBatched(trx, ctx, fresh, t);
    });
    return this.require(ctx, id);
  }

  async remove(ctx: RequestCtx, id: string): Promise<void> {
    await this.require(ctx, id);
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('titleSlots')
        .set({ batchId: null, updatedAt: now() })
        .where('workspaceId', '=', ctx.workspaceId)
        .where('batchId', '=', id)
        .execute();
      await trx.deleteFrom('batchItems').where('workspaceId', '=', ctx.workspaceId).where('batchId', '=', id).execute();
      await trx.deleteFrom('batches').where('workspaceId', '=', ctx.workspaceId).where('id', '=', id).execute();
    });
  }

  async setJob(ctx: RequestCtx, id: string, jobId: string): Promise<void> {
    const t = now();
    await this.db.updateTable('batches').set({ jobId, startedAt: t, updatedAt: t }).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
  }

  async setItemJob(ctx: RequestCtx, itemId: string, jobId: string): Promise<void> {
    await this.db.updateTable('batchItems').set({ jobId, updatedAt: now() }).where('id', '=', itemId).where('workspaceId', '=', ctx.workspaceId).execute();
  }

  async setItemStatus(ctx: RequestCtx, itemId: string, status: BatchItemStatus): Promise<void> {
    const t = now();
    await this.db
      .updateTable('batchItems')
      .set({ status, readyAt: status === 'ready' ? t : null, updatedAt: t })
      .where('id', '=', itemId)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
  }
}
