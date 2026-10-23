// Editing the cover from the preview: the pure rules behind the toolbar (no React), so they are easy to test.
// Positions are in cover-width units (width 100, height 150), the same numbers the build stores as the Pct fields.

export type CoverPart = "title" | "subtitle" | "author";
export type PartAlign = "left" | "center" | "right";

/** What the owner changed on the preview. Anything missing keeps the cover style's own value. */
export interface CoverEdits {
  titleAlign?: PartAlign | undefined;
  subtitleAlign?: PartAlign | undefined;
  authorAlign?: PartAlign | undefined;
  titleTop?: number | undefined;
  subtitleTop?: number | undefined;
  authorTop?: number | undefined;
  /** Multipliers, 0.6 to 1.6. */
  subtitleSize?: number | undefined;
  authorSize?: number | undefined;
  titleUppercase?: boolean | undefined;
}

export const TOP_MIN = 0;
export const TOP_MAX = 150;
export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.6;
export const SCALE_STEP = 0.1;
export const TITLE_SIZE_MIN = 60;
export const TITLE_SIZE_MAX = 180;
export const TITLE_SIZE_STEP = 5;
/** One press of Move up or Move down, in cover-width units. */
export const NUDGE = 1;

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
export const clampTop = (n: number): number => round(Math.min(TOP_MAX, Math.max(TOP_MIN, n)), 1);
export const clampScale = (n: number): number => round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, n)), 2);

/** Move a line up (-1) or down (1) by one step. */
export const nudgeTop = (top: number, direction: -1 | 1, step = NUDGE): number => clampTop(top + direction * step);

/** Smaller (-1) or larger (1) for the subtitle or author multiplier. */
export const stepScale = (scale: number, direction: -1 | 1): number => clampScale(scale + direction * SCALE_STEP);

/** Smaller (-1) or larger (1) for the title, as a percent of the style's size. */
export const stepTitleSize = (pct: number, direction: -1 | 1): number => Math.min(TITLE_SIZE_MAX, Math.max(TITLE_SIZE_MIN, pct + direction * TITLE_SIZE_STEP));

/** Where a line ends up when dragged `dyPx` down from `startTop`, on a preview `heightPx` tall. */
export const dragTop = (startTop: number, dyPx: number, heightPx: number, units: number = TOP_MAX): number =>
  heightPx > 0 ? clampTop(startTop + (dyPx / heightPx) * units) : clampTop(startTop);

const PART_ALIGN = { title: "titleAlign", subtitle: "subtitleAlign", author: "authorAlign" } as const;
const PART_TOP = { title: "titleTop", subtitle: "subtitleTop", author: "authorTop" } as const;

export const setAlign = (edits: CoverEdits, part: CoverPart, align: PartAlign): CoverEdits => ({ ...edits, [PART_ALIGN[part]]: align });
export const setTop = (edits: CoverEdits, part: CoverPart, top: number): CoverEdits => ({ ...edits, [PART_TOP[part]]: clampTop(top) });

/** Back to the style's own tops, after the owner picks a Title position from the side controls. */
export const clearTops = (edits: CoverEdits): CoverEdits => ({ ...edits, titleTop: undefined, subtitleTop: undefined });

/** The keys these edits add to the saved typography (POST /cover/choose). Unset edits add nothing. */
export const EDIT_KEYS = [
  "titleAlign",
  "subtitleAlign",
  "authorAlign",
  "subtitleTopPct",
  "authorTopPct",
  "subtitleSize",
  "authorSize",
  "titleUppercase",
] as const;

export function editsToTypography(e: CoverEdits): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (e.titleAlign) out["titleAlign"] = e.titleAlign;
  if (e.subtitleAlign) out["subtitleAlign"] = e.subtitleAlign;
  if (e.authorAlign) out["authorAlign"] = e.authorAlign;
  if (e.subtitleTop !== undefined) out["subtitleTopPct"] = round(e.subtitleTop, 2);
  if (e.authorTop !== undefined) out["authorTopPct"] = round(e.authorTop, 2);
  if (e.subtitleSize !== undefined) out["subtitleSize"] = e.subtitleSize;
  if (e.authorSize !== undefined) out["authorSize"] = e.authorSize;
  if (e.titleUppercase !== undefined) out["titleUppercase"] = e.titleUppercase;
  return out;
}

const isAlign = (v: unknown): v is PartAlign => v === "left" || v === "center" || v === "right";
const inRange = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/**
 * The edits saved last time. The title top is always saved (as titleTopPct), so it only counts as an edit when it
 * differs from where the style puts the title (`autoTitleTop`); that keeps older covers looking as they did.
 */
export function editsFromSaved(saved: Record<string, unknown>, autoTitleTop: number): CoverEdits {
  const e: CoverEdits = {};
  const rawAlign = (v: unknown) => (v === "centre" ? "center" : v);
  const ta = rawAlign(saved["titleAlign"]);
  const sa = rawAlign(saved["subtitleAlign"]);
  const aa = rawAlign(saved["authorAlign"]);
  if (isAlign(ta)) e.titleAlign = ta;
  if (isAlign(sa)) e.subtitleAlign = sa;
  if (isAlign(aa)) e.authorAlign = aa;
  const top = saved["titleTopPct"];
  if (inRange(top, TOP_MIN, TOP_MAX) && Math.abs(top - autoTitleTop) > 0.05) e.titleTop = top;
  if (inRange(saved["subtitleTopPct"], TOP_MIN, TOP_MAX)) e.subtitleTop = saved["subtitleTopPct"];
  if (inRange(saved["authorTopPct"], TOP_MIN, TOP_MAX)) e.authorTop = saved["authorTopPct"];
  if (inRange(saved["subtitleSize"], SCALE_MIN, SCALE_MAX)) e.subtitleSize = saved["subtitleSize"];
  if (inRange(saved["authorSize"], SCALE_MIN, SCALE_MAX)) e.authorSize = saved["authorSize"];
  if (typeof saved["titleUppercase"] === "boolean") e.titleUppercase = saved["titleUppercase"];
  return e;
}
