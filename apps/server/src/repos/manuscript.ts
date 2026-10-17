import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { AuthorNotesTable, CheckResultsTable, ClaimsTable, SectionVersionsTable, SectionsTable, SuggestionsTable } from '../db/schema.js';
import { AppError, notFound } from '../http/errors.js';
import type { AiGuardrails } from '../ports/ai.js';
import { markdownToPlaintext, wordCount } from '../lib/text.js';
import { bool, flag, fromJson, newId, now, toJson } from '../lib/util.js';

const Obj = z.record(z.string(), z.unknown());

export const SECTION_KINDS = [
  'half_title',
  'title_page',
  'copyright',
  'dedication',
  'epigraph',
  'contents',
  'foreword',
  'preface',
  'acknowledgements',
  'introduction',
  'part',
  'chapter',
  'conclusion',
  'epilogue',
  'appendix',
  'resources',
  'glossary',
  'references',
  'about_author',
  'also_by',
  'review_request',
  'newsletter',
  // Picture books (D-044): one section per spread, text in its versions, layout and picture in their own columns.
  'spread',
] as const;

export const SaveVersionSchema = z.object({
  bodyMd: z.string().max(2_000_000),
  /** Editor document (TipTap JSON) when the client has one; Markdown stays the source for export. */
  content: z.unknown().optional(),
  note: z.string().max(2000).nullable().optional(),
  /** Version the edit started from; a mismatch returns 409 conflict. */
  baseVersionId: z.string().nullable().optional(),
});

export const NoteInputSchema = z.object({
  note: z.string().trim().min(1).max(20000),
  position: z.number().int().min(0).nullable().optional(),
  anchorText: z.string().max(2000).nullable().optional(),
});
export const NotePatchSchema = z.object({
  note: z.string().trim().min(1).max(20000).optional(),
  position: z.number().int().min(0).nullable().optional(),
  status: z.enum(['open', 'dismissed']).optional(),
});

export interface Section {
  id: string;
  projectId: string;
  kind: string;
  area: string;
  position: number;
  enabled: boolean;
  partId: string | null;
  number: number | null;
  title: string | null;
  wordTarget: number | null;
  plan: Record<string, unknown>;
  currentVersionId: string | null;
  status: string;
  blueprintChanged: boolean;
  wordCount: number;
  updatedAt: number;
  /** Spreads only (migration 0006): where the text sits. Null for other kinds. */
  layout: string | null;
  /** Spreads only: the spread's picture asset, null until it is made. */
  imageAssetId: string | null;
}

export interface SectionVersion {
  id: string;
  sectionId: string;
  projectId: string;
  version: number;
  content: unknown;
  bodyMd: string;
  plaintext: string;
  wordCount: number;
  source: string;
  parentVersionId: string | null;
  promptRunId: string | null;
  summary: string | null;
  note: string | null;
  createdAt: number;
}

function toSection(r: SectionsTable, words = 0): Section {
  return {
    id: r.id,
    projectId: r.projectId,
    kind: r.kind,
    area: r.area,
    position: r.position,
    enabled: bool(r.enabled),
    partId: r.partId,
    number: r.number,
    title: r.title,
    wordTarget: r.wordTarget,
    plan: fromJson(Obj, r.plan, {}),
    currentVersionId: r.currentVersionId,
    status: r.status,
    blueprintChanged: bool(r.blueprintChanged),
    wordCount: words,
    updatedAt: Number(r.updatedAt),
    layout: r.layout ?? null,
    imageAssetId: r.imageAssetId ?? null,
  };
}

function toVersion(r: SectionVersionsTable): SectionVersion {
  return {
    id: r.id,
    sectionId: r.sectionId,
    projectId: r.projectId,
    version: r.version,
    content: fromJson(z.unknown(), r.content, null),
    bodyMd: r.bodyMd,
    plaintext: r.plaintext,
    wordCount: r.wordCount,
    source: r.source,
    parentVersionId: r.parentVersionId,
    promptRunId: r.promptRunId,
    summary: r.summary,
    note: r.note,
    createdAt: Number(r.createdAt),
  };
}

export interface AuthorNote {
  id: string;
  projectId: string;
  sectionId: string;
  position: number | null;
  anchorText: string | null;
  note: string;
  status: string;
  jobId: string | null;
  wovenVersionId: string | null;
  createdAt: number;
  updatedAt: number;
}

function toNote(r: AuthorNotesTable): AuthorNote {
  return {
    id: r.id,
    projectId: r.projectId,
    sectionId: r.sectionId,
    position: r.position,
    anchorText: r.anchorText,
    note: r.note,
    status: r.status,
    jobId: r.jobId,
    wovenVersionId: r.wovenVersionId,
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  };
}

export interface Suggestion {
  id: string;
  projectId: string;
  sectionId: string;
  baseVersionId: string | null;
  pass: string;
  start: number | null;
  end: number | null;
  original: string;
  proposed: string;
  reason: string | null;
  status: string;
  decidedAt: number | null;
  createdAt: number;
}

function toSuggestion(r: SuggestionsTable): Suggestion {
  return {
    id: r.id,
    projectId: r.projectId,
    sectionId: r.sectionId,
    baseVersionId: r.baseVersionId,
    pass: r.pass,
    start: r.startOffset,
    end: r.endOffset,
    original: r.original,
    proposed: r.proposed,
    reason: r.reason,
    status: r.status,
    decidedAt: r.decidedAt === null ? null : Number(r.decidedAt),
    createdAt: Number(r.createdAt),
  };
}

export interface Claim {
  id: string;
  projectId: string;
  sectionId: string | null;
  versionId: string | null;
  category: string;
  sentence: string;
  location: Record<string, unknown>;
  checkNeeded: string | null;
  status: string;
  ownerNote: string | null;
  sourceUrl: string | null;
  resolvedAt: number | null;
  createdAt: number;
  /** A softer wording from the checks stage, the default for "soften" (null when none was offered). */
  suggestedSoftening: string | null;
}

function toClaim(r: ClaimsTable): Claim {
  return {
    id: r.id,
    projectId: r.projectId,
    sectionId: r.sectionId,
    versionId: r.versionId,
    category: r.category,
    sentence: r.sentence,
    location: fromJson(Obj, r.location, {}),
    checkNeeded: r.checkNeeded,
    status: r.status,
    ownerNote: r.ownerNote,
    sourceUrl: r.sourceUrl,
    resolvedAt: r.resolvedAt === null ? null : Number(r.resolvedAt),
    createdAt: Number(r.createdAt),
    suggestedSoftening: r.suggestedSoftening ?? null,
  };
}

export interface CheckResult {
  id: string;
  sectionId: string | null;
  versionId: string | null;
  checker: string;
  severity: string;
  message: string;
  location: Record<string, unknown>;
  autoFixed: boolean;
  status: string;
}

function toCheck(r: CheckResultsTable): CheckResult {
  return {
    id: r.id,
    sectionId: r.sectionId,
    versionId: r.versionId,
    checker: r.checker,
    severity: r.severity,
    message: r.message,
    location: fromJson(Obj, r.location, {}),
    autoFixed: bool(r.autoFixed),
    status: r.status,
  };
}

export interface NewSectionInput {
  kind: string;
  area: 'front' | 'body' | 'back';
  title: string | null;
  number?: number | null;
  wordTarget?: number | null;
  plan?: Record<string, unknown>;
  partId?: string | null;
  enabled?: boolean;
  /** Spreads only. */
  layout?: string | null;
}

export interface SaveVersionInput {
  bodyMd: string;
  content?: unknown;
  source: string;
  note?: string | null;
  parentVersionId?: string | null;
  promptRunId?: string | null;
  summary?: string | null;
  baseVersionId?: string | null;
  /** Section status after saving (default: 'done' when it has text). */
  status?: string;
  /** The automatic style rewrite of the AI run that wrote this text, kept with the version's guardrail report. */
  styleRewrite?: AiGuardrails['styleRewrite'];
}

/** Works out the code guardrail report for a book's text as it is saved (set by the app; see jobs/guardrails.ts). */
export type TextGuardrailChecker = (ctx: RequestCtx, projectId: string, bodyMd: string) => Promise<AiGuardrails | null>;

export class ManuscriptRepo {
  private textChecker: TextGuardrailChecker | null = null;

  constructor(private readonly db: Db) {}

  /** Every saved version then stores the guardrail report for its own text, so stale hits never outlive an edit. */
  setTextChecker(checker: TextGuardrailChecker | null): void {
    this.textChecker = checker;
  }

  /** The guardrail report a save would store for this text (null without a checker). */
  async checkText(ctx: RequestCtx, projectId: string, bodyMd: string): Promise<AiGuardrails | null> {
    return this.textChecker ? this.textChecker(ctx, projectId, bodyMd) : null;
  }

  // ---------- sections ----------

  async listSections(ctx: RequestCtx, projectId: string): Promise<Section[]> {
    const rows = await this.db
      .selectFrom('sections as s')
      .leftJoin('sectionVersions as v', 'v.id', 's.currentVersionId')
      .selectAll('s')
      .select('v.wordCount as currentWords')
      .where('s.workspaceId', '=', ctx.workspaceId)
      .where('s.projectId', '=', projectId)
      .orderBy('s.position')
      .execute();
    return rows.map((r) => toSection(r, Number(r.currentWords ?? 0)));
  }

  async tree(
    ctx: RequestCtx,
    projectId: string,
  ): Promise<{ front: Section[]; body: (Section & { children: Section[] })[]; back: Section[]; totals: { sections: number; words: number; done: number } }> {
    const all = await this.listSections(ctx, projectId);
    const front = all.filter((s) => s.area === 'front');
    const back = all.filter((s) => s.area === 'back');
    const bodyAll = all.filter((s) => s.area === 'body');
    const body: (Section & { children: Section[] })[] = [];
    const parts = new Map<string, Section & { children: Section[] }>();
    for (const s of bodyAll) {
      if (s.kind === 'part') {
        const node = { ...s, children: [] as Section[] };
        parts.set(s.id, node);
        body.push(node);
      }
    }
    for (const s of bodyAll) {
      if (s.kind === 'part') continue;
      const parent = s.partId ? parts.get(s.partId) : undefined;
      if (parent) parent.children.push(s);
      else body.push({ ...s, children: [] });
    }
    const enabled = all.filter((s) => s.enabled);
    return {
      front,
      body,
      back,
      totals: { sections: enabled.length, words: enabled.reduce((n, s) => n + s.wordCount, 0), done: enabled.filter((s) => s.status === 'done').length },
    };
  }

  /**
   * Who wrote each section: 'app' for pages code writes (title page, copyright, contents, about the author and the
   * other code-written kinds passed in), 'owner' when every version is a human one, otherwise 'ai' (also for
   * sections not written yet, which the writer will fill).
   */
  async writtenBy(
    ctx: RequestCtx,
    sections: readonly { id: string; kind: string }[],
    appKinds: ReadonlySet<string>,
  ): Promise<Map<string, 'app' | 'ai' | 'owner'>> {
    const out = new Map<string, 'app' | 'ai' | 'owner'>();
    const ids = sections.filter((x) => !appKinds.has(x.kind)).map((x) => x.id);
    const counts = new Map<string, { all: number; human: number }>();
    if (ids.length > 0) {
      const rows = await this.db
        .selectFrom('sectionVersions')
        .select(['sectionId', 'source', (eb) => eb.fn.countAll<number>().as('n')])
        .where('workspaceId', '=', ctx.workspaceId)
        .where('sectionId', 'in', ids)
        .groupBy(['sectionId', 'source'])
        .execute();
      for (const r of rows) {
        const c = counts.get(r.sectionId) ?? { all: 0, human: 0 };
        c.all += Number(r.n);
        if (r.source === 'human') c.human += Number(r.n);
        counts.set(r.sectionId, c);
      }
    }
    for (const x of sections) {
      if (appKinds.has(x.kind)) out.set(x.id, 'app');
      else {
        const c = counts.get(x.id);
        out.set(x.id, c && c.all > 0 && c.human === c.all ? 'owner' : 'ai');
      }
    }
    return out;
  }

  async getSection(ctx: RequestCtx, id: string): Promise<Section | null> {
    const r = await this.db.selectFrom('sections').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (!r) return null;
    let words = 0;
    if (r.currentVersionId) {
      const v = await this.db
        .selectFrom('sectionVersions')
        .select(['wordCount'])
        .where('id', '=', r.currentVersionId)
        .where('workspaceId', '=', ctx.workspaceId)
        .executeTakeFirst();
      words = v?.wordCount ?? 0;
    }
    return toSection(r, words);
  }

  async requireSection(ctx: RequestCtx, id: string): Promise<Section> {
    const s = await this.getSection(ctx, id);
    if (!s) throw notFound('Section');
    return s;
  }

  async addSections(ctx: RequestCtx, projectId: string, items: NewSectionInput[], startPosition = 1000): Promise<Section[]> {
    const t = now();
    let pos = startPosition;
    const ids: string[] = [];
    const insert = async (trx: Db): Promise<void> => {
      for (const it of items) {
        const id = newId();
        ids.push(id);
        await trx
          .insertInto('sections')
          .values({
            id,
            workspaceId: ctx.workspaceId,
            projectId,
            kind: it.kind,
            area: it.area,
            position: pos,
            enabled: flag(it.enabled ?? true),
            partId: it.partId ?? null,
            number: it.number ?? null,
            title: it.title,
            wordTarget: it.wordTarget ?? null,
            plan: toJson(it.plan ?? {}),
            currentVersionId: null,
            status: 'empty',
            blueprintChanged: 0,
            layout: it.layout ?? null,
            imageAssetId: null,
            createdAt: t,
            updatedAt: t,
          })
          .execute();
        pos += 1000;
      }
    };
    if (this.db.isTransaction) await insert(this.db);
    else await this.db.transaction().execute(insert);
    const all = await this.listSections(ctx, projectId);
    return all.filter((s) => ids.includes(s.id));
  }

  async updateSectionPlan(
    ctx: RequestCtx,
    id: string,
    set: {
      title?: string | null;
      plan?: Record<string, unknown>;
      wordTarget?: number | null;
      blueprintChanged?: boolean;
      enabled?: boolean;
      position?: number;
    },
  ): Promise<void> {
    const patch: Partial<SectionsTable> = { updatedAt: now() };
    if (set.title !== undefined) patch.title = set.title;
    if (set.plan !== undefined) patch.plan = toJson(set.plan);
    if (set.wordTarget !== undefined) patch.wordTarget = set.wordTarget;
    if (set.blueprintChanged !== undefined) patch.blueprintChanged = flag(set.blueprintChanged);
    if (set.enabled !== undefined) patch.enabled = flag(set.enabled);
    if (set.position !== undefined) patch.position = set.position;
    await this.db.updateTable('sections').set(patch).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
  }

  /** Sets a spread's layout and, when given, its picture (picture books, migration 0006). */
  async setSpread(ctx: RequestCtx, id: string, set: { layout?: string; imageAssetId?: string | null }): Promise<void> {
    const patch: Partial<SectionsTable> = { updatedAt: now() };
    if (set.layout !== undefined) patch.layout = set.layout;
    if (set.imageAssetId !== undefined) patch.imageAssetId = set.imageAssetId;
    await this.db.updateTable('sections').set(patch).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
  }

  async setSectionStatus(ctx: RequestCtx, id: string, status: string): Promise<void> {
    await this.db.updateTable('sections').set({ status, updatedAt: now() }).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
  }

  // ---------- versions ----------

  async saveVersion(ctx: RequestCtx, sectionId: string, input: SaveVersionInput): Promise<SectionVersion> {
    // The guardrail report is worked out before the transaction (the checker reads the book, profile and sources).
    let guardrails: AiGuardrails | null = null;
    if (this.textChecker) {
      const owner = await this.db
        .selectFrom('sections')
        .select(['projectId'])
        .where('id', '=', sectionId)
        .where('workspaceId', '=', ctx.workspaceId)
        .executeTakeFirst();
      if (owner) guardrails = await this.textChecker(ctx, owner.projectId, input.bodyMd);
      if (guardrails && input.styleRewrite) guardrails = { ...guardrails, styleRewrite: input.styleRewrite };
    }
    const save = async (trx: Db): Promise<SectionVersion> => {
      const section = await trx.selectFrom('sections').selectAll().where('id', '=', sectionId).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
      if (!section) throw notFound('Section');
      if (input.baseVersionId !== undefined && input.baseVersionId !== section.currentVersionId) {
        throw new AppError('conflict', 'This section changed since you opened it. Compare both versions and choose one.', {
          currentVersionId: section.currentVersionId,
          baseVersionId: input.baseVersionId,
        });
      }
      const last = await trx
        .selectFrom('sectionVersions')
        .select(['version'])
        .where('workspaceId', '=', ctx.workspaceId)
        .where('sectionId', '=', sectionId)
        .orderBy('version', 'desc')
        .executeTakeFirst();
      const plaintext = markdownToPlaintext(input.bodyMd);
      const words = wordCount(plaintext);
      const t = now();
      const id = newId();
      await trx
        .insertInto('sectionVersions')
        .values({
          id,
          workspaceId: ctx.workspaceId,
          sectionId,
          projectId: section.projectId,
          version: (last?.version ?? 0) + 1,
          content: toJson(input.content ?? null),
          bodyMd: input.bodyMd,
          plaintext,
          wordCount: words,
          source: input.source,
          parentVersionId: input.parentVersionId ?? section.currentVersionId,
          promptRunId: input.promptRunId ?? null,
          summary: input.summary ?? null,
          note: input.note ?? null,
          guardrails: guardrails ? toJson(guardrails) : null,
          createdAt: t,
          updatedAt: t,
        })
        .execute();
      await trx
        .updateTable('sections')
        .set({ currentVersionId: id, status: input.status ?? (words > 0 ? 'done' : 'empty'), blueprintChanged: 0, updatedAt: t })
        .where('id', '=', sectionId)
        .where('workspaceId', '=', ctx.workspaceId)
        .execute();
      await trx.updateTable('projects').set({ updatedAt: t }).where('id', '=', section.projectId).where('workspaceId', '=', ctx.workspaceId).execute();
      const row = await trx.selectFrom('sectionVersions').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
      return toVersion(row);
    };
    return this.db.isTransaction ? save(this.db) : this.db.transaction().execute(save);
  }

  async listVersions(ctx: RequestCtx, sectionId: string): Promise<Omit<SectionVersion, 'content' | 'bodyMd' | 'plaintext'>[]> {
    await this.requireSection(ctx, sectionId);
    const rows = await this.db
      .selectFrom('sectionVersions')
      .select(['id', 'sectionId', 'projectId', 'version', 'wordCount', 'source', 'parentVersionId', 'promptRunId', 'summary', 'note', 'createdAt'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('sectionId', '=', sectionId)
      .orderBy('version', 'desc')
      .execute();
    return rows.map((r) => ({ ...r, createdAt: Number(r.createdAt) }));
  }

  async getVersion(ctx: RequestCtx, versionId: string): Promise<SectionVersion | null> {
    const r = await this.db.selectFrom('sectionVersions').selectAll().where('id', '=', versionId).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    return r ? toVersion(r) : null;
  }

  async requireVersion(ctx: RequestCtx, sectionId: string, versionId: string): Promise<SectionVersion> {
    const v = await this.getVersion(ctx, versionId);
    if (!v || v.sectionId !== sectionId) throw notFound('Version');
    return v;
  }

  async currentVersion(ctx: RequestCtx, sectionId: string): Promise<SectionVersion | null> {
    const s = await this.requireSection(ctx, sectionId);
    return s.currentVersionId ? this.getVersion(ctx, s.currentVersionId) : null;
  }

  async restoreVersion(ctx: RequestCtx, sectionId: string, versionId: string): Promise<SectionVersion> {
    const v = await this.requireVersion(ctx, sectionId, versionId);
    return this.saveVersion(ctx, sectionId, {
      bodyMd: v.bodyMd,
      content: v.content,
      source: 'restore',
      parentVersionId: v.id,
      note: `Restored version ${v.version}`,
    });
  }

  /** Copies sections and their current text into another book (duplicate). */
  async copyManuscript(ctx: RequestCtx, fromProjectId: string, toProjectId: string): Promise<void> {
    const sections = await this.listSections(ctx, fromProjectId);
    const idMap = new Map<string, string>();
    const t = now();
    await this.db.transaction().execute(async (trx) => {
      for (const s of sections) {
        const id = newId();
        idMap.set(s.id, id);
        await trx
          .insertInto('sections')
          .values({
            id,
            workspaceId: ctx.workspaceId,
            projectId: toProjectId,
            kind: s.kind,
            area: s.area,
            position: s.position,
            enabled: flag(s.enabled),
            partId: s.partId ? (idMap.get(s.partId) ?? null) : null,
            number: s.number,
            title: s.title,
            wordTarget: s.wordTarget,
            plan: toJson(s.plan),
            currentVersionId: null,
            status: 'empty',
            blueprintChanged: 0,
            // A copied picture book keeps its layouts and pictures (assets stay in the same workspace).
            layout: s.layout,
            imageAssetId: s.imageAssetId,
            createdAt: t,
            updatedAt: t,
          })
          .execute();
      }
    });
    for (const s of sections) {
      if (!s.currentVersionId) continue;
      const v = await this.getVersion(ctx, s.currentVersionId);
      const newSectionId = idMap.get(s.id);
      if (v && newSectionId) {
        await this.saveVersion(ctx, newSectionId, {
          bodyMd: v.bodyMd,
          content: v.content,
          source: v.source,
          parentVersionId: null,
          note: 'Copied from the original book',
        });
      }
    }
  }

  // ---------- author notes ----------

  async addNote(ctx: RequestCtx, sectionId: string, input: z.infer<typeof NoteInputSchema>): Promise<AuthorNote> {
    const s = await this.requireSection(ctx, sectionId);
    const t = now();
    const id = newId();
    await this.db
      .insertInto('authorNotes')
      .values({
        id,
        workspaceId: ctx.workspaceId,
        projectId: s.projectId,
        sectionId,
        position: input.position ?? null,
        anchorText: input.anchorText ?? null,
        note: input.note,
        status: 'open',
        jobId: null,
        wovenVersionId: null,
        createdAt: t,
        updatedAt: t,
      })
      .execute();
    return this.requireNote(ctx, id);
  }

  async requireNote(ctx: RequestCtx, id: string): Promise<AuthorNote> {
    const r = await this.db.selectFrom('authorNotes').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (!r) throw notFound('Note');
    return toNote(r);
  }

  async listNotes(ctx: RequestCtx, filter: { sectionId?: string; projectId?: string; status?: string; ids?: string[] }): Promise<AuthorNote[]> {
    let q = this.db.selectFrom('authorNotes').selectAll().where('workspaceId', '=', ctx.workspaceId);
    if (filter.sectionId) q = q.where('sectionId', '=', filter.sectionId);
    if (filter.projectId) q = q.where('projectId', '=', filter.projectId);
    if (filter.status) q = q.where('status', '=', filter.status);
    if (filter.ids) {
      if (filter.ids.length === 0) return [];
      q = q.where('id', 'in', filter.ids);
    }
    return (await q.orderBy('id').execute()).map(toNote);
  }

  async updateNote(ctx: RequestCtx, id: string, patch: z.infer<typeof NotePatchSchema>): Promise<AuthorNote> {
    const note = await this.requireNote(ctx, id);
    if (note.status === 'woven') throw new AppError('invalid_state', 'This note is already woven into the text.');
    const set: Partial<AuthorNotesTable> = { updatedAt: now() };
    if (patch.note !== undefined) set.note = patch.note;
    if (patch.position !== undefined) set.position = patch.position;
    if (patch.status !== undefined) set.status = patch.status;
    await this.db.updateTable('authorNotes').set(set).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    return this.requireNote(ctx, id);
  }

  async setNotesStatus(ctx: RequestCtx, ids: string[], status: string, extra: { jobId?: string | null; wovenVersionId?: string | null } = {}): Promise<void> {
    if (ids.length === 0) return;
    const set: Partial<AuthorNotesTable> = { status, updatedAt: now() };
    if (extra.jobId !== undefined) set.jobId = extra.jobId;
    if (extra.wovenVersionId !== undefined) set.wovenVersionId = extra.wovenVersionId;
    await this.db.updateTable('authorNotes').set(set).where('workspaceId', '=', ctx.workspaceId).where('id', 'in', ids).execute();
  }

  // ---------- suggestions ----------

  async addSuggestions(
    ctx: RequestCtx,
    section: Section,
    baseVersionId: string | null,
    pass: string,
    items: { original: string; proposed: string; reason: string; start: number | null; end: number | null }[],
    promptRunId: string | null,
  ): Promise<Suggestion[]> {
    const t = now();
    const ids: string[] = [];
    for (const it of items) {
      const id = newId();
      ids.push(id);
      await this.db
        .insertInto('suggestions')
        .values({
          id,
          workspaceId: ctx.workspaceId,
          projectId: section.projectId,
          sectionId: section.id,
          baseVersionId,
          pass,
          startOffset: it.start,
          endOffset: it.end,
          original: it.original,
          proposed: it.proposed,
          reason: it.reason,
          status: 'open',
          decidedAt: null,
          promptRunId,
          createdAt: t,
          updatedAt: t,
        })
        .execute();
    }
    return this.listSuggestions(ctx, { ids });
  }

  async listSuggestions(ctx: RequestCtx, filter: { sectionId?: string; status?: string; ids?: string[] }): Promise<Suggestion[]> {
    let q = this.db.selectFrom('suggestions').selectAll().where('workspaceId', '=', ctx.workspaceId);
    if (filter.sectionId) q = q.where('sectionId', '=', filter.sectionId);
    if (filter.status) q = q.where('status', '=', filter.status);
    if (filter.ids) {
      if (filter.ids.length === 0) return [];
      q = q.where('id', 'in', filter.ids);
    }
    return (await q.orderBy('id').execute()).map(toSuggestion);
  }

  async requireSuggestion(ctx: RequestCtx, id: string): Promise<Suggestion> {
    const r = await this.db.selectFrom('suggestions').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (!r) throw notFound('Suggestion');
    return toSuggestion(r);
  }

  async decideSuggestion(ctx: RequestCtx, id: string, status: 'accepted' | 'rejected' | 'stale'): Promise<Suggestion> {
    const t = now();
    await this.db
      .updateTable('suggestions')
      .set({ status, decidedAt: t, updatedAt: t })
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
    return this.requireSuggestion(ctx, id);
  }

  // ---------- ledger, checks, claims ----------

  async upsertLedger(
    ctx: RequestCtx,
    projectId: string,
    sectionId: string,
    versionId: string,
    items: { kind: string; key: string; detail: string }[],
  ): Promise<void> {
    const t = now();
    for (const it of items) {
      const key = it.key.trim().toLowerCase().slice(0, 255);
      if (!key) continue;
      const existing = await this.db
        .selectFrom('storyLedger')
        .select(['id'])
        .where('workspaceId', '=', ctx.workspaceId)
        .where('projectId', '=', projectId)
        .where('kind', '=', it.kind)
        .where('ledgerKey', '=', key)
        .executeTakeFirst();
      if (existing) continue;
      await this.db
        .insertInto('storyLedger')
        .values({
          id: newId(),
          workspaceId: ctx.workspaceId,
          projectId,
          sectionId,
          kind: it.kind.slice(0, 64),
          ledgerKey: key,
          detail: it.detail,
          versionId,
          createdAt: t,
          updatedAt: t,
        })
        .execute();
    }
  }

  async listLedger(ctx: RequestCtx, projectId: string): Promise<{ kind: string; key: string; detail: string | null; sectionId: string | null }[]> {
    const rows = await this.db
      .selectFrom('storyLedger')
      .select(['kind', 'ledgerKey', 'detail', 'sectionId'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .orderBy('id')
      .execute();
    return rows.map((r) => ({ kind: r.kind, key: r.ledgerKey, detail: r.detail, sectionId: r.sectionId }));
  }

  async addCheckResults(
    ctx: RequestCtx,
    projectId: string,
    sectionId: string,
    versionId: string,
    items: { checker: string; severity: 'info' | 'warn' | 'block'; message: string; location?: Record<string, unknown> }[],
  ): Promise<void> {
    const t = now();
    for (const it of items) {
      await this.db
        .insertInto('checkResults')
        .values({
          id: newId(),
          workspaceId: ctx.workspaceId,
          projectId,
          sectionId,
          versionId,
          checker: it.checker,
          severity: it.severity,
          message: it.message,
          location: toJson(it.location ?? {}),
          autoFixed: 0,
          status: 'open',
          createdAt: t,
          updatedAt: t,
        })
        .execute();
    }
  }

  /** Marks the open results of one checker on a version as resolved (kept for history). Returns how many changed. */
  async resolveChecks(ctx: RequestCtx, versionId: string, checker: string): Promise<number> {
    const r = await this.db
      .updateTable('checkResults')
      .set({ status: 'resolved', updatedAt: now() })
      .where('workspaceId', '=', ctx.workspaceId)
      .where('versionId', '=', versionId)
      .where('checker', '=', checker)
      .where('status', '=', 'open')
      .executeTakeFirst();
    return Number(r.numUpdatedRows);
  }

  /** Sets the summary of an existing version (a summary rerun); the text and version number stay as they are. */
  async setVersionSummary(ctx: RequestCtx, versionId: string, summary: string): Promise<void> {
    await this.db
      .updateTable('sectionVersions')
      .set({ summary, updatedAt: now() })
      .where('id', '=', versionId)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
  }

  async listChecks(ctx: RequestCtx, filter: { projectId?: string; sectionId?: string; versionId?: string }): Promise<CheckResult[]> {
    let q = this.db.selectFrom('checkResults').selectAll().where('workspaceId', '=', ctx.workspaceId);
    if (filter.projectId) q = q.where('projectId', '=', filter.projectId);
    if (filter.sectionId) q = q.where('sectionId', '=', filter.sectionId);
    if (filter.versionId) q = q.where('versionId', '=', filter.versionId);
    return (await q.orderBy('id').execute()).map(toCheck);
  }

  async addClaims(
    ctx: RequestCtx,
    projectId: string,
    sectionId: string,
    versionId: string,
    items: { sentence: string; category: string; checkNeeded: string; start: number | null; end: number | null; suggestedSoftening?: string | null }[],
  ): Promise<Claim[]> {
    const t = now();
    const ids: string[] = [];
    for (const it of items) {
      const id = newId();
      ids.push(id);
      await this.db
        .insertInto('claims')
        .values({
          id,
          workspaceId: ctx.workspaceId,
          projectId,
          sectionId,
          versionId,
          category: it.category,
          sentence: it.sentence,
          location: toJson({ start: it.start, end: it.end }),
          checkNeeded: it.checkNeeded,
          status: 'open',
          ownerNote: null,
          sourceUrl: null,
          resolvedAt: null,
          suggestedSoftening: it.suggestedSoftening?.trim() || null,
          createdAt: t,
          updatedAt: t,
        })
        .execute();
    }
    return this.listClaims(ctx, { ids });
  }

  async listClaims(ctx: RequestCtx, filter: { projectId?: string; sectionId?: string; status?: string; ids?: string[] }): Promise<Claim[]> {
    let q = this.db.selectFrom('claims').selectAll().where('workspaceId', '=', ctx.workspaceId);
    if (filter.projectId) q = q.where('projectId', '=', filter.projectId);
    if (filter.sectionId) q = q.where('sectionId', '=', filter.sectionId);
    if (filter.status) q = q.where('status', '=', filter.status);
    if (filter.ids) {
      if (filter.ids.length === 0) return [];
      q = q.where('id', 'in', filter.ids);
    }
    return (await q.orderBy('id').execute()).map(toClaim);
  }

  async requireClaim(ctx: RequestCtx, id: string): Promise<Claim> {
    const r = await this.db.selectFrom('claims').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (!r) throw notFound('Claim');
    return toClaim(r);
  }

  async resolveClaim(
    ctx: RequestCtx,
    id: string,
    status: 'verified' | 'softened' | 'removed' | 'author_experience',
    extra: { ownerNote?: string | null; sourceUrl?: string | null },
  ): Promise<Claim> {
    const t = now();
    const set: Partial<ClaimsTable> = { status, resolvedAt: t, updatedAt: t };
    if (extra.ownerNote !== undefined) set.ownerNote = extra.ownerNote;
    if (extra.sourceUrl !== undefined) set.sourceUrl = extra.sourceUrl;
    await this.db.updateTable('claims').set(set).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    return this.requireClaim(ctx, id);
  }
}
