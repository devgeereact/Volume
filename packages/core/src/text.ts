// Small text helpers shared by the parser, checkers and exporters.

/** Lower-case slug: letters and digits joined by hyphens ("Chapter 1: Read" -> "chapter-1-read"). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Words are tokens containing at least one letter or digit (the TXT word count rule). */
export function countWords(text: string): number {
  let n = 0;
  for (const tok of text.split(/\s+/)) if (/[\p{L}\p{N}]/u.test(tok)) n++;
  return n;
}

/**
 * Wrap on word boundaries to `width` columns. Words longer than the width stay whole on their own line.
 * `indent` prefixes continuation lines; `firstIndent` prefixes the first line.
 */
export function wrapText(text: string, width = 80, firstIndent = '', indent = ''): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = firstIndent;
  let lineHasWord = false;
  for (const w of words) {
    const prefixLen = line.length;
    if (!lineHasWord) {
      line += w;
      lineHasWord = true;
    } else if (prefixLen + 1 + w.length <= width) {
      line += ` ${w}`;
    } else {
      lines.push(line);
      line = indent + w;
    }
  }
  if (lineHasWord || lines.length === 0) lines.push(line);
  return lines;
}

const ROMAN: [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];
export function toRoman(n: number): string {
  let out = '';
  let rest = n;
  for (const [v, s] of ROMAN) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}

export interface TitleCaseOptions {
  /** Lower-case minor words except first and last ("lowercase" mode). Empty means capitalise every word. */
  minorWords?: readonly string[];
}

/**
 * House title case: capitalise the first letter of every word (default mode "capitalise-every-word").
 * Hyphenated words capitalise only the first part; letters after an apostrophe are left alone;
 * words with capitals after the first letter (acronyms, brands) and units stay as written.
 */
export function toTitleCase(text: string, opts: TitleCaseOptions = {}): string {
  const minor = new Set((opts.minorWords ?? []).map((w) => w.toLowerCase()));
  const parts = text.split(/(\s+)/);
  const wordIdx = parts.map((p, i) => (/\S/.test(p) ? i : -1)).filter((i) => i >= 0);
  const first = wordIdx[0];
  const last = wordIdx[wordIdx.length - 1];
  return parts
    .map((p, i) => {
      if (!/\S/.test(p)) return p;
      if (/\p{L}.*\p{Lu}/u.test(p.slice(1))) return p; // NHS, TRiM, iPhone
      const bare = p.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase();
      if (minor.has(bare) && i !== first && i !== last) return p.toLowerCase();
      return p.replace(/\p{L}/u, (c) => c.toUpperCase());
    })
    .join('');
}

/** Check that a heading is in house title case; returns the words that are not, or an empty list. */
export function titleCaseProblems(text: string, opts: TitleCaseOptions = {}): string[] {
  const words = text
    .replace(/[*_`]/g, '')
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w));
  const minor = new Set((opts.minorWords ?? []).map((w) => w.toLowerCase()));
  const bad: string[] = [];
  words.forEach((w, i) => {
    const bare = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase();
    const isMinorPos = minor.has(bare) && i > 0 && i < words.length - 1;
    const startsLower = /^[^\p{L}]*\p{Ll}/u.test(w);
    if (!isMinorPos && startsLower) bad.push(w);
  });
  return bad;
}

/** ISBN-13 checksum (validation only: Volume never generates an ISBN). */
export function isValidIsbn13(isbn: string): boolean {
  const digits = isbn.replace(/[\s-]/g, '');
  if (!/^97[89]\d{10}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(digits[12]);
}
