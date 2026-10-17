import { checkTitleSlot, TITLE_FORMATS, type TitleCreationLimit, type TitleFormat, type TitleSlot } from '@volume/core';
import { MysqlAdapter } from 'kysely';
import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { TitleSlotsTable } from '../db/schema.js';
import { AppError, notFound } from '../http/errors.js';
import { affected, newId, now } from '../lib/util.js';

/** Title slots (P8-2, D-046): planned releases per book and format. Every method stays inside ctx.workspaceId. */

export const SLOT_STATUSES = ['planned', 'confirmed'] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

/** Times are epoch milliseconds (UTC). Bounds keep them to real dates (2000 to 2100). */
const Ms = z.number().int().min(946_684_800_000).max(4_102_444_800_000);

export const SlotInputSchema = z
  .object({
    bookId: z.string().min(1).max(64),
    format: z.enum(TITLE_FORMATS),
    plannedAt: Ms,
    batchId: z.string().min(1).max(64).nullable().optional(),
  })
  .strict();

export const ScheduleQuerySchema = z
  .object({
    from: z.coerce.number().pipe(Ms).optional(),
    to: z.coerce.number().pipe(Ms).optional(),
  })
  .refine((q) => q.from === undefined || q.to === undefined || q.from <= q.to, { message: 'from must not be after to.' });

export interface TitleSlotView {
  id: string;
  bookId: string;
  batchId: string | null;
  format: TitleFormat;
  plannedAt: number;
  status: SlotStatus;
  confirmedAt: number | null;
  createdAt: number;
  book: { title: string | null; idea: string | null; profileId: string; penName: string };
}

/** The limit as the API reports it: the numbers from the rules file plus where they came from. */
export type TitleLimitInfo = TitleCreationLimit & { ruleId: string; rulesVersion: string };

/** Body of the 409 title_limit answer. */
export interface TitleLimitDetails {
  conflicts: TitleSlotView[];
  nextFreeAt: number;
  limit: TitleLimitInfo;
}

type SlotRow = Pick<TitleSlotsTable, 'id' | 'projectId' | 'batchId' | 'format' | 'plannedAt' | 'status' | 'confirmedAt' | 'createdAt'> & {
  title: string | null;
  idea: string | null;
  profileId: string;
  penName: string;
};

function toView(r: SlotRow): TitleSlotView {
  return {
    id: r.id,
    bookId: r.projectId,
    batchId: r.batchId,
    format: r.format as TitleFormat,
    plannedAt: Number(r.plannedAt),
    status: r.status as SlotStatus,
    confirmedAt: r.confirmedAt === null ? null : Number(r.confirmedAt),
    createdAt: Number(r.createdAt),
    book: { title: r.title, idea: r.idea, profileId: r.profileId, penName: r.penName },
  };
}

export class ScheduleRepo {
  constructor(private readonly db: Db) {}

  private base(ctx: RequestCtx) {
    return this.db
      .selectFrom('titleSlots as s')
      .innerJoin('projects as p', (j) => j.onRef('p.id', '=', 's.projectId').onRef('p.workspaceId', '=', 's.workspaceId'))
      .innerJoin('authorProfiles as a', (j) => j.onRef('a.id', '=', 'p.profileId').onRef('a.workspaceId', '=', 'p.workspaceId'))
      .select([
        's.id',
        's.projectId',
        's.batchId',
        's.format',
        's.plannedAt',
        's.status',
        's.confirmedAt',
        's.createdAt',
        'p.title',
        'p.idea',
        'p.profileId',
        'a.penName',
      ])
      .where('s.workspaceId', '=', ctx.workspaceId);
  }

  async list(ctx: RequestCtx, f: { from?: number | undefined; to?: number | undefined; bookIds?: string[] } = {}): Promise<TitleSlotView[]> {
    let q = this.base(ctx);
    if (f.from !== undefined) q = q.where('s.plannedAt', '>=', f.from);
    if (f.to !== undefined) q = q.where('s.plannedAt', '<=', f.to);
    if (f.bookIds) {
      if (f.bookIds.length === 0) return [];
      q = q.where('s.projectId', 'in', f.bookIds);
    }
    const rows = await q.orderBy('s.plannedAt').orderBy('s.id').execute();
    return rows.map(toView);
  }

  async require(ctx: RequestCtx, id: string): Promise<TitleSlotView> {
    const row = await this.base(ctx).where('s.id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Title slot');
    return toView(row);
  }

  /**
   * Adds a planned slot unless the same format already has `limit` titles inside a rolling window around it
   * (checkTitleSlot, D-046). All pen names in the workspace share the limit: one workspace is one KDP account.
   * The check and the insert run in one transaction, behind a per-workspace lock on MySQL.
   */
  async add(ctx: RequestCtx, input: z.infer<typeof SlotInputSchema>, limit: TitleLimitInfo): Promise<TitleSlotView> {
    const book = await this.db
      .selectFrom('projects')
      .select(['id', 'status'])
      .where('id', '=', input.bookId)
      .where('workspaceId', '=', ctx.workspaceId)
      .executeTakeFirst();
    if (!book) throw notFound('Book');
    if (book.status === 'archived') throw new AppError('invalid_state', 'Restore this book before planning its release.');
    if (input.batchId) {
      const item = await this.db
        .selectFrom('batchItems')
        .select('id')
        .where('workspaceId', '=', ctx.workspaceId)
        .where('batchId', '=', input.batchId)
        .where('projectId', '=', input.bookId)
        .executeTakeFirst();
      if (!item) throw new AppError('validation_failed', 'That book is not in that batch.');
    }
    const id = newId();
    let refused = null as { ids: string[]; nextFreeAt: number } | null;
    await this.db.transaction().execute(async (trx) => {
      // One writer per workspace for the check and the insert. MySQL: lock the workspace row (InnoDB row lock held
      // to commit), so two parallel adds cannot both pass the limit. SQLite serialises writers on one connection.
      if (this.db.getExecutor().adapter instanceof MysqlAdapter) {
        await trx.selectFrom('workspaces').select('id').where('id', '=', ctx.workspaceId).forUpdate().execute();
      }
      const same = await trx
        .selectFrom('titleSlots')
        .select(['id', 'projectId', 'format', 'plannedAt'])
        .where('workspaceId', '=', ctx.workspaceId)
        .where('format', '=', input.format)
        .execute();
      if (same.some((s) => s.projectId === input.bookId)) {
        throw new AppError('conflict', 'This book already has a slot for that format. Remove it first to move it.');
      }
      const existing: (TitleSlot & { id: string })[] = same.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        format: s.format as TitleFormat,
        plannedAt: Number(s.plannedAt),
      }));
      const check = checkTitleSlot(existing, { projectId: input.bookId, format: input.format, plannedAt: input.plannedAt }, limit);
      if (!check.ok) {
        // Looked up after the transaction: on SQLite a query outside it would wait for it.
        refused = { ids: existing.filter((e) => check.conflicts.some((c) => c.projectId === e.projectId)).map((e) => e.id), nextFreeAt: check.nextFreeAt };
        return;
      }
      const t = now();
      await trx
        .insertInto('titleSlots')
        .values({
          id,
          workspaceId: ctx.workspaceId,
          projectId: input.bookId,
          batchId: input.batchId ?? null,
          format: input.format,
          plannedAt: input.plannedAt,
          status: 'planned',
          confirmedAt: null,
          createdBy: ctx.userId,
          createdAt: t,
          updatedAt: t,
        })
        .execute();
    });
    if (refused) {
      const { ids, nextFreeAt } = refused;
      const conflicts = ids.length === 0 ? [] : (await this.base(ctx).where('s.id', 'in', ids).orderBy('s.plannedAt').execute()).map(toView);
      const details: TitleLimitDetails = { conflicts, nextFreeAt, limit };
      throw new AppError(
        'title_limit',
        `KDP allows ${limit.maxNewTitlesPerFormat} new ${input.format} titles in any ${limit.periodDays} days for one account. The next free time is ${new Date(nextFreeAt).toISOString()}.`,
        details,
      );
    }
    return this.require(ctx, id);
  }

  async confirm(ctx: RequestCtx, id: string): Promise<TitleSlotView> {
    const t = now();
    await this.db
      .updateTable('titleSlots')
      .set({ status: 'confirmed', confirmedAt: t, updatedAt: t })
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
    return this.require(ctx, id);
  }

  async remove(ctx: RequestCtx, id: string): Promise<void> {
    const res = await this.db.deleteFrom('titleSlots').where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (affected(res) !== 1) throw notFound('Title slot');
  }
}
