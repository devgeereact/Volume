import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { CoversTable, ExportsTable, MarketingItemsTable } from '../db/schema.js';
import { notFound } from '../http/errors.js';
import { bool, flag, fromJson, newId, now, toJson } from '../lib/util.js';
import type { AiGuardrails, AiUsage } from '../ports/ai.js';

const Obj = z.record(z.string(), z.unknown());

// ---------------- covers ----------------

export const CoverConceptSchema = z.object({
  assetId: z.string(),
  name: z.string(),
  prompt: z.string(),
  why: z.string().default(''),
  mock: z.boolean().default(false),
});

export interface Cover {
  id: string;
  projectId: string;
  brief: Record<string, unknown>;
  concepts: z.infer<typeof CoverConceptSchema>[];
  chosenAssetId: string | null;
  typography: Record<string, unknown>;
  ebookAssetId: string | null;
  wrapAssetId: string | null;
  wrapSpec: Record<string, unknown>;
  status: string;
  updatedAt: number;
}

function toCover(r: CoversTable): Cover {
  return {
    id: r.id,
    projectId: r.projectId,
    brief: fromJson(Obj, r.brief, {}),
    concepts: fromJson(z.array(CoverConceptSchema), r.concepts, []),
    chosenAssetId: r.chosenAssetId,
    typography: fromJson(Obj, r.typography, {}),
    ebookAssetId: r.ebookAssetId,
    wrapAssetId: r.wrapAssetId,
    wrapSpec: fromJson(Obj, r.wrapSpec, {}),
    status: r.status,
    updatedAt: Number(r.updatedAt),
  };
}

// ---------------- marketing ----------------

export const MARKETING_KINDS = ['tiktok_script', 'instagram_caption', 'launch_email'] as const;

export const MarketingPatchSchema = z.object({
  title: z.string().max(255).nullable().optional(),
  hook: z.string().max(5000).nullable().optional(),
  body: z.string().min(1).max(50000).optional(),
  cta: z.string().max(2000).nullable().optional(),
  hashtags: z.array(z.string().max(100)).max(30).optional(),
  durationS: z.number().int().min(0).max(3600).nullable().optional(),
  status: z.enum(['draft', 'used']).optional(),
});

export interface MarketingItem {
  id: string;
  projectId: string;
  profileId: string | null;
  kind: string;
  title: string | null;
  hook: string | null;
  body: string;
  cta: string | null;
  hashtags: string[];
  durationS: number | null;
  status: string;
  archivedAt: number | null;
  jobId: string | null;
  createdAt: number;
  updatedAt: number;
  /** Launch email: every subject line the model offered (title holds the first). Empty for other kinds. */
  subjectLines: string[];
  /** Instagram caption: what the picture should show. Null for other kinds. */
  imageIdea: string | null;
}

export interface MarketingExtras {
  subjectLines?: string[];
  imageIdea?: string | null;
}
const ExtrasSchema = z.object({ subjectLines: z.array(z.string()).optional(), imageIdea: z.string().nullable().optional() });

function toMarketing(r: MarketingItemsTable): MarketingItem {
  return {
    id: r.id,
    projectId: r.projectId,
    profileId: r.profileId,
    kind: r.kind,
    title: r.title,
    hook: r.hook,
    body: r.body,
    cta: r.cta,
    hashtags: fromJson(z.array(z.string()), r.hashtags, []),
    durationS: r.durationS,
    status: r.status,
    archivedAt: r.archivedAt === null ? null : Number(r.archivedAt),
    jobId: r.jobId,
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
    ...extrasOf(r.extras),
  };
}

function extrasOf(json: string | null): { subjectLines: string[]; imageIdea: string | null } {
  const e = fromJson(ExtrasSchema, json, {});
  return { subjectLines: e.subjectLines ?? [], imageIdea: e.imageIdea?.trim() ? e.imageIdea : null };
}

// ---------------- exports ----------------

export interface ExportRecord {
  id: string;
  projectId: string;
  kind: string;
  trim: string | null;
  paper: string | null;
  status: string;
  assetId: string | null;
  bytes: number | null;
  pageCount: number | null;
  sha256: string | null;
  manuscriptHash: string | null;
  preflight: Record<string, unknown>;
  jobId: string | null;
  mock: boolean;
  error: string | null;
  createdAt: number;
}

function toExport(r: ExportsTable): ExportRecord {
  return {
    id: r.id,
    projectId: r.projectId,
    kind: r.kind,
    trim: r.trim,
    paper: r.paper,
    status: r.status,
    assetId: r.assetId,
    bytes: r.bytes === null ? null : Number(r.bytes),
    pageCount: r.pageCount,
    sha256: r.sha256,
    manuscriptHash: r.manuscriptHash,
    preflight: fromJson(Obj, r.preflight, {}),
    jobId: r.jobId,
    mock: bool(r.mock),
    error: r.error,
    createdAt: Number(r.createdAt),
  };
}

/** The listing the matter stage wrote: the Amazon description (KDP HTML), back-cover blurb, short bio, categories, keywords. */
export interface Listing {
  descriptionHtml: string | null;
  backBlurb: string | null;
  shortBio: string | null;
  categories: string[];
  keywords: string[];
  /** Who wrote the text: `ai:matter` for the listing job, null for older rows. */
  source: string | null;
  updatedAt: number;
}

export class ProductionRepo {
  constructor(private readonly db: Db) {}

  /** The book's listing written by the matter stage (listings row), or null before the listing job has run. */
  async getListing(ctx: RequestCtx, projectId: string): Promise<Listing | null> {
    const r = await this.db
      .selectFrom('listings')
      .select(['descriptionHtml', 'backBlurb', 'shortBio', 'categories', 'keywords', 'source', 'updatedAt'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .executeTakeFirst();
    if (!r) return null;
    return {
      descriptionHtml: r.descriptionHtml,
      backBlurb: r.backBlurb,
      shortBio: r.shortBio,
      categories: fromJson(z.array(z.string()), r.categories, []),
      keywords: fromJson(z.array(z.string()), r.keywords, []),
      source: r.source,
      updatedAt: Number(r.updatedAt),
    };
  }

  /** Saves the matter stage's listing for the book (one row per book), keeping its pricing and disclosure note. */
  async saveListing(ctx: RequestCtx, projectId: string, l: Omit<Listing, 'updatedAt'>): Promise<Listing> {
    const t = now();
    const fields = {
      descriptionHtml: l.descriptionHtml,
      backBlurb: l.backBlurb,
      shortBio: l.shortBio,
      categories: toJson(l.categories),
      keywords: toJson(l.keywords),
      source: l.source,
      updatedAt: t,
    };
    const row = await this.db
      .selectFrom('listings')
      .select('id')
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .executeTakeFirst();
    if (row) {
      await this.db.updateTable('listings').set(fields).where('id', '=', row.id).where('workspaceId', '=', ctx.workspaceId).execute();
    } else {
      await this.db
        .insertInto('listings')
        .values({ id: newId(), workspaceId: ctx.workspaceId, projectId, ...fields, aiDisclosureNote: null, pricing: '{}', kdpRulesVersion: null, createdAt: t })
        .execute();
    }
    const saved = await this.getListing(ctx, projectId);
    if (!saved) throw notFound('Listing');
    return saved;
  }

  // covers

  async getCover(ctx: RequestCtx, projectId: string): Promise<Cover | null> {
    const r = await this.db.selectFrom('covers').selectAll().where('workspaceId', '=', ctx.workspaceId).where('projectId', '=', projectId).executeTakeFirst();
    return r ? toCover(r) : null;
  }

  async upsertCover(ctx: RequestCtx, projectId: string, patch: Partial<Omit<Cover, 'id' | 'projectId' | 'updatedAt'>>): Promise<Cover> {
    const existing = await this.getCover(ctx, projectId);
    const t = now();
    const set: Partial<CoversTable> = { updatedAt: t };
    if (patch.brief !== undefined) set.brief = toJson(patch.brief);
    if (patch.concepts !== undefined) set.concepts = toJson(patch.concepts);
    if (patch.chosenAssetId !== undefined) set.chosenAssetId = patch.chosenAssetId;
    if (patch.typography !== undefined) set.typography = toJson(patch.typography);
    if (patch.ebookAssetId !== undefined) set.ebookAssetId = patch.ebookAssetId;
    if (patch.wrapAssetId !== undefined) set.wrapAssetId = patch.wrapAssetId;
    if (patch.wrapSpec !== undefined) set.wrapSpec = toJson(patch.wrapSpec);
    if (patch.status !== undefined) set.status = patch.status;
    if (existing) {
      await this.db.updateTable('covers').set(set).where('id', '=', existing.id).where('workspaceId', '=', ctx.workspaceId).execute();
    } else {
      await this.db
        .insertInto('covers')
        .values({
          id: newId(),
          workspaceId: ctx.workspaceId,
          projectId,
          brief: set.brief ?? '{}',
          concepts: set.concepts ?? '[]',
          chosenAssetId: set.chosenAssetId ?? null,
          typography: set.typography ?? '{}',
          ebookAssetId: set.ebookAssetId ?? null,
          wrapAssetId: set.wrapAssetId ?? null,
          wrapSpec: set.wrapSpec ?? '{}',
          status: set.status ?? 'brief',
          createdAt: t,
          updatedAt: t,
        })
        .execute();
    }
    const c = await this.getCover(ctx, projectId);
    if (!c) throw notFound('Cover');
    return c;
  }

  // marketing

  async addMarketingItems(
    ctx: RequestCtx,
    projectId: string,
    profileId: string | null,
    items: {
      kind: string;
      title: string | null;
      hook: string | null;
      body: string;
      cta: string | null;
      hashtags: string[];
      durationS: number | null;
      extras?: MarketingExtras;
    }[],
    jobId: string | null,
    promptRunId: string | null,
  ): Promise<void> {
    const t = now();
    for (const it of items) {
      await this.db
        .insertInto('marketingItems')
        .values({
          id: newId(),
          workspaceId: ctx.workspaceId,
          projectId,
          profileId,
          kind: it.kind,
          title: it.title,
          hook: it.hook,
          body: it.body,
          cta: it.cta,
          hashtags: toJson(it.hashtags),
          durationS: it.durationS,
          status: 'draft',
          archivedAt: null,
          jobId,
          promptRunId,
          extras: it.extras ? toJson(it.extras) : null,
          createdAt: t,
          updatedAt: t,
        })
        .execute();
    }
  }

  /** Replaces an item's text with a regenerated one (same id, kind and book), back to draft. */
  async replaceMarketing(
    ctx: RequestCtx,
    id: string,
    it: { title: string | null; hook: string | null; body: string; cta: string | null; hashtags: string[]; durationS: number | null; extras?: MarketingExtras },
    jobId: string | null,
    promptRunId: string | null,
  ): Promise<MarketingItem> {
    await this.requireMarketing(ctx, id);
    await this.db
      .updateTable('marketingItems')
      .set({
        title: it.title,
        hook: it.hook,
        body: it.body,
        cta: it.cta,
        hashtags: toJson(it.hashtags),
        durationS: it.durationS,
        extras: it.extras ? toJson(it.extras) : null,
        status: 'draft',
        archivedAt: null,
        jobId,
        promptRunId,
        updatedAt: now(),
      })
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
    return this.requireMarketing(ctx, id);
  }

  async listMarketing(ctx: RequestCtx, projectId: string, filter: { kind?: string; includeArchived?: boolean }): Promise<MarketingItem[]> {
    let q = this.db.selectFrom('marketingItems').selectAll().where('workspaceId', '=', ctx.workspaceId).where('projectId', '=', projectId);
    if (filter.kind) q = q.where('kind', '=', filter.kind);
    if (!filter.includeArchived) q = q.where('status', '!=', 'archived');
    return (await q.orderBy('id', 'desc').execute()).map(toMarketing);
  }

  /** Marketing items across every book, newest first (for example status archived for the Archive screen). */
  async listAllMarketing(ctx: RequestCtx, filter: { status?: string; kind?: string; limit?: number }): Promise<MarketingItem[]> {
    let q = this.db.selectFrom('marketingItems').selectAll().where('workspaceId', '=', ctx.workspaceId);
    if (filter.status) q = q.where('status', '=', filter.status);
    if (filter.kind) q = q.where('kind', '=', filter.kind);
    return (
      await q
        .orderBy('id', 'desc')
        .limit(filter.limit ?? 200)
        .execute()
    ).map(toMarketing);
  }

  async requireMarketing(ctx: RequestCtx, id: string): Promise<MarketingItem> {
    const r = await this.db.selectFrom('marketingItems').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (!r) throw notFound('Marketing item');
    return toMarketing(r);
  }

  async updateMarketing(
    ctx: RequestCtx,
    id: string,
    patch: { [K in Exclude<keyof z.infer<typeof MarketingPatchSchema>, 'status'>]?: z.infer<typeof MarketingPatchSchema>[K] | undefined } & {
      status?: string | undefined;
      archivedAt?: number | null | undefined;
    },
  ): Promise<MarketingItem> {
    await this.requireMarketing(ctx, id);
    const set: Partial<MarketingItemsTable> = { updatedAt: now() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.hook !== undefined) set.hook = patch.hook;
    if (patch.body !== undefined) set.body = patch.body;
    if (patch.cta !== undefined) set.cta = patch.cta;
    if (patch.hashtags !== undefined) set.hashtags = toJson(patch.hashtags);
    if (patch.durationS !== undefined) set.durationS = patch.durationS;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.archivedAt !== undefined) set.archivedAt = patch.archivedAt;
    await this.db.updateTable('marketingItems').set(set).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    return this.requireMarketing(ctx, id);
  }

  // exports

  async addExport(
    ctx: RequestCtx,
    projectId: string,
    rec: {
      kind: string;
      trim: string | null;
      paper: string | null;
      status: string;
      assetId: string | null;
      bytes: number | null;
      pageCount: number | null;
      sha256: string | null;
      manuscriptHash: string | null;
      preflight: unknown;
      jobId: string | null;
      mock: boolean;
      error?: string | null;
    },
  ): Promise<ExportRecord> {
    const t = now();
    const id = newId();
    await this.db
      .insertInto('exports')
      .values({
        id,
        workspaceId: ctx.workspaceId,
        projectId,
        kind: rec.kind,
        trim: rec.trim,
        paper: rec.paper,
        status: rec.status,
        assetId: rec.assetId,
        bytes: rec.bytes,
        pageCount: rec.pageCount,
        sha256: rec.sha256,
        manuscriptHash: rec.manuscriptHash,
        preflight: toJson(rec.preflight ?? {}),
        jobId: rec.jobId,
        mock: flag(rec.mock),
        error: rec.error ?? null,
        createdAt: t,
        updatedAt: t,
      })
      .execute();
    return this.requireExport(ctx, id);
  }

  async listExports(ctx: RequestCtx, projectId: string): Promise<ExportRecord[]> {
    const rows = await this.db
      .selectFrom('exports')
      .selectAll()
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .orderBy('id', 'desc')
      .execute();
    return rows.map(toExport);
  }

  async requireExport(ctx: RequestCtx, id: string): Promise<ExportRecord> {
    const r = await this.db.selectFrom('exports').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (!r) throw notFound('Export');
    return toExport(r);
  }

  // prompt runs

  /** Records an AI call and adds its cost to the book and the job, in one transaction. */
  async recordPromptRun(
    ctx: RequestCtx,
    run: {
      projectId: string | null;
      jobId: string | null;
      stage: string;
      prompt: { id: string; version: number; hash: string } | null;
      usage: AiUsage;
      status: string;
      error?: string | null;
      output?: string | null;
      guardrails?: AiGuardrails | null;
    },
  ): Promise<string> {
    const id = newId();
    const t = now();
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('promptRuns')
        .values({
          id,
          workspaceId: ctx.workspaceId,
          projectId: run.projectId,
          jobId: run.jobId,
          stage: run.stage,
          promptId: run.prompt?.id ?? null,
          promptVersion: run.prompt?.version ?? null,
          promptHash: run.prompt?.hash ?? null,
          provider: run.usage.provider,
          modelSlug: run.usage.model,
          generationId: run.usage.generationId,
          inputTokens: run.usage.inputTokens,
          outputTokens: run.usage.outputTokens,
          costUsd: run.usage.costUsd,
          latencyMs: run.usage.latencyMs,
          status: run.status,
          error: run.error ?? null,
          output: run.output ?? null,
          guardrails: run.guardrails ? toJson(run.guardrails) : null,
          createdAt: t,
          updatedAt: t,
        })
        .execute();
      if (run.projectId) {
        await trx
          .updateTable('projects')
          .set((eb) => ({ costToDateUsd: eb('costToDateUsd', '+', run.usage.costUsd), updatedAt: t }))
          .where('id', '=', run.projectId)
          .where('workspaceId', '=', ctx.workspaceId)
          .execute();
      }
      if (run.jobId) {
        await trx
          .updateTable('jobs')
          .set((eb) => ({ costUsd: eb('costUsd', '+', run.usage.costUsd) }))
          .where('id', '=', run.jobId)
          .where('workspaceId', '=', ctx.workspaceId)
          .execute();
      }
    });
    return id;
  }

  async listPromptRuns(
    ctx: RequestCtx,
    projectId: string,
    limit = 100,
  ): Promise<
    {
      id: string;
      stage: string;
      modelSlug: string;
      provider: string;
      costUsd: number;
      inputTokens: number;
      outputTokens: number;
      status: string;
      createdAt: number;
    }[]
  > {
    const rows = await this.db
      .selectFrom('promptRuns')
      .select(['id', 'stage', 'modelSlug', 'provider', 'costUsd', 'inputTokens', 'outputTokens', 'status', 'createdAt'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();
    return rows.map((r) => ({ ...r, costUsd: Number(r.costUsd), createdAt: Number(r.createdAt) }));
  }

  async monthSpendUsd(ctx: RequestCtx, at = now()): Promise<number> {
    const d = new Date(at);
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    const r = await this.db
      .selectFrom('promptRuns')
      .select((eb) => eb.fn.sum<number>('costUsd').as('total'))
      .where('workspaceId', '=', ctx.workspaceId)
      .where('createdAt', '>=', start)
      .executeTakeFirst();
    return Number(r?.total ?? 0);
  }
}
