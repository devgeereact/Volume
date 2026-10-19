// Print glyphs (live acceptance 18 October 2026, defect 5): a character the embedded fonts lack makes Chromium fall
// back to a system font, which it writes into the PDF as Type 3 and preflight blocks (`interior.fonts`). The writer
// can emit any character, so before rendering the print HTML:
// 1. symbols no print font has (the Latin subsets of the OFL fonts in assets/fonts and @fontsource) become plain text
//    or a covered look-alike that keeps the meaning: "→" becomes "to", "⇒" "->", "↔" "<->", a tick "[x]", a cross "×";
// 2. maths symbols (≤ ≥ ≠ ≈ ∞ √ and so on) fall back to Lora's maths subset (OFL, @fontsource/lora), embedded as a
//    subset like every other print font (symbolFallbackCss).
// Coverage was read from each font's cmap (19 October 2026): every Latin subset lacks the arrows (Lora lacks ↑ and ↓
// too), ticks, ballot boxes, geometric bullets other than "•", stars, U+2010 to U+2012 hyphens, † and ‡.
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { BookDoc } from '@volume/core';
import type { FontLibrary } from './fonts.ts';

/** Words or ASCII arrows replace arrows; covered look-alikes replace ticks, crosses, boxes and bullets. */
const WORD: Record<string, string> = {
  '→': 'to',
  '⟶': 'to',
  '➔': 'to',
  '➜': 'to',
  '➝': 'to',
  '➞': 'to',
  '➡': 'to',
  '⇒': '->',
  '⇨': '->',
  '←': '<-',
  '⟵': '<-',
  '⬅': '<-',
  '⇐': '<-',
  '↔': '<->',
  '⇔': '<->',
  '⟷': '<->',
  '↑': 'up',
  '⬆': 'up',
  '↗': 'up',
  '↓': 'down',
  '⬇': 'down',
  '↘': 'down',
};
const SYMBOL: Record<string, string> = {
  '✓': '[x]',
  '✔': '[x]',
  '☑': '[x]',
  '✅': '[x]',
  '✗': '×',
  '✘': '×',
  '❌': '×',
  '☒': '×',
  '✕': '×',
  '✖': '×',
  '☐': '[ ]',
  '□': '[ ]',
  '■': '•',
  '▪': '•',
  '◼': '•',
  '◾': '•',
  '●': '•',
  '◆': '•',
  '◇': '•',
  '○': '•',
  '◦': '•',
  '‣': '•',
  '★': '*',
  '☆': '*',
  '‐': '-',
  '‑': '-',
  '‒': '-',
  '†': '*',
  '‡': '**',
  '⅓': '1/3',
  '⅔': '2/3',
  '№': 'No.',
};

const WORD_RE = new RegExp(`[ \\t]*[${Object.keys(WORD).join('')}][\\uFE0E\\uFE0F]?[ \\t]*`, 'gu');
const SYMBOL_RE = new RegExp(`[${Object.keys(SYMBOL).join('')}][\\uFE0E\\uFE0F]?`, 'gu');
/**
 * Emoji and pictographs no print font has, and which carry no words: U+1F000 to U+1FAFF, the miscellaneous symbols and
 * dingbats (U+2600 to U+27BF) and U+2B00 to U+2BFF. Ticks, crosses, stars and arrows in those blocks are mapped first.
 */
const EMOJI_RE = /[ \t]?(?:(?:[\u{1F000}-\u{1FAFF}]|[\u2600-\u27BF]|[\u2B00-\u2BFF])(?:[\u{1F3FB}-\u{1F3FF}]|\uFE0F|\u200D)*)+/gu;

export interface GlyphReplacement {
  from: string;
  to: string;
  count: number;
}

/**
 * Replace characters no print font covers. Arrows become words with single spaces around them ("A→B" and "A → B"
 * both become "A to B"); an arrow that opens a line is dropped ("→ Next" becomes "Next"). Records each replacement.
 */
export function normalisePrintText(text: string, seen?: Map<string, GlyphReplacement>): string {
  const note = (from: string, to: string) => {
    if (!seen) return;
    const r = seen.get(from) ?? { from, to, count: 0 };
    r.count++;
    seen.set(from, r);
  };
  let out = text.replace(WORD_RE, (m, offset: number, whole: string) => {
    const ch = [...m.trim()][0] ?? '';
    const word = WORD[ch] ?? '';
    note(ch, word);
    const before = whole.slice(0, offset);
    const after = whole.slice(offset + m.length);
    if (before === '' || before.endsWith('\n')) return '';
    const lead = /[([]$/.test(before) ? '' : ' ';
    const trail = after === '' || /^[\n)\].,;:!?]/.test(after) ? '' : ' ';
    return `${lead}${word}${trail}`;
  });
  out = out.replace(SYMBOL_RE, (m) => {
    const ch = [...m][0] ?? '';
    const to = SYMBOL[ch] ?? '';
    note(ch, to);
    return to;
  });
  out = out.replace(EMOJI_RE, (m) => {
    note(m.trim(), '');
    return '';
  });
  return out;
}

function mapStrings<T>(value: T, fn: (s: string) => string): T {
  if (typeof value === 'string') return fn(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => mapStrings(v, fn)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === 'src' || k === 'id' || k === 'imageKey' ? v : mapStrings(v, fn);
    return out as T;
  }
  return value;
}

/** A copy of any plain data (cover meta, a picture book) with print-unsafe glyphs replaced; ids and image keys kept. */
export function normalisePrintStrings<T>(value: T, seen?: Map<string, GlyphReplacement>): T {
  return mapStrings(value, (s) => normalisePrintText(s, seen));
}

/** A copy of the book with print-unsafe glyphs replaced in every text, and what was replaced. */
export function normaliseBookGlyphs(book: BookDoc): { book: BookDoc; replaced: GlyphReplacement[] } {
  const seen = new Map<string, GlyphReplacement>();
  const next = normalisePrintStrings(book, seen);
  return { book: next, replaced: [...seen.values()] };
}

/** One warning line for the export log, or undefined when nothing changed. */
export function glyphWarning(replaced: GlyphReplacement[]): string | undefined {
  if (!replaced.length) return undefined;
  const list = replaced.map((r) => `"${r.from}" ${r.to ? `to "${r.to}"` : 'removed'} (${r.count})`).join(', ');
  return `Symbols the print fonts lack were replaced so the PDF has no Type 3 fonts: ${list}.`;
}

/** Family name of the maths fallback; print CSS lists it after each family. */
export const SYMBOL_FALLBACK_FAMILY = 'Volume Symbols';
/** Code points in Lora's maths subset (from @fontsource/lora index.css, 5.3.0), less the arrows Lora does not draw. */
const MATH_RANGE =
  'U+0391-03A1,U+03A3-03A9,U+03B1-03C9,U+2016-2017,U+2034-2038,U+2070-2071,U+2074-208E,U+2100-2112,U+2114-2115,U+2117-2121,U+2123-214F,U+21F4-2211,U+2213-2214,U+2216-22FF,U+2308-230B,U+27C0-27FF,U+2900-2AFF';

const fallbackCache = new Map<string, string>();
/**
 * @font-face rules for the maths fallback (Lora maths subset, 400 and 700, roman and italic), as data: URLs. Empty when
 * Lora is not installed. Chromium embeds only the glyphs used, as a TrueType subset (not Type 3).
 */
export function symbolFallbackCss(lib: FontLibrary): string {
  const latin = lib.family('Lora').find((f) => f.source === 'fontsource');
  if (!latin) return '';
  const dir = path.dirname(latin.path);
  const hit = fallbackCache.get(dir);
  if (hit !== undefined) return hit;
  const rules: string[] = [];
  for (const weight of [400, 700])
    for (const style of ['normal', 'italic'] as const) {
      const file = path.join(dir, `lora-math-${weight}-${style}.woff2`);
      if (!existsSync(file)) continue;
      rules.push(
        `@font-face { font-family: '${SYMBOL_FALLBACK_FAMILY}'; font-weight: ${weight}; font-style: ${style}; unicode-range: ${MATH_RANGE}; src: url('data:font/woff2;base64,${readFileSync(file).toString('base64')}') format('woff2'); }`,
      );
    }
  const css = rules.join('\n');
  fallbackCache.set(dir, css);
  return css;
}

/** Add the maths fallback after every single-family `font-family: 'X'` declaration (not inside @font-face rules). */
export function withSymbolFallback(css: string): string {
  return css.replace(/(^|[;{\s])font-family: '([^']+)';/g, (m, lead: string, fam: string, offset: number, whole: string) => {
    const open = whole.lastIndexOf('@font-face', offset);
    if (open !== -1 && whole.indexOf('}', open) > offset) return m;
    return `${lead}font-family: '${fam}', '${SYMBOL_FALLBACK_FAMILY}';`;
  });
}
