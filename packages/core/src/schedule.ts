// Title scheduler maths (D-046). Pure functions: no clock, no I/O.
// KDP limits new titles per book format per period (rule titles.creationLimit, FACTS 5.7).
// The limit comes in from the rules file through titleCreationLimit(); nothing here is typed in.
//
// Window: rolling, half-open [start, start + periodDays) in milliseconds. A slot exactly one period
// after another is outside its window. Rolling is never looser than a calendar week, so it can be
// stricter than KDP near the weekly reset.
// Scope: the caller passes the slots of one workspace (one KDP account); all pen names share them.

import type { TitleCreationLimit } from './kdp.ts';

export const TITLE_FORMATS = ['ebook', 'paperback', 'hardcover'] as const;
export type TitleFormat = (typeof TITLE_FORMATS)[number];

export interface TitleSlot {
  projectId: string;
  format: TitleFormat;
  /** Epoch milliseconds (UTC). */
  plannedAt: number;
}

export interface TitleSlotCheck {
  ok: boolean;
  /** Existing slots of the same format in every window that is already full, oldest first. Empty when ok. */
  conflicts: TitleSlot[];
  /** proposed.plannedAt when ok; otherwise the earliest later time at which the slot would be allowed. */
  nextFreeAt: number;
}

const DAY_MS = 86_400_000;

function assertLimit(limit: TitleCreationLimit): void {
  if (!Number.isInteger(limit.maxNewTitlesPerFormat) || limit.maxNewTitlesPerFormat < 1) {
    throw new RangeError('maxNewTitlesPerFormat must be a whole number of 1 or more.');
  }
  if (!Number.isInteger(limit.periodDays) || limit.periodDays < 1) {
    throw new RangeError('periodDays must be a whole number of 1 or more.');
  }
}

function assertTime(t: number, what: string): void {
  if (!Number.isFinite(t)) throw new RangeError(`${what} must be a finite time in milliseconds.`);
}

/** Slots that count against `proposed`: same format, and not the proposed project's own slot (a reschedule). */
function rivals(existing: readonly TitleSlot[], proposed: TitleSlot): TitleSlot[] {
  return existing.filter((s) => s.format === proposed.format && s.projectId !== proposed.projectId).sort((a, b) => a.plannedAt - b.plannedAt);
}

/**
 * Slots in full windows that contain time t. Only windows starting at t or at an existing slot need
 * checking: any window containing t can slide right to one of those starts without losing a slot.
 */
function fullWindowSlots(sorted: readonly TitleSlot[], t: number, periodMs: number, max: number): TitleSlot[] {
  const starts = [t, ...sorted.filter((s) => s.plannedAt > t - periodMs && s.plannedAt <= t).map((s) => s.plannedAt)];
  const hit = new Set<TitleSlot>();
  for (const start of starts) {
    const inside = sorted.filter((s) => s.plannedAt >= start && s.plannedAt < start + periodMs);
    if (inside.length >= max) for (const s of inside) hit.add(s);
  }
  return sorted.filter((s) => hit.has(s));
}

/** Whether `proposed` fits under the title creation limit, the slots in the way and the next free time. */
export function checkTitleSlot(existing: readonly TitleSlot[], proposed: TitleSlot, limit: TitleCreationLimit): TitleSlotCheck {
  assertLimit(limit);
  assertTime(proposed.plannedAt, 'proposed.plannedAt');
  for (const s of existing) assertTime(s.plannedAt, 'existing plannedAt');

  const periodMs = limit.periodDays * DAY_MS;
  const max = limit.maxNewTitlesPerFormat;
  const sorted = rivals(existing, proposed);
  const conflicts = fullWindowSlots(sorted, proposed.plannedAt, periodMs, max);
  if (conflicts.length === 0) return { ok: true, conflicts: [], nextFreeAt: proposed.plannedAt };

  // A blocked time frees up only when a slot leaves the window, at slot + period.
  const candidates = [...new Set(sorted.map((s) => s.plannedAt + periodMs))].filter((t) => t > proposed.plannedAt).sort((a, b) => a - b);
  let nextFreeAt = proposed.plannedAt;
  for (const t of candidates) {
    if (fullWindowSlots(sorted, t, periodMs, max).length === 0) {
      nextFreeAt = t;
      break;
    }
  }
  return { ok: false, conflicts, nextFreeAt };
}
