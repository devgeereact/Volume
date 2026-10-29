import { checkTitleSlot, parseKdpRules, titleCreationLimit } from "@volume/core";
import { kdpRulesFile as rulesFile } from "../../lib/kdpRulesFile";
import { ApiError } from "../../api/client";
import type { ApiBatchDetail, ApiBatchSummary, ApiTitleLimit, ApiTitleSlot, BatchInput, QualityGate, SlotInput, TitleLimitDetails } from "../../api/types";
import { demoBatches, demoGate, demoSlots } from "../../demo/volume";
import { books as demoBooks } from "../../demo/books";
import { getPenName } from "../../demo/penNames";
import { formatDate } from "../../lib/format";
import { limitSentence } from "./model";

/* Volume mode in demo mode: batches and planned releases kept in memory for this visit, with the same rules
   and refusals as the server. The title limit comes from config/kdp-rules (rule titles.creationLimit) through
   @volume/core, and the check is the server's own checkTitleSlot, so the demo refuses exactly what the server
   would. A batch started in this visit moves on every few seconds so the live progress can be seen. */

const rules = parseKdpRules(rulesFile);
export const demoLimit: ApiTitleLimit = { ...titleCreationLimit(rules), ruleId: "titles.creationLimit", rulesVersion: rules.version };

export interface DemoVolumeState {
  batches: ApiBatchDetail[];
  slots: ApiTitleSlot[];
}

export function initialDemoVolume(): DemoVolumeState {
  return { batches: demoBatches(), slots: demoSlots() };
}

let nextId = 1;
const newId = (p: string) => `${p}-demo-${nextId++}`;

function bookRef(bookId: string) {
  const b = demoBooks.find((x) => x.id === bookId);
  if (!b) throw new ApiError(404, "not_found", "Book was not found.");
  return {
    title: b.title,
    idea: b.subtitle || null,
    stage: b.stage,
    status: b.archived ? "archived" : "active",
    profileId: b.penNameId,
    penName: getPenName(b.penNameId)?.name ?? "Unknown pen name",
  };
}

/** The item's run status, or null when the book is in no batch or has not run. */
function runStatusOf(state: DemoVolumeState, bookId: string): string | null {
  for (const b of state.batches) {
    const item = b.items.find((i) => i.bookId === bookId);
    if (item) return item.run?.status ?? null;
  }
  return null;
}

export function demoGateFor(state: DemoVolumeState, bookId: string): QualityGate {
  return demoGate(bookId, runStatusOf(state, bookId));
}

function gateRefusal(gate: QualityGate, action: string): ApiError {
  const reasons: string[] = [];
  if (gate.blocks.length > 0) reasons.push(`preflight has ${gate.blocks.length} blocking item${gate.blocks.length === 1 ? "" : "s"}`);
  if (gate.openClaims > 0) reasons.push(`${gate.openClaims} claim${gate.openClaims === 1 ? " is" : "s are"} still open`);
  return new ApiError(409, "quality_gate", `This book cannot be ${action} yet: ${reasons.join(" and ")}.`, gate);
}

/* ---------- Schedule ---------- */

/** POST /schedule/slots: 201, or 409 title_limit with the conflicting slots and the next free time. */
export function demoAddSlot(state: DemoVolumeState, input: SlotInput, limit: ApiTitleLimit = demoLimit): DemoVolumeState {
  const ref = bookRef(input.bookId);
  const same = state.slots.filter((s) => s.format === input.format);
  if (same.some((s) => s.bookId === input.bookId))
    throw new ApiError(409, "conflict", "This book already has a slot for that format. Remove it first to move it.");
  const check = checkTitleSlot(
    same.map((s) => ({ projectId: s.bookId, format: s.format, plannedAt: s.plannedAt })),
    { projectId: input.bookId, format: input.format, plannedAt: input.plannedAt },
    limit,
  );
  if (!check.ok) {
    const conflicts = same.filter((s) => check.conflicts.some((c) => c.projectId === s.bookId)).sort((a, b) => a.plannedAt - b.plannedAt);
    const details: TitleLimitDetails = { conflicts, nextFreeAt: check.nextFreeAt, limit };
    throw new ApiError(
      409,
      "title_limit",
      `${limitSentence(limit, input.format)} The next free date is ${formatDate(new Date(check.nextFreeAt).toISOString())}.`,
      details,
    );
  }
  const slot: ApiTitleSlot = {
    id: newId("slot"),
    bookId: input.bookId,
    batchId: input.batchId ?? null,
    format: input.format,
    plannedAt: input.plannedAt,
    status: "planned",
    confirmedAt: null,
    createdAt: Date.now(),
    book: { title: ref.title, idea: ref.idea, profileId: ref.profileId, penName: ref.penName },
  };
  return { ...state, slots: [...state.slots, slot].sort((a, b) => a.plannedAt - b.plannedAt) };
}

export function demoConfirmSlot(state: DemoVolumeState, id: string): DemoVolumeState {
  const slot = state.slots.find((s) => s.id === id);
  if (!slot) throw new ApiError(404, "not_found", "Title slot was not found.");
  const gate = demoGateFor(state, slot.bookId);
  if (!gate.ok) throw gateRefusal(gate, "scheduled");
  return { ...state, slots: state.slots.map((s) => (s.id === id ? { ...s, status: "confirmed", confirmedAt: Date.now() } : s)) };
}

export function demoRemoveSlot(state: DemoVolumeState, id: string): DemoVolumeState {
  return { ...state, slots: state.slots.filter((s) => s.id !== id) };
}

/* ---------- Batches ---------- */

function summarise(b: ApiBatchDetail): ApiBatchDetail {
  return {
    ...b,
    itemCount: b.items.length,
    readyCount: b.items.filter((i) => i.status === "ready").length,
    penNames: [...new Set(b.items.map((i) => i.book.penName))].sort(),
  };
}

function checkBooks(state: DemoVolumeState, bookIds: readonly string[], batchId: string | null): void {
  if (new Set(bookIds).size !== bookIds.length) throw new ApiError(400, "validation_failed", "A book is listed twice.");
  const taken = state.batches.filter((b) => b.id !== batchId).flatMap((b) => b.items.map((i) => i.bookId));
  if (bookIds.some((id) => taken.includes(id))) throw new ApiError(409, "conflict", "A book can be in one batch at a time.");
}

function assertIdle(b: ApiBatchDetail): void {
  if (b.status === "running" || b.status === "queued" || b.status === "waiting" || b.status === "paused" || b.status === "paused_budget") {
    throw new ApiError(409, "invalid_state", "This batch is running. Cancel or wait for the run first.");
  }
}

function requireBatch(state: DemoVolumeState, id: string): ApiBatchDetail {
  const b = state.batches.find((x) => x.id === id);
  if (!b) throw new ApiError(404, "not_found", "Batch was not found.");
  return b;
}

function replaceBatch(state: DemoVolumeState, b: ApiBatchDetail): DemoVolumeState {
  return { ...state, batches: state.batches.map((x) => (x.id === b.id ? summarise(b) : x)) };
}

export function demoCreateBatch(state: DemoVolumeState, input: BatchInput): { state: DemoVolumeState; id: string } {
  const name = input.name.trim();
  if (!name) throw new ApiError(400, "validation_failed", "Some fields are missing or not valid.", [{ path: "name", message: "Give the batch a name." }]);
  if (input.bookIds.length === 0)
    throw new ApiError(400, "validation_failed", "Some fields are missing or not valid.", [{ path: "bookIds", message: "Pick at least one book." }]);
  checkBooks(state, input.bookIds, null);
  const id = newId("batch");
  const t = Date.now();
  const batch: ApiBatchDetail = summarise({
    id,
    name,
    notes: input.notes ?? null,
    jobId: null,
    startedAt: null,
    createdAt: t,
    updatedAt: t,
    status: "draft",
    progress: 0,
    itemCount: 0,
    readyCount: 0,
    penNames: [],
    job: null,
    items: input.bookIds.map((bookId, i) => ({
      id: `${id}-item-${i + 1}`,
      batchId: id,
      bookId,
      position: i + 1,
      status: "planned",
      jobId: null,
      readyAt: null,
      book: bookRef(bookId),
      run: null,
      slots: [],
    })),
  });
  return { state: { ...state, batches: [batch, ...state.batches] }, id };
}

export function demoPatchBatch(state: DemoVolumeState, id: string, patch: { addBookIds?: string[]; removeBookIds?: string[] }): DemoVolumeState {
  const b = requireBatch(state, id);
  assertIdle(b);
  const remove = new Set(patch.removeBookIds ?? []);
  const add = (patch.addBookIds ?? []).filter((x) => !b.items.some((i) => i.bookId === x));
  checkBooks(state, add, id);
  let position = Math.max(0, ...b.items.map((i) => i.position));
  const items = [
    ...b.items.filter((i) => !remove.has(i.bookId)),
    ...add.map((bookId) => {
      position += 1;
      return {
        id: `${id}-item-${position}`,
        batchId: id,
        bookId,
        position,
        status: "planned" as const,
        jobId: null,
        readyAt: null,
        book: bookRef(bookId),
        run: null,
        slots: [],
      };
    }),
  ];
  return replaceBatch(state, { ...b, items, updatedAt: Date.now() });
}

export function demoDeleteBatch(state: DemoVolumeState, id: string): DemoVolumeState {
  assertIdle(requireBatch(state, id));
  return { batches: state.batches.filter((b) => b.id !== id), slots: state.slots.map((s) => (s.batchId === id ? { ...s, batchId: null } : s)) };
}

export function demoStartBatch(state: DemoVolumeState, id: string): DemoVolumeState {
  const b = requireBatch(state, id);
  assertIdle(b);
  if (b.items.length === 0) throw new ApiError(409, "invalid_state", "Add books to the batch first.");
  let first = true;
  const items = b.items.map((i) => {
    if (i.status === "ready") return i;
    const run = { status: first ? ("running" as const) : ("queued" as const), progress: 0, error: null };
    first = false;
    return { ...i, jobId: newId("job"), run };
  });
  const allReady = first;
  return replaceBatch(state, {
    ...b,
    items,
    jobId: newId("job"),
    startedAt: Date.now(),
    status: allReady ? "succeeded" : "running",
    progress: allReady ? 1 : 0,
  });
}

export function demoMarkReady(state: DemoVolumeState, batchId: string, itemId: string): DemoVolumeState {
  const b = requireBatch(state, batchId);
  const item = b.items.find((i) => i.id === itemId);
  if (!item) throw new ApiError(404, "not_found", "Batch item was not found.");
  const gate = demoGateFor(state, item.bookId);
  if (!gate.ok) throw gateRefusal(gate, "marked ready");
  return replaceBatch(state, { ...b, items: b.items.map((i) => (i.id === itemId ? { ...i, status: "ready", readyAt: Date.now() } : i)) });
}

/** One step of a running demo batch: the current book moves on by a quarter, then the next book starts. */
export function demoTick(state: DemoVolumeState, id: string): DemoVolumeState {
  const b = state.batches.find((x) => x.id === id);
  if (!b || b.status !== "running") return state;
  const items = b.items.map((i) => ({ ...i }));
  const current = items.find((i) => i.run?.status === "running");
  if (current?.run) {
    const progress = Math.min(1, current.run.progress + 0.25);
    current.run = { ...current.run, progress, status: progress >= 1 ? "succeeded" : "running" };
    if (progress >= 1) {
      const next = items.find((i) => i.run?.status === "queued");
      if (next?.run) next.run = { ...next.run, status: "running" };
    }
  }
  const runs = items.filter((i) => i.run !== null);
  const progress = runs.length === 0 ? 1 : runs.reduce((sum, i) => sum + (i.run?.progress ?? 0), 0) / runs.length;
  const finished = runs.every((i) => i.run?.status === "succeeded");
  return replaceBatch(state, { ...b, items, progress, status: finished ? "succeeded" : "running" });
}

/** A batch with its books' planned releases, as GET /batches/:id answers. */
export function withSlots(state: DemoVolumeState, b: ApiBatchDetail): ApiBatchDetail {
  return { ...b, items: b.items.map((i) => ({ ...i, slots: state.slots.filter((s) => s.bookId === i.bookId) })) };
}

export function toSummary(b: ApiBatchDetail): ApiBatchSummary {
  const { items: _items, job: _job, ...rest } = b;
  return rest;
}
