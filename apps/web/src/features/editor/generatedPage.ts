import type { ApiSection } from "../../api/types";
import { formatNumber } from "../../lib/format";
import type { MsSection } from "./manuscript";

/* What the Editor shows for pages the writer does not write. The server (apps/server jobs/book-data.ts) builds each page
   with the exporter's own code and sends the text; these helpers only decide how to label and count it. */

const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** 1 to 39 as Roman numerals, for "Part II". Larger numbers fall back to digits. */
export function romanNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 39) return String(n);
  let left = n;
  let out = "";
  for (const [value, mark] of ROMAN)
    while (left >= value) {
      out += mark;
      left -= value;
    }
  return out;
}

/** Words that count toward the manuscript but are missing from the server's total: the text of built pages (About the author, Also by). */
export function builtPageWords(sections: readonly Pick<ApiSection, "enabled" | "generated">[]): number {
  return sections.reduce((n, s) => (s.enabled && s.generated && s.generated.countsInTotal ? n + s.generated.words : n), 0);
}

/** The words to show for a section: a built page's own words, otherwise the saved text's. */
export function shownWords(s: Pick<ApiSection, "wordCount" | "generated">): number {
  return s.generated ? s.generated.words : s.wordCount;
}

/** The small line under a section's name in the manuscript tree. */
export function treeMeta(s: MsSection, words: number, edited: boolean): string {
  if (!s.enabled) return "Off";
  if (s.isPart) return "Divider";
  if (s.generated?.leftOut) return "Left out";
  if (s.ownerPrompt && s.blocks.length === 0) return "Needs your input";
  if (s.generated) return `${formatNumber(words)}, built`;
  if (s.blocks.length === 0 && s.baseWords === 0) return "Empty";
  return `${formatNumber(words)}${edited ? ", edited" : ""}`;
}

/** The part's heading: "Part II: Title", or just the title when it has no number. */
export function partTitle(number: number | null, title: string | null): string {
  const name = title?.trim() ?? "";
  if (number === null) return name || "Part";
  return name ? `Part ${romanNumeral(number)}: ${name}` : `Part ${romanNumeral(number)}`;
}
