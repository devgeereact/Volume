import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { ProjectsTable } from '../db/schema.js';
import { AppError, notFound } from '../http/errors.js';
import { bool, flag, fromJson, newId, now, toJson } from '../lib/util.js';

/** Steps of the book stepper (D-016). */
export const STAGES = ['idea', 'research', 'titles', 'blueprint', 'writing', 'editor', 'cover', 'export', 'marketing'] as const;
export type Stage = (typeof STAGES)[number];
export const BOOK_STATUSES = ['active', 'published', 'archived'] as const;
/** Paperback trims the API accepts (config/kdp-rules paperback.trimSizes.list, plus 8x10 kept from before). */
export const TRIMS = ['5x8', '5.25x8', '5.5x8.5', '6x9', '7x10', '8.5x11', '8x10', '8.5x8.5'] as const;

const AiDisclosureSchema = z.object({
  text: z.enum(['ai_generated', 'ai_assisted', 'none']),
  images: z.enum(['ai_generated', 'ai_assisted', 'none']),
  translation: z.enum(['ai_generated', 'ai_assisted', 'none']),
});
const DEFAULT_DISCLOSURE = { text: 'none', images: 'none', translation: 'none' } as const;

/** The Amazon store a book is listed on when the owner has not said otherwise. */
export const DEFAULT_MARKETPLACE = 'amazon.co.uk';

/** Owner-entered list prices in pounds, per format. Null clears a price. */
export const ListPricesSchema = z
  .object({
    ebook: z.number().min(0).max(1000).nullable().optional(),
    paperback: z.number().min(0).max(1000).nullable().optional(),
    hardcover: z.number().min(0).max(1000).nullable().optional(),
  })
  .strict();
export type ListPrices = { ebook: number | null; paperback: number | null; hardcover: number | null };
const EMPTY_PRICES: ListPrices = { ebook: null, paperback: null, hardcover: null };

function toPrices(json: string | null): ListPrices {
  const v = fromJson(ListPricesSchema, json, {});
  return { ebook: v.ebook ?? null, paperback: v.paperback ?? null, hardcover: v.hardcover ?? null };
}

/**
 * Book settings: free-form, with these checked keys.
 * - acknowledgements: the people the owner wants to thank (one per line, or a list). Without names the writer saves a
 *   placeholder for the owner instead of inventing family, colleagues or early readers.
 * - coverConcepts: how many cover concepts (one paid image each) the cover brief writes, 1 to 4, default 3.
 * - pov, tense: fiction point of view and tense, sent to the fiction blueprint and writer.
 */
export const BookSettingsSchema = z.looseObject({
  acknowledgements: z
    .union([z.string().max(5000), z.array(z.string().trim().min(1).max(300)).max(100)])
    .nullable()
    .optional(),
  coverConcepts: z.number().int().min(1).max(4).nullable().optional(),
  /** Fiction: point of view, for example "close third, Mara" or "first person". The template default when unset. */
  pov: z.string().trim().max(200).nullable().optional(),
  /** Fiction: narration tense. Past when unset (fiction.json voice.tense). */
  tense: z.enum(['past', 'present']).nullable().optional(),
});

export const BookInputSchema = z.object({
  profileId: z.string().min(1),
  bookTypeId: z.string().max(200).nullable().optional(),
  interiorThemeId: z.string().max(200).nullable().optional(),
  coverStyleId: z.string().max(200).nullable().optional(),
  template: z.string().min(1).max(64).optional(),
  idea: z.string().max(20000).nullable().optional(),
  notes: z.string().max(50000).nullable().optional(),
  title: z.string().max(255).nullable().optional(),
  subtitle: z.string().max(255).nullable().optional(),
  trim: z.enum(TRIMS).optional(),
  paper: z.enum(['white', 'cream']).optional(),
  isbnPaperback: z.string().max(20).nullable().optional(),
  isbnEbook: z.string().max(20).nullable().optional(),
  edition: z.string().max(100).nullable().optional(),
  publicationYear: z.number().int().min(1900).max(2200).nullable().optional(),
  illustrativeLine: z.boolean().optional(),
  wordTarget: z.number().int().min(0).max(1000000).nullable().optional(),
  settings: BookSettingsSchema.optional(),
  budgetUsd: z.number().min(0).max(10000).optional(),
});
export type BookInput = z.infer<typeof BookInputSchema>;
export const BookPatchSchema = BookInputSchema.omit({ profileId: true })
  .partial()
  .extend({
    stage: z.enum(STAGES).optional(),
    profileId: z.string().min(1).optional(),
    /** Pounds. Only the formats given change; null clears one. */
    listPrices: ListPricesSchema.optional(),
    /** For example amazon.co.uk. Null goes back to the default. */
    marketplace: z
      .string()
      .trim()
      .regex(/^amazon\.[a-z.]{2,12}$/i, 'Use a store such as amazon.co.uk')
      .max(40)
      .nullable()
      .optional(),
  });

export const BookListQuerySchema = z.object({
  profileId: z.string().optional(),
  stage: z.enum(STAGES).optional(),
  status: z.enum(BOOK_STATUSES).optional(),
  published: z.enum(['true', 'false']).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

/** ISBN-10 or ISBN-13 checksum check (D-010: validate, never generate). */
export function isValidIsbn(raw: string): boolean {
  const s = raw.replace(/[-\s]/g, '').toUpperCase();
  if (/^\d{13}$/.test(s)) {
    const sum = [...s].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }
  if (/^\d{9}[\dX]$/.test(s)) {
    const sum = [...s].reduce((acc, ch, i) => acc + (ch === 'X' ? 10 : Number(ch)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  return false;
}

export interface Book {
  id: string;
  profileId: string;
  bookTypeId: string | null;
  interiorThemeId: string | null;
  coverStyleId: string | null;
  template: string;
  idea: string | null;
  notes: string | null;
  title: string | null;
  subtitle: string | null;
  status: string;
  stage: string;
  trim: string;
  paper: string;
  isbnPaperback: string | null;
  isbnEbook: string | null;
  edition: string | null;
  publicationYear: number | null;
  illustrativeLine: boolean;
  aiDisclosure: z.infer<typeof AiDisclosureSchema>;
  wordTarget: number | null;
  settings: Record<string, unknown>;
  budgetUsd: number;
  costToDateUsd: number;
  approvedBlueprintId: string | null;
  publishedAt: number | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Owner-entered list prices in pounds (null when not entered). */
  listPrices: ListPrices;
  /** Amazon store, amazon.co.uk unless the owner changed it. */
  marketplace: string;
}

export function toBook(r: ProjectsTable): Book {
  return {
    id: r.id,
    profileId: r.profileId,
    bookTypeId: r.bookTypeId,
    interiorThemeId: r.interiorThemeId,
    coverStyleId: r.coverStyleId,
    template: r.template,
    idea: r.idea,
    notes: r.notes,
    title: r.title,
    subtitle: r.subtitle,
    status: r.status,
    stage: r.stage,
    trim: r.trim,
    paper: r.paper,
    isbnPaperback: r.isbnPaperback,
    isbnEbook: r.isbnEbook,
    edition: r.edition,
    publicationYear: r.publicationYear,
    illustrativeLine: bool(r.illustrativeLine),
    aiDisclosure: fromJson(AiDisclosureSchema, r.aiDisclosure, { ...DEFAULT_DISCLOSURE }),
    wordTarget: r.wordTarget,
    settings: fromJson(z.record(z.string(), z.unknown()), r.settings, {}),
    budgetUsd: Number(r.budgetUsd),
    costToDateUsd: Number(r.costToDateUsd),
    approvedBlueprintId: r.approvedBlueprintId,
    publishedAt: r.publishedAt === null ? null : Number(r.publishedAt),
    archivedAt: r.archivedAt === null ? null : Number(r.archivedAt),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
    listPrices: r.listPrices ? toPrices(r.listPrices) : { ...EMPTY_PRICES },
    marketplace: r.marketplace ?? DEFAULT_MARKETPLACE,
  };
}

function checkIsbns(input: { isbnPaperback?: string | null | undefined; isbnEbook?: string | null | undefined }): void {
  for (const [field, value] of [
    ['isbnPaperback', input.isbnPaperback],
    ['isbnEbook', input.isbnEbook],
  ] as const) {
    if (value && !isValidIsbn(value)) {
      throw new AppError('validation_failed', 'That ISBN does not pass its checksum. Copy it again from KDP or Nielsen.', [
        { path: field, message: 'invalid ISBN checksum' },
      ]);
    }
  }
}

/** Called when a book's stage changes (the app sends it to the event bus for the activity panel). */
export type StageListener = (ctx: RequestCtx, projectId: string, from: string, to: string) => Promise<void>;

export class BooksRepo {
  private stageListener: StageListener | null = null;

  constructor(private readonly db: Db) {}

  onStageChange(fn: StageListener): void {
    this.stageListener = fn;
  }

  private async stageChanged(ctx: RequestCtx, projectId: string, from: string, to: string): Promise<void> {
    if (from === to || !this.stageListener) return;
    await this.stageListener(ctx, projectId, from, to);
  }

  async list(ctx: RequestCtx, f: z.infer<typeof BookListQuerySchema>): Promise<Book[]> {
    let q = this.db.selectFrom('projects').selectAll().where('workspaceId', '=', ctx.workspaceId);
    if (f.profileId) q = q.where('profileId', '=', f.profileId);
    if (f.stage) q = q.where('stage', '=', f.stage);
    if (f.published === 'true') q = q.where('status', '=', 'published');
    else if (f.published === 'false') q = q.where('status', '=', 'active');
    else if (f.status) q = q.where('status', '=', f.status);
    else q = q.where('status', '!=', 'archived');
    if (f.q) {
      // Wildcards are stripped: SQLite and MySQL disagree on the default LIKE escape character.
      const like = `%${f.q.replace(/[%_\\]/g, '')}%`;
      q = q.where((eb) => eb.or([eb('title', 'like', like), eb('idea', 'like', like), eb('subtitle', 'like', like)]));
    }
    const rows = await q.orderBy('updatedAt', 'desc').limit(f.limit).offset(f.offset).execute();
    return rows.map(toBook);
  }

  async get(ctx: RequestCtx, id: string): Promise<Book | null> {
    const r = await this.db.selectFrom('projects').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    return r ? toBook(r) : null;
  }

  async require(ctx: RequestCtx, id: string): Promise<Book> {
    const b = await this.get(ctx, id);
    if (!b) throw notFound('Book');
    return b;
  }

  async create(ctx: RequestCtx, input: BookInput, defaults: { budgetUsd: number; illustrativeLine: boolean }): Promise<Book> {
    checkIsbns(input);
    const t = now();
    const id = newId();
    await this.db
      .insertInto('projects')
      .values({
        id,
        workspaceId: ctx.workspaceId,
        profileId: input.profileId,
        bookTypeId: input.bookTypeId ?? null,
        interiorThemeId: input.interiorThemeId ?? null,
        coverStyleId: input.coverStyleId ?? null,
        template: input.template ?? 'nonfiction',
        idea: input.idea ?? null,
        notes: input.notes ?? null,
        title: input.title ?? null,
        subtitle: input.subtitle ?? null,
        status: 'active',
        stage: 'idea',
        trim: input.trim ?? '6x9',
        paper: input.paper ?? 'white',
        isbnPaperback: input.isbnPaperback ?? null,
        isbnEbook: input.isbnEbook ?? null,
        edition: input.edition ?? 'First edition',
        publicationYear: input.publicationYear ?? null,
        illustrativeLine: flag(input.illustrativeLine ?? defaults.illustrativeLine),
        aiDisclosure: toJson(DEFAULT_DISCLOSURE),
        wordTarget: input.wordTarget ?? null,
        settings: toJson(input.settings ?? {}),
        budgetUsd: input.budgetUsd ?? defaults.budgetUsd,
        costToDateUsd: 0,
        approvedBlueprintId: null,
        publishedAt: null,
        archivedAt: null,
        createdAt: t,
        updatedAt: t,
      })
      .execute();
    return this.require(ctx, id);
  }

  async update(ctx: RequestCtx, id: string, patch: z.infer<typeof BookPatchSchema>): Promise<Book> {
    const before = await this.require(ctx, id);
    checkIsbns(patch);
    const set: Partial<ProjectsTable> = { updatedAt: now() };
    const direct = [
      'profileId',
      'bookTypeId',
      'interiorThemeId',
      'coverStyleId',
      'template',
      'idea',
      'notes',
      'title',
      'subtitle',
      'trim',
      'paper',
      'isbnPaperback',
      'isbnEbook',
      'edition',
      'publicationYear',
      'wordTarget',
      'budgetUsd',
      'stage',
    ] as const;
    for (const k of direct) {
      const v = patch[k];
      if (v !== undefined) (set as Record<string, unknown>)[k] = v;
    }
    if (patch.illustrativeLine !== undefined) set.illustrativeLine = flag(patch.illustrativeLine);
    if (patch.settings !== undefined) set.settings = toJson(patch.settings);
    if (patch.listPrices !== undefined) {
      const next: ListPrices = { ...before.listPrices };
      for (const k of ['ebook', 'paperback', 'hardcover'] as const) {
        const v = patch.listPrices[k];
        if (v !== undefined) next[k] = v === null ? null : Math.round(v * 100) / 100;
      }
      set.listPrices = toJson(next);
    }
    if (patch.marketplace !== undefined) set.marketplace = patch.marketplace === null ? null : patch.marketplace.toLowerCase();
    await this.db.updateTable('projects').set(set).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    if (patch.stage !== undefined) await this.stageChanged(ctx, id, before.stage, patch.stage);
    return this.require(ctx, id);
  }

  /** Moves the stage forward only (never back), for job results. */
  async advanceStage(ctx: RequestCtx, id: string, stage: Stage): Promise<void> {
    const b = await this.require(ctx, id);
    if (STAGES.indexOf(stage) > STAGES.indexOf(b.stage as Stage)) {
      await this.db.updateTable('projects').set({ stage, updatedAt: now() }).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
      await this.stageChanged(ctx, id, b.stage, stage);
    }
  }

  async setStatus(ctx: RequestCtx, id: string, action: 'archive' | 'restore' | 'publish' | 'unpublish'): Promise<Book> {
    const b = await this.require(ctx, id);
    const t = now();
    const set: Partial<ProjectsTable> = { updatedAt: t };
    if (action === 'archive') {
      set.status = 'archived';
      set.archivedAt = t;
    } else if (action === 'restore') {
      set.status = b.publishedAt ? 'published' : 'active';
      set.archivedAt = null;
    } else if (action === 'publish') {
      if (b.status === 'archived') throw new AppError('invalid_state', 'Restore the book before marking it as published.');
      set.status = 'published';
      set.publishedAt = b.publishedAt ?? t;
    } else {
      set.status = 'active';
      set.publishedAt = null;
    }
    await this.db.updateTable('projects').set(set).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    return this.require(ctx, id);
  }

  async setAiDisclosure(ctx: RequestCtx, id: string, part: 'text' | 'images', value: 'ai_generated'): Promise<void> {
    const b = await this.require(ctx, id);
    if (b.aiDisclosure[part] === value) return;
    await this.db
      .updateTable('projects')
      .set({ aiDisclosure: toJson({ ...b.aiDisclosure, [part]: value }), updatedAt: now() })
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
  }

  /** Sets one key of the book's settings, keeping the others (jobs use it for picture-book state). */
  async setSetting(ctx: RequestCtx, id: string, key: string, value: unknown): Promise<void> {
    const b = await this.require(ctx, id);
    await this.db
      .updateTable('projects')
      .set({ settings: toJson({ ...b.settings, [key]: value }), updatedAt: now() })
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
  }

  async setApprovedBlueprint(ctx: RequestCtx, id: string, blueprintId: string, title: string | null, subtitle: string | null): Promise<void> {
    const set: Partial<ProjectsTable> = { approvedBlueprintId: blueprintId, updatedAt: now() };
    if (title) set.title = title;
    if (subtitle !== null) set.subtitle = subtitle;
    await this.db.updateTable('projects').set(set).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
  }

  /** Adds AI spend to the book. Called in the same transaction as the prompt_runs insert. */
  async addCost(db: Db, ctx: RequestCtx, id: string, usd: number): Promise<void> {
    await db
      .updateTable('projects')
      .set((eb) => ({ costToDateUsd: eb('costToDateUsd', '+', usd), updatedAt: now() }))
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
  }

  /**
   * Deletes an archived book for good after the owner typed its exact title (docs/03, Deletes). Child rows go
   * with the project (on delete cascade); its files, jobs and events are removed here. AI spend rows stay
   * (unlinked) so the month's spend stays right.
   */
  async deleteArchived(ctx: RequestCtx, id: string, confirm: string): Promise<void> {
    const b = await this.require(ctx, id);
    if (b.status !== 'archived') throw new AppError('invalid_state', 'Archive the book before deleting it.');
    const name = (b.title ?? b.idea ?? 'Untitled').trim();
    if (confirm.trim() !== name) throw new AppError('invalid_state', `Type the book's exact title (${name}) to delete it.`);
    const active = await this.db
      .selectFrom('jobs')
      .select('id')
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', id)
      .where('status', 'in', ['queued', 'running', 'waiting'])
      .executeTakeFirst();
    if (active) throw new AppError('invalid_state', 'A job is still running for this book. Cancel it, then delete the book.');
    await this.db.transaction().execute(async (trx) => {
      const w = ctx.workspaceId;
      await trx.deleteFrom('projects').where('id', '=', id).where('workspaceId', '=', w).execute();
      await trx.deleteFrom('assets').where('projectId', '=', id).where('workspaceId', '=', w).execute();
      await trx.deleteFrom('jobEvents').where('projectId', '=', id).where('workspaceId', '=', w).execute();
      await trx.deleteFrom('jobs').where('projectId', '=', id).where('workspaceId', '=', w).execute();
      await trx.updateTable('promptRuns').set({ projectId: null, jobId: null }).where('projectId', '=', id).where('workspaceId', '=', w).execute();
    });
  }

  async insertCopy(ctx: RequestCtx, source: Book, overrides: Partial<ProjectsTable>): Promise<Book> {
    const t = now();
    const id = newId();
    await this.db
      .insertInto('projects')
      .values({
        id,
        workspaceId: ctx.workspaceId,
        profileId: source.profileId,
        bookTypeId: source.bookTypeId,
        interiorThemeId: source.interiorThemeId,
        coverStyleId: source.coverStyleId,
        template: source.template,
        idea: source.idea,
        notes: source.notes,
        title: source.title ? `Copy of ${source.title}`.slice(0, 255) : null,
        subtitle: source.subtitle,
        status: 'active',
        stage: source.stage,
        trim: source.trim,
        paper: source.paper,
        isbnPaperback: null,
        isbnEbook: null,
        edition: source.edition,
        publicationYear: source.publicationYear,
        illustrativeLine: flag(source.illustrativeLine),
        aiDisclosure: toJson(source.aiDisclosure),
        wordTarget: source.wordTarget,
        settings: toJson(source.settings),
        budgetUsd: source.budgetUsd,
        costToDateUsd: 0,
        approvedBlueprintId: null,
        publishedAt: null,
        archivedAt: null,
        createdAt: t,
        updatedAt: t,
        ...overrides,
      })
      .execute();
    return this.require(ctx, id);
  }
}
