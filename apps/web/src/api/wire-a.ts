/* Screen glue for the shell and group A screens (Library, Published, Archive, Profiles, Settings, New book):
   the API or demo mode, plain error words, pen names and books for the current mode, trim labels, the
   job bar's running jobs and the project file download. Every endpoint call lives in the shared area
   modules (books.ts, system.ts and the rest) and every hook in hooks.ts; this file only combines them.
   Every query here is switched off unless the server answered its health check, so the screens never
   call the server in demo mode. */

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { getPenName as demoPenName } from "../demo/penNames";
import { useNow } from "../lib/useNow";
import type { Book, PenName } from "../demo/types";
import { isoFromMs, toPenName, toPrototypeBook } from "./adapters";
import { assetsApi } from "./assets";
import { booksApi } from "./books";
import { isApiError } from "./client";
import { emptyLiveState, type BookLiveState } from "./events";
import { plainJobError } from "./jobErrors";
import { queryKeys, useActivity, useBooks, useModelSettings, useProfiles, useSettings } from "./hooks";
import { useDataSourceState } from "./source";
import { TRIMS, type ApiArchiveItem, type ApiBookRow, type ApiProfile, type BookListQuery, type ProfileListQuery, type Trim } from "./types";

/* ---------- Mode ---------- */

/** "checking" until the first health check answers, then "api" or "mock". */
export type WireMode = "checking" | "api" | "mock";

export function useWireMode(): WireMode {
  const s = useDataSourceState();
  if (s.source === "api") return "api";
  return s.checking ? "checking" : "mock";
}

/* ---------- Errors in plain words ---------- */

/** An ApiError (or anything else) as one sentence for a banner. */
export function apiErrorText(err: unknown): string {
  if (isApiError(err)) {
    if (err.code === "network_error" || err.status === 0 || err.status >= 500)
      return "The Volume server did not answer. Check your connection, then try again.";
    const issues = err.fieldIssues;
    if (issues.length > 0) return issues.map((i) => i.message).join(" ");
    return err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong. Try again.";
}

/* ---------- Queries, only in API mode ---------- */

export function useApiBooks(enabled: boolean, q: BookListQuery = {}) {
  return useBooks(q, { enabled });
}

export function useApiProfiles(enabled: boolean, q: ProfileListQuery = {}) {
  return useProfiles(q, { enabled });
}

export function useApiSettings(enabled: boolean) {
  return useSettings({ enabled });
}

export function useApiModelSettings(enabled: boolean) {
  return useModelSettings({ enabled });
}

/** The live book count the server adds to each profile in the list; null on a single profile. */
export function profileBookCount(p: ApiProfile): number | null {
  return p.bookCount ?? null;
}

/* ---------- Pen names for the current mode ---------- */

export interface PenNames {
  state: "loading" | "error" | "ready";
  /** Active profiles, as PenName. */
  list: PenName[];
  /** Any profile by id, archived ones included (books keep their author). */
  get: (id: string) => PenName | undefined;
  error: string | null;
  retry: () => void;
  raw: ApiProfile[];
}

/** Server profiles in API mode, demo pen names otherwise. */
export function usePenNames(mode: WireMode, demoList: PenName[]): PenNames {
  const api = mode === "api";
  const q = useApiProfiles(api, { includeArchived: true });
  const raw = useMemo(() => q.data ?? [], [q.data]);
  const all = useMemo(() => raw.map((p) => toPenName(p)), [raw]);
  const byId = useMemo(() => new Map(all.map((p) => [p.id, p])), [all]);
  const list = useMemo(() => all.filter((p) => raw.find((r) => r.id === p.id)?.status !== "archived"), [all, raw]);
  const refetch = q.refetch;
  const retry = useCallback(() => void refetch(), [refetch]);
  if (mode === "mock") return { state: "ready", list: demoList, get: demoPenName, error: null, retry, raw: [] };
  if (mode === "checking" || q.isPending) return { state: "loading", list: [], get: () => undefined, error: null, retry, raw: [] };
  if (q.isError) return { state: "error", list: [], get: () => undefined, error: apiErrorText(q.error), retry, raw: [] };
  return { state: "ready", list, get: (id) => byId.get(id), error: null, retry, raw };
}

/* ---------- Books for the current mode ---------- */

export interface WiredBooks {
  state: "loading" | "error" | "ready";
  books: Book[];
  raw: ApiBookRow[];
  error: string | null;
  retry: () => void;
}

/** Server books in API mode (with word totals and published formats), the given demo list otherwise. */
export function useWiredBooks(mode: WireMode, demo: Book[], q: BookListQuery = {}): WiredBooks {
  const q1 = useApiBooks(mode === "api", q);
  const raw = useMemo(() => q1.data ?? [], [q1.data]);
  const books = useMemo(() => raw.map((b) => toWiredBook(b)), [raw]);
  const refetch = q1.refetch;
  const retry = useCallback(() => void refetch(), [refetch]);
  if (mode === "mock") return { state: "ready", books: demo, raw: [], error: null, retry };
  if (mode === "checking" || q1.isPending) return { state: "loading", books: [], raw: [], error: null, retry };
  if (q1.isError) return { state: "error", books: [], raw: [], error: apiErrorText(q1.error), retry };
  return { state: "ready", books, raw, error: null, retry };
}

/** Refreshes every book list and profile list (after archive, restore, create). */
/* ---------- Small converters ---------- */

/** "6 x 9 in" (the wizard's label) to the server's "6x9". Null when the server does not take that size. */
export function toServerTrim(label: string): Trim | null {
  const compact = label.replace(/\s*in\s*$/i, "").replace(/\s+/g, "");
  return TRIMS.find((t) => t === compact) ?? null;
}

/** "6x9" back to the wizard's "6 x 9 in". */
export function fromServerTrim(trim: string): string {
  const m = /^([\d.]+)x([\d.]+)$/.exec(trim);
  return m ? `${m[1]} x ${m[2]} in` : trim;
}

/** True when an ISO time from the server falls on today's date (local time). */
export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export { isoFromMs };

/** A server book as the prototype Book, with word totals, a running job and published formats. */
export function toWiredBook(b: ApiBookRow): Book {
  const book = toPrototypeBook(b);
  return {
    ...book,
    words: { ...book.words, written: b.wordCount },
    statusLine: b.jobRunning && !book.statusLine.endsWith("job running") ? `${book.statusLine}, job running` : book.statusLine,
    published: book.published
      ? {
          ...book.published,
          marketplace: b.marketplace,
          packVersion: b.packVersion,
          formats: b.formats.map((f) => ({ format: f.format, listPriceGbp: f.listPriceGbp, pages: f.pages })) as NonNullable<Book["published"]>["formats"],
        }
      : null,
    coverImage: b.coverEbookAssetId
      ? { src: assetsApi.downloadUrl(b.coverEbookAssetId, true), final: true }
      : b.coverAssetId
        ? { src: assetsApi.downloadUrl(b.coverAssetId, true), final: false }
        : null,
  };
}

/** Archived books and profiles can be deleted for good (useDeleteArchived). Marketing items cannot. */
export function canDeleteArchived(item: Pick<ApiArchiveItem, "kind">): boolean {
  return item.kind === "book" || item.kind === "profile";
}

/* ---------- Running jobs for the job bar ---------- */

export interface RunningJob {
  jobId: string;
  bookId: string;
  bookTitle: string;
  kind: string;
  /** Job status, or "failed" for a recent failure read from GET /activity. */
  status: string;
  progress: number;
  message: string | null;
  done: number | null;
  total: number | null;
  /** Minutes since the job last changed, when a running or queued job looks stuck (over 5 minutes). */
  stalledMinutes: number | null;
  /** The failure in plain words, for a failed job. */
  error: string | null;
}

const STALL_MS = 5 * 60_000;
const FAILED_SHOWN_MS = 30 * 60_000;

const ACTIVE = new Set(["queued", "running", "waiting", "paused", "paused_budget"]);

/** When each job's progress last moved, as seen by this browser (the row summary has no update time). */
const progressSeen = new Map<string, { progress: number; since: number }>();

function lastMoved(jobId: string, progress: number, liveAt: number, now: number): number {
  const seen = progressSeen.get(jobId);
  if (!seen || seen.progress !== progress) progressSeen.set(jobId, { progress, since: now });
  return Math.max(progressSeen.get(jobId)?.since ?? now, liveAt);
}

/**
 * Top-level jobs that are not finished, across every book. Each book row carries its running job; the
 * live state that the workspace or book event stream keeps in the cache (events.ts) gives fresh status
 * and progress. Polls the list slowly as a safety net.
 */
export function useRunningJobs(enabled: boolean): RunningJob[] {
  const books = useQuery({
    queryKey: queryKeys.books.list({}),
    queryFn: ({ signal }) => booksApi.list({}, { signal }),
    select: (r) => r.items,
    enabled,
    refetchInterval: enabled ? 20_000 : false,
  });
  const busy = useMemo(() => (books.data ?? []).filter((b) => b.runningJob !== null), [books.data]);
  // Stall and failure ages need the time; a 30 s tick is plenty for a 5 minute stall threshold.
  const now = useNow(30_000);
  const qc = useQueryClient();
  const lives = useQueries({
    queries: busy.map((b) => ({
      queryKey: queryKeys.book.live(b.id),
      queryFn: () => qc.getQueryData<BookLiveState>(queryKeys.book.live(b.id)) ?? emptyLiveState(),
      enabled,
      staleTime: Infinity,
      gcTime: Infinity,
      initialData: emptyLiveState,
    })),
  });
  const out: RunningJob[] = [];
  busy.forEach((b, i) => {
    const live = lives[i]?.data;
    for (const j of b.runningJob ? [b.runningJob] : []) {
      const l = live?.jobs[j.id];
      const status = l?.status ?? j.status;
      if (!ACTIVE.has(status)) continue;
      const progress = l ? l.progress : j.progress;
      const idle = now - lastMoved(j.id, progress, l?.updatedAt ?? 0, now);
      out.push({
        jobId: j.id,
        bookId: b.id,
        bookTitle: b.title ?? "Untitled book",
        kind: l?.kind ?? j.kind,
        status,
        progress,
        message: l?.message ?? null,
        done: l?.done ?? null,
        total: l?.total ?? null,
        stalledMinutes: (status === "running" || status === "queued" || status === "waiting") && idle > STALL_MS ? Math.round(idle / 60_000) : null,
        error: null,
      });
    }
  });
  // Recent failures, from GET /activity (job_failed), until the owner dismisses them.
  const activity = useActivity(20, { enabled });
  const dismissed = useDismissedFailures();
  for (const a of activity.data ?? []) {
    if (a.kind !== "job_failed" || !a.projectId || !a.jobId || dismissed.has(a.jobId)) continue;
    if (now - a.at > FAILED_SHOWN_MS || out.some((j) => j.jobId === a.jobId)) continue;
    out.push({
      jobId: a.jobId,
      bookId: a.projectId,
      bookTitle: a.title,
      kind: "",
      status: "failed",
      progress: 0,
      message: null,
      done: null,
      total: null,
      stalledMinutes: null,
      // The live state holds the error in plain words (events.ts); the activity line is the fallback.
      error: qc.getQueryData<BookLiveState>(queryKeys.book.live(a.projectId))?.jobs[a.jobId]?.error ?? plainJobError(a.detail, a.errorCode),
    });
  }
  return out;
}

/* Failed jobs the owner has dismissed from the job bar, for this visit. */
let dismissedFailures = new Set<string>();
const dismissListeners = new Set<() => void>();

export function dismissFailure(jobId: string): void {
  dismissedFailures = new Set([...dismissedFailures, jobId]);
  for (const l of dismissListeners) l();
}

function useDismissedFailures(): Set<string> {
  return useSyncExternalStore(
    (cb) => {
      dismissListeners.add(cb);
      return () => dismissListeners.delete(cb);
    },
    () => dismissedFailures,
  );
}

/** Plain words for a job kind ("Writing the book"). */
export const JOB_LABELS: Record<string, string> = {
  research: "Research",
  titles: "Title ideas",
  blueprint: "Blueprint",
  blueprint_part: "Blueprint part",
  write_book: "Writing the book",
  rebuild_book: "Rebuilding the book",
  write_section: "Writing a section",
  weave_notes: "Weaving in notes",
  edit_pass: "Editor pass",
  cover_concepts: "Cover concepts",
  cover_build: "Building the cover",
  marketing: "Marketing",
  export_pack: "Export pack",
};

/** The book step that shows a job of this kind. */
export function stepForJob(kind: string): "research" | "titles" | "blueprint" | "writing" | "editor" | "cover" | "export" | "marketing" {
  switch (kind) {
    case "research":
      return "research";
    case "titles":
      return "titles";
    case "blueprint":
    case "blueprint_part":
      return "blueprint";
    case "edit_pass":
    case "weave_notes":
      return "editor";
    case "cover_concepts":
    case "cover_build":
      return "cover";
    case "export_pack":
      return "export";
    case "marketing":
      return "marketing";
    default:
      return "writing";
  }
}

/* ---------- Project files ---------- */

/** Asks the server for a book's project zip and hands it to the browser as a download. Resolves with the file name. */
export async function downloadProjectFile(bookId: string, title: string): Promise<string> {
  const { blob, filename } = await booksApi.exportProject(bookId);
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "book";
  return saveBlob(blob, filename ?? `${slug}.volume.zip`);
}

/** Hands a downloaded file to the browser's downloads under `name`, and returns the name. */
export function saveBlob(blob: Blob, name: string): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}
