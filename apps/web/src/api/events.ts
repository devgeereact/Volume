/* Live progress over server-sent events.

   useBookEvents(bookId) opens GET /api/v1/books/:id/events and keeps the TanStack Query cache in
   step: job status and progress go into ["job", id] and the book's live state, finished jobs
   refresh the area they changed, saved sections refresh the section and the tree, and so on.
   useWorkspaceEvents() does the same for every book over GET /api/v1/events (the library).

   Reconnects: the browser's EventSource retries by itself and sends Last-Event-ID, and the server
   replays stored events after it. When the stream closes for good (server stopped, HTTP error), the
   hook opens a new one with ?lastEventId= after a backoff of 1, 2, 4 ... 30 seconds. */

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { apiUrl, seg, type QueryValue } from "./client";
import { queryKeys } from "./hooks";
import { plainJobError } from "./jobErrors";
import {
  BOOK_EVENT_TYPES,
  isTerminalJob,
  type ApiBatchDetail,
  type ApiBatchSummary,
  type ApiBookDetail,
  type ApiJobDetail,
  type BookEvent,
  type BookEventType,
  type BudgetPausedEventData,
  type JobStatus,
  type ServerEventEnvelope,
} from "./types";
import { useKeyChanged } from "../lib/useKeyChanged";

/* ---------- Live state kept in the cache ---------- */

export interface LiveJob {
  jobId: string;
  kind: string | null;
  status: JobStatus | null;
  /** 0 to 1. */
  progress: number;
  message: string | null;
  /** Parent jobs (write_book) report done of total children. */
  done: number | null;
  total: number | null;
  error: string | null;
  parentId: string | null;
  updatedAt: number;
}

export interface BookLiveState {
  jobs: Record<string, LiveJob>;
  /** Text streamed for each section since its last save (section.delta, never stored on the server). */
  deltas: Record<string, string>;
  /** Set when a job pauses for AI credit (D-057); cleared when a job starts running again. */
  budgetPaused: BudgetPausedEventData | null;
  lastEventId: string | null;
  lastEventAt: number | null;
}

/** Keep at most this many characters of streamed text per section. */
const MAX_DELTA_CHARS = 20_000;

export function emptyLiveState(): BookLiveState {
  return { jobs: {}, deltas: {}, budgetPaused: null, lastEventId: null, lastEventAt: null };
}

function updateLive(qc: QueryClient, bookId: string, fn: (s: BookLiveState) => BookLiveState): void {
  qc.setQueryData<BookLiveState>(queryKeys.book.live(bookId), (old) => fn(old ?? emptyLiveState()));
}

function patchLiveJob(s: BookLiveState, jobId: string, patch: Partial<LiveJob>): BookLiveState {
  const prev: LiveJob = s.jobs[jobId] ?? {
    jobId,
    kind: null,
    status: null,
    progress: 0,
    message: null,
    done: null,
    total: null,
    error: null,
    parentId: null,
    updatedAt: 0,
  };
  return { ...s, jobs: { ...s.jobs, [jobId]: { ...prev, ...patch, updatedAt: Date.now() } } };
}

/** Which cached areas a finished job of this kind changes. */
function keysForJobKind(bookId: string, kind: string | null): QueryKey[] {
  const b = queryKeys.book;
  switch (kind) {
    case "research":
      return [b.research(bookId)];
    case "titles":
      return [b.titleSets(bookId)];
    case "blueprint":
    case "blueprint_part":
      return [b.blueprint(bookId)];
    case "rebuild_book":
      return [b.detail(bookId), b.blueprint(bookId), b.rebuilds(bookId), b.sections(bookId), b.claimsAll(bookId), b.preflight(bookId), b.costs(bookId)];
    case "write_book":
    case "write_section":
      return [b.sections(bookId), b.claimsAll(bookId), b.preflight(bookId), b.exports(bookId), b.costs(bookId)];
    case "weave_notes":
      return [b.sections(bookId), b.notesAll(bookId)];
    case "edit_pass":
      return [["section"]];
    case "cover_concepts":
    case "cover_build":
      return [b.cover(bookId), b.preflight(bookId)];
    case "export_pack":
      return [b.exports(bookId)];
    case "marketing":
      return [b.marketingAll(bookId)];
    // Picture books: the run and its steps change the spreads, the character sheets and the spend.
    case "picture_book":
    case "picture_story":
    case "picture_characters":
    case "spread_image":
      return [b.spreads(bookId), b.characters(bookId), b.costs(bookId), b.preflight(bookId)];
    case "picture_export":
      return [b.exports(bookId), b.spreads(bookId)];
    default:
      return [];
  }
}

function inv(qc: QueryClient, keys: QueryKey[]): void {
  for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
}

/**
 * Applies one server event to the cache. Exported so the workspace stream, tests and the live
 * check can use the same rules as useBookEvents.
 */
export function applyBookEvent(qc: QueryClient, bookId: string, ev: BookEvent): void {
  const b = queryKeys.book;
  updateLive(qc, bookId, (s) => ({ ...s, lastEventId: ev.id ?? s.lastEventId, lastEventAt: ev.createdAt }));

  switch (ev.type) {
    case "job.status": {
      const d = ev.data;
      const error = plainJobError(d.error, d.errorCode);
      // A finished job is refetched below, so its status and its result arrive together. Writing the
      // terminal status into the cached record first would let a watcher see "succeeded" with the old
      // null result (the Editor then said a woven note had failed).
      if (!isTerminalJob(d.status)) {
        qc.setQueryData<ApiJobDetail>(queryKeys.job(d.jobId), (old) =>
          old ? { ...old, status: d.status, progress: d.progress, attempts: d.attempts, error, errorCode: d.errorCode } : old,
        );
      }
      updateLive(qc, bookId, (s) => {
        const next = patchLiveJob(s, d.jobId, { kind: d.kind, status: d.status, progress: d.progress, error, parentId: d.parentId });
        return d.status === "running" ? { ...next, budgetPaused: null } : next;
      });
      if (d.parentId) inv(qc, [queryKeys.job(d.parentId)]);
      if (isTerminalJob(d.status)) {
        inv(qc, [queryKeys.job(d.jobId), b.jobsAll(bookId), b.detail(bookId), queryKeys.books.all, ...keysForJobKind(bookId, d.kind)]);
        // A finished writing child (or summary rerun) changes its section's checks, such as the summary_missing flag.
        if (d.sectionId) inv(qc, [queryKeys.section.detail(d.sectionId)]);
      } else {
        inv(qc, [b.jobsAll(bookId)]);
      }
      return;
    }
    case "job.progress": {
      const d = ev.data;
      qc.setQueryData<ApiJobDetail>(queryKeys.job(d.jobId), (old) => (old ? { ...old, progress: d.progress } : old));
      updateLive(qc, bookId, (s) => {
        const patch: Partial<LiveJob> = { progress: d.progress };
        if (d.kind !== undefined) patch.kind = d.kind;
        if (d.message !== undefined) patch.message = d.message;
        if (d.done !== undefined) patch.done = d.done;
        if (d.total !== undefined) patch.total = d.total;
        return patchLiveJob(s, d.jobId, patch);
      });
      return;
    }
    case "section.started": {
      // A writing child started or restarted (after a pause, a stop or a retry): it streams again from
      // the start, so drop the text kept from the earlier attempt.
      const d = ev.data;
      updateLive(qc, bookId, (s) => {
        if (!(d.sectionId in s.deltas)) return s;
        const deltas = { ...s.deltas };
        delete deltas[d.sectionId];
        return { ...s, deltas };
      });
      return;
    }
    case "section.delta": {
      const d = ev.data;
      updateLive(qc, bookId, (s) => ({ ...s, deltas: { ...s.deltas, [d.sectionId]: ((s.deltas[d.sectionId] ?? "") + d.text).slice(-MAX_DELTA_CHARS) } }));
      return;
    }
    case "section.saved": {
      const d = ev.data;
      updateLive(qc, bookId, (s) => {
        const deltas = { ...s.deltas };
        delete deltas[d.sectionId];
        return { ...s, deltas };
      });
      inv(qc, [queryKeys.section.all(d.sectionId), b.sections(bookId), b.detail(bookId), b.preflight(bookId), b.exports(bookId), b.claimsAll(bookId)]);
      return;
    }
    case "check.result":
      inv(qc, [queryKeys.section.detail(ev.data.sectionId)]);
      return;
    case "claim.added":
      inv(qc, [b.claimsAll(bookId)]);
      return;
    case "cost.update": {
      const d = ev.data;
      qc.setQueryData<ApiBookDetail>(b.detail(bookId), (old) =>
        old && d.costToDateUsd !== null ? { ...old, costToDateUsd: d.costToDateUsd, budgetUsd: d.budgetUsd ?? old.budgetUsd } : old,
      );
      inv(qc, [b.costs(bookId), queryKeys.system.settings()]);
      return;
    }
    case "budget.paused": {
      const d = ev.data;
      updateLive(qc, bookId, (s) => ({ ...patchLiveJob(s, d.jobId, { status: "paused_budget" }), budgetPaused: d }));
      inv(qc, [queryKeys.job(d.jobId), b.jobsAll(bookId)]);
      return;
    }
    case "export.ready":
      inv(qc, [b.exports(bookId)]);
      return;
    case "note.woven":
      inv(qc, [queryKeys.section.all(ev.data.sectionId), b.notesAll(bookId), b.sections(bookId)]);
      return;
    case "cover.updated":
      inv(qc, [b.cover(bookId)]);
      return;
    case "book.updated": {
      const d = ev.data;
      const keys: QueryKey[] = [b.detail(bookId), queryKeys.books.all];
      if (d.part === "research") keys.push(b.research(bookId));
      if (d.part === "titles") keys.push(b.titleSets(bookId));
      if (d.part === "blueprint") keys.push(b.blueprint(bookId), b.sections(bookId));
      if (d.part === "marketing") keys.push(b.marketingAll(bookId));
      if (d.part === "spreads") keys.push(b.spreads(bookId));
      if (d.part === "characters") keys.push(b.characters(bookId));
      if (d.part === "suggestions" && typeof d["sectionId"] === "string") keys.push(queryKeys.section.suggestionsAll(d["sectionId"]));
      inv(qc, keys);
      return;
    }
  }
}

/* ---------- Volume mode batches ---------- */

const BATCH_JOB_KINDS = new Set(["batch_run", "batch_book"]);

/** Writes a batch job's progress (and status) into every cached batch list and detail that shows it. */
function patchBatchJob(qc: QueryClient, jobId: string, progress: number, status: JobStatus | null): void {
  qc.setQueriesData<ApiBatchDetail>({ queryKey: ["volume", "batches", "detail"] }, (old) => {
    if (!old || typeof old !== "object" || !Array.isArray(old.items)) return old;
    let changed = false;
    const next: ApiBatchDetail = { ...old };
    if (old.jobId === jobId) {
      changed = true;
      next.progress = progress;
      if (status) next.status = status;
    }
    next.items = old.items.map((i) => {
      if (i.jobId !== jobId) return i;
      changed = true;
      const run = i.run ?? { status: status ?? "running", progress: 0, error: null };
      return { ...i, run: { ...run, progress, status: status ?? run.status } };
    });
    return changed ? next : old;
  });
  qc.setQueriesData<ApiBatchSummary[]>({ queryKey: ["volume", "batches", "list"] }, (old) =>
    Array.isArray(old) ? old.map((b) => (b.jobId === jobId ? { ...b, progress, status: status ?? b.status } : b)) : old,
  );
}

/**
 * Applies one workspace event to the Volume mode caches: batch_run and batch_book progress goes straight into the
 * cached batches (live progress without a refetch), and a status change refetches them so items, gates and slots
 * arrive with it. Exported for tests and for any screen that opens its own stream.
 */
export function applyVolumeEvent(qc: QueryClient, ev: BookEvent): void {
  if (ev.type === "job.status") {
    const d = ev.data;
    if (!BATCH_JOB_KINDS.has(d.kind)) return;
    patchBatchJob(qc, d.jobId, d.progress, d.status);
    void qc.invalidateQueries({ queryKey: ["volume", "batches"] });
    return;
  }
  if (ev.type === "job.progress") {
    const d = ev.data;
    if (d.kind !== undefined && !BATCH_JOB_KINDS.has(d.kind)) return;
    patchBatchJob(qc, d.jobId, d.progress, null);
  }
}

/** Parses one SSE message. Returns null for anything that is not a known event with JSON data. */
export function parseServerEvent(type: string, data: string, id: string | null): BookEvent | null {
  if (!(BOOK_EVENT_TYPES as readonly string[]).includes(type)) return null;
  let env: ServerEventEnvelope;
  try {
    env = JSON.parse(data) as ServerEventEnvelope;
  } catch {
    return null;
  }
  if (typeof env !== "object" || env === null || typeof env.data !== "object" || env.data === null) return null;
  return { id: id || null, type: type as BookEventType, projectId: env.projectId, jobId: env.jobId, createdAt: env.createdAt, data: env.data } as BookEvent;
}

/* ---------- The stream hook ---------- */

export type StreamStatus = "off" | "connecting" | "open" | "reconnecting";

export interface StreamState {
  status: StreamStatus;
  lastEventId: string | null;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000];

function useEventStream(path: string | null, query: Record<string, QueryValue>, onEvent: (ev: BookEvent) => void, onGap: () => void): StreamState {
  const [state, setState] = useState<StreamState>({ status: path ? "connecting" : "off", lastEventId: null });
  const onEventRef = useRef(onEvent);
  const onGapRef = useRef(onGap);
  useEffect(() => {
    onEventRef.current = onEvent;
    onGapRef.current = onGap;
  });
  const queryKey = JSON.stringify(query);
  const live = path !== null && typeof EventSource !== "undefined";

  // A new stream (or none) starts from a fresh state, set while rendering rather than in the effect.
  if (useKeyChanged(live ? `${path}?${queryKey}` : null)) setState({ status: live ? "connecting" : "off", lastEventId: null });

  useEffect(() => {
    if (!path || typeof EventSource === "undefined") return;
    const baseQuery = JSON.parse(queryKey) as Record<string, QueryValue>;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let stopped = false;
    let lastId: string | null = null;
    let hadError = false;

    const handle = (e: MessageEvent<string>): void => {
      const ev = parseServerEvent(e.type, e.data, e.lastEventId || null);
      if (!ev) return;
      if (ev.id) {
        lastId = ev.id;
        setState((s) => (s.lastEventId === ev.id ? s : { ...s, lastEventId: ev.id }));
      }
      onEventRef.current(ev);
    };

    const connect = (): void => {
      if (stopped) return;
      const url = apiUrl(path, lastId ? { ...baseQuery, lastEventId: lastId } : baseQuery);
      const source = new EventSource(url);
      es = source;
      for (const t of BOOK_EVENT_TYPES) source.addEventListener(t, handle as EventListener);
      source.onopen = () => {
        attempt = 0;
        setState((s) => ({ ...s, status: "open" }));
        // Without an event id there is nothing to replay, so refetch what may have changed while away.
        if (hadError && lastId === null) onGapRef.current();
        hadError = false;
      };
      source.onerror = () => {
        hadError = true;
        if (source.readyState === EventSource.CLOSED) {
          source.close();
          es = null;
          setState((s) => ({ ...s, status: "reconnecting" }));
          const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 30000;
          attempt += 1;
          timer = setTimeout(connect, wait);
        } else {
          setState((s) => ({ ...s, status: "reconnecting" }));
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [path, queryKey]);

  return state;
}

/** Live events for one book. Mount once per book screen (the book layout is a good place). */
export function useBookEvents(bookId: string | undefined, options: { enabled?: boolean } = {}): StreamState {
  const qc = useQueryClient();
  const enabled = (options.enabled ?? true) && !!bookId;
  return useEventStream(
    enabled && bookId ? `/books/${seg(bookId)}/events` : null,
    {},
    (ev) => {
      if (bookId) applyBookEvent(qc, bookId, ev);
    },
    () => {
      if (bookId) void qc.invalidateQueries({ queryKey: queryKeys.book.all(bookId) });
    },
  );
}

/** Live events for every book in the workspace (library, Today strip, live panel). */
export function useWorkspaceEvents(options: { enabled?: boolean } = {}): StreamState {
  const qc = useQueryClient();
  return useEventStream(
    (options.enabled ?? true) ? "/events" : null,
    {},
    (ev) => {
      applyVolumeEvent(qc, ev);
      if (ev.projectId) applyBookEvent(qc, ev.projectId, ev);
    },
    () => {
      void qc.invalidateQueries({ queryKey: queryKeys.books.all });
      void qc.invalidateQueries({ queryKey: queryKeys.volume.batchesAll });
    },
  );
}

/** The live state that useBookEvents writes: running jobs, streamed text, budget pause. */
export function useBookLive(bookId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.book.live(bookId ?? ""),
    queryFn: () => qc.getQueryData<BookLiveState>(queryKeys.book.live(bookId ?? "")) ?? emptyLiveState(),
    enabled: !!bookId,
    staleTime: Infinity,
    gcTime: Infinity,
    initialData: emptyLiveState,
  });
}
