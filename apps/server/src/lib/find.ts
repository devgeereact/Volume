/** Book-wide find and replace on Markdown text: literal search, optional case match and whole words. */

export interface FindOptions {
  /** Match case exactly (default false). */
  caseSensitive?: boolean;
  /** Whole words only: no letter or digit right before or after the match (default false). */
  word?: boolean;
}

export interface FindMatch {
  start: number;
  end: number;
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function escape(q: string): string {
  return q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every non-overlapping match of `q` in `text`, in order. An empty query matches nothing. */
export function findMatches(text: string, q: string, opts: FindOptions = {}): FindMatch[] {
  if (!q) return [];
  const re = new RegExp(escape(q), opts.caseSensitive ? 'gu' : 'giu');
  const out: FindMatch[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const start = m.index;
    const end = start + m[0].length;
    if (opts.word) {
      const before = start > 0 ? text.slice(start - 1, start) : '';
      const after = text.slice(end, end + 1);
      if ((before && WORD_CHAR.test(before)) || (after && WORD_CHAR.test(after))) continue;
    }
    out.push({ start, end });
  }
  return out;
}

/** Replaces the given matches (from findMatches) with `replacement`, working from the end so offsets hold. */
export function replaceMatches(text: string, matches: readonly FindMatch[], replacement: string): string {
  let out = text;
  for (const m of [...matches].sort((a, b) => b.start - a.start)) out = out.slice(0, m.start) + replacement + out.slice(m.end);
  return out;
}

/** Up to `width` characters either side of a match, on one line. */
export function contextOf(text: string, m: FindMatch, width = 40): { before: string; match: string; after: string } {
  const flat = (s: string): string => s.replace(/\s+/g, ' ');
  return { before: flat(text.slice(Math.max(0, m.start - width), m.start)), match: text.slice(m.start, m.end), after: flat(text.slice(m.end, m.end + width)) };
}
