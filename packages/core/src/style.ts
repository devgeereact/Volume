// House-style checker: typed port of .claude/skills/volume-house-style/scripts/check-style.mjs.
// Reads the house-style config object (config/house-style.json) passed in by the caller.

import type { BookDoc, Section } from './model.ts';
import { stripInline } from './inline.ts';
import { countWords, titleCaseProblems } from './text.ts';

export type StyleRule = 'emdash' | 'endash' | 'banned' | 'spelling' | 'phrasing' | 'guardrail' | 'titlecase' | 'wordcount' | 'habit';
export type StyleSeverity = 'error' | 'warn' | 'info';

export interface StyleFinding {
  rule: StyleRule;
  severity: StyleSeverity;
  message: string;
  /** Offset of the match in the checked text (UTF-16 code units). */
  start: number;
  end: number;
  /** 1-based line and column. */
  line: number;
  col: number;
  match: string;
  suggestion?: string;
  /** Guardrail id (for example "percent-of"), banned phrase or habit id (for example "heres-the"). */
  id?: string;
  /** Guardrail action from the config: block, claims-report or autofix. */
  action?: string;
}

interface Matcher {
  phrase: string;
  re: RegExp;
  replacement?: string;
}

export interface CompiledHouseStyle {
  banned: Matcher[];
  spelling: Matcher[];
  phrasing: Matcher[];
  exceptions: Map<string, string>;
  guardrails: { id: string; re: RegExp; message: string; action: string }[];
  emDash: { allowed: boolean; replacement: string };
  enDash: { allowedAsDash: boolean; allowedInNumberRanges: boolean; replacement: string };
  titleCase: { minorWords: string[] } | null;
  /** AI writing habits (config aiHabits). Empty lists when the config has none. */
  habits: CompiledHabits;
}

export interface CompiledHabits {
  openers: { id: string; label: string; re: RegExp }[];
  maxOpenersPerSection: number;
  openerMessage: string;
  disclaimers: { id: string; re: RegExp }[];
  maxDisclaimersPerBook: number;
  disclaimerMessage: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex for a phrase: case-insensitive, word bounded, single words also match the configured inflections. */
export function phraseRegExp(phrase: string, inflections: readonly string[] = [], dropFinalE = false): RegExp {
  const t = phrase.trim();
  let body = escapeRe(t).replace(/\s+/g, '\\s+').replace(/'/g, "['\u2019]");
  if (inflections.length && /^[\p{L}-]+$/u.test(t)) {
    const suf = `(?:${inflections.map(escapeRe).join('|')})`;
    if (dropFinalE && /e$/i.test(t) && t.length > 2) body = `(?:${body}${suf}?|${escapeRe(t.slice(0, -1))}(?:ing|ed))`;
    else body += `${suf}?`;
  }
  const pre = /^[\p{L}\p{N}_]/u.test(t) ? '(?<![\\p{L}\\p{N}_])' : '';
  const post = /[\p{L}\p{N}_]$/u.test(t) ? '(?![\\p{L}\\p{N}_])' : '';
  return new RegExp(pre + body + post, 'giu');
}

/** Compile the house-style config object. Unknown or missing parts fall back to the built-in em dash rule. */
export function compileHouseStyle(config: unknown, extraBanned: readonly string[] = []): CompiledHouseStyle {
  const cfg = isObj(config) ? config : {};
  const matching = isObj(cfg.bannedPhraseMatching) ? cfg.bannedPhraseMatching : {};
  const inflections = Array.isArray(matching.singleWordInflections) ? matching.singleWordInflections.map(String) : ['s', 'es', 'ed', 'ing', 'd'];
  const dropE = typeof matching.dropFinalEBeforeSuffix === 'boolean' ? matching.dropFinalEBeforeSuffix : true;

  const seen = new Set<string>();
  const banned: Matcher[] = [];
  const configured: unknown[] = Array.isArray(cfg.bannedPhrases) ? cfg.bannedPhrases : [];
  const phrases = [...configured, ...extraBanned];
  for (const p of phrases) {
    const phrase = typeof p === 'string' ? p : isObj(p) ? (str(p.phrase) ?? str(p.text)) : undefined;
    if (!phrase || !phrase.trim() || seen.has(phrase.toLowerCase())) continue;
    seen.add(phrase.toLowerCase());
    const m: Matcher = { phrase, re: phraseRegExp(phrase, inflections, dropE) };
    const rep = isObj(p) ? str(p.replacement) : undefined;
    if (rep) m.replacement = rep;
    banned.push(m);
  }

  const mapMatchers = (v: unknown): Matcher[] =>
    isObj(v)
      ? Object.entries(v)
          .filter(([k, val]) => typeof val === 'string' && !k.includes('('))
          .map(([k, val]) => ({ phrase: k, re: phraseRegExp(k), replacement: String(val) }))
      : [];

  const exceptions = new Map<string, string>();
  if (isObj(cfg.spellingExceptions)) for (const [k, v] of Object.entries(cfg.spellingExceptions)) exceptions.set(k.toLowerCase(), String(v));

  const guardrails: CompiledHouseStyle['guardrails'] = [];
  if (Array.isArray(cfg.guardrailPatterns)) {
    for (const g of cfg.guardrailPatterns) {
      if (!isObj(g) || typeof g.pattern !== 'string') continue;
      const id = str(g.id) ?? 'guardrail';
      if (id === 'em-dash' || id === 'en-dash') continue; // reported by the dash rules
      const flags = (str(g.flags) ?? 'gi').replace(/[^gimsuy]/g, '');
      try {
        guardrails.push({
          id,
          re: new RegExp(g.pattern, flags.includes('g') ? flags : `${flags}g`),
          message: str(g.message) ?? id,
          action: str(g.action) ?? 'block',
        });
      } catch {
        // an invalid pattern in the config is skipped, not fatal
      }
    }
  }

  const em = isObj(cfg.emDash) ? cfg.emDash : {};
  const en = isObj(cfg.enDash) ? cfg.enDash : {};
  let titleCase: CompiledHouseStyle['titleCase'] = null;
  if (isObj(cfg.titleCase)) {
    const tc = cfg.titleCase;
    const every = /every/i.test(str(tc.mode) ?? '') || /^off/i.test(str(tc.minorWordsMode) ?? '');
    titleCase = { minorWords: every ? [] : Array.isArray(tc.minorWords) ? tc.minorWords.map(String) : [] };
  }
  return {
    habits: compileHabits(cfg.aiHabits),
    banned,
    spelling: mapMatchers(cfg.usToUkSpelling),
    phrasing: mapMatchers(cfg.ukPhrasing),
    exceptions,
    guardrails,
    emDash: { allowed: em.allowed === true, replacement: str(em.replacement) ?? ', ' },
    enDash: {
      allowedAsDash: en.allowedAsDash === true,
      allowedInNumberRanges: en.allowedInNumberRanges === true,
      replacement: str(en.replacement) ?? ' to ',
    },
    titleCase,
  };
}

function compileHabits(v: unknown): CompiledHabits {
  const h = isObj(v) ? v : {};
  const po = isObj(h.paragraphOpeners) ? h.paragraphOpeners : {};
  const di = isObj(h.illustrativeDisclaimers) ? h.illustrativeDisclaimers : {};
  const regexes = (list: unknown, flags: string): { id: string; label: string; re: RegExp }[] => {
    if (!Array.isArray(list)) return [];
    const out: { id: string; label: string; re: RegExp }[] = [];
    for (const x of list) {
      const src = isObj(x) ? (str(x.regex) ?? str(x.pattern)) : undefined;
      if (!isObj(x) || !src) continue;
      try {
        out.push({ id: str(x.id) ?? src, label: str(x.label) ?? str(x.id) ?? src, re: new RegExp(src, flags) });
      } catch {
        // an invalid pattern in the config is skipped, not fatal
      }
    }
    return out;
  };
  return {
    openers: regexes(po.openers, 'iu'),
    maxOpenersPerSection: typeof po.maxPerSection === 'number' ? po.maxPerSection : 2,
    openerMessage: str(po.message) ?? 'Scaffolding opener "{match}" ({count} in this section, keep it to {max}).',
    disclaimers: regexes(di.markers, 'iu').map(({ id, re }) => ({ id, re })),
    maxDisclaimersPerBook: typeof di.maxPerBook === 'number' ? di.maxPerBook : 2,
    disclaimerMessage: str(di.message) ?? 'Illustrative disclaimer ({count} in the book, keep it to {max}).',
  };
}

const fillMessage = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** Keep the first letter's case of the original when suggesting a replacement. */
export function matchCase(original: string, replacement: string): string {
  if (original === original.toUpperCase() && /\p{L}/u.test(original) && original.length > 1) return replacement.toUpperCase();
  if (/^\p{Lu}/u.test(original)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement;
}

export interface CheckTextOptions {
  /** Rules to run. Default: emdash, endash, banned, spelling, phrasing, guardrail, habit. */
  rules?: readonly StyleRule[];
  /** Honour "house-style: ignore" lines and "house-style:off/on" ranges. Default true. */
  ignoreMarkers?: boolean;
}

const DEFAULT_RULES: StyleRule[] = ['emdash', 'endash', 'banned', 'spelling', 'phrasing', 'guardrail', 'habit'];

function maskIgnored(text: string): string {
  let off = false;
  return text
    .split('\n')
    .map((line) => {
      if (/house-style:\s*off/i.test(line)) {
        off = true;
        return ' '.repeat(line.length);
      }
      if (/house-style:\s*on/i.test(line)) {
        off = false;
        return ' '.repeat(line.length);
      }
      return off || /house-style:\s*ignore/i.test(line) ? ' '.repeat(line.length) : line;
    })
    .join('\n');
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

/** Check one text. Findings carry offsets into `text`, plus line and column. */
export function checkText(text: string, style: CompiledHouseStyle, opts: CheckTextOptions = {}): StyleFinding[] {
  const rules = new Set(opts.rules ?? DEFAULT_RULES);
  const src = opts.ignoreMarkers === false ? text : maskIgnored(text);
  const starts = lineStarts(src);
  const pos = (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - (starts[lo] ?? 0) + 1 };
  };
  const out: StyleFinding[] = [];
  const add = (f: Omit<StyleFinding, 'line' | 'col'>) => out.push({ ...f, ...pos(f.start) });
  const scan = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      if (m[0] === '') {
        re.lastIndex++;
        continue;
      }
      fn(m);
    }
  };

  if (rules.has('emdash') && !style.emDash.allowed) {
    scan(/\u2014/g, (m) =>
      add({
        rule: 'emdash',
        severity: 'error',
        message: 'Em dash. Replace with a comma, colon, full stop or brackets.',
        start: m.index,
        end: m.index + 1,
        match: m[0],
        suggestion: style.emDash.replacement,
      }),
    );
  }
  if (rules.has('endash') && !style.enDash.allowedAsDash) {
    scan(/\u2013/g, (m) => {
      const inRange = /\d\s*$/.test(src.slice(0, m.index)) && /^\s*\d/.test(src.slice(m.index + 1));
      if (inRange && style.enDash.allowedInNumberRanges) return;
      add({
        rule: 'endash',
        severity: 'error',
        message: inRange ? "En dash in a number range. Write 'to'." : 'En dash used as a dash. Use a comma or a full stop.',
        start: m.index,
        end: m.index + 1,
        match: m[0],
        suggestion: inRange ? style.enDash.replacement : ', ',
      });
    });
  }
  if (rules.has('banned')) {
    for (const b of style.banned) {
      scan(b.re, (m) => {
        const f: Omit<StyleFinding, 'line' | 'col'> = {
          rule: 'banned',
          severity: 'error',
          message: `Banned phrase "${m[0]}".`,
          start: m.index,
          end: m.index + m[0].length,
          match: m[0],
          id: b.phrase,
        };
        if (b.replacement) f.suggestion = b.replacement;
        add(f);
      });
    }
  }
  if (rules.has('spelling')) {
    for (const s of style.spelling) {
      scan(s.re, (m) => {
        const exc = style.exceptions.get(s.phrase.toLowerCase());
        const suggestion = matchCase(m[0], s.replacement ?? '');
        add({
          rule: 'spelling',
          severity: exc !== undefined ? 'info' : 'error',
          message:
            exc !== undefined
              ? `US spelling "${m[0]}"; British English is "${suggestion}" (context dependent: ${exc})`
              : `US spelling "${m[0]}"; British English is "${suggestion}".`,
          start: m.index,
          end: m.index + m[0].length,
          match: m[0],
          suggestion,
          id: s.phrase,
        });
      });
    }
  }
  if (rules.has('phrasing')) {
    for (const s of style.phrasing) {
      scan(s.re, (m) =>
        add({
          rule: 'phrasing',
          severity: 'warn',
          message: `US phrasing "${m[0]}"; British English is "${s.replacement ?? ''}".`,
          start: m.index,
          end: m.index + m[0].length,
          match: m[0],
          suggestion: s.replacement ?? '',
          id: s.phrase,
        }),
      );
    }
  }
  if (rules.has('guardrail')) {
    for (const g of style.guardrails) {
      scan(g.re, (m) =>
        add({
          rule: 'guardrail',
          severity: g.action === 'block' ? 'error' : 'warn',
          message: g.message,
          start: m.index,
          end: m.index + m[0].length,
          match: m[0],
          id: g.id,
          action: g.action,
        }),
      );
    }
  }
  if (rules.has('habit')) {
    // The text is one section: each line that is a prose paragraph can open with scaffolding.
    const paras: { start: number; text: string }[] = [];
    let at = 0;
    for (const line of src.split('\n')) {
      const lead = /^\s*/.exec(line)?.[0].length ?? 0;
      if (isProseLine(line.slice(lead))) paras.push({ start: at + lead, text: line.slice(lead) });
      at += line.length + 1;
    }
    for (const { para: _para, ...f } of openerFindings(paras, style.habits)) add(f);
  }
  return out.sort((a, b) => a.start - b.start || a.rule.localeCompare(b.rule));
}

/** A dialect line that is a prose paragraph (not a heading, list, table, quote, fence, image or scene break). */
function isProseLine(line: string): boolean {
  const t = line.trim();
  return t !== '' && !/^(?:#|:::|[-*+]\s|\d+\.\s|\||>|!\[|\*\*\*$)/.test(t);
}

/** Opener warnings for one section's paragraphs (offsets are each paragraph's start in the caller's text). */
function openerFindings(paras: { start: number; text: string }[], habits: CompiledHabits): (Omit<StyleFinding, 'line' | 'col'> & { para: number })[] {
  const hits: { start: number; match: string; id: string; label: string; para: number }[] = [];
  paras.forEach((p, para) => {
    const marks = /^[*_]*/.exec(p.text)?.[0].length ?? 0;
    const body = p.text.slice(marks);
    for (const o of habits.openers) {
      const m = o.re.exec(body);
      if (m && m.index === 0) {
        hits.push({ start: p.start + marks, match: m[0], id: o.id, label: o.label, para });
        break;
      }
    }
  });
  if (hits.length <= habits.maxOpenersPerSection) return [];
  return hits.map((h) => ({
    rule: 'habit',
    severity: 'warn',
    message: fillMessage(habits.openerMessage, { match: h.match, label: h.label, count: hits.length, max: habits.maxOpenersPerSection }),
    start: h.start,
    end: h.start + h.match.length,
    match: h.match,
    id: h.id,
    para: h.para,
  }));
}

/** Text to check for disclaimers: one entry per paragraph-like unit. */
export interface HabitUnit {
  sectionId: string;
  /** Section body (the dialect) or one block's text. */
  text: string;
  /** Block index when `text` is one block. */
  blockIndex?: number;
}

export interface DisclaimerFinding extends StyleFinding {
  sectionId: string;
  blockIndex?: number;
}

/**
 * "This is illustrative" style disclaimers across a whole book (config aiHabits.illustrativeDisclaimers).
 * Counts each paragraph with a marker once; above the limit every one gets a warning. Pass one unit
 * per section body (offsets are into that body) or one per block. Skip the copyright page yourself.
 */
export function checkDisclaimers(units: readonly HabitUnit[], style: CompiledHouseStyle): DisclaimerFinding[] {
  const habits = style.habits;
  if (!habits.disclaimers.length) return [];
  const hits: Omit<DisclaimerFinding, 'message'>[] = [];
  for (const u of units) {
    const src = maskIgnored(u.text);
    const starts = lineStarts(src);
    src.split('\n').forEach((line, i) => {
      if (!line.trim() || /^\s*(?:#|:::)/.test(line)) return;
      let best: { index: number; match: string; id: string } | null = null;
      for (const d of habits.disclaimers) {
        const m = d.re.exec(line);
        if (m && (!best || m.index < best.index)) best = { index: m.index, match: m[0], id: d.id };
      }
      if (!best) return;
      const start = (starts[i] ?? 0) + best.index;
      const hit: Omit<DisclaimerFinding, 'message'> = {
        rule: 'habit',
        severity: 'warn',
        start,
        end: start + best.match.length,
        line: i + 1,
        col: best.index + 1,
        match: best.match,
        id: best.id,
        sectionId: u.sectionId,
      };
      if (u.blockIndex !== undefined) hit.blockIndex = u.blockIndex;
      hits.push(hit);
    });
  }
  if (hits.length <= habits.maxDisclaimersPerBook) return [];
  const message = fillMessage(habits.disclaimerMessage, { count: hits.length, max: habits.maxDisclaimersPerBook });
  return hits.map((h) => ({ ...h, message }));
}

/** Replace em and en dashes with the configured replacements (en dash between numbers becomes " to "). */
export function fixDashes(text: string, style: CompiledHouseStyle): string {
  let t = text.replace(/(\d)\s*\u2013\s*(\d)/g, (_m, a: string, b: string) => `${a}${style.enDash.replacement}${b}`);
  t = t.replace(/\s*[\u2014\u2013]\s*/g, style.emDash.replacement);
  return t;
}

/** Title case check for one heading. Returns null when fine. */
export function checkHeadingCase(heading: string, style: CompiledHouseStyle): string | null {
  if (!style.titleCase) return null;
  const bad = titleCaseProblems(heading, { minorWords: style.titleCase.minorWords });
  return bad.length ? `Heading not in title case (check: ${bad.slice(0, 4).join(', ')}).` : null;
}

// ---------- whole book ----------

export interface BookStyleFinding extends StyleFinding {
  sectionId: string;
  /** Index of the block in the section, -1 for the heading. */
  blockIndex: number;
}

/** Text of every block of a section, one string per block (inline markers removed). */
export function blockTexts(s: Section): string[] {
  return s.blocks.map((b) => {
    switch (b.type) {
      case 'paragraph':
      case 'heading2':
      case 'heading3':
        return stripInline(b.text);
      case 'list':
      case 'takeaways':
        return b.items.map(stripInline).join('\n');
      case 'table':
        return b.rows.map((r) => r.map(stripInline).join(' | ')).join('\n');
      case 'quote':
        return [...b.lines, b.attribution ?? ''].join('\n');
      case 'callout':
        return stripInline(b.text);
      case 'image':
        return b.caption ?? '';
      default:
        return '';
    }
  });
}

export interface CheckBookOptions extends CheckTextOptions {
  /** Check chapter titles, part titles and subheadings for title case. Default true. */
  titleCase?: boolean;
  /** Skip callouts of these variants (P02 demo notes). Default ["demo"]. */
  skipCalloutVariants?: string[];
}

const FENCED_FRONT = new Set(['titlepage', 'copyright', 'contents', 'halftitle']);

export function checkBookStyle(book: BookDoc, style: CompiledHouseStyle, opts: CheckBookOptions = {}): BookStyleFinding[] {
  const out: BookStyleFinding[] = [];
  const skip = new Set(opts.skipCalloutVariants ?? ['demo']);
  const wanted = new Set(opts.rules ?? DEFAULT_RULES);
  // Habits are counted per section and per book below, not per block.
  const perBlock: CheckTextOptions = { ...opts, rules: [...wanted].filter((r) => r !== 'habit') };
  const disclaimerUnits: HabitUnit[] = [];
  for (const s of book.sections) {
    if (s.enabled === false) continue;
    const headText = s.kicker ? `${s.kicker}: ${s.title}` : s.title;
    for (const f of checkText(headText, style, perBlock)) out.push({ ...f, sectionId: s.id, blockIndex: -1 });
    if (opts.titleCase !== false && (s.kind === 'chapter' || s.kind === 'part')) {
      const msg = checkHeadingCase(s.title, style);
      if (msg)
        out.push({
          rule: 'titlecase',
          severity: 'warn',
          message: msg,
          start: 0,
          end: s.title.length,
          line: 1,
          col: 1,
          match: s.title,
          suggestion: '',
          sectionId: s.id,
          blockIndex: -1,
        });
    }
    const texts = blockTexts(s);
    if (wanted.has('habit')) {
      const paras = s.blocks.flatMap((b, k) => (b.type === 'paragraph' ? [{ start: 0, text: texts[k] ?? '', k }] : []));
      for (const { para, ...f } of openerFindings(paras, style.habits)) {
        out.push({ ...f, line: 1, col: f.start + 1, sectionId: s.id, blockIndex: paras[para]?.k ?? -1 });
      }
      if (!FENCED_FRONT.has(s.subtype))
        s.blocks.forEach((b, k) => {
          if (b.type === 'paragraph' || b.type === 'list' || b.type === 'quote' || b.type === 'callout')
            disclaimerUnits.push({ sectionId: s.id, blockIndex: k, text: texts[k] ?? '' });
        });
    }
    s.blocks.forEach((b, k) => {
      if (b.type === 'callout' && skip.has(b.variant)) return;
      const t = texts[k] ?? '';
      if (!t) return;
      for (const f of checkText(t, style, perBlock)) out.push({ ...f, sectionId: s.id, blockIndex: k });
      if (opts.titleCase !== false && (b.type === 'heading2' || b.type === 'heading3')) {
        const msg = checkHeadingCase(t, style);
        if (msg)
          out.push({ rule: 'titlecase', severity: 'warn', message: msg, start: 0, end: t.length, line: 1, col: 1, match: t, sectionId: s.id, blockIndex: k });
      }
    });
  }
  for (const f of checkDisclaimers(disclaimerUnits, style)) out.push({ ...f, blockIndex: f.blockIndex ?? -1 });
  return out;
}

// ---------- word counts against the template ----------

export interface WordRange {
  min?: number;
  max?: number;
  default?: number;
}
/** The parts of a book template (config/book-templates/*.json) the word count check reads. */
export interface WordTargetsTemplate {
  wordTargets?: Record<string, unknown> & { tolerance?: number; total?: WordRange };
  chapterRules?: { wordTarget?: WordRange };
}

export interface WordCountItem {
  sectionId: string;
  title: string;
  words: number;
  target?: number;
  low?: number;
  high?: number;
  status: 'ok' | 'under' | 'over' | 'no-target';
}

/** Words in a section body (headings excluded, subheadings and list items included). */
export function sectionWordCount(s: Section, opts: { skipCalloutVariants?: string[] } = {}): number {
  const skip = new Set(opts.skipCalloutVariants ?? ['demo']);
  return blockTexts(s).reduce((n, t, k) => {
    const b = s.blocks[k];
    if (b && b.type === 'callout' && skip.has(b.variant)) return n;
    return n + countWords(t);
  }, 0);
}

const SUBTYPE_TARGET_KEYS: Record<string, string> = { about_the_author: 'aboutTheAuthor', review_request: 'reviewRequest' };

/** Compare each section's words with the template target, using the template tolerance (0.15 in Volume's templates). */
export function wordCountReport(
  book: BookDoc,
  template: WordTargetsTemplate,
  overrides: Record<string, number> = {},
): { items: WordCountItem[]; total: WordCountItem } {
  const tol = typeof template.wordTargets?.tolerance === 'number' ? template.wordTargets.tolerance : 0;
  const rangeFor = (s: Section): WordRange | undefined => {
    if (s.kind === 'chapter') return template.chapterRules?.wordTarget;
    const key = SUBTYPE_TARGET_KEYS[s.subtype] ?? s.subtype;
    const r = template.wordTargets?.[key];
    return isObj(r) ? r : undefined;
  };
  const judge = (words: number, target: number | undefined): Pick<WordCountItem, 'status' | 'low' | 'high' | 'target'> => {
    if (target === undefined) return { status: 'no-target' };
    const low = Math.round(target * (1 - tol));
    const high = Math.round(target * (1 + tol));
    return { target, low, high, status: words < low ? 'under' : words > high ? 'over' : 'ok' };
  };
  const items: WordCountItem[] = [];
  let totalWords = 0;
  for (const s of book.sections) {
    if (s.enabled === false || ['titlepage', 'copyright', 'contents', 'halftitle'].includes(s.subtype)) continue;
    const words = sectionWordCount(s);
    totalWords += words;
    const target = overrides[s.id] ?? rangeFor(s)?.default;
    items.push({ sectionId: s.id, title: s.title, words, ...judge(words, target) });
  }
  const totalTarget = overrides.total ?? template.wordTargets?.total?.default;
  return { items, total: { sectionId: 'total', title: 'Total', words: totalWords, ...judge(totalWords, totalTarget) } };
}
