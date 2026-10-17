import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  useAddSlot,
  useBatch,
  useBatches,
  useBatchGates,
  useConfirmSlot,
  useCreateBatch,
  useDeleteBatch,
  useMarkBatchItemReady,
  usePatchBatch,
  useRemoveSlot,
  useSchedule,
  useStartBatch,
} from "../../api/hooks";
import type { ApiBatchDetail, ApiBatchSummary, ApiTitleLimit, ApiTitleSlot, BatchInput, QualityGate, SlotInput } from "../../api/types";
import { apiErrorText, usePenNames, useWiredBooks, type WireMode } from "../../api/wire-a";
import { isApiError } from "../../api/client";
import { books as demoBookList } from "../../demo/books";
import { penNames as demoPenNames } from "../../demo/penNames";
import { DEMO_TODAY_MS } from "../../demo/volume";
import {
  demoAddSlot,
  demoConfirmSlot,
  demoCreateBatch,
  demoDeleteBatch,
  demoGateFor,
  demoLimit,
  demoMarkReady,
  demoPatchBatch,
  demoRemoveSlot,
  demoStartBatch,
  demoTick,
  initialDemoVolume,
  toSummary,
  withSlots,
  type DemoVolumeState,
} from "./demoVolume";

/* Volume mode data for the current mode: the server through the hooks in api/hooks.ts, or the demo store in
   demoVolume.ts. Every action returns a promise that rejects with an ApiError, so the screens handle a
   refusal (title_limit, quality_gate, invalid_state) the same way in both modes. */

export type LoadState = "loading" | "error" | "ready";

/* ---------- Demo store ---------- */

let demo: DemoVolumeState = initialDemoVolume();
const listeners = new Set<() => void>();
const ticking = new Map<string, number>();
const TICK_MS = 2500;

function setDemo(next: DemoVolumeState): void {
  demo = next;
  for (const l of listeners) l();
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
function startTicking(id: string): void {
  if (ticking.has(id)) return;
  const timer = window.setInterval(() => {
    setDemo(demoTick(demo, id));
    const b = demo.batches.find((x) => x.id === id);
    if (!b || b.status !== "running") {
      window.clearInterval(timer);
      ticking.delete(id);
    }
  }, TICK_MS);
  ticking.set(id, timer);
}
/** Runs a demo change on the next microtask, so a refusal arrives as a rejected promise, as from the server. */
function demoDo(fn: (s: DemoVolumeState) => DemoVolumeState): Promise<void> {
  return Promise.resolve().then(() => setDemo(fn(demo)));
}

function useDemoVolume(): DemoVolumeState {
  return useSyncExternalStore(subscribe, () => demo);
}

/** Today, for the schedule: the demo's fixed today in demo mode, the real date (read once) with the server. */
export function useToday(mode: WireMode): number {
  const [now] = useState(() => Date.now());
  return mode === "mock" ? DEMO_TODAY_MS : now;
}

/* ---------- Lists ---------- */

export function useVolumeBatches(mode: WireMode): { state: LoadState; batches: ApiBatchSummary[]; error: string | null; retry: () => void } {
  const q = useBatches({ enabled: mode === "api" });
  const store = useDemoVolume();
  const refetch = q.refetch;
  const retry = useCallback(() => void refetch(), [refetch]);
  const demoList = useMemo(() => store.batches.map(toSummary), [store.batches]);
  if (mode === "mock") return { state: "ready", batches: demoList, error: null, retry };
  if (mode === "checking" || q.isPending) return { state: "loading", batches: [], error: null, retry };
  if (q.isError) return { state: "error", batches: [], error: apiErrorText(q.error), retry };
  return { state: "ready", batches: q.data, error: null, retry };
}

export interface VolumeBatch {
  state: LoadState | "missing";
  batch: ApiBatchDetail | null;
  gates: Map<string, QualityGate>;
  gatesState: LoadState;
  error: string | null;
  retry: () => void;
}

export function useVolumeBatch(mode: WireMode, id: string | undefined): VolumeBatch {
  const api = mode === "api";
  const q = useBatch(api ? id : undefined);
  const g = useBatchGates(api ? id : undefined);
  const store = useDemoVolume();
  const refetchBatch = q.refetch;
  const refetchGates = g.refetch;
  const retry = useCallback(() => {
    void refetchBatch();
    void refetchGates();
  }, [refetchBatch, refetchGates]);
  const demoBatch = useMemo(() => {
    const b = store.batches.find((x) => x.id === id);
    return b ? withSlots(store, b) : null;
  }, [store, id]);
  const demoGates = useMemo(() => new Map((demoBatch?.items ?? []).map((i) => [i.id, demoGateFor(store, i.bookId)])), [demoBatch, store]);
  const apiGates = useMemo(() => new Map((g.data?.items ?? []).map((i) => [i.itemId, i.gate])), [g.data]);
  // The gates follow the batch: refetch them when a run finishes or the books change.
  const status = q.data?.status;
  const itemKey = q.data?.items.map((i) => `${i.id}:${i.status}:${i.run?.status ?? ""}`).join(",");
  useEffect(() => {
    if (api && id && status !== undefined) void refetchGates();
  }, [api, id, status, itemKey, refetchGates]);

  if (mode === "mock") return { state: demoBatch ? "ready" : "missing", batch: demoBatch, gates: demoGates, gatesState: "ready", error: null, retry };
  const gatesState: LoadState = g.isPending ? "loading" : g.isError ? "error" : "ready";
  if (mode === "checking" || q.isPending) return { state: "loading", batch: null, gates: apiGates, gatesState, error: null, retry };
  if (q.isError) {
    if (isApiError(q.error) && q.error.status === 404) return { state: "missing", batch: null, gates: apiGates, gatesState, error: null, retry };
    return { state: "error", batch: null, gates: apiGates, gatesState, error: apiErrorText(q.error), retry };
  }
  return { state: "ready", batch: q.data, gates: apiGates, gatesState, error: null, retry };
}

export interface VolumeSchedule {
  state: LoadState;
  slots: ApiTitleSlot[];
  limit: ApiTitleLimit | null;
  error: string | null;
  retry: () => void;
}

export function useVolumeSchedule(mode: WireMode, range: { from: number; to: number }): VolumeSchedule {
  const q = useSchedule(range, { enabled: mode === "api" });
  const store = useDemoVolume();
  const refetch = q.refetch;
  const retry = useCallback(() => void refetch(), [refetch]);
  const demoSlotsInRange = useMemo(() => store.slots.filter((s) => s.plannedAt >= range.from && s.plannedAt <= range.to), [store.slots, range.from, range.to]);
  if (mode === "mock") return { state: "ready", slots: demoSlotsInRange, limit: demoLimit, error: null, retry };
  if (mode === "checking" || q.isPending) return { state: "loading", slots: [], limit: null, error: null, retry };
  if (q.isError) return { state: "error", slots: [], limit: null, error: apiErrorText(q.error), retry };
  return { state: "ready", slots: q.data.items, limit: q.data.limit, error: null, retry };
}

/* ---------- Books that can join a batch or get a release slot ---------- */

export interface PickableBook {
  id: string;
  title: string;
  penName: string;
}

export function usePickableBooks(mode: WireMode): { state: LoadState; books: PickableBook[]; error: string | null; retry: () => void } {
  const wired = useWiredBooks(mode, demoBookList);
  const pens = usePenNames(mode, demoPenNames);
  const books = useMemo(
    () =>
      wired.books
        .filter((b) => !b.archived && b.stage !== "published")
        .map((b) => ({ id: b.id, title: b.title || "Untitled book", penName: pens.get(b.penNameId)?.name ?? "Unknown pen name" }))
        .sort((a, b) => a.penName.localeCompare(b.penName) || a.title.localeCompare(b.title)),
    [wired.books, pens],
  );
  const state: LoadState = wired.state === "error" ? "error" : wired.state === "loading" || pens.state === "loading" ? "loading" : "ready";
  return { state, books, error: wired.error, retry: wired.retry };
}

/* ---------- Actions ---------- */

export interface VolumeActions {
  createBatch: (input: BatchInput) => Promise<string>;
  addBooks: (id: string, bookIds: string[]) => Promise<void>;
  removeBook: (id: string, bookId: string) => Promise<void>;
  deleteBatch: (id: string) => Promise<void>;
  startBatch: (id: string) => Promise<void>;
  markReady: (batchId: string, itemId: string) => Promise<void>;
  addSlot: (input: SlotInput) => Promise<void>;
  confirmSlot: (id: string) => Promise<void>;
  removeSlot: (id: string) => Promise<void>;
}

export function useVolumeActions(mode: WireMode): VolumeActions {
  const { mutateAsync: create } = useCreateBatch();
  const { mutateAsync: patch } = usePatchBatch();
  const { mutateAsync: del } = useDeleteBatch();
  const { mutateAsync: start } = useStartBatch();
  const { mutateAsync: ready } = useMarkBatchItemReady();
  const { mutateAsync: add } = useAddSlot();
  const { mutateAsync: confirm } = useConfirmSlot();
  const { mutateAsync: remove } = useRemoveSlot();
  const api = mode === "api";
  return useMemo<VolumeActions>(
    () =>
      api
        ? {
            createBatch: (input) => create(input).then((b) => b.id),
            addBooks: (id, bookIds) => patch({ id, patch: { addBookIds: bookIds } }).then(() => undefined),
            removeBook: (id, bookId) => patch({ id, patch: { removeBookIds: [bookId] } }).then(() => undefined),
            deleteBatch: (id) => del(id),
            startBatch: (id) => start({ id }).then(() => undefined),
            markReady: (batchId, itemId) => ready({ batchId, itemId }).then(() => undefined),
            addSlot: (input) => add(input).then(() => undefined),
            confirmSlot: (id) => confirm(id).then(() => undefined),
            removeSlot: (id) => remove(id),
          }
        : {
            createBatch: (input) =>
              Promise.resolve().then(() => {
                const r = demoCreateBatch(demo, input);
                setDemo(r.state);
                return r.id;
              }),
            addBooks: (id, bookIds) => demoDo((s) => demoPatchBatch(s, id, { addBookIds: bookIds })),
            removeBook: (id, bookId) => demoDo((s) => demoPatchBatch(s, id, { removeBookIds: [bookId] })),
            deleteBatch: (id) => demoDo((s) => demoDeleteBatch(s, id)),
            startBatch: (id) =>
              demoDo((s) => demoStartBatch(s, id)).then(() => {
                if (demo.batches.find((b) => b.id === id)?.status === "running") startTicking(id);
              }),
            markReady: (batchId, itemId) => demoDo((s) => demoMarkReady(s, batchId, itemId)),
            addSlot: (input) => demoDo((s) => demoAddSlot(s, input)),
            confirmSlot: (id) => demoDo((s) => demoConfirmSlot(s, id)),
            removeSlot: (id) => demoDo((s) => demoRemoveSlot(s, id)),
          },
    [api, create, patch, del, start, ready, add, confirm, remove],
  );
}

/** Book ids already in a batch other than `except` (a book can be in one batch at a time). Demo mode only: with the
    server the batch list carries no items, and the server refuses a taken book with a 409 the dialog shows. */
export function useBooksInBatches(mode: WireMode, except: string | null): Set<string> {
  const store = useDemoVolume();
  return useMemo(() => {
    if (mode !== "mock") return new Set<string>();
    return new Set(store.batches.filter((b) => b.id !== except).flatMap((b) => b.items.map((i) => i.bookId)));
  }, [mode, store.batches, except]);
}
