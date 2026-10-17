import type { ApiBatchItemView, ApiTitleLimit, ApiTitleSlot, BatchStatus, QualityGate, TitleFormat, TitleLimitDetails } from "../../api/types";
import { formatDate } from "../../lib/format";

/* Plain helpers for the Volume mode screens: the 7-day window the schedule shows, how full each format is,
   and the sentences for the title limit, the quality gate and a batch's state. No React here, so the rules
   are tested on their own (model.test.ts). The limit numbers always come from the server or the rules file,
   never from this file (AGENTS.md rule 7). */

export const DAY_MS = 86_400_000;

export const formatLabels: Record<TitleFormat, string> = { ebook: "Kindle eBook", paperback: "Paperback", hardcover: "Hardcover" };
/** The format inside a sentence: "2 new paperback titles". */
export const formatNouns: Record<TitleFormat, string> = { ebook: "Kindle eBook", paperback: "paperback", hardcover: "hardcover" };

/** 12:00 UTC on the same UTC day. Planned dates sit at noon so they show on the same day in London. */
export function noonUtc(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
}

/** The seven days of the window that starts on `startMs`, each at 12:00 UTC. */
export function windowDays(startMs: number): number[] {
  const first = noonUtc(startMs);
  return Array.from({ length: 7 }, (_, i) => first + i * DAY_MS);
}

/** First and last moment of the window, for GET /schedule?from&to. */
export function windowRange(startMs: number): { from: number; to: number } {
  const first = noonUtc(startMs) - 12 * 3_600_000;
  return { from: first, to: first + 7 * DAY_MS - 1 };
}

/** True when both times fall on the same UTC day. */
export function sameDay(a: number, b: number): boolean {
  return noonUtc(a) === noonUtc(b);
}

/** "2026-10-06" for an input of type date (UTC day). */
export function isoDate(ms: number): string {
  return new Date(noonUtc(ms)).toISOString().slice(0, 10);
}

/** "2026-10-06" back to 12:00 UTC that day, or null when it is not a real date. */
export function fromIsoDate(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(ms) || isoDate(ms) !== value ? null : ms;
}

/** Slots of one format inside the 7-day window that starts on `startMs`. */
export function slotsInWindow(slots: readonly ApiTitleSlot[], format: TitleFormat, startMs: number): ApiTitleSlot[] {
  const { from, to } = windowRange(startMs);
  return slots.filter((s) => s.format === format && s.plannedAt >= from && s.plannedAt <= to);
}

/** How full one format is in the shown window. The window is 7 days, the same length as KDP's rolling week. */
export function windowUse(slots: readonly ApiTitleSlot[], format: TitleFormat, startMs: number, limit: Pick<ApiTitleLimit, "maxNewTitlesPerFormat">) {
  const used = slotsInWindow(slots, format, startMs).length;
  return { used, max: limit.maxNewTitlesPerFormat, full: used >= limit.maxNewTitlesPerFormat };
}

/** "KDP allows 2 new paperback titles in any 7 days for one account." */
export function limitSentence(limit: Pick<ApiTitleLimit, "maxNewTitlesPerFormat" | "periodDays">, format: TitleFormat): string {
  const n = limit.maxNewTitlesPerFormat;
  return `KDP allows ${n} new ${formatNouns[format]} ${n === 1 ? "title" : "titles"} in any ${limit.periodDays} days for one account.`;
}

function titleOf(slot: Pick<ApiTitleSlot, "book">): string {
  return slot.book.title ?? slot.book.idea ?? "Untitled book";
}

/** "A and B", "A, B and C". */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The refusal for a 409 title_limit, in plain words, with the next free date. */
export function refusalText(details: TitleLimitDetails, format: TitleFormat): { title: string; body: string; nextFree: string } {
  const nextFree = formatDate(new Date(details.nextFreeAt).toISOString());
  const names = details.conflicts.map((c) => `${titleOf(c)} (${formatDate(new Date(c.plannedAt).toISOString())})`);
  const taken = names.length > 0 ? ` Already planned: ${listWords(names)}.` : "";
  return {
    title: `No ${formatNouns[format]} slot free on that date`,
    body: `${limitSentence(details.limit, format)}${taken} The next free date is ${nextFree}.`,
    nextFree,
  };
}

/** True when details look like a title_limit answer. */
export function isTitleLimitDetails(d: unknown): d is TitleLimitDetails {
  return typeof d === "object" && d !== null && typeof (d as TitleLimitDetails).nextFreeAt === "number" && Array.isArray((d as TitleLimitDetails).conflicts);
}

/** True when details look like a quality_gate answer. */
export function isQualityGate(d: unknown): d is QualityGate {
  return typeof d === "object" && d !== null && typeof (d as QualityGate).ok === "boolean" && Array.isArray((d as QualityGate).blocks);
}

/** The gate in a few words: "Checks passed", "2 claims open", "1 blocking item and 1 claim open". */
export function gateSummary(gate: QualityGate): string {
  if (gate.ok) return "Checks passed";
  const parts: string[] = [];
  if (gate.blocks.length > 0) parts.push(`${gate.blocks.length} blocking ${gate.blocks.length === 1 ? "item" : "items"}`);
  if (gate.openClaims > 0) parts.push(`${gate.openClaims} ${gate.openClaims === 1 ? "claim" : "claims"} open`);
  return listWords(parts);
}

export type Tone = "live" | "attention" | "error" | "success" | "neutral";

/** A batch or book run state as a word and a tone for its chip. */
export function runLabel(status: BatchStatus | null | undefined): { label: string; tone: Tone } {
  switch (status) {
    case "running":
    case "waiting":
      return { label: "Running", tone: "live" };
    case "queued":
      return { label: "Queued", tone: "neutral" };
    case "paused":
      return { label: "Paused", tone: "attention" };
    case "paused_budget":
      return { label: "Paused at budget", tone: "attention" };
    case "succeeded":
      return { label: "Finished", tone: "success" };
    case "needs_attention":
      return { label: "Needs attention", tone: "attention" };
    case "failed":
      return { label: "Stopped with an error", tone: "error" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "draft":
    case null:
    case undefined:
      return { label: "Not started", tone: "neutral" };
    default:
      return { label: String(status), tone: "neutral" };
  }
}

/** True while a batch's run is still going, so it cannot be changed or started again. */
export function isBusy(status: BatchStatus | null | undefined): boolean {
  return status === "queued" || status === "running" || status === "waiting" || status === "paused" || status === "paused_budget";
}

/** Books finished in this run, the total and the book being written now, for the live line. */
export function runProgress(items: readonly Pick<ApiBatchItemView, "run" | "status" | "book">[]): { done: number; total: number; current: string | null } {
  const total = items.length;
  const done = items.filter((i) => i.status === "ready" || i.run?.status === "succeeded").length;
  const running = items.find((i) => i.run?.status === "running" || i.run?.status === "waiting");
  return { done, total, current: running ? (running.book.title ?? running.book.idea ?? "Untitled book") : null };
}
