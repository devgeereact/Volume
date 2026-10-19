// Deterministic text checks added after live run 3 (5 October 2026): template junk the preflight must catch,
// prices with no month checked (book types with the dated-prices rule) and the glossary post-step. Model-free.

// ---------- template junk ----------

export type JunkKind = 'echo' | 'tbd' | 'lorem' | 'bracket' | 'brace' | 'empty-item';

export interface JunkHit {
  kind: JunkKind;
  /** The text as written ('' is never returned: an empty item reports its marker). */
  match: string;
  /** Offsets into the text given (UTF-16 code units). */
  start: number;
  end: number;
}

/** "- x: x", "a: a", "x: y": a label and value that are the same short token, or single characters. */
const ECHO_RE = /^(\s*(?:[-*+]\s+|\d+\.\s+)?)(?:\*\*)?([\p{L}\p{N}]{1,3})(?:\*\*)?\s*[:=-]\s*([\p{L}\p{N}]{1,3})\s*\.?\s*$/u;
const TBD_RE = /\b(?:TBD|TBC|tbd|tbc|TODO|FIXME|XXX+)\b/g;
const LOREM_RE = /\blorem\b|\bipsum dolor\b/gi;
/** "[NEEDS SOURCE]", "[insert name]", "[Your Name]", "[TK]"; a markdown link "[text](url)" is not junk. */
const BRACKET_RE = /\[(?:needs?|insert|add|todo|placeholder|tk|tbd|tbc|fill(?: in)?|your|author|citation needed|source)\b[^\]\n]*\](?!\()/gi;
/** "{placeholder}", "{book.title}", "{{name}}". */
const BRACE_RE = /\{\{?\s*[A-Za-z_][\w.]*\s*\}?\}/g;
/** A list marker with nothing (or only punctuation) after it. */
const EMPTY_ITEM_RE = /^(\s*)(?:[-*+]|\d+\.)\s*[\p{P}\s]*$/u;

/**
 * Template junk a model or a template can leave behind: echo lines such as "- x: x", TBD or TODO markers,
 * lorem ipsum, "[NEEDS ...]" style brackets, "{placeholder}" braces and empty list items. The text is read
 * line by line (a list item per line is fine). Ordinary prose is never matched.
 */
export function findTemplateJunk(text: string): JunkHit[] {
  const hits: JunkHit[] = [];
  let at = 0;
  for (const line of text.split('\n')) {
    const echo = ECHO_RE.exec(line);
    if (echo && (echo[2] ?? '').toLowerCase() === (echo[3] ?? '').toLowerCase()) {
      const lead = line.length - line.trimStart().length;
      hits.push({ kind: 'echo', match: line.trim(), start: at + lead, end: at + line.trimEnd().length });
    } else if (EMPTY_ITEM_RE.test(line) && line.trim() !== '' && !/^\s*(?:[-*_]\s*){3,}$/.test(line)) {
      const lead = line.length - line.trimStart().length;
      hits.push({ kind: 'empty-item', match: line.trim(), start: at + lead, end: at + line.trimEnd().length });
    }
    for (const [kind, re] of [
      ['tbd', TBD_RE],
      ['lorem', LOREM_RE],
      ['bracket', BRACKET_RE],
      ['brace', BRACE_RE],
    ] as const) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) hits.push({ kind, match: m[0], start: at + (m.index ?? 0), end: at + (m.index ?? 0) + m[0].length });
    }
    at += line.length + 1;
  }
  return hits.sort((a, b) => a.start - b.start);
}

// ---------- dated prices ----------

export interface PriceHit {
  /** The currency amount as written, for example "£60" or "15 pounds". */
  match: string;
  start: number;
  end: number;
  /** The sentence the amount sits in. */
  sentence: string;
}

const CURRENCY_RE =
  /(?:US\$|£|\$|€)\s?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:k|m|bn|million|billion)\b)?|\b\d+(?:,\d{3})*(?:\.\d+)?\s?(?:pounds|GBP|USD|EUR|dollars|euros)\b/g;
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec';
const MONTH_YEAR_RE = new RegExp(String.raw`\b(?:${MONTHS})\.?,?\s+\d{4}\b`);

/** Sentence spans of a text: a full stop, ! or ? followed by a space or the end ends a sentence; so does a line break. */
function sentenceSpans(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let start = 0;
  const re = /[.!?]+["'”’)\]]*(?=\s|$)|\n/g;
  for (const m of text.matchAll(re)) {
    const end = (m.index ?? 0) + m[0].length;
    if (end > start) out.push({ start, end });
    start = end;
  }
  if (start < text.length) out.push({ start, end: text.length });
  return out;
}

/** True when a "Month Year" date such as "October 2026" or "(checked Oct 2026)" is in the text. */
export function hasMonthYear(text: string): boolean {
  return MONTH_YEAR_RE.test(text);
}

/**
 * What a currency amount is:
 * - `sourced`: its sentence cites a research source ([[S<n>]]), so it is a real price the reader may want to date;
 * - `hypothetical`: a round figure in a sentence about the reader or a made-up case ("you", "your", "suppose", "say",
 *   "for example", "if" ...), for example "Set yourself a ceiling of £10 a month". Fine as it is;
 * - `unsourced`: any other specific price. It needs a source, so it belongs in the claims report, never a "checked"
 *   stamp the writer cannot back (live acceptance run, 18 October 2026: "(checked October 2026)" on invented prices).
 */
export type PriceKind = 'sourced' | 'hypothetical' | 'unsourced';

export interface ClassifiedPrice extends PriceHit {
  kind: PriceKind;
  /** True when the sentence carries a "Month Year" date. */
  dated: boolean;
}

const SOURCE_MARKER_RE = /\[\[S\d+\]\]/;
const HYPOTHETICAL_RE =
  /\b(?:you|your|yours|yourself|you're|you'll|you'd|suppose|supposing|say|imagine|for example|for instance|e\.g\.|if|let's|let us|budget|ceiling|aim)\b/i;

/** A whole amount that is a multiple of 5 (£10, $250, 50 pounds), or one given in thousands or millions. */
function isRoundFigure(match: string): boolean {
  if (/\d\.\d/.test(match)) return false;
  if (/(?:k|m|bn|million|billion)\b/i.test(match)) return true;
  const n = Number((/\d+(?:,\d{3})*/.exec(match)?.[0] ?? '').replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 && n % 5 === 0;
}

/** Every currency amount in a text, with its kind and whether its sentence carries a month and year. */
export function classifyPrices(text: string): ClassifiedPrice[] {
  const out: ClassifiedPrice[] = [];
  for (const s of sentenceSpans(text)) {
    const sentence = text.slice(s.start, s.end);
    const dated = hasMonthYear(sentence);
    const sourced = SOURCE_MARKER_RE.test(sentence);
    const hypothetical = HYPOTHETICAL_RE.test(sentence);
    CURRENCY_RE.lastIndex = 0;
    for (const m of sentence.matchAll(CURRENCY_RE)) {
      const start = s.start + (m.index ?? 0);
      const kind: PriceKind = sourced ? 'sourced' : hypothetical && isRoundFigure(m[0]) ? 'hypothetical' : 'unsourced';
      out.push({ match: m[0], start, end: start + m[0].length, sentence: sentence.trim(), kind, dated });
    }
  }
  return out;
}

const plainHit = ({ match, start, end, sentence }: ClassifiedPrice): PriceHit => ({ match, start, end, sentence });

/**
 * Sourced prices with no month and year in the same sentence. Book types with the dated-prices rule (a tech how-to,
 * travel) write a sourced price with "(checked <Month Year>)"; each hit is a real price the reader cannot date.
 * Hypothetical figures need no date, and unsourced specific prices go to the claims report (findUnsourcedPrices).
 */
export function findUndatedPrices(text: string): PriceHit[] {
  return classifyPrices(text)
    .filter((p) => p.kind === 'sourced' && !p.dated)
    .map(plainHit);
}

/** Specific prices with no research source, dated or not: claims to verify, not prices to stamp. */
export function findUnsourcedPrices(text: string): PriceHit[] {
  return classifyPrices(text)
    .filter((p) => p.kind === 'unsourced')
    .map(plainHit);
}

/** The month and year a book's prices are checked in, for example "October 2026" (UTC, English month names). */
export function checkedMonth(date: Date): string {
  const names = MONTHS.split('|').slice(0, 12);
  return `${names[date.getUTCMonth()] ?? ''} ${date.getUTCFullYear()}`;
}

/** A sentence that promises every price carries the month it was checked ("each price is dated", "carries the month it was checked"). */
const PRICE_PROMISE_RE =
  /\b(?:every|each|all|any)\b[^.!?\n]{0,40}\bprices?\b[^.!?\n]{0,60}\b(?:month|dated|date)\b|\bprices?\b[^.!?\n]{0,60}\b(?:carr(?:y|ies)|show|shows|with|has|have)\b[^.!?\n]{0,30}\b(?:the )?(?:month|date)\b[^.!?\n]{0,30}\bchecked\b/i;

/** The first sentence that promises dated prices, or null. */
export function findPricePromise(text: string): string | null {
  const m = PRICE_PROMISE_RE.exec(text);
  if (!m) return null;
  const spans = sentenceSpans(text);
  const s = spans.find((x) => x.start <= (m.index ?? 0) && (m.index ?? 0) < x.end);
  return (s ? text.slice(s.start, s.end) : m[0]).trim();
}

// ---------- glossary post-step ----------

export interface GlossaryEntry {
  term: string;
  definition: string;
}

export interface GlossaryTidy {
  entries: GlossaryEntry[];
  /** Terms merged into another entry with the same meaning: [dropped term, kept term]. */
  merged: [string, string][];
  /** Terms the book text never uses. */
  unused: string[];
}

const normDef = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Lower case, hyphens as spaces, a final plural s dropped, so "No-code tools" and "no code tool" compare equal. */
function normTerm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[-‐]/g, ' ')
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(?<=\w{3})(?:es|s)$/u, '');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when the term (or its plural, or a hyphen or space variant) appears in the text as whole words. */
export function textUsesTerm(text: string, term: string): boolean {
  const words = normTerm(term).split(' ').filter(Boolean);
  if (!words.length) return false;
  const body = words.map(escapeRe).join('[\\s\\-‐]+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?:s|es)?(?![\\p{L}\\p{N}])`, 'iu').test(text.replace(/[’]/g, "'"));
}

/**
 * The glossary post-step: entries with the same term or the same definition are merged (the longest term the
 * text uses is kept), terms the book text never uses are dropped, and the rest are sorted alphabetically.
 * With no book text nothing is dropped.
 */
export function tidyGlossary(entries: readonly GlossaryEntry[], bookText: string): GlossaryTidy {
  const merged: [string, string][] = [];
  const unused: string[] = [];
  const hasText = bookText.trim().length > 0;
  const groups: GlossaryEntry[][] = [];
  for (const e of entries) {
    const term = e.term.trim();
    if (!term) continue;
    const entry = { term, definition: e.definition.trim() };
    const g = groups.find((x) =>
      x.some((y) => normTerm(y.term) === normTerm(term) || (normDef(y.definition) !== '' && normDef(y.definition) === normDef(entry.definition))),
    );
    if (g) g.push(entry);
    else groups.push([entry]);
  }
  const kept: GlossaryEntry[] = [];
  for (const g of groups) {
    const used = hasText ? g.filter((x) => textUsesTerm(bookText, x.term)) : g;
    if (used.length === 0) {
      unused.push(...g.map((x) => x.term));
      continue;
    }
    const keep = [...used].sort((a, b) => b.term.length - a.term.length || a.term.localeCompare(b.term))[0] as GlossaryEntry;
    for (const x of g) if (x !== keep) merged.push([x.term, keep.term]);
    kept.push(keep);
  }
  kept.sort((a, b) => a.term.localeCompare(b.term, 'en-GB', { sensitivity: 'base' }));
  return { entries: kept, merged, unused };
}

const ENTRY_RE = /^\s*(?:[-*+]\s+)?\*\*(.+?)\*\*\s*[:.]?\s*(.*)$/;

/** Glossary Markdown ("**Term**: definition" paragraphs or list items) into entries; other paragraphs are kept apart. */
export function parseGlossaryMarkdown(markdown: string): { lead: string[]; entries: GlossaryEntry[] } {
  const lead: string[] = [];
  const entries: GlossaryEntry[] = [];
  for (const para of markdown.split(/\n{2,}/)) {
    const lines = para.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    const parsed = lines.map((l) => ENTRY_RE.exec(l));
    if (parsed.every((m) => m !== null)) {
      for (const m of parsed) if (m) entries.push({ term: (m[1] ?? '').replace(/:$/, '').trim(), definition: (m[2] ?? '').trim() });
    } else if (entries.length === 0) lead.push(para.trim());
    else {
      // A continuation paragraph belongs to the entry before it.
      const last = entries[entries.length - 1] as GlossaryEntry;
      last.definition = `${last.definition}\n\n${para.trim()}`;
    }
  }
  return { lead, entries };
}

/** The glossary post-step on Markdown: parse, tidy against the book text, write back as "**Term**: definition" paragraphs. */
export function tidyGlossaryMarkdown(markdown: string, bookText: string): GlossaryTidy & { markdown: string } {
  const { lead, entries } = parseGlossaryMarkdown(markdown);
  if (entries.length === 0) return { entries: [], merged: [], unused: [], markdown };
  const t = tidyGlossary(entries, bookText);
  const out = [...lead, ...t.entries.map((e) => `**${e.term}**: ${e.definition}`)].join('\n\n');
  return { ...t, markdown: out };
}
