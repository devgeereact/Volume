import rulesFile from "@config/kdp-rules/2026-10-17.json";
import { colourPageRange, parseKdpRules, spineTextAllowed, trimPageRange, trimSizes, wrapSizeIn, type ColourInk, type Paper } from "@volume/core";

/* Paperback numbers for the cover studio's Paperback panel: trims, inks, page ranges, spine and wrap. Every
   value comes from config/kdp-rules through the KDP maths in packages/core (AGENTS.md rule 7). The studio only
   offers trims from the rules' list (paperback.trimSizes.list); the panel is a what-if, and the build always
   uses the book's own trim and the interior PDF's real page count. */

const rules = parseKdpRules(rulesFile);
export const paperbackRulesVersion: string = rules.version;

export type Ink = "black" | ColourInk;
export const INKS: readonly { value: Ink; label: string }[] = [
  { value: "black", label: "Black" },
  { value: "standard", label: "Standard colour" },
  { value: "premium", label: "Premium colour" },
];

export interface Trim {
  w: number;
  h: number;
}

const trimKey = (t: Trim) => `${t.w}x${t.h}`;
export const trimLabel = (t: Trim): string => `${t.w} x ${t.h} in`;

/** The trims in the KDP rules file, in its order. */
export const ruleTrims: readonly Trim[] = trimSizes(rules).value.map((t) => ({ w: t.widthIn, h: t.heightIn }));

export const trimInRules = (t: Trim): boolean => ruleTrims.some((r) => trimKey(r) === trimKey(t));

/** Colour ink prints on white paper only (rule paperback.colour.paper). */
export const paperFor = (ink: Ink, paper: Paper): Paper => (ink === "black" ? paper : "white");

/** The page range for a trim, ink and paper, or null when the rules have no row for it. */
export function pageRange(trim: Trim, ink: Ink, paper: Paper): { min: number; max: number } | null {
  if (!trimInRules(trim)) return null;
  const t = { widthIn: trim.w, heightIn: trim.h };
  try {
    return ink === "black" ? trimPageRange(rules, t, paper).value : colourPageRange(rules, t, ink).value;
  } catch {
    return null;
  }
}

export interface PaperbackSize {
  spineIn: number;
  widthIn: number;
  heightIn: number;
  bleedIn: number;
  /** Thickness per page used for the spine. */
  perPageIn: number;
  spineText: boolean;
}

/** Spine and full wrap for a trim, page count, ink and paper (black ink uses the paper's thickness, colour the ink's). */
export function paperbackSize(trim: Trim, pages: number, ink: Ink, paper: Paper): PaperbackSize {
  const t = { widthIn: trim.w, heightIn: trim.h };
  const p = paperFor(ink, paper);
  const w = ink === "black" ? wrapSizeIn(rules, { trim: t, pages, paper: p }) : wrapSizeIn(rules, { trim: t, pages, paper: p, ink });
  return {
    spineIn: w.spineIn,
    widthIn: w.widthIn,
    heightIn: w.heightIn,
    bleedIn: w.bleedIn,
    perPageIn: pages > 0 ? w.spineIn / pages : 0,
    spineText: spineTextAllowed(rules, pages),
  };
}

/** The page-range check for the panel and the Checks tab. */
export function pageCheck(trim: Trim, pages: number, ink: Ink, paper: Paper): { ok: boolean | null; text: string } {
  const range = pageRange(trim, ink, paper);
  const inkName = INKS.find((i) => i.value === ink)?.label.toLowerCase() ?? ink;
  if (!range) return { ok: null, text: `Page limits for ${trimLabel(trim)} are not in the KDP rules, so this is not checked.` };
  const where = `${inkName[0]?.toUpperCase() ?? ""}${inkName.slice(1)} ink on ${trimLabel(trim)}${ink === "black" ? `, ${paperFor(ink, paper)} paper` : ""}`;
  const ok = pages >= range.min && pages <= range.max;
  return { ok, text: `${pages} pages. ${where} takes ${range.min} to ${range.max} pages.` };
}
