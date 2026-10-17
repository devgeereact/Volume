/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { checkTitleSlot, getRule, KdpRuleError, titleCreationLimit, type KdpRules, type TitleSlot } from '../src/index.ts';
import { loadKdpRules } from '../src/node/index.ts';

const rules = loadKdpRules();
const limit = titleCreationLimit(rules);
const DAY = 86_400_000;
const PERIOD = limit.periodDays * DAY;
const MAX = limit.maxNewTitlesPerFormat;
const T0 = Date.UTC(2026, 9, 19, 9, 0, 0);

const slot = (projectId: string, at: number, format: TitleSlot['format'] = 'paperback'): TitleSlot => ({ projectId, format, plannedAt: at });
/** `n` paperback slots starting at `start`, one hour apart. */
const fill = (n: number, start: number, format: TitleSlot['format'] = 'paperback'): TitleSlot[] =>
  Array.from({ length: n }, (_, i) => slot(`p${i}`, start + i * 3_600_000, format));

/** A copy of the rules with titles.creationLimit values replaced. */
function withLimit(values: unknown): KdpRules {
  return { ...rules, rules: rules.rules.map((r) => (r.id === 'titles.creationLimit' ? { ...r, values } : r)) };
}

describe('titleCreationLimit (FACTS 5.7)', () => {
  it('reads the limit from the latest rules file, not from code', () => {
    const r = getRule(rules, 'titles.creationLimit');
    const v = r.values as { maxNewTitlesPerFormat: number; period: string };
    expect(limit.maxNewTitlesPerFormat).toBe(v.maxNewTitlesPerFormat);
    expect(v.period).toBe('week');
    expect(limit.periodDays).toBe(7);
  });

  it('follows the rules file when the numbers change', () => {
    expect(titleCreationLimit(withLimit({ maxNewTitlesPerFormat: 5, period: 'day' }))).toEqual({ maxNewTitlesPerFormat: 5, periodDays: 1 });
  });

  it.each([
    [{ maxNewTitlesPerFormat: 0, period: 'week' }],
    [{ maxNewTitlesPerFormat: 1.5, period: 'week' }],
    [{ maxNewTitlesPerFormat: '2', period: 'week' }],
    [{ maxNewTitlesPerFormat: 2, period: 'fortnight' }],
    [{ maxNewTitlesPerFormat: 2, period: 'toString' }],
    [{ maxNewTitlesPerFormat: 2 }],
    [null],
  ])('refuses a broken rule %j', (values) => {
    expect(() => titleCreationLimit(withLimit(values))).toThrow(KdpRuleError);
  });

  it('refuses a rules file without the rule', () => {
    expect(() => titleCreationLimit({ ...rules, rules: rules.rules.filter((r) => r.id !== 'titles.creationLimit') })).toThrow(KdpRuleError);
  });
});

describe('checkTitleSlot (D-046, rolling window per format)', () => {
  it('allows a slot in an empty schedule', () => {
    expect(checkTitleSlot([], slot('new', T0), limit)).toEqual({ ok: true, conflicts: [], nextFreeAt: T0 });
  });

  it('allows up to the limit inside one window', () => {
    expect(checkTitleSlot(fill(MAX - 1, T0), slot('new', T0 + DAY), limit).ok).toBe(true);
  });

  it('refuses one more than the limit and names the conflicts and the next free time', () => {
    const existing = fill(MAX, T0);
    const res = checkTitleSlot(existing, slot('new', T0 + 2 * DAY), limit);
    expect(res.ok).toBe(false);
    expect(res.conflicts).toEqual(existing);
    // The earliest slot leaves the window one period after it was planned.
    expect(res.nextFreeAt).toBe(T0 + PERIOD);
    expect(checkTitleSlot(existing, slot('new', res.nextFreeAt), limit).ok).toBe(true);
    expect(checkTitleSlot(existing, slot('new', res.nextFreeAt - 1), limit).ok).toBe(false);
  });

  it('treats the window as half-open: exactly one period apart is outside, one millisecond less is inside', () => {
    const existing = fill(MAX, T0);
    const last = existing[existing.length - 1]!.plannedAt;
    expect(checkTitleSlot(existing, slot('new', T0 + PERIOD), limit).ok).toBe(true);
    expect(checkTitleSlot(existing, slot('new', T0 + PERIOD - 1), limit).ok).toBe(false);
    // Looking backwards too: a slot one period before the first full slot is free.
    expect(checkTitleSlot(existing, slot('new', last - PERIOD), limit).ok).toBe(true);
    expect(checkTitleSlot(existing, slot('new', last - PERIOD + 1), limit).ok).toBe(false);
  });

  it('refuses a slot planned before slots already in the schedule', () => {
    const existing = fill(MAX, T0 + 3 * DAY);
    const res = checkTitleSlot(existing, slot('new', T0), limit);
    expect(res.ok).toBe(false);
    expect(res.conflicts).toEqual(existing);
    // The first of them leaving the window drops the count below the limit.
    expect(res.nextFreeAt).toBe(existing[0]!.plannedAt + PERIOD);
    expect(checkTitleSlot(existing, slot('new', res.nextFreeAt - 1), limit).ok).toBe(false);
  });

  it('does not count slots that never share one window with the proposed slot', () => {
    // Before and after, each within one period of the proposed time but more than one period apart from each other.
    const existing = [
      ...fill(MAX - 1, T0 - PERIOD + DAY).map((s) => ({ ...s, projectId: `a-${s.projectId}` })),
      ...fill(MAX - 1, T0 + PERIOD - DAY).map((s) => ({ ...s, projectId: `b-${s.projectId}` })),
    ];
    expect(checkTitleSlot(existing, slot('new', T0), limit).ok).toBe(true);
  });

  it('counts each format on its own', () => {
    const existing = [...fill(MAX, T0, 'ebook'), ...fill(MAX, T0, 'hardcover')];
    expect(checkTitleSlot(existing, slot('new', T0 + DAY, 'paperback'), limit).ok).toBe(true);
    expect(checkTitleSlot(existing, slot('new', T0 + DAY, 'ebook'), limit).ok).toBe(false);
  });

  it("ignores the proposed project's own slot in that format, so a book can be moved", () => {
    const existing = fill(MAX, T0);
    const own = existing[0]!;
    expect(checkTitleSlot(existing, { ...own, plannedAt: T0 + DAY }, limit).ok).toBe(true);
    expect(checkTitleSlot(existing, { ...own, format: 'ebook', plannedAt: T0 + DAY }, limit).ok).toBe(true);
  });

  it('finds the next free time after a long run of full windows', () => {
    // MAX slots every day for three periods: nothing is free until the first of the last day's slots leaves the window.
    const days = 3 * limit.periodDays;
    const existing: TitleSlot[] = [];
    for (let d = 0; d < days; d++) for (let i = 0; i < MAX; i++) existing.push(slot(`d${d}-${i}`, T0 + d * DAY + i * 60_000));
    const res = checkTitleSlot(existing, slot('new', T0), limit);
    expect(res.ok).toBe(false);
    expect(checkTitleSlot(existing, slot('new', res.nextFreeAt), limit).ok).toBe(true);
    expect(res.nextFreeAt).toBe(T0 + (days - 1) * DAY + PERIOD);
    expect(checkTitleSlot(existing, slot('new', res.nextFreeAt - 1), limit).ok).toBe(false);
  });

  it('returns conflicts oldest first, whatever order they came in', () => {
    const existing = fill(MAX, T0).reverse();
    const res = checkTitleSlot(existing, slot('new', T0 + DAY), limit);
    expect(res.conflicts.map((s) => s.plannedAt)).toEqual([...existing].map((s) => s.plannedAt).sort((a, b) => a - b));
  });

  it('only lists slots from windows that are full', () => {
    // MAX slots clustered late in the window; one stray slot early that never shares a full window with them.
    const early = slot('early', T0 - PERIOD + DAY);
    const late = fill(MAX, T0 + 2 * DAY);
    const res = checkTitleSlot([early, ...late], slot('new', T0 + 3 * DAY), limit);
    expect(res.ok).toBe(false);
    expect(res.conflicts).toEqual(late);
  });

  it('works with any limit passed in', () => {
    const one = { maxNewTitlesPerFormat: 1, periodDays: 1 };
    expect(checkTitleSlot([slot('a', T0)], slot('b', T0 + DAY - 1), one)).toEqual({ ok: false, conflicts: [slot('a', T0)], nextFreeAt: T0 + DAY });
    expect(checkTitleSlot([slot('a', T0)], slot('b', T0 + DAY), one).ok).toBe(true);
  });

  it.each([
    [{ maxNewTitlesPerFormat: 0, periodDays: 7 }],
    [{ maxNewTitlesPerFormat: 2, periodDays: 0 }],
    [{ maxNewTitlesPerFormat: 2.5, periodDays: 7 }],
    [{ maxNewTitlesPerFormat: 2, periodDays: Number.NaN }],
  ])('refuses a bad limit %j', (bad) => {
    expect(() => checkTitleSlot([], slot('new', T0), bad)).toThrow(RangeError);
  });

  it('refuses times that are not finite', () => {
    expect(() => checkTitleSlot([], slot('new', Number.NaN), limit)).toThrow(RangeError);
    expect(() => checkTitleSlot([slot('a', Number.POSITIVE_INFINITY)], slot('new', T0), limit)).toThrow(RangeError);
  });

  it('does not change its inputs', () => {
    const existing = fill(MAX, T0).reverse();
    const copy = structuredClone(existing);
    checkTitleSlot(existing, slot('new', T0), limit);
    expect(existing).toEqual(copy);
  });
});
