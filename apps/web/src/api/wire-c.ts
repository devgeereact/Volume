/* Screen glue for group C's screens (Editor, Cover, Export, Marketing). Endpoint calls live in the shared
   area modules and hooks in hooks.ts; this file only combines them.

   - errorText: an ApiError (or anything thrown) as one plain sentence for the screen.
   - useJobWatch: one job's progress from the live SSE state (the book layout runs useBookEvents),
     with useJob as the slow fallback, plus a callback when it finishes.
   - blocksFromMarkdown and markdownFromBlocks: the editor's paragraph blocks to and from bodyMd.
   - versionOrigin: a server version source as the editor's version label.
   - sectionGuardrails: a section's guardrails report for the Checks tab. */

import { useEffect, useRef } from "react";
import { isApiError } from "./client";
import { useBookLive } from "./events";
import { useJob } from "./hooks";
import { isTerminalJob, type ApiSection, type ApiSectionVersion, type JobStatus } from "./types";

/* ---------- Errors ---------- */

/** One plain sentence for an error from the server (or the network). */
export function errorText(e: unknown, fallback = "Something went wrong. Try again."): string {
  if (isApiError(e)) {
    if (e.code === "network_error") return "The Volume server is not answering. Start it, then try again.";
    if (e.code === "conflict") return "This changed somewhere else since you opened it. Reload to see the latest, then try again.";
    const issues = e.fieldIssues;
    if (issues.length > 0) return `${e.message} ${issues.map((i) => i.message).join(" ")}`.trim();
    return e.message || fallback;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/* ---------- Jobs ---------- */

export interface JobWatch {
  status: JobStatus | null;
  /** 0 to 1. */
  progress: number;
  message: string | null;
  error: string | null;
  /** The server's error code when the job failed (for example "preflight_blocked"). */
  errorCode: string | null;
  running: boolean;
  finished: boolean;
  ok: boolean;
  /** The job's result once it has finished (from GET /jobs/:id). */
  result: unknown;
}

/**
 * Progress for one job. The live SSE state (useBookLive) gives status, progress and the step message;
 * useJob polls slowly as a fallback and supplies the result. `onDone` runs once when the job ends.
 */
export function useJobWatch(bookId: string | undefined, jobId: string | null | undefined, onDone?: (w: JobWatch) => void): JobWatch {
  const live = useBookLive(jobId ? bookId : undefined);
  const job = useJob(jobId ?? undefined, { pollMs: 2000 });
  const lj = jobId ? live.data?.jobs[jobId] : undefined;
  const status: JobStatus | null = (job.data && isTerminalJob(job.data.status) ? job.data.status : (lj?.status ?? job.data?.status)) ?? null;
  const finished = status !== null && isTerminalJob(status);
  const w: JobWatch = {
    status,
    progress: finished ? 1 : Math.max(lj?.progress ?? 0, job.data?.progress ?? 0),
    message: lj?.message ?? null,
    error: job.data?.error ?? lj?.error ?? null,
    errorCode: job.data?.errorCode ?? null,
    running: !!jobId && !finished,
    finished,
    ok: status === "succeeded",
    result: job.data?.result ?? null,
  };
  const doneFor = useRef<string | null>(null);
  const cb = useRef(onDone);
  useEffect(() => {
    cb.current = onDone;
  });
  // Wait for the job record itself to say it ended, so the result is there when onDone runs.
  const recordDone = !!job.data && isTerminalJob(job.data.status);
  useEffect(() => {
    if (!jobId || !recordDone || doneFor.current === jobId) return;
    doneFor.current = jobId;
    cb.current?.(w);
  });
  return w;
}

/** Friendly words for a job status. */
export function jobStatusText(status: JobStatus | null): string {
  switch (status) {
    case "queued":
      return "Waiting to start";
    case "running":
      return "Running";
    case "waiting":
      return "Waiting for the step before it";
    case "paused":
      return "Paused";
    case "paused_budget":
      return "Paused at the budget limit";
    case "succeeded":
      return "Finished";
    case "needs_attention":
      return "Finished, needs your attention";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Starting";
  }
}

/* ---------- Manuscript text ---------- */

export interface MdBlock {
  id: string;
  kind: "p" | "h";
  text: string;
  rev: number;
  /** Heading marks as written in the markdown ("## "), kept so a save does not change the level. */
  prefix?: string | undefined;
}

/** bodyMd to blocks: one block per paragraph, headings ("#" lines) as "h". Ids are stable per position. */
export function blocksFromMarkdown(md: string, idBase: string): MdBlock[] {
  const parts = md
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim().length > 0);
  return parts.map((p, i) => {
    const m = /^(#{1,6}\s+)(.*)$/s.exec(p);
    if (m && !p.includes("\n")) return { id: `${idBase}-${i}`, kind: "h", text: m[2] ?? "", rev: 0, prefix: m[1] };
    return { id: `${idBase}-${i}`, kind: "p", text: p, rev: 0 };
  });
}

/** Blocks back to bodyMd. Empty paragraphs are dropped. */
export function markdownFromBlocks(blocks: { kind: "p" | "h"; text: string; prefix?: string | undefined }[]): string {
  return blocks
    .filter((b) => b.text.trim().length > 0)
    .map((b) => (b.kind === "h" ? `${b.prefix ?? "## "}${b.text.trim()}` : b.text.trim()))
    .join("\n\n");
}

/** Character offset in markdownFromBlocks(blocks) just after block `index` (for a note's position). */
export function offsetAfterBlock(blocks: { kind: "p" | "h"; text: string; prefix?: string | undefined }[], index: number): number {
  return markdownFromBlocks(blocks.slice(0, index + 1)).length;
}

export type EditorOrigin = "AI write" | "Checker fix" | "AI edit" | "AI rewrite" | "Owner" | "Restore";

/** A server version's source as the editor's label. */
export function versionOrigin(v: Pick<ApiSectionVersion, "source">): EditorOrigin {
  const s = v.source;
  if (s === "human" || s === "copy") return "Owner";
  if (s === "restore") return "Restore";
  if (s === "ai:editing") return "AI edit";
  if (s === "ai:weave") return "AI rewrite";
  if (s.startsWith("checker") || s.startsWith("check")) return "Checker fix";
  return "AI write";
}

/* ---------- Guardrails (sections carry the latest writing or weave run's report) ---------- */

export interface GuardrailItem {
  rule: string;
  severity: string;
  message: string;
  match: string | null;
}

export interface GuardrailReport {
  passed: boolean;
  needsAttention: GuardrailItem[];
}

/** The section's guardrails report for the Checks tab (items without a message are left out), or null. */
export function sectionGuardrails(section: Pick<ApiSection, "guardrails"> | null | undefined): GuardrailReport | null {
  const g = section?.guardrails;
  if (!g) return null;
  return {
    passed: g.passed === true,
    // Blocking hits first, then the banned phrases left for the owner.
    needsAttention: [...(g.blocking ?? []), ...g.needsAttention]
      .map((x) => ({ rule: x.rule, severity: x.severity, message: x.message, match: x.match }))
      .filter((x) => x.message.length > 0),
  };
}
