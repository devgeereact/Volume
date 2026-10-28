import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { AuthorNotesTable, CheckResultsTable, ClaimsTable, SectionVersionsTable, SectionsTable, SuggestionsTable } from '../db/schema.js';
import { AppError, notFound } from '../http/errors.js';
import type { AiGuardrails } from '../ports/ai.js';
import { markdownToPlaintext, wordCount } from '../lib/text.js';
import { bool, flag, fromJson, newId, now, toJson } from '../lib/util.js';

const Obj = z.record(z.string(), z.unknown());

export const SaveVersionSchema = z.object({
  bodyMd: z.string().max(2_000_000),
  /** Editor document (TipTap JSON) when the client has one; Markdown stays the source for export. */
  content: z.unknown().optional(),
  note: z.string().max(2000).nullable().optional(),
  /** Version the edit started from; a mismatch returns 409 conflict. */
  baseVersionId: z.string().nullable().optional(),
});

export const AutosaveSchema = z.object({
  bodyMd: z.string().max(2_000_000),
  content: z.unknown().optional(),
  /** The version the editor holds; null for a section with no text yet. A mismatch returns 409 conflict. */
  baseVersionId: z.string().max(64).nullable(),
  /**
   * The revision of that version the editor holds (its updatedAt, as the last autosave answer or the version list gave
   * it). An autosave is updated in place only when this matches, so two tabs on the same version cannot overwrite
   * each other; left out, the autosave always makes a new version.
   */
  baseRevision: z.number().int().min(0).optional(),
});

/** Version source of the editor's autosave. */
export const OWNER_AUTOSAVE_SOURCE = 'owner:autosave';
/** An autosave younger than this, by the same user and still current, is updated in place instead of adding a version. */
export const AUTOSAVE_WINDOW_MS = 5 * 60 * 1000;

/**
 * Puts each part divider directly before its own chapters. Approving a blueprint stores every part first and the
 * chapters after them (the tree groups them by partId, the flat position order does not), so an export that walked the
 * positions printed "Part I" and "Part II" back to back, before Chapter 1. Sections keep their position order; a part
 * is followed by the chapters whose partId is that part; chapters with no part stay where they are. Pure.
 */
export function orderPartsWithChapters<T extends { id: string; kind: string; area: string; partId: string | null }>(sections: readonly T[]): T[] {
  const partIds = new Set(sections.filter((s) => s.kind === 'part').map((s) => s.id));
  if (partIds.size === 0) return [...sections];
  const children = new Map<string, T[]>();
  for (const s of sections) {
    if (s.kind !== 'part' && s.partId && partIds.has(s.partId)) children.set(s.partId, [...(children.get(s.partId) ?? []), s]);
  }
  const out: T[] = [];
  for (const s of sections) {
    if (s.kind !== 'part' && s.partId && partIds.has(s.partId)) continue;
    out.push(s);
    if (s.kind === 'part') out.push(...(children.get(s.id) ?? []));
  }
  return out;
}

/** Sources of text the owner wrote: an explicit save (`human`) or an `owner:` save such as an autosave or a claim fix. */
export function isOwnerSource(source: string): boolean {
  return source === 'human' || source.startsWith('owner:');
}

/**
 * The version before the current edit session: walks back from the current version through the run of the same user's
 * autosaves and returns the parent of the oldest. With no autosave run it is the current version's parent.
 */
export function sessionStartOf(
  versions: readonly { id: string; source: string; parentVersionId: string | null; createdBy: string | null }[],
  currentVersionId: string | null,
): string | null {
  const byId = new Map(versions.map((v) => [v.id, v]));
  let cur = currentVersionId ? byId.get(currentVersionId) : undefined;
  if (!cur) return null;
  const seen = new Set<string>([cur.id]);
  for (;;) {
    const parent: (typeof versions)[number] | undefined = cur.parentVersionId ? byId.get(cur.parentVersionId) : undefined;
    if (!parent || seen.has(parent.id) || parent.source !== OWNER_AUTOSAVE_SOURCE || !cur.createdBy || parent.createdBy !== cur.createdBy) break;
    seen.add(parent.id);
    cur = parent;
  }
  return cur.parentVersionId;
}

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

/** A section as the writing-complete predicate sees it (jobs/book-data.ts isWritingComplete). */
export type WritingState = Pick<Section, 'kind' | 'enabled' | 'plan' | 'currentVersionId' | 'wordCount'> & {
  /** Source of the current version (for example ai:writing, human, app:placeholder), null when there is none. */
  currentSource: string | null;
};

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
  /** The user who saved an owner version (migration 0011); null for AI, app and older versions. */
  createdBy: string | null;
  createdAt: number;
  /** Later than createdAt only for an autosave updated in place. */
  updatedAt: number;
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
    createdBy: r.createdBy,
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
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
  /** The user saving an owner version (explicit save, autosave, claim fix). */
  createdBy?: string | null;
}

/** Works out the code guardrail report for a book's text as it is saved (set by the app; see jobs/guardrails.ts). */
export type TextGuardrailChecker = (ctx: RequestCtx, projectId: string, bodyMd: string) => Promise<AiGuardrails | null>;

/** A claim sentence compared loosely: case, curly quotes and spacing do not make it a new claim. */
function normSentence(s: string): string {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
}

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
    // Reading order: a part sits directly before its own chapters, whatever positions an older book stored.
    return orderPartsWithChapters(rows.map((r) => toSection(r, Number(r.currentWords ?? 0))));
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
    // bodyAll is in reading order (listSections): parts, and sections that belong to no part, stay where the book reads them.
    for (const s of bodyAll) if (s.kind === 'part') parts.set(s.id, { ...s, children: [] });
    for (const s of bodyAll) {
      const node = s.kind === 'part' ? parts.get(s.id) : undefined;
      if (node) body.push(node);
      else if (s.kind !== 'part') {
        const parent = s.partId ? parts.get(s.partId) : undefined;
        if (parent) parent.children.push(s);
        else body.push({ ...s, children: [] });
      }
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
   * other code-written kinds passed in), 'owner' when every version is the owner's (isOwnerSource), otherwise 'ai' (also for
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
        if (isOwnerSource(r.source)) c.human += Number(r.n);
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

  /** The fields the writing-complete predicate needs, for several books at once (Library list). */
  async writingStateFor(ctx: RequestCtx, projectIds: readonly string[]): Promise<Map<string, WritingState[]>> {
    const out = new Map<string, WritingState[]>();
    for (const id of projectIds) out.set(id, []);
    if (projectIds.length === 0) return out;
    const rows = await this.db
      .selectFrom('sections as s')
      .leftJoin('sectionVersions as v', 'v.id', 's.currentVersionId')
      .select(['s.projectId', 's.kind', 's.enabled', 's.plan', 's.currentVersionId', 'v.wordCount as currentWords', 'v.source as currentSource'])
      .where('s.workspaceId', '=', ctx.workspaceId)
      .where('s.projectId', 'in', [...projectIds])
      .execute();
    for (const r of rows) {
      out.get(r.projectId)?.push({
        kind: r.kind,
        enabled: bool(r.enabled),
        plan: fromJson(Obj, r.plan, {}),
        currentVersionId: r.currentVersionId,
        wordCount: Number(r.currentWords ?? 0),
        currentSource: r.currentSource ?? null,
      });
    }
    return out;
  }

  /**
   * Evidence that AI made part of the book, whatever the stored disclosure says (preflight kdp.ai-disclosure).
   * Text: any version of a switched-on section whose source is `ai` or starts with `ai:`, a restore counting as the
   * version it restored (followed back through parentVersionId). Images: the built covers or a switched-on spread's
   * picture, when the asset is marked AI-generated.
   */
  async aiEvidence(ctx: RequestCtx, projectId: string): Promise<{ text: boolean; images: boolean }> {
    const sections = await this.db
      .selectFrom('sections')
      .select(['id', 'kind', 'imageAssetId'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .where('enabled', '=', 1)
      .execute();
    const ids = sections.map((s) => s.id);
    let text = false;
    if (ids.length > 0) {
      const versions = await this.db
        .selectFrom('sectionVersions')
        .select(['id', 'source', 'parentVersionId'])
        .where('workspaceId', '=', ctx.workspaceId)
        .where('projectId', '=', projectId)
        .where('sectionId', 'in', ids)
        .execute();
      // The restore chain is followed only within these switched-on sections' versions. That is enough: a restore's
      // parent is always a version of the same section (restoreVersion checks it), and copied books carry each
      // version's own source (copyManuscript keeps it), so no AI version sits outside this set.
      const byId = new Map(versions.map((v) => [v.id, v]));
      const isAi = (source: string): boolean => source === 'ai' || source.startsWith('ai:');
      text = versions.some((v) => {
        let cur: { source: string; parentVersionId: string | null } | undefined = v;
        const seen = new Set<string>();
        while (cur && cur.source === 'restore' && cur.parentVersionId && !seen.has(cur.parentVersionId)) {
          seen.add(cur.parentVersionId);
          cur = byId.get(cur.parentVersionId);
        }
        return cur !== undefined && isAi(cur.source);
      });
    }
    const cover = await this.db
      .selectFrom('covers')
      .select(['ebookAssetId', 'wrapAssetId'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .executeTakeFirst();
    const assetIds = [cover?.ebookAssetId, cover?.wrapAssetId, ...sections.filter((s) => s.kind === 'spread').map((s) => s.imageAssetId)].filter(
      (x): x is string => typeof x === 'string' && x.length > 0,
    );
    let images = false;
    if (assetIds.length > 0) {
      const hit = await this.db
        .selectFrom('assets')
        .select('id')
        .where('workspaceId', '=', ctx.workspaceId)
        .where('id', 'in', assetIds)
        .where('aiGenerated', '=', 1)
        .executeTakeFirst();
      images = hit !== undefined;
    }
    return { text, images };
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
      partId?: string | null;
    },
  ): Promise<void> {
    const patch: Partial<SectionsTable> = { updatedAt: now() };
    if (set.title !== undefined) patch.title = set.title;
    if (set.plan !== undefined) patch.plan = toJson(set.plan);
    if (set.wordTarget !== undefined) patch.wordTarget = set.wordTarget;
    if (set.blueprintChanged !== undefined) patch.blueprintChanged = flag(set.blueprintChanged);
    if (set.enabled !== undefined) patch.enabled = flag(set.enabled);
    if (set.position !== undefined) patch.position = set.position;
    if (set.partId !== undefined) patch.partId = set.partId;
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

  /** The code guardrail report for a section's new text, worked out before a save's transaction. */
  private async guardrailsFor(ctx: RequestCtx, sectionId: string, bodyMd: string, styleRewrite?: AiGuardrails['styleRewrite']): Promise<AiGuardrails | null> {
    if (!this.textChecker) return null;
    const owner = await this.db
      .selectFrom('sections')
      .select(['projectId'])
      .where('id', '=', sectionId)
      .where('workspaceId', '=', ctx.workspaceId)
      .executeTakeFirst();
    let guardrails = owner ? await this.textChecker(ctx, owner.projectId, bodyMd) : null;
    if (guardrails && styleRewrite) guardrails = { ...guardrails, styleRewrite };
    return guardrails;
  }

  private static conflict(currentVersionId: string | null, baseVersionId: string | null): AppError {
    return new AppError('conflict', 'This section changed since you opened it. Compare both versions and choose one.', { currentVersionId, baseVersionId });
  }

  async saveVersion(ctx: RequestCtx, sectionId: string, input: SaveVersionInput): Promise<SectionVersion> {
    // The guardrail report is worked out before the transaction (the checker reads the book, profile and sources).
    const guardrails = await this.guardrailsFor(ctx, sectionId, input.bodyMd, input.styleRewrite);
    const save = (trx: Db): Promise<SectionVersion> => this.insertVersion(trx, ctx, sectionId, input, guardrails);
    return this.db.isTransaction ? save(this.db) : this.db.transaction().execute(save);
  }

  private async insertVersion(trx: Db, ctx: RequestCtx, sectionId: string, input: SaveVersionInput, guardrails: AiGuardrails | null): Promise<SectionVersion> {
    {
      const section = await trx.selectFrom('sections').selectAll().where('id', '=', sectionId).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
      if (!section) throw notFound('Section');
      if (input.baseVersionId !== undefined && input.baseVersionId !== section.currentVersionId) {
        throw ManuscriptRepo.conflict(section.currentVersionId, input.baseVersionId);
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
          createdBy: input.createdBy ?? null,
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
    }
  }

  /**
   * The editor's autosave. Saves an `owner:autosave` version, or, when the current version is this user's own autosave
   * from less than AUTOSAVE_WINDOW_MS ago, updates that version in place so a long edit session does not pile up
   * versions. Any other save (explicit save, restore, AI) makes a version that is not an autosave and so closes the
   * window. A baseVersionId that is not the current version is a 409 conflict carrying the current version id; so is a
   * baseRevision that is not the open autosave's updatedAt (two tabs on one version). Without baseRevision the autosave
   * always makes a new version.
   */
  async autosave(
    ctx: RequestCtx,
    sectionId: string,
    input: { bodyMd: string; content?: unknown; baseVersionId: string | null; baseRevision?: number },
  ): Promise<{ version: SectionVersion; coalesced: boolean }> {
    const guardrails = await this.guardrailsFor(ctx, sectionId, input.bodyMd);
    const run = async (trx: Db): Promise<{ version: SectionVersion; coalesced: boolean }> => {
      const section = await trx.selectFrom('sections').selectAll().where('id', '=', sectionId).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
      if (!section) throw notFound('Section');
      if (input.baseVersionId !== section.currentVersionId) throw ManuscriptRepo.conflict(section.currentVersionId, input.baseVersionId);
      const cur = section.currentVersionId
        ? await trx
            .selectFrom('sectionVersions')
            .selectAll()
            .where('id', '=', section.currentVersionId)
            .where('workspaceId', '=', ctx.workspaceId)
            .executeTakeFirst()
        : undefined;
      const t = now();
      const open = cur && cur.source === OWNER_AUTOSAVE_SOURCE && cur.createdBy === ctx.userId && t - Number(cur.createdAt) < AUTOSAVE_WINDOW_MS;
      // The autosave the editor started from has been updated in place since (another tab or window): a conflict.
      const revisionConflict = (currentRevision: number): AppError =>
        new AppError('conflict', 'This section changed in another tab or window. Compare both versions and choose one.', {
          currentVersionId: cur?.id ?? null,
          baseVersionId: input.baseVersionId,
          currentRevision,
          baseRevision: input.baseRevision,
        });
      if (cur && open && input.baseRevision !== undefined && input.baseRevision !== Number(cur.updatedAt)) throw revisionConflict(Number(cur.updatedAt));
      if (cur && open && input.baseRevision !== undefined) {
        // Each in-place update moves the revision on, even within the same millisecond.
        const revision = Math.max(t, Number(cur.updatedAt) + 1);
        const plaintext = markdownToPlaintext(input.bodyMd);
        const words = wordCount(plaintext);
        const updated = await trx
          .updateTable('sectionVersions')
          .set({
            content: toJson(input.content ?? null),
            bodyMd: input.bodyMd,
            plaintext,
            wordCount: words,
            guardrails: guardrails ? toJson(guardrails) : null,
            updatedAt: revision,
          })
          .where('id', '=', cur.id)
          .where('workspaceId', '=', ctx.workspaceId)
          // Compare and set: a save that landed since the read above changed updatedAt, so this one changes nothing.
          .where('updatedAt', '=', cur.updatedAt)
          .executeTakeFirst();
        if (Number(updated.numUpdatedRows) === 0) {
          const now2 = await trx.selectFrom('sectionVersions').select('updatedAt').where('id', '=', cur.id).executeTakeFirst();
          throw revisionConflict(Number(now2?.updatedAt ?? 0));
        }
        await trx
          .updateTable('sections')
          .set({ status: words > 0 ? 'done' : 'empty', updatedAt: t })
          .where('id', '=', sectionId)
          .where('workspaceId', '=', ctx.workspaceId)
          .execute();
        await trx.updateTable('projects').set({ updatedAt: t }).where('id', '=', section.projectId).where('workspaceId', '=', ctx.workspaceId).execute();
        const row = await trx.selectFrom('sectionVersions').selectAll().where('id', '=', cur.id).executeTakeFirstOrThrow();
        return { version: toVersion(row), coalesced: true };
      }
      const version = await this.insertVersion(
        trx,
        ctx,
        sectionId,
        { bodyMd: input.bodyMd, content: input.content, source: OWNER_AUTOSAVE_SOURCE, note: 'Autosave', createdBy: ctx.userId },
        guardrails,
      );
      return { version, coalesced: false };
    };
    return this.db.isTransaction ? run(this.db) : this.db.transaction().execute(run);
  }

  async listVersions(ctx: RequestCtx, sectionId: string): Promise<Omit<SectionVersion, 'content' | 'bodyMd' | 'plaintext'>[]> {
    await this.requireSection(ctx, sectionId);
    const rows = await this.db
      .selectFrom('sectionVersions')
      .select([
        'id',
        'sectionId',
        'projectId',
        'version',
        'wordCount',
        'source',
        'parentVersionId',
        'promptRunId',
        'summary',
        'note',
        'createdBy',
        'createdAt',
        'updatedAt',
      ])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('sectionId', '=', sectionId)
      .orderBy('version', 'desc')
      .execute();
    return rows.map((r) => ({ ...r, createdAt: Number(r.createdAt), updatedAt: Number(r.updatedAt) }));
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

  /** Saves an old version's text as the new current version. `note` names why (default "Restored version N"). */
  async restoreVersion(ctx: RequestCtx, sectionId: string, versionId: string, note?: string): Promise<SectionVersion> {
    const v = await this.requireVersion(ctx, sectionId, versionId);
    return this.saveVersion(ctx, sectionId, {
      bodyMd: v.bodyMd,
      content: v.content,
      source: 'restore',
      parentVersionId: v.id,
      note: note ?? `Restored version ${v.version}`,
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
    items: {
      sentence: string;
      category: string;
      checkNeeded: string;
      start: number | null;
      end: number | null;
      suggestedSoftening?: string | null;
      /** The checker's risk rating (claim tiers, kept in location.risk); a claim with none needs the owner's check. */
      risk?: 'low' | 'medium' | 'high' | null;
      /** Whether the claim would do harm if wrong (location.harmIfWrong). */
      harmIfWrong?: boolean | null;
    }[],
  ): Promise<Claim[]> {
    const t = now();
    const ids: string[] = [];
    // A sentence the owner already settled (verified, softened, removed) or that is already open in this section is
    // not filed again when the checks run on a later version: accepted claims must not come back. Nor is the text a
    // settled claim was replaced with (location.replacement, kept by the fix and soften routes): the fix is the answer.
    const rows = await this.db
      .selectFrom('claims')
      .select(['sentence', 'status', 'location'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('sectionId', '=', sectionId)
      .execute();
    const known = new Set(rows.map((r) => normSentence(r.sentence)));
    const replacements = rows.flatMap((r) => {
      if (r.status === 'open') return [];
      const replacement = fromJson(Obj, r.location, {})['replacement'];
      return typeof replacement === 'string' && replacement.trim() ? [normSentence(replacement)] : [];
    });
    for (const it of items) {
      const key = normSentence(it.sentence);
      if (known.has(key)) continue;
      // Exact match only: a short fragment inside a long replacement may be a new claim and must still be filed.
      if (key && replacements.includes(key)) continue;
      known.add(key);
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
          location: toJson({
            start: it.start,
            end: it.end,
            ...(it.risk ? { risk: it.risk } : {}),
            ...(typeof it.harmIfWrong === 'boolean' ? { harmIfWrong: it.harmIfWrong } : {}),
          }),
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

  /**
   * Retires open claims whose sentence is no longer in the text they were filed against (the section was rewritten), so
   * old claims do not pile up beside the new ones. Each is marked removed with a note. `keepVersionId` is the version
   * the text belongs to: its own claims are never retired. Returns how many were retired.
   */
  async retireGoneClaims(ctx: RequestCtx, sectionId: string, bodyMd: string, keepVersionId: string): Promise<number> {
    const open = await this.listClaims(ctx, { sectionId, status: 'open' });
    let n = 0;
    for (const c of open) {
      if (c.versionId === keepVersionId || bodyMd.includes(c.sentence)) continue;
      await this.resolveClaim(ctx, c.id, 'removed', { ownerNote: 'The sentence is no longer in the text (the section was rewritten).' });
      n += 1;
    }
    return n;
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
    extra: { ownerNote?: string | null; sourceUrl?: string | null; replacement?: string | null },
  ): Promise<Claim> {
    const t = now();
    const set: Partial<ClaimsTable> = { status, resolvedAt: t, updatedAt: t };
    if (extra.ownerNote !== undefined) set.ownerNote = extra.ownerNote;
    if (extra.sourceUrl !== undefined) set.sourceUrl = extra.sourceUrl;
    // The text the sentence was replaced with, kept in the claim's location JSON (no new column), so addClaims does not
    // file the fixed wording again on the next check.
    if (extra.replacement !== undefined) {
      const claim = await this.requireClaim(ctx, id);
      const location: Record<string, unknown> = { ...claim.location };
      if (extra.replacement && extra.replacement.trim()) location['replacement'] = extra.replacement.trim();
      else delete location['replacement'];
      set.location = toJson(location);
    }
    await this.db.updateTable('claims').set(set).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    return this.requireClaim(ctx, id);
  }
}
