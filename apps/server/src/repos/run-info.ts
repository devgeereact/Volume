import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import { fromJson } from '../lib/util.js';
import type { AiGuardrailHit, AiGuardrailRule } from '../ports/ai.js';

/**
 * Model, cost and guardrails of the AI work behind a research run, title set, blueprint version or
 * section version, read from prompt_runs. Cost is the sum of every call in the job that made it
 * (a titles job can make two calls); the model is the one that answered the main call.
 */

const HitSchema = z.looseObject({
  rule: z.string(),
  severity: z.string().default('warn'),
  message: z.string().default(''),
  match: z.string().default(''),
  path: z.string().optional(),
  phrase: z.string().optional(),
});
const RuleSchema = z.looseObject({
  rule: z.string(),
  list: z.string(),
  count: z.number().default(0),
  message: z.string().default(''),
  matches: z.array(z.string()).default([]),
});
const ReportSchema = z.looseObject({
  passed: z.boolean().default(true),
  blocking: z.array(HitSchema).default([]),
  needsAttention: z.array(HitSchema).default([]),
  rules: z.array(RuleSchema).default([]),
});

/** What the UI needs to show "needs attention" items. */
export interface GuardrailSummary {
  passed: boolean;
  /** Hits that block (an invented review, a link that is not a source, an unknown source marker...). */
  blocking: AiGuardrailHit[];
  /** Banned phrases left in the text for the owner to change. */
  needsAttention: AiGuardrailHit[];
  rules: AiGuardrailRule[];
}

export interface RunInfo {
  promptRunId: string | null;
  /** The model that answered the main call; null when no AI call made it (owner edits). */
  model: string | null;
  /** USD for every call in the job that made it. */
  costUsd: number;
  guardrails: GuardrailSummary | null;
}

export const NO_RUN: RunInfo = { promptRunId: null, model: null, costUsd: 0, guardrails: null };

export function parseGuardrails(json: string | null): GuardrailSummary | null {
  if (!json) return null;
  const r = fromJson(ReportSchema.nullable(), json, null);
  if (!r) return null;
  const hit = (h: z.infer<typeof HitSchema>): AiGuardrailHit => {
    const out: AiGuardrailHit = { rule: h.rule, severity: h.severity, message: h.message, match: h.match };
    if (h.path !== undefined) out.path = h.path;
    if (h.phrase !== undefined) out.phrase = h.phrase;
    return out;
  };
  return {
    passed: r.passed,
    blocking: r.blocking.map(hit),
    needsAttention: r.needsAttention.map(hit),
    rules: r.rules.map((x) => ({ rule: x.rule, list: x.list, count: x.count, message: x.message, matches: x.matches })),
  };
}

interface RunRow {
  id: string;
  jobId: string | null;
  modelSlug: string;
  costUsd: number;
  guardrails: string | null;
  status: string;
}

/** One RunInfo per ref, in order. Two queries whatever the number of refs. */
export async function loadRunInfo(db: Db, ctx: RequestCtx, refs: readonly { promptRunId: string | null; jobId?: string | null }[]): Promise<RunInfo[]> {
  const ids = [...new Set(refs.map((r) => r.promptRunId).filter((x): x is string => !!x))];
  const byId = new Map<string, RunRow>();
  if (ids.length > 0) {
    const rows = await db
      .selectFrom('promptRuns')
      .select(['id', 'jobId', 'modelSlug', 'costUsd', 'guardrails', 'status'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('id', 'in', ids)
      .execute();
    for (const r of rows) byId.set(r.id, { ...r, costUsd: Number(r.costUsd) });
  }
  const jobOf = (ref: { promptRunId: string | null; jobId?: string | null }): string | null =>
    ref.jobId ?? (ref.promptRunId ? (byId.get(ref.promptRunId)?.jobId ?? null) : null);
  const jobIds = [...new Set(refs.map(jobOf).filter((x): x is string => !!x))];
  const byJob = new Map<string, RunRow[]>();
  if (jobIds.length > 0) {
    const rows = await db
      .selectFrom('promptRuns')
      .select(['id', 'jobId', 'modelSlug', 'costUsd', 'guardrails', 'status'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('jobId', 'in', jobIds)
      .orderBy('id')
      .execute();
    for (const r of rows) {
      const list = byJob.get(r.jobId as string) ?? [];
      list.push({ ...r, costUsd: Number(r.costUsd) });
      byJob.set(r.jobId as string, list);
    }
  }
  return refs.map((ref) => {
    const job = jobOf(ref);
    const inJob = job ? (byJob.get(job) ?? []) : [];
    const main = (ref.promptRunId ? byId.get(ref.promptRunId) : undefined) ?? inJob.find((r) => r.status === 'ok') ?? inJob[0];
    if (!main && inJob.length === 0) return { ...NO_RUN };
    const cost = inJob.length > 0 ? inJob.reduce((n, r) => n + r.costUsd, 0) : (main?.costUsd ?? 0);
    return {
      promptRunId: main?.id ?? null,
      model: main?.modelSlug ?? null,
      costUsd: Math.round(cost * 1e6) / 1e6,
      guardrails: parseGuardrails(main?.guardrails ?? null),
    };
  });
}

/**
 * Guardrails of each section: the report stored with its current version (worked out on every save, so it
 * always matches the saved text). Older versions saved before that report existed fall back to the latest
 * AI-written version's run (writing or weave). promptRunId and model name the latest AI run. Sections with
 * neither get no entry.
 */
export async function sectionGuardrails(
  db: Db,
  ctx: RequestCtx,
  sectionIds: readonly string[],
): Promise<Map<string, { promptRunId: string; model: string; guardrails: GuardrailSummary | null }>> {
  const out = new Map<string, { promptRunId: string; model: string; guardrails: GuardrailSummary | null }>();
  if (sectionIds.length === 0) return out;
  const rows = await db
    .selectFrom('sectionVersions as v')
    .innerJoin('promptRuns as p', 'p.id', 'v.promptRunId')
    .select(['v.sectionId', 'v.version', 'p.id as runId', 'p.modelSlug', 'p.guardrails'])
    .where('v.workspaceId', '=', ctx.workspaceId)
    .where('p.workspaceId', '=', ctx.workspaceId)
    .where('v.sectionId', 'in', [...sectionIds])
    .where('p.stage', 'in', ['writing', 'weave'])
    .orderBy('v.version', 'desc')
    .execute();
  for (const r of rows) {
    if (out.has(r.sectionId)) continue;
    out.set(r.sectionId, { promptRunId: r.runId, model: r.modelSlug, guardrails: parseGuardrails(r.guardrails) });
  }
  const current = await db
    .selectFrom('sections as s')
    .innerJoin('sectionVersions as v', 'v.id', 's.currentVersionId')
    .select(['s.id as sectionId', 'v.guardrails'])
    .where('s.workspaceId', '=', ctx.workspaceId)
    .where('s.id', 'in', [...sectionIds])
    .execute();
  for (const c of current) {
    if (c.guardrails === null) continue;
    const prev = out.get(c.sectionId);
    out.set(c.sectionId, { promptRunId: prev?.promptRunId ?? '', model: prev?.model ?? '', guardrails: parseGuardrails(c.guardrails) });
  }
  return out;
}
