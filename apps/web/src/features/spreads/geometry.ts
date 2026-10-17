import rulesFile from "@config/kdp-rules/2026-10-17.json";
import {
  defaultPictureBookPlan,
  interiorBleedSizeIn,
  parseKdpRules,
  parseTrimKey,
  pictureBookGeometry,
  safeRectIn,
  trimBoxIn,
  type ColourInk,
  type PictureBookPlan,
  type RectIn,
} from "@volume/core";
import type { SpreadLayout } from "../../api/picture";

/* Page geometry for the spreads board and the export step, from config/kdp-rules/2026-10-17.json (the newest
   rules file, the one the server reads) through the same @volume/core maths the exporter uses: page size with
   bleed (rule print.bleed) and the safe area (rule paperback.interiorMargins). Nothing is typed in from memory.
   This module loads @volume/core and zod, so it is only imported from the picture-book chunk. */

const rules = parseKdpRules(rulesFile);
export const pictureRulesVersion: string = rulesFile.version;

/** Picture books print on 8.5 x 8.5 in (D-044, PICTURE_TRIM on the server). */
export const PICTURE_TRIM_KEY = "8.5x8.5";

/** A box as percentages of the whole spread (two facing pages with bleed). */
export interface PctRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SpreadOverlay {
  /** Width over height of the two facing pages with bleed. */
  aspect: number;
  /** The gutter, as a percentage from the left. */
  gutter: number;
  trim: { left: PctRect; right: PctRect };
  safe: { left: PctRect; right: PctRect };
  ruleIds: string[];
}

/** Where the exporter puts a spread's text (spreadTextPlacement in packages/export/src/picture-book.ts). */
export function textPlacement(layout: SpreadLayout): { side: "left" | "right"; align: "top" | "middle" | "bottom" } {
  switch (layout) {
    case "text-left":
      return { side: "left", align: "middle" };
    case "text-right":
      return { side: "right", align: "middle" };
    case "text-top":
      return { side: "left", align: "top" };
    case "text-bottom":
      return { side: "left", align: "bottom" };
  }
}

/** The trim, safe area and gutter of one spread, as percentages, for a book of `pageCount` pages. */
export function spreadOverlay(pageCount: number): SpreadOverlay {
  const g = pictureBookGeometry(rules, parseTrimKey(PICTURE_TRIM_KEY), Math.max(1, pageCount));
  const w = g.page.widthIn * 2;
  const h = g.page.heightIn;
  const pct = (r: RectIn, offsetIn: number): PctRect => ({
    left: ((r.xIn + offsetIn) / w) * 100,
    top: (r.yIn / h) * 100,
    width: (r.widthIn / w) * 100,
    height: (r.heightIn / h) * 100,
  });
  return {
    aspect: w / h,
    gutter: 50,
    trim: { left: pct(trimBoxIn(g, "left"), 0), right: pct(trimBoxIn(g, "right"), g.page.widthIn) },
    safe: { left: pct(safeRectIn(g, "left"), 0), right: pct(safeRectIn(g, "right"), g.page.widthIn) },
    ruleIds: g.ruleIds,
  };
}

/** Page size with bleed (rule print.bleed), for the demo book. The server sends its own in API mode. */
export function bleedPageSize(): { widthIn: number; heightIn: number } {
  return interiorBleedSizeIn(rules, parseTrimKey(PICTURE_TRIM_KEY));
}

/** The default page plan (rule paperback.trimAndPages.colour) with the given matter pages, for the demo book. */
export function demoPlan(ink: ColourInk, frontPages: number, backPages: number): PictureBookPlan {
  return defaultPictureBookPlan(rules, parseTrimKey(PICTURE_TRIM_KEY), ink, { frontPages, backPages });
}

/** "8.625 x 8.75 in": inches with up to three decimals, trailing zeros dropped. */
export function inchesLabel(size: { widthIn: number; heightIn: number }): string {
  const f = (n: number) => String(Math.round(n * 1000) / 1000);
  return `${f(size.widthIn)} x ${f(size.heightIn)} in`;
}
