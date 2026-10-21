// Print typography: straight quotes become curly ones, the way the owner's books are set (Harni Muharami catalogue,
// 21 October 2026). Applied when a book is typeset (PDF, DOCX, EPUB, TXT), never to the manuscript text itself.

const OPENS_AFTER = /[\s([{\u2014\u2013\-/*_]/;

/** Straight " and ' to curly quotes and apostrophes. Inline code (`...`) and URLs are left exactly as written. */
export function curlQuotes(text: string): string {
  if (!/["']/.test(text)) return text;
  return text
    .split(/(`[^`]*`|https?:\/\/\S+|www\.\S+)/g)
    .map((part, i) => (i % 2 === 1 ? part : curlPlain(part)))
    .join('');
}

function curlPlain(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const prev = i > 0 ? s[i - 1]! : '';
    const opens = prev === '' || OPENS_AFTER.test(prev);
    if (ch === '"') out += opens ? '“' : '”';
    else if (ch === "'") {
      // An apostrophe inside or after a word (don't, nurses') closes; one at a word start opens ('quiet one').
      const next = s[i + 1] ?? '';
      out += opens && /\S/.test(next) ? '‘' : '’';
    } else out += ch;
  }
  return out;
}

const SKIP_KEYS = new Set(['type', 'src', 'href', 'url', 'id', 'variant', 'kind', 'subtype', 'lang', 'mime']);

/** A deep copy of a book-model value with curlQuotes applied to every text string, skipping ids, kinds and links. */
export function curlQuotesDeep<T>(value: T): T {
  if (typeof value === 'string') return curlQuotes(value) as T;
  if (Array.isArray(value)) return (value as unknown[]).map((v): unknown => curlQuotesDeep(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SKIP_KEYS.has(k) ? v : curlQuotesDeep(v);
    return out as T;
  }
  return value;
}
