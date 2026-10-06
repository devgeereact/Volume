import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { BlueprintsTable, ResearchRunsTable, ResearchSourcesTable, TitleSetsTable } from '../db/schema.js';
import { AppError, notFound } from '../http/errors.js';
import { bool, flag, fromJson, newId, now, sha256Hex, toJson } from '../lib/util.js';
import type { AiSource } from '../ports/ai.js';
import { loadRunInfo, type GuardrailSummary, type RunInfo } from './run-info.js';

const Obj = z.record(z.string(), z.unknown());
const Arr = z.array(z.unknown());

// ---------------- research ----------------

export interface ResearchSource {
  id: string;
  researchRunId: string;
  url: string;
  title: string | null;
  domain: string | null;
  excerpt: string | null;
  startIndex: number | null;
  endIndex: number | null;
  useInBook: boolean;
  linkStatus: string;
  /** The search grounding redirect link the URL was resolved from, when it was one. */
  redirectUrl: string | null;
  /** True when the URL is still a redirect link that could not be resolved: say so in the UI. */
  unresolved: boolean;
}

/** Model, cost (USD, every call in the job) and guardrails of the AI work behind an item. */
export interface RunFields {
  promptRunId: string | null;
  model: string | null;
  costUsd: number;
  guardrails: GuardrailSummary | null;
}

function runFields(i: RunInfo): RunFields {
  return { promptRunId: i.promptRunId, model: i.model, costUsd: i.costUsd, guardrails: i.guardrails };
}

export interface ResearchRun extends RunFields {
  id: string;
  projectId: string;
  jobId: string | null;
  status: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

function toRun(r: ResearchRunsTable): Omit<ResearchRun, keyof RunFields> & { promptRunId: string | null } {
  return {
    id: r.id,
    projectId: r.projectId,
    jobId: r.jobId,
    promptRunId: r.promptRunId,
    status: r.status,
    input: fromJson(Obj, r.input, {}),
    output: r.output === null ? null : fromJson(Obj, r.output, {}),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
  };
}

function toSource(r: ResearchSourcesTable): ResearchSource {
  return {
    id: r.id,
    researchRunId: r.researchRunId,
    url: r.url,
    title: r.title,
    domain: r.domain,
    excerpt: r.excerpt,
    startIndex: r.startIndex,
    endIndex: r.endIndex,
    useInBook: bool(r.useInBook),
    linkStatus: r.linkStatus,
    redirectUrl: r.redirectUrl ?? null,
    unresolved: bool(r.unresolved),
  };
}

/** Host without "www.", the same rule @volume/ai uses. */
function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '') || null;
  } catch {
    return null;
  }
}

/** The source's own domain wins; an unresolved redirect link has none. */
function sourceDomain(s: AiSource): string | null {
  if (s.domain !== undefined) return s.domain;
  return s.unresolved ? null : domainOf(s.url);
}

// ---------------- titles ----------------

export interface TitleSet extends RunFields {
  id: string;
  projectId: string;
  jobId: string | null;
  directions: unknown[];
  options: unknown[];
  chosenIndex: number | null;
  createdAt: number;
}

function toTitleSet(r: TitleSetsTable): Omit<TitleSet, keyof RunFields> & { promptRunId: string | null } {
  return {
    id: r.id,
    projectId: r.projectId,
    jobId: r.jobId,
    directions: fromJson(Arr, r.directions, []),
    // Every option object carries favourite (false unless the owner starred it).
    options: fromJson(Arr, r.options, []).map((o) =>
      o && typeof o === 'object' && !Array.isArray(o)
        ? { ...(o as Record<string, unknown>), favourite: (o as Record<string, unknown>)['favourite'] === true }
        : o,
    ),
    chosenIndex: r.chosenIndex,
    createdAt: Number(r.createdAt),
    promptRunId: r.promptRunId,
  };
}

// ---------------- blueprints ----------------

export interface BlueprintVersion extends RunFields {
  id: string;
  projectId: string;
  version: number;
  status: string;
  source: string;
  note: string | null;
  data: Record<string, unknown>;
  parentVersionId: string | null;
  approvedAt: number | null;
  approvedBy: string | null;
  createdAt: number;
}

function toBlueprint(r: BlueprintsTable): Omit<BlueprintVersion, keyof RunFields> & { promptRunId: string | null } {
  return {
    id: r.id,
    projectId: r.projectId,
    version: r.version,
    status: r.status,
    source: r.source,
    note: r.note,
    data: fromJson(Obj, r.data, {}),
    parentVersionId: r.parentVersionId,
    approvedAt: r.approvedAt === null ? null : Number(r.approvedAt),
    approvedBy: r.approvedBy,
    createdAt: Number(r.createdAt),
    promptRunId: r.promptRunId,
  };
}

export class PlanningRepo {
  constructor(private readonly db: Db) {}

  /** Adds model, cost and guardrails from prompt_runs (two queries for the whole list). */
  private async withRuns<T extends { promptRunId: string | null; jobId?: string | null }>(ctx: RequestCtx, items: T[]): Promise<(T & RunFields)[]> {
    const info = await loadRunInfo(
      this.db,
      ctx,
      items.map((i) => ({ promptRunId: i.promptRunId, jobId: i.jobId ?? null })),
    );
    return items.map((item, n) => {
      const f = runFields(info[n] ?? { promptRunId: null, model: null, costUsd: 0, guardrails: null });
      // The row's own prompt run id wins (it is the main call); the lookup fills it when missing.
      return { ...item, ...f, promptRunId: item.promptRunId ?? f.promptRunId };
    });
  }

  private async withRun<T extends { promptRunId: string | null; jobId?: string | null }>(ctx: RequestCtx, item: T): Promise<T & RunFields> {
    const [out] = await this.withRuns(ctx, [item]);
    return out as T & RunFields;
  }

  // research

  async createRun(ctx: RequestCtx, projectId: string, input: Record<string, unknown>, jobId: string | null): Promise<ResearchRun> {
    const t = now();
    const id = newId();
    await this.db
      .insertInto('researchRuns')
      .values({
        id,
        workspaceId: ctx.workspaceId,
        projectId,
        jobId,
        promptRunId: null,
        status: 'queued',
        input: toJson(input),
        output: null,
        createdAt: t,
        updatedAt: t,
      })
      .execute();
    return this.requireRun(ctx, id);
  }

  async completeRun(ctx: RequestCtx, runId: string, output: unknown, sources: AiSource[], promptRunId: string | null): Promise<void> {
    const t = now();
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('researchRuns')
        .set({ status: 'done', output: toJson(output), promptRunId, updatedAt: t })
        .where('id', '=', runId)
        .where('workspaceId', '=', ctx.workspaceId)
        .execute();
      const run = await trx
        .selectFrom('researchRuns')
        .select(['projectId'])
        .where('id', '=', runId)
        .where('workspaceId', '=', ctx.workspaceId)
        .executeTakeFirstOrThrow();
      const seen = new Set<string>();
      for (const s of sources) {
        const urlHash = sha256Hex(s.url);
        if (seen.has(urlHash)) continue;
        seen.add(urlHash);
        await trx
          .insertInto('researchSources')
          .values({
            id: newId(),
            workspaceId: ctx.workspaceId,
            researchRunId: runId,
            projectId: run.projectId,
            url: s.url,
            urlHash,
            title: s.title,
            domain: sourceDomain(s),
            excerpt: s.excerpt,
            startIndex: s.startIndex,
            endIndex: s.endIndex,
            // A resolved source is ticked for the book by default (the owner can untick it); an unresolved
            // search redirect waits for the owner (live run 3: resources used one of three ticked sources).
            useInBook: s.unresolved === true ? 0 : 1,
            linkStatus: 'unchecked',
            checkedAt: null,
            redirectUrl: s.redirectUrl ?? null,
            unresolved: flag(s.unresolved === true),
            createdAt: t,
            updatedAt: t,
          })
          .execute();
      }
    });
  }

  async failRun(ctx: RequestCtx, runId: string): Promise<void> {
    await this.db
      .updateTable('researchRuns')
      .set({ status: 'failed', updatedAt: now() })
      .where('id', '=', runId)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
  }

  async listRuns(ctx: RequestCtx, projectId: string): Promise<ResearchRun[]> {
    const rows = await this.db
      .selectFrom('researchRuns')
      .selectAll()
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .orderBy('id', 'desc')
      .execute();
    return this.withRuns(ctx, rows.map(toRun));
  }

  async requireRun(ctx: RequestCtx, id: string): Promise<ResearchRun> {
    const r = await this.db.selectFrom('researchRuns').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (!r) throw notFound('Research run');
    return this.withRun(ctx, toRun(r));
  }

  async listSources(ctx: RequestCtx, filter: { runId?: string; projectId?: string; useInBook?: boolean }): Promise<ResearchSource[]> {
    let q = this.db.selectFrom('researchSources').selectAll().where('workspaceId', '=', ctx.workspaceId);
    if (filter.runId) q = q.where('researchRunId', '=', filter.runId);
    if (filter.projectId) q = q.where('projectId', '=', filter.projectId);
    if (filter.useInBook !== undefined) q = q.where('useInBook', '=', flag(filter.useInBook));
    return (await q.orderBy('id').execute()).map(toSource);
  }

  async setSourceUse(ctx: RequestCtx, sourceId: string, useInBook: boolean): Promise<ResearchSource> {
    const res = await this.db
      .updateTable('researchSources')
      .set({ useInBook: flag(useInBook), updatedAt: now() })
      .where('id', '=', sourceId)
      .where('workspaceId', '=', ctx.workspaceId)
      .executeTakeFirst();
    if (Number(res.numUpdatedRows) === 0) throw notFound('Source');
    const r = await this.db
      .selectFrom('researchSources')
      .selectAll()
      .where('id', '=', sourceId)
      .where('workspaceId', '=', ctx.workspaceId)
      .executeTakeFirstOrThrow();
    return toSource(r);
  }

  // titles

  async createTitleSet(
    ctx: RequestCtx,
    projectId: string,
    data: { directions: unknown[]; options: unknown[]; jobId: string | null; promptRunId: string | null },
  ): Promise<TitleSet> {
    const t = now();
    const id = newId();
    await this.db
      .insertInto('titleSets')
      .values({
        id,
        workspaceId: ctx.workspaceId,
        projectId,
        jobId: data.jobId,
        promptRunId: data.promptRunId,
        directions: toJson(data.directions),
        options: toJson(data.options),
        chosenIndex: null,
        createdAt: t,
        updatedAt: t,
      })
      .execute();
    return this.requireTitleSet(ctx, id);
  }

  async listTitleSets(ctx: RequestCtx, projectId: string): Promise<TitleSet[]> {
    const rows = await this.db
      .selectFrom('titleSets')
      .selectAll()
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .orderBy('id', 'desc')
      .execute();
    return this.withRuns(ctx, rows.map(toTitleSet));
  }

  async requireTitleSet(ctx: RequestCtx, id: string): Promise<TitleSet> {
    const r = await this.db.selectFrom('titleSets').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (!r) throw notFound('Title set');
    return this.withRun(ctx, toTitleSet(r));
  }

  /** Stars or unstars one title option. */
  async setFavourite(ctx: RequestCtx, id: string, index: number, favourite: boolean): Promise<TitleSet> {
    const r = await this.db.selectFrom('titleSets').select(['options']).where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (!r) throw notFound('Title set');
    const options = fromJson(Arr, r.options, []);
    const opt = options[index];
    if (!opt || typeof opt !== 'object' || Array.isArray(opt)) throw notFound('Title option');
    options[index] = { ...(opt as Record<string, unknown>), favourite };
    await this.db
      .updateTable('titleSets')
      .set({ options: toJson(options), updatedAt: now() })
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
    return this.requireTitleSet(ctx, id);
  }

  async chooseTitle(ctx: RequestCtx, id: string, index: number): Promise<TitleSet> {
    const set = await this.requireTitleSet(ctx, id);
    if (index < 0 || index >= set.options.length) throw new AppError('validation_failed', 'That title option does not exist.');
    await this.db
      .updateTable('titleSets')
      .set({ chosenIndex: index, updatedAt: now() })
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
    return this.requireTitleSet(ctx, id);
  }

  // blueprints

  async latestBlueprint(ctx: RequestCtx, projectId: string): Promise<BlueprintVersion | null> {
    const r = await this.db
      .selectFrom('blueprints')
      .selectAll()
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .orderBy('version', 'desc')
      .executeTakeFirst();
    return r ? this.withRun(ctx, toBlueprint(r)) : null;
  }

  async blueprintVersions(ctx: RequestCtx, projectId: string): Promise<Omit<BlueprintVersion, 'data'>[]> {
    const rows = await this.db
      .selectFrom('blueprints')
      .selectAll()
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .orderBy('version', 'desc')
      .execute();
    const items = await this.withRuns(ctx, rows.map(toBlueprint));
    return items.map((b) => {
      const { data: _data, ...rest } = b;
      return rest;
    });
  }

  async blueprintByVersion(ctx: RequestCtx, projectId: string, version: number): Promise<BlueprintVersion> {
    const r = await this.db
      .selectFrom('blueprints')
      .selectAll()
      .where('workspaceId', '=', ctx.workspaceId)
      .where('projectId', '=', projectId)
      .where('version', '=', version)
      .executeTakeFirst();
    if (!r) throw notFound('Blueprint version');
    return this.withRun(ctx, toBlueprint(r));
  }

  async blueprintById(ctx: RequestCtx, id: string): Promise<BlueprintVersion> {
    const r = await this.db.selectFrom('blueprints').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (!r) throw notFound('Blueprint');
    return this.withRun(ctx, toBlueprint(r));
  }

  /** Saves a new draft version. Older drafts stay as history. */
  async addBlueprintVersion(
    ctx: RequestCtx,
    projectId: string,
    data: Record<string, unknown>,
    meta: { source: string; note?: string | null; parentVersionId?: string | null; promptRunId?: string | null },
  ): Promise<BlueprintVersion> {
    return this.db
      .transaction()
      .execute(async (trx) => {
        const last = await trx
          .selectFrom('blueprints')
          .select(['version'])
          .where('workspaceId', '=', ctx.workspaceId)
          .where('projectId', '=', projectId)
          .orderBy('version', 'desc')
          .executeTakeFirst();
        const t = now();
        const id = newId();
        await trx
          .insertInto('blueprints')
          .values({
            id,
            workspaceId: ctx.workspaceId,
            projectId,
            version: (last?.version ?? 0) + 1,
            status: 'draft',
            data: toJson(data),
            source: meta.source,
            note: meta.note ?? null,
            parentVersionId: meta.parentVersionId ?? null,
            approvedAt: null,
            approvedBy: null,
            promptRunId: meta.promptRunId ?? null,
            createdAt: t,
            updatedAt: t,
          })
          .execute();
        const r = await trx.selectFrom('blueprints').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
        return toBlueprint(r);
      })
      .then((b) => this.withRun(ctx, b));
  }

  async approveBlueprint(ctx: RequestCtx, id: string): Promise<BlueprintVersion> {
    const bp = await this.blueprintById(ctx, id);
    const t = now();
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('blueprints')
        .set({ status: 'superseded', updatedAt: t })
        .where('workspaceId', '=', ctx.workspaceId)
        .where('projectId', '=', bp.projectId)
        .where('status', '=', 'approved')
        .execute();
      await trx
        .updateTable('blueprints')
        .set({ status: 'approved', approvedAt: t, approvedBy: ctx.userId, updatedAt: t })
        .where('id', '=', id)
        .where('workspaceId', '=', ctx.workspaceId)
        .execute();
    });
    return this.blueprintById(ctx, id);
  }
}
