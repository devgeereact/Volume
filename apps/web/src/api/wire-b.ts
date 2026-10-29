/* Screen glue for group B's screens (Research, Titles, Blueprint, Writing) in API mode: plain error
   words, model and cost lines, each step's jobs with live progress laid over them, research source
   views, writing row states and estimate words. Endpoint calls live in the shared area modules and
   hooks in hooks.ts; this file only combines them. */

import { formatRelative } from "../lib/format";
import { titleOptions } from "./adapters";
import { isApiError } from "./client";
import { useBookCosts, useBookJobs } from "./hooks";
import { useBookLive } from "./events";
import {
  isTerminalJob,
  type ApiGuardrailHit,
  type ApiGuardrailSummary,
  type ApiJob,
  type ApiResearchSource,
  type ApiRunInfo,
  type ApiSection,
  type ApiTitleSet,
  type Estimate,
  type JobStatus,
  type WrittenBy,
} from "./types";

/* ---------- Errors in plain words ---------- */

/** One plain sentence for any error a mutation or query can throw. */
export function plainError(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === "network_error") return "The Volume server is not answering. Check your connection, then try again.";
    if (e.code === "conflict") return "Someone saved a newer version while you were working. Reload to see it, then make your change again.";
    if (e.code === "budget_exceeded") return "This step is paused for AI credit. Top up with the AI provider, or ask the owner of this Volume, then try again.";
    const issues = e.fieldIssues;
    if (issues.length > 0) return `${e.message} ${issues.map((i) => i.message).join(" ")}`;
    return e.message;
  }
  return "Something went wrong. Try again.";
}

/* ---------- Summary missing (owner decision, 7 October 2026) ---------- */

/** Checker name of the blocking flag on saved text whose summary failed (apps/server/src/jobs/book-data.ts). */
export const SUMMARY_MISSING_CHECKER = "summary_missing";

/** A write_section job that only runs the summary again (payload.summaryOnly). It never rewrites the text. */
export function isSummaryOnlyJob(j: { kind: string; payload: Record<string, unknown> }): boolean {
  return j.kind === "write_section" && j.payload["summaryOnly"] === true;
}

/** The open summary_missing flag among a section's checks, or null. Resolved flags are ignored. */
export function openSummaryFlag<C extends { checker: string; status: string }>(checks: readonly C[] | undefined): C | null {
  return checks?.find((c) => c.checker === SUMMARY_MISSING_CHECKER && c.status === "open") ?? null;
}

/* ---------- Model, cost and guardrails (ApiRunInfo, ApiSection.guardrails) ---------- */

/** Model and cost a research run, title set or blueprint version carries (null for owner edits). */
export function runMeta(o: ApiRunInfo | null | undefined): { model: string | null; costUsd: number | null } {
  return { model: o?.model || null, costUsd: typeof o?.costUsd === "number" ? o.costUsd : null };
}

export type GuardrailItem = ApiGuardrailHit;

/** The guardrails report on a run, set, version or section: whether it passed and what needs a look. */
export function guardrailsOf(o: { guardrails?: ApiGuardrailSummary | null | undefined } | null | undefined): ApiGuardrailSummary | null {
  const g = o?.guardrails;
  if (!g) return null;
  // Blocking hits are shown with the needs-attention items, blocking first.
  const blocking = Array.isArray(g.blocking) ? g.blocking : [];
  return { ...g, blocking, needsAttention: [...blocking, ...(Array.isArray(g.needsAttention) ? g.needsAttention : [])] };
}

/** "about 4 min" for a time left in ms. */
export function etaWords(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  return min < 60 ? `about ${min} min` : `about ${Math.floor(min / 60)} h ${min % 60} min`;
}

/* ---------- Jobs for one step ---------- */

export interface StageJob {
  id: string;
  kind: string;
  status: JobStatus;
  /** 0 to 1. */
  progress: number;
  message: string | null;
  error: string | null;
  done: number | null;
  total: number | null;
  costUsd: number;
  startedAt: number | null;
  finishedAt: number | null;
  createdAt: number;
  payload: Record<string, unknown>;
  pauseRequested: boolean;
  /** Writing jobs: time left in ms from the server (null when finished or not known yet). */
  etaMs: number | null;
  /** Writing jobs: the writer model. */
  model: string | null;
  /** Writing children: the section the job writes. */
  sectionId: string | null;
  errorCode: string | null;
}

function fromApiJob(j: ApiJob): StageJob {
  return {
    id: j.id,
    kind: j.kind,
    status: j.status,
    progress: j.progress,
    message: null,
    error: j.error,
    done: null,
    total: null,
    costUsd: j.costUsd,
    startedAt: j.startedAt,
    finishedAt: j.finishedAt,
    createdAt: j.createdAt,
    payload: j.payload,
    pauseRequested: j.pauseRequested,
    etaMs: typeof j.etaMs === "number" ? j.etaMs : null,
    model: j.model || null,
    sectionId: typeof j.payload["sectionId"] === "string" ? j.payload["sectionId"] : null,
    errorCode: j.errorCode,
  };
}

/**
 * Every job of the book (newest first) with live status, progress and message from the event stream
 * laid over the stored rows. The stored list refreshes when a job changes status (useBookEvents).
 */
export function useBookJobsLive(bookId: string | undefined): { jobs: StageJob[]; loading: boolean } {
  const list = useBookJobs(bookId, { limit: 300 });
  const live = useBookLive(bookId);
  const stored = list.data ?? [];
  const seen = new Set<string>();
  const jobs: StageJob[] = stored.map((j) => {
    seen.add(j.id);
    const l = live.data.jobs[j.id];
    const base = fromApiJob(j);
    if (!l) return base;
    return {
      ...base,
      status: l.status ?? base.status,
      progress: l.progress,
      message: l.message,
      error: l.error ?? base.error,
      done: l.done,
      total: l.total,
    };
  });
  // Jobs the stream has seen but the list has not caught up with yet (just started).
  const extra = Object.values(live.data.jobs)
    .filter((l) => !seen.has(l.jobId) && l.kind)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map<StageJob>((l) => ({
      id: l.jobId,
      kind: l.kind ?? "",
      status: l.status ?? "queued",
      progress: l.progress,
      message: l.message,
      error: l.error,
      done: l.done,
      total: l.total,
      costUsd: 0,
      startedAt: null,
      finishedAt: null,
      createdAt: l.updatedAt,
      payload: {},
      pauseRequested: false,
      etaMs: null,
      model: null,
      sectionId: null,
      errorCode: null,
    }));
  return { jobs: [...extra, ...jobs], loading: list.isPending && !!bookId };
}

/** The newest job of these kinds, or null. `active` is true while it is not finished. */
export function useStageJob(bookId: string | undefined, kinds: readonly string[]): { job: StageJob | null; active: boolean; loading: boolean } {
  const { jobs, loading } = useBookJobsLive(bookId);
  const job = jobs.find((j) => kinds.includes(j.kind)) ?? null;
  return { job, active: job !== null && !isTerminalJob(job.status), loading };
}

/** Model and cost of the AI call a job made, from the book's prompt runs (GET /books/:id/costs). */
export function usePromptRunFor(bookId: string | undefined, stage: string, job: StageJob | null): { model: string | null; costUsd: number | null } {
  const costs = useBookCosts(bookId);
  if (!job || !costs.data) return { model: null, costUsd: job ? job.costUsd : null };
  const from = (job.startedAt ?? job.createdAt) - 1000;
  // A job still running has no end yet, so any later run counts.
  const to = job.finishedAt === null ? Number.POSITIVE_INFINITY : job.finishedAt + 1000;
  const run = costs.data.runs.find((r) => r.stage === stage && r.createdAt >= from && r.createdAt <= to);
  return { model: run?.modelSlug ?? null, costUsd: run ? run.costUsd : job.costUsd };
}

/* ---------- Research sources ---------- */

/** Hosts whose links are redirects to the real page (packages/ai GROUNDING_REDIRECT_HOSTS). */
const REDIRECT_HOSTS = ["vertexaisearch.cloud.google.com"];

export interface SourceView {
  id: string;
  title: string;
  domain: string | null;
  url: string;
  excerpt: string;
  useInBook: boolean;
  /** True when the link is still a search redirect (or not a web address), so the real page is unknown. */
  unresolved: boolean;
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function toSourceView(s: ApiResearchSource): SourceView {
  const host = hostOf(s.url);
  // The server marks an unresolved grounding redirect (unresolved: true, domain: null); older rows are
  // checked by host as well.
  const unresolved = s.unresolved === true || s.linkStatus === "unresolved" || host === null || REDIRECT_HOSTS.includes(host);
  const domain = unresolved ? null : ((s.domain ?? host)?.replace(/^www\./, "") ?? null);
  return { id: s.id, title: s.title?.trim() || domain || s.url, domain, url: s.url, excerpt: s.excerpt ?? "", useInBook: s.useInBook, unresolved };
}

/* ---------- Writing ---------- */

export type WriteRowStatus =
  "built" | "not-written" | "queued" | "writing" | "checking" | "summarising" | "paused" | "done" | "attention" | "failed" | "stopped";

/** Who writes a section: the app builds title pages, copyright, contents and About the author. */
export function writtenByOf(section: ApiSection): WrittenBy | null {
  return section.writtenBy ?? null;
}

/** A section's status for the writing list: its newest write job wins while it is unfinished or failed. */
export function writeStatusOf(section: ApiSection, job: StageJob | undefined, streaming: boolean): WriteRowStatus {
  if (writtenByOf(section) === "app") return "built";
  if (job) {
    switch (job.status) {
      case "running":
        return streaming || job.progress < 0.6 ? "writing" : "checking";
      case "queued":
      case "waiting":
        return "queued";
      case "paused":
      case "paused_budget":
        return "paused";
      case "failed":
        return "failed";
      case "cancelled":
        // dependency_failed: never started because an earlier section failed; the section is simply not written.
        if (job.errorCode !== "dependency_failed" && section.status !== "done" && section.status !== "needs_attention") return "stopped";
        break;
      default:
        break;
    }
  }
  if (section.blueprintChanged) return "attention";
  switch (section.status) {
    case "done":
      return "done";
    case "needs_attention":
    case "attention":
      return "attention";
    case "checking":
      return "checking";
    case "writing":
      return "writing";
    case "queued":
      return "queued";
    default:
      return "not-written";
  }
}

export const writeStatusWords: Record<WriteRowStatus, string> = {
  built: "Made from the book details",
  "not-written": "Not written yet",
  queued: "Queued",
  writing: "Writing",
  checking: "Checking",
  summarising: "Summarising",
  paused: "Paused",
  done: "Done",
  attention: "Needs a look",
  failed: "Failed",
  stopped: "Stopped",
};

/** Markdown from the writer as simple blocks for reading (headings, lists, paragraphs, scene breaks and workbook blocks). */
export type TextBlock = { kind: "h1" | "h2" | "h3" | "p" | "li" | "scene" | "note"; text: string };

const EXERCISE_OPEN = /^:::\s+exercise\s+(\S+)(?:\s+(.+))?$/i;
const LINES_OPEN = /^:::\s+lines\s+(\d+)$/i;
const FILL_OPEN = /^:::\s+fill-in(?:\s+page)?$/i;

export function markdownBlocks(md: string): TextBlock[] {
  const out: TextBlock[] = [];
  for (const raw of md.split(/\n{2,}/)) {
    const block = raw.trim();
    if (!block) continue;
    if (/^\*(?:\s*\*){2}$/.test(block)) {
      out.push({ kind: "scene", text: "* * *" });
      continue;
    }
    // Workbook fences read as labels: the exercise name, the ruled lines, the prompts; closing fences drop out.
    const lines: string[] = [];
    for (const l of block.split("\n")) {
      const t = l.trim();
      const ex = EXERCISE_OPEN.exec(t);
      const ln = LINES_OPEN.exec(t);
      if (ex) {
        const kind = (ex[1] ?? "").toLowerCase();
        out.push({ kind: "h3", text: `${kind.charAt(0).toUpperCase()}${kind.slice(1)} exercise${ex[2] ? `: ${ex[2].trim()}` : ""}` });
      } else if (ln) out.push({ kind: "note", text: `${ln[1]} lines to write on` });
      else if (t === ":::" || FILL_OPEN.test(t)) continue;
      else lines.push(l);
    }
    if (lines.length === 0) continue;
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      for (const l of lines) out.push({ kind: "li", text: l.replace(/^\s*[-*]\s+(\[[ xX]\]\s+)?/, "") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[0] ?? "");
    if (h) {
      out.push({ kind: (["h1", "h2", "h3"] as const)[Math.min(3, h[1]?.length ?? 1) - 1] ?? "h3", text: h[2] ?? "" });
      const rest = lines.slice(1).join(" ").trim();
      if (rest) out.push({ kind: "p", text: rest });
      continue;
    }
    out.push({ kind: "p", text: lines.join(" ") });
  }
  return out;
}

/** "Today, 14:12", "Yesterday" or "1 October" for a server time, relative to now. */
export function whenMs(ms: number): string {
  return formatRelative(new Date(ms).toISOString(), new Date().toISOString());
}

export function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/* ---------- Estimates ---------- */

/** "about $0.02 to $0.05" (or one figure when both ends round the same). */
export function estimateWords(e: Pick<Estimate, "lowUsd" | "highUsd"> | undefined | null): string | undefined {
  if (!e) return undefined;
  if (e.highUsd < 0.01) return "under $0.01";
  const lo = e.lowUsd.toFixed(2);
  const hi = e.highUsd.toFixed(2);
  return lo === hi ? `about $${lo}` : `about $${lo} to $${hi}`;
}

/* ---------- Title favourites ---------- */

/** Whether option `index` of a title set is starred. */
export function isFavourite(set: ApiTitleSet, index: number): boolean {
  return titleOptions(set)[index]?.favourite === true;
}
