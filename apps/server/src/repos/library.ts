import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import { fromJson, now } from '../lib/util.js';
import type { Book } from './books.js';

/**
 * Read models for the Library: list row extras (words, sections, running job, cover, published
 * formats), the workspace activity feed and the archive. Read only; every query filters by workspace.
 */

export type PublishedFormatName = 'Paperback' | 'Kindle eBook' | 'Hardcover';

export interface PublishedFormat {
  format: PublishedFormatName;
  kind: 'paperback' | 'ebook' | 'hardcover';
  /** Owner-entered list price in pounds, or null. */
  listPriceGbp: number | null;
  /** Interior page count (paperback only). */
  pages: number | null;
  /** The export files behind this format, for example ['epub', 'docx']. */
  exportKinds: string[];
}

export interface BookExtras {
  /** Sum of the current version word counts of the sections that are switched on. */
  wordCount: number;
  /** Sections switched on. */
  sectionCount: number;
  /** A job for this book is queued, running or waiting for its parts. */
  jobRunning: boolean;
  /** The chosen cover concept's asset, when one is chosen. */
  coverAssetId: string | null;
  /** The finished eBook cover (built or the owner's own upload), when there is one. Thumbnails prefer it. */
  coverEbookAssetId: string | null;
  /** Formats from the latest export job (paperback from the print PDF, Kindle eBook from EPUB or DOCX). */
  formats: PublishedFormat[];
  /** How many upload packs were built for this book (0 when none). */
  packVersion: number;
  /** The newest top-level job that is queued, running, waiting, paused or paused for budget, or null. */
  runningJob: { id: string; kind: string; status: string; progress: number } | null;
}

const EMPTY: BookExtras = {
  wordCount: 0,
  sectionCount: 0,
  jobRunning: false,
  coverAssetId: null,
  coverEbookAssetId: null,
  formats: [],
  packVersion: 0,
  runningJob: null,
};
const ACTIVE_JOB = ['queued', 'running', 'waiting'];

export type ActivityKind = 'book_created' | 'stage_changed' | 'job_finished' | 'job_failed' | 'export_built' | 'published';

export interface ActivityItem {
  /** job_events id, or book:<id>:created / book:<id>:published for events read from books. */
  id: string;
  kind: ActivityKind;
  at: number;
  projectId: string | null;
  jobId: string | null;
  /** Book title (or idea), "Untitled" when it has neither. */
  title: string;
  /** One plain line, for example "Blueprint finished" or "Moved to Writing". */
  detail: string;
  /** Happened in the last five minutes. */
  live: boolean;
  /** For job_failed: the job's error code (for example ai_credits), so the UI can explain it in plain words. */
  errorCode?: string | null;
}

export interface ArchiveItem {
  kind: 'book' | 'profile' | 'marketing';
  id: string;
  title: string;
  detail: string;
  archivedAt: number;
  /** The book a marketing item belongs to. */
  projectId: string | null;
  /** POST here (under /api/v1) to restore it. */
  restorePath: string;
}

const JOB_LABEL: Readonly<Record<string, string>> = {
  research: 'Research',
  titles: 'Title ideas',
  blueprint: 'Blueprint',
  blueprint_part: 'Blueprint part',
  write_book: 'Writing the book',
  rebuild_book: 'Rebuilding the book',
  write_section: 'Writing a section',
  weave_notes: 'Weaving in notes',
  edit_pass: 'Editor pass',
  cover_concepts: 'Cover concepts',
  cover_build: 'Cover files',
  marketing: 'Marketing pack',
  export_pack: 'Export',
  rewrite_selection: 'Rewrite of a selection',
  claim_fix: 'Claim fix options',
  noop: 'Job',
};

const STAGE_LABEL: Readonly<Record<string, string>> = {
  idea: 'Idea',
  research: 'Research',
  titles: 'Titles',
  blueprint: 'Blueprint',
  writing: 'Writing',
  editor: 'Editor',
  cover: 'Cover',
  export: 'Export',
  marketing: 'Marketing',
};

const MARKETING_LABEL: Readonly<Record<string, string>> = {
  tiktok_script: 'TikTok script',
  instagram_caption: 'Instagram caption',
  launch_email: 'Launch email',
};

const EventData = z.looseObject({
  kind: z.string().optional(),
  status: z.string().optional(),
  error: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  stage: z.string().optional(),
  from: z.string().optional(),
  part: z.string().optional(),
});

const LIVE_MS = 5 * 60 * 1000;

function titleOf(b: { title: string | null; idea: string | null } | undefined): string {
  const t = b?.title?.trim() || b?.idea?.trim();
  return t ? t.slice(0, 200) : 'Untitled';
}

function clip(text: string, max = 80): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export class LibraryRepo {
  constructor(private readonly db: Db) {}

  /** Extras for a page of books, in a fixed number of queries. */
  async extras(ctx: RequestCtx, books: readonly Pick<Book, 'id' | 'listPrices'>[]): Promise<Map<string, BookExtras>> {
    const out = new Map<string, BookExtras>();
    const ids = books.map((b) => b.id);
    if (ids.length === 0) return out;
    for (const id of ids) out.set(id, { ...EMPTY, formats: [] });

    const words = await this.db
      .selectFrom('sections as s')
      .leftJoin('sectionVersions as v', 'v.id', 's.currentVersionId')
      .select((eb) => ['s.projectId', eb.fn.countAll<number>().as('n'), eb.fn.sum<number>('v.wordCount').as('words')])
      .where('s.workspaceId', '=', ctx.workspaceId)
      .where('s.projectId', 'in', ids)
      .where('s.enabled', '=', 1)
      .groupBy('s.projectId')
      .execute();
    for (const w of words) {
      const e = out.get(w.projectId);
      if (e) {
        e.sectionCount = Number(w.n);
        e.wordCount = Number(w.words ?? 0);
      }
    }

    const running = await this.db
      .selectFrom('jobs')
      .select('projectId')
      .distinct()
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', 'in', ids)
      .where('status', 'in', ACTIVE_JOB)
      .execute();
    for (const r of running)
      if (r.projectId) {
        const e = out.get(r.projectId);
        if (e) e.jobRunning = true;
      }

    const live = await this.db
      .selectFrom('jobs')
      .select(['id', 'projectId', 'kind', 'status', 'progress'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', 'in', ids)
      .where('parentId', 'is', null)
      .where('status', 'in', ['queued', 'running', 'waiting', 'paused', 'paused_budget'])
      .orderBy('id', 'desc')
      .execute();
    for (const j of live)
      if (j.projectId) {
        const e = out.get(j.projectId);
        if (e && !e.runningJob) e.runningJob = { id: j.id, kind: j.kind, status: j.status, progress: Number(j.progress) };
      }

    const covers = await this.db
      .selectFrom('covers')
      .select(['projectId', 'chosenAssetId', 'ebookAssetId'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', 'in', ids)
      .execute();
    for (const c of covers) {
      const e = out.get(c.projectId);
      if (!e) continue;
      e.coverAssetId = c.chosenAssetId;
      e.coverEbookAssetId = c.ebookAssetId;
    }

    const exports = await this.db
      .selectFrom('exports')
      .select(['id', 'projectId', 'kind', 'jobId', 'pageCount'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', 'in', ids)
      .where('status', '=', 'done')
      .orderBy('id', 'desc')
      .execute();
    const byBook = new Map<string, typeof exports>();
    for (const x of exports) {
      const list = byBook.get(x.projectId) ?? [];
      list.push(x);
      byBook.set(x.projectId, list);
    }
    for (const b of books) {
      const e = out.get(b.id);
      const list = byBook.get(b.id);
      if (!e || !list) continue;
      e.packVersion = list.filter((x) => x.kind === 'pack').length;
      const latestJob = list.find((x) => x.kind !== 'pack')?.jobId ?? null;
      const latest = list.filter((x) => x.kind !== 'pack' && x.jobId === latestJob);
      const pdf = latest.find((x) => x.kind === 'pdf_print');
      if (pdf)
        e.formats.push({ format: 'Paperback', kind: 'paperback', listPriceGbp: b.listPrices.paperback, pages: pdf.pageCount, exportKinds: ['pdf_print'] });
      const ebookKinds = latest.filter((x) => x.kind === 'epub' || x.kind === 'docx').map((x) => x.kind);
      if (ebookKinds.length)
        e.formats.push({ format: 'Kindle eBook', kind: 'ebook', listPriceGbp: b.listPrices.ebook, pages: null, exportKinds: [...new Set(ebookKinds)].sort() });
    }
    return out;
  }

  async extrasFor(ctx: RequestCtx, book: Pick<Book, 'id' | 'listPrices'>): Promise<BookExtras> {
    return (await this.extras(ctx, [book])).get(book.id) ?? { ...EMPTY, formats: [] };
  }

  /** Recent workspace events, newest first. */
  async activity(ctx: RequestCtx, limit: number): Promise<ActivityItem[]> {
    const t = now();
    const events = await this.db
      .selectFrom('jobEvents')
      .select(['id', 'projectId', 'jobId', 'type', 'data', 'createdAt'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where((eb) =>
        eb.or([
          // Top-level jobs that finished well or failed (section children would flood the panel).
          eb.and([
            eb('type', '=', 'job.status'),
            eb('data', 'like', '%"parentId":null%'),
            eb.or([
              eb('data', 'like', '%"status":"succeeded"%'),
              eb('data', 'like', '%"status":"needs_attention"%'),
              eb('data', 'like', '%"status":"failed"%'),
            ]),
          ]),
          eb.and([eb('type', '=', 'export.ready'), eb('data', 'like', '%"kind":"pack"%')]),
          eb.and([eb('type', '=', 'book.updated'), eb('data', 'like', '%"part":"stage"%')]),
        ]),
      )
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();

    const created = await this.db
      .selectFrom('projects')
      .select(['id', 'createdAt'])
      .where('workspaceId', '=', ctx.workspaceId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
    const published = await this.db
      .selectFrom('projects')
      .select(['id', 'publishedAt'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('publishedAt', 'is not', null)
      .orderBy('publishedAt', 'desc')
      .limit(limit)
      .execute();

    const projectIds = new Set<string>();
    for (const e of events) if (e.projectId) projectIds.add(e.projectId);
    for (const c of created) projectIds.add(c.id);
    for (const p of published) projectIds.add(p.id);
    const titles = new Map<string, { title: string | null; idea: string | null }>();
    if (projectIds.size > 0) {
      const rows = await this.db
        .selectFrom('projects')
        .select(['id', 'title', 'idea'])
        .where('workspaceId', '=', ctx.workspaceId)
        .where('id', 'in', [...projectIds])
        .execute();
      for (const r of rows) titles.set(r.id, r);
    }

    const items: ActivityItem[] = [];
    const push = (item: Omit<ActivityItem, 'live' | 'title'>): void => {
      items.push({ ...item, title: titleOf(item.projectId ? titles.get(item.projectId) : undefined), live: t - item.at < LIVE_MS });
    };
    for (const e of events) {
      const d = fromJson(EventData, e.data, {});
      const at = Number(e.createdAt);
      if (e.type === 'job.status') {
        const label = JOB_LABEL[d.kind ?? ''] ?? 'Job';
        const failed = d.status === 'failed';
        const detail = failed
          ? `${label} failed${d.error ? `: ${clip(d.error, 120)}` : ''}`
          : d.status === 'needs_attention'
            ? `${label} finished, needs attention`
            : `${label} finished`;
        push({
          id: e.id,
          kind: failed ? 'job_failed' : 'job_finished',
          at,
          projectId: e.projectId,
          jobId: e.jobId,
          detail,
          ...(failed ? { errorCode: d.errorCode ?? null } : {}),
        });
      } else if (e.type === 'export.ready') {
        push({ id: e.id, kind: 'export_built', at, projectId: e.projectId, jobId: e.jobId, detail: 'Upload pack built' });
      } else {
        push({
          id: e.id,
          kind: 'stage_changed',
          at,
          projectId: e.projectId,
          jobId: e.jobId,
          detail: `Moved to ${STAGE_LABEL[d.stage ?? ''] ?? d.stage ?? 'the next step'}`,
        });
      }
    }
    for (const c of created)
      push({ id: `book:${c.id}:created`, kind: 'book_created', at: Number(c.createdAt), projectId: c.id, jobId: null, detail: 'Book started' });
    for (const p of published)
      push({ id: `book:${p.id}:published`, kind: 'published', at: Number(p.publishedAt), projectId: p.id, jobId: null, detail: 'Marked as published' });

    return items.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1)).slice(0, limit);
  }

  /** Archived books, pen names and marketing items in one list, newest first. */
  async archive(ctx: RequestCtx): Promise<ArchiveItem[]> {
    const books = await this.db
      .selectFrom('projects as p')
      .leftJoin('authorProfiles as a', 'a.id', 'p.profileId')
      .select(['p.id', 'p.title', 'p.idea', 'p.stage', 'p.archivedAt', 'p.updatedAt', 'a.penName'])
      .where('p.workspaceId', '=', ctx.workspaceId)
      .where('p.status', '=', 'archived')
      .execute();
    const profiles = await this.db
      .selectFrom('authorProfiles')
      .select(['id', 'penName', 'isRealPerson', 'archivedAt', 'updatedAt'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('status', '=', 'archived')
      .execute();
    const marketing = await this.db
      .selectFrom('marketingItems as m')
      .leftJoin('projects as p', 'p.id', 'm.projectId')
      .select(['m.id', 'm.projectId', 'm.kind', 'm.title', 'm.hook', 'm.body', 'm.archivedAt', 'm.updatedAt', 'p.title as bookTitle', 'p.idea as bookIdea'])
      .where('m.workspaceId', '=', ctx.workspaceId)
      .where('m.status', '=', 'archived')
      .execute();

    const items: ArchiveItem[] = [
      ...books.map((b) => ({
        kind: 'book' as const,
        id: b.id,
        title: titleOf(b),
        detail: `Book${b.penName ? ` by ${b.penName}` : ''}, stopped at ${STAGE_LABEL[b.stage] ?? b.stage}`,
        archivedAt: Number(b.archivedAt ?? b.updatedAt),
        projectId: b.id,
        restorePath: `/books/${b.id}/restore`,
      })),
      ...profiles.map((p) => ({
        kind: 'profile' as const,
        id: p.id,
        title: p.penName,
        detail: Number(p.isRealPerson) === 1 ? 'Author profile' : 'Pen name',
        archivedAt: Number(p.archivedAt ?? p.updatedAt),
        projectId: null,
        restorePath: `/profiles/${p.id}/restore`,
      })),
      ...marketing.map((m) => ({
        kind: 'marketing' as const,
        id: m.id,
        title: clip(m.title ?? m.hook ?? m.body, 80) || 'Marketing item',
        detail: `${MARKETING_LABEL[m.kind] ?? 'Marketing item'} for ${titleOf({ title: m.bookTitle, idea: m.bookIdea })}`,
        archivedAt: Number(m.archivedAt ?? m.updatedAt),
        projectId: m.projectId,
        restorePath: `/marketing/${m.id}/restore`,
      })),
    ];
    return items.sort((a, b) => b.archivedAt - a.archivedAt);
  }
}
