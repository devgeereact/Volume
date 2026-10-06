// Guardrail post-checks run on every model answer. They never change the text; they report hits so the
// checker gate (packages/core and the server) can block, auto-fix or send a sentence to the claims report.
// Patterns come from config/house-style.json guardrailPatterns, plus three checks that need context:
// ISBNs other than the owner's, URLs that are not research sources or profile links, and [[S<n>]]
// markers that point at no source.

import type { HouseStyle } from './config.ts';
import type { Source } from './types.ts';
import { asObject } from './util.ts';

export type GuardrailSeverity = 'block' | 'claims' | 'autofix' | 'warn';

export interface GuardrailHit {
  rule: string;
  severity: GuardrailSeverity;
  message: string;
  match: string;
  /** Character index inside the string at `path`. */
  index: number;
  /** JSON path of the string ('' for a plain text answer). */
  path: string;
  /** For banned-phrase hits: the listed phrase that matched (match is the text as written). */
  phrase?: string | undefined;
}

export interface StyleRewriteReport {
  /** The banned phrases (as listed in house style or the profile) the first answer used. */
  phrases: string[];
  /** True when the rewrite's answer was kept. False when it failed or broke the structure, so the first answer was kept. */
  applied: boolean;
  /** True when no banned phrase is left in the answer that was kept. */
  cleared: boolean;
  /** Why the rewrite's answer was not kept (empty when it was). */
  note: string;
  /** Scaffolding openers ("Here's the") the rewrite was asked to fix, when a section had more than allowed. */
  openers?: string[] | undefined;
}

/** One rule that hit, so the UI can name it without walking every list. */
export interface GuardrailRuleSummary {
  /** Rule id: a house-style guardrailPatterns id, banned-phrase, url-not-from-sources, unknown-source-marker... */
  rule: string;
  /** The report list its hits are in. */
  list: 'blocking' | 'needsAttention' | 'claims' | 'autofix' | 'warnings';
  count: number;
  /** The rule's message (for banned phrases, a general one; the phrases are in `matches`). */
  message: string;
  /** Distinct matched texts, up to 10. */
  matches: string[];
}

export interface GuardrailReport {
  /** True when nothing blocking and nothing needing attention was found. */
  passed: boolean;
  blocking: GuardrailHit[];
  /**
   * Banned phrases still in the answer after the one automatic style rewrite. The answer is kept and the
   * stage does not fail; the UI shows these as "needs attention" for the owner.
   */
  needsAttention: GuardrailHit[];
  /** The automatic style rewrite, when one ran. */
  styleRewrite?: StyleRewriteReport | undefined;
  /** Statements for the claims-to-verify report (statistics, studies, medical, legal, safety). */
  claims: GuardrailHit[];
  /** Dashes the checker can fix by rule. */
  autofix: GuardrailHit[];
  warnings: GuardrailHit[];
  /** Every rule that hit, one entry per rule and list, in list order. Kept in step by finaliseReport. */
  rules: GuardrailRuleSummary[];
}

export interface GuardrailContext {
  /** Research sources the text may cite. When given, [[S<n>]] markers are checked against them. */
  sources?: Source[] | undefined;
  /** Extra allowed links (profile links, the book's store link). */
  allowedUrls?: string[] | undefined;
  /** ISBNs the owner entered; any other ISBN blocks. */
  allowedIsbns?: string[] | undefined;
  /** Banned phrases to check (house style plus the profile's own). Empty or undefined skips the check. */
  bannedPhrases?: string[] | undefined;
  /** JSON keys whose strings are copied text (quotes, before) and are not checked. */
  skipKeys?: string[] | undefined;
}

interface CompiledPattern {
  id: string;
  re: RegExp;
  message: string;
  severity: GuardrailSeverity;
}

const DEFAULT_SKIP_KEYS = ['quote', 'before', 'sourceMarker', 'evidence', 'basis', 'id', 'hex', 'sourceId', 'sourceIds', 'resourcesFromSources', 'url'];

function severityOf(action: string): GuardrailSeverity {
  if (action === 'block') return 'block';
  if (action === 'claims-report') return 'claims';
  if (action === 'autofix') return 'autofix';
  return 'warn';
}

const compiledCache = new WeakMap<HouseStyle, CompiledPattern[]>();

export function compilePatterns(houseStyle: HouseStyle): CompiledPattern[] {
  const cached = compiledCache.get(houseStyle);
  if (cached) return cached;
  const out: CompiledPattern[] = [];
  for (const p of houseStyle.guardrailPatterns) {
    const flags = new Set((p.flags ?? 'g').split(''));
    flags.add('g');
    out.push({ id: p.id, re: new RegExp(p.pattern, [...flags].join('')), message: p.message, severity: severityOf(p.action) });
  }
  compiledCache.set(houseStyle, out);
  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bannedRegex(phrase: string): RegExp {
  const p = phrase.trim().toLowerCase().replace(/[‘’']/g, "'");
  const body = escapeRe(p).replace(/'/g, "['’]");
  if (!/\s/.test(p) && /^[a-z-]+$/.test(p)) {
    const stem = p.endsWith('e') ? escapeRe(p.slice(0, -1)) : null;
    const alt = stem ? `|${stem}(?:ing|ed)` : '';
    return new RegExp(`\\b(?:${body}(?:s|es|d|ed|ing|ly)?${alt})\\b`, 'gi');
  }
  return new RegExp(`\\b${body}\\b`, 'gi');
}

function normaliseUrl(u: string): string {
  return u
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/.]+$/, '');
}

function hostOf(u: string): string {
  return normaliseUrl(u).split('/')[0] ?? '';
}

function isbnDigits(s: string): string {
  return s.replace(/[^0-9Xx]/g, '').toUpperCase();
}

/** Check one string. */
export function checkText(text: string, houseStyle: HouseStyle, ctx: GuardrailContext = {}, path = ''): GuardrailHit[] {
  const hits: GuardrailHit[] = [];
  const allowedIsbns = new Set((ctx.allowedIsbns ?? []).map(isbnDigits));
  const allowedUrls = [...(ctx.sources ?? []).map((s) => s.url), ...(ctx.allowedUrls ?? [])].map(normaliseUrl);
  const allowedHosts = new Set(allowedUrls.map((u) => u.split('/')[0] ?? ''));

  for (const p of compilePatterns(houseStyle)) {
    p.re.lastIndex = 0;
    for (const m of text.matchAll(p.re)) {
      const match = m[0];
      const index = m.index ?? 0;
      if ((p.id === 'isbn' || p.id === 'isbn-bare') && allowedIsbns.has(isbnDigits(match).slice(-13))) continue;
      if ((p.id === 'isbn' || p.id === 'isbn-bare') && [...allowedIsbns].some((a) => isbnDigits(match).endsWith(a))) continue;
      if (p.id === 'url-in-prose') {
        // The bare-domain pattern matches only the last labels (example.com); take the whole host.
        const lead = /[a-z0-9.-]*$/i.exec(text.slice(0, index))?.[0] ?? '';
        const full = /^https?:\/\/|^www\./i.test(match) ? match : `${lead}${match}`;
        const n = normaliseUrl(full);
        const allowed = allowedUrls.some((a) => n === a || n.startsWith(`${a}/`) || a.startsWith(n)) || allowedHosts.has(hostOf(full));
        if (allowed) continue;
        hits.push({
          rule: 'url-not-from-sources',
          severity: 'block',
          message: `${p.message} This link is not a research source or profile link.`,
          match,
          index,
          path,
        });
        continue;
      }
      hits.push({ rule: p.id, severity: p.severity, message: p.message, match, index, path });
    }
  }

  if (ctx.sources) {
    const ids = new Set(ctx.sources.map((s) => s.id));
    for (const m of text.matchAll(/\[\[\s*(S\d+)\s*\]\]/g)) {
      const id = m[1] ?? '';
      if (!ids.has(id)) {
        hits.push({
          rule: 'unknown-source-marker',
          severity: 'block',
          message: `Source marker ${id} does not match any research source.`,
          match: m[0],
          index: m.index ?? 0,
          path,
        });
      }
    }
  }

  for (const phrase of ctx.bannedPhrases ?? []) {
    if (!phrase.trim()) continue;
    for (const m of text.matchAll(bannedRegex(phrase))) {
      hits.push({ rule: 'banned-phrase', severity: 'block', message: `Banned phrase "${phrase}".`, match: m[0], index: m.index ?? 0, path, phrase });
    }
  }
  return hits;
}

function walkStrings(value: unknown, path: string, skip: ReadonlySet<string>, visit: (s: string, path: string) => void): void {
  if (typeof value === 'string') {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, skip, visit));
    return;
  }
  const o = asObject(value);
  if (!o) return;
  for (const [k, v] of Object.entries(o)) {
    if (skip.has(k)) continue;
    walkStrings(v, path ? `${path}.${k}` : k, skip, visit);
  }
}

/** Run the guardrails over a text answer or every string in a JSON answer. */
export function runGuardrails(output: unknown, houseStyle: HouseStyle, ctx: GuardrailContext = {}): GuardrailReport {
  const skip = new Set([...DEFAULT_SKIP_KEYS, ...(ctx.skipKeys ?? [])]);
  const hits: GuardrailHit[] = [];
  walkStrings(output, '', skip, (s, p) => hits.push(...checkText(s, houseStyle, ctx, p)));
  const report: GuardrailReport = {
    passed: true,
    blocking: hits.filter((h) => h.severity === 'block'),
    needsAttention: [],
    claims: hits.filter((h) => h.severity === 'claims'),
    autofix: hits.filter((h) => h.severity === 'autofix'),
    warnings: hits.filter((h) => h.severity === 'warn'),
    rules: [],
  };
  return finaliseReport(report);
}

export function emptyReport(): GuardrailReport {
  return { passed: true, blocking: [], needsAttention: [], claims: [], autofix: [], warnings: [], rules: [] };
}

const REPORT_LISTS = ['blocking', 'needsAttention', 'claims', 'autofix', 'warnings'] as const;

/** Recompute `passed` and `rules` after the lists were built or moved about. Returns the same report. */
export function finaliseReport(report: GuardrailReport): GuardrailReport {
  const rules: GuardrailRuleSummary[] = [];
  for (const list of REPORT_LISTS) {
    for (const h of report[list]) {
      let entry = rules.find((r) => r.rule === h.rule && r.list === list);
      if (!entry) {
        entry = {
          rule: h.rule,
          list,
          count: 0,
          message: h.rule === 'banned-phrase' ? 'Banned phrase from the house style or the profile.' : h.message,
          matches: [],
        };
        rules.push(entry);
      }
      entry.count += 1;
      const m = h.rule === 'banned-phrase' ? (h.phrase ?? h.match) : h.match;
      if (entry.matches.length < 10 && !entry.matches.includes(m)) entry.matches.push(m);
    }
  }
  report.rules = rules;
  report.passed = report.blocking.length === 0 && report.needsAttention.length === 0;
  return report;
}

/** Code checker hits formatted for the {{patternHits}} input of checks.claims. */
export function formatPatternHits(text: string, houseStyle: HouseStyle, ctx: GuardrailContext = {}): string {
  const hits = checkText(text, houseStyle, { ...ctx, bannedPhrases: [] }).filter((h) => h.severity === 'claims' || h.severity === 'block');
  if (hits.length === 0) return 'None';
  return hits.map((h) => `- ${h.rule}: "${h.match}" at ${h.index} (${h.message})`).join('\n');
}

/**
 * The guardrail report for text as it is saved (an owner edit, a replace, a restore, an accepted suggestion
 * or a fresh AI answer), so the stored report always matches the saved words. Banned phrases go to
 * needsAttention (the owner decides); every other blocking hit stays in blocking.
 */
export function savedTextReport(text: string, houseStyle: HouseStyle, ctx: GuardrailContext = {}): GuardrailReport {
  const report = runGuardrails(text, houseStyle, ctx);
  const banned = report.blocking.filter((h) => h.rule === 'banned-phrase');
  report.blocking = report.blocking.filter((h) => h.rule !== 'banned-phrase');
  report.needsAttention = banned;
  return finaliseReport(report);
}

// ---------- scaffolding openers (house style aiHabits.paragraphOpeners) ----------

export interface OpenerHit {
  /** The opener's label from the house style, for example "Here's the". */
  label: string;
  /** The words as written at the start of the paragraph. */
  match: string;
  /** Index of the paragraph's first character in the text. */
  index: number;
}

export interface OpenerReport {
  hits: OpenerHit[];
  /** Openers allowed per section (aiHabits.paragraphOpeners.maxPerSection, default 2). */
  max: number;
  /** True when the section has more openers than allowed (the core habit check warns on each). */
  excess: boolean;
}

interface CompiledOpeners {
  max: number;
  openers: { label: string; re: RegExp }[];
}
const openerCache = new WeakMap<HouseStyle, CompiledOpeners>();

function compileOpeners(houseStyle: HouseStyle): CompiledOpeners {
  const cached = openerCache.get(houseStyle);
  if (cached) return cached;
  const habits = asObject((houseStyle as Record<string, unknown>)['aiHabits']) ?? {};
  const po = asObject(habits['paragraphOpeners']) ?? {};
  const list = Array.isArray(po['openers']) ? po['openers'] : [];
  const openers: { label: string; re: RegExp }[] = [];
  for (const x of list) {
    const o = asObject(x);
    const src = o && typeof o['regex'] === 'string' ? o['regex'] : null;
    if (!o || !src) continue;
    try {
      const label = typeof o['label'] === 'string' ? o['label'] : typeof o['id'] === 'string' ? o['id'] : src;
      openers.push({ label, re: new RegExp(src, 'iu') });
    } catch {
      // An invalid pattern in the config is skipped, as in packages/core.
    }
  }
  const out = { max: typeof po['maxPerSection'] === 'number' ? po['maxPerSection'] : 2, openers };
  openerCache.set(houseStyle, out);
  return out;
}

/**
 * Paragraphs that open with scaffolding ("Here's the", "Let's", "In this chapter, we will"), matched the same way as
 * the core habit check: each prose line (not a heading, list, table, quote or scene break), after bold or italic marks.
 */
export function scaffoldingOpeners(markdown: string, houseStyle: HouseStyle): OpenerReport {
  const { max, openers } = compileOpeners(houseStyle);
  const hits: OpenerHit[] = [];
  let at = 0;
  for (const line of markdown.split('\n')) {
    const lead = line.length - line.trimStart().length;
    const t = line.slice(lead).trim();
    if (t !== '' && !/^(?:#|:::|[-*+]\s|\d+\.\s|\||>|!\[|\*\*\*$|\* \* \*$)/.test(t)) {
      const marks = /^[*_]*/.exec(t)?.[0].length ?? 0;
      const body = t.slice(marks);
      for (const o of openers) {
        const m = o.re.exec(body);
        if (m && m.index === 0) {
          hits.push({ label: o.label, match: m[0], index: at + lead + marks });
          break;
        }
      }
    }
    at += line.length + 1;
  }
  return { hits, max, excess: hits.length > max };
}

/** The openers as lines for the style rewrite prompt ({{styleRewrite.openers}}), or "None". */
export function describeOpeners(report: OpenerReport): string {
  if (!report.excess) return 'None';
  const byLabel = new Map<string, { forms: Set<string>; count: number }>();
  for (const h of report.hits) {
    const e = byLabel.get(h.label) ?? { forms: new Set<string>(), count: 0 };
    e.forms.add(h.match);
    e.count += 1;
    byLabel.set(h.label, e);
  }
  const lines = [...byLabel].map(
    ([label, e]) => `- "${label}": written as ${[...e.forms].map((f) => `"${f}"`).join(', ')}, ${e.count} ${e.count === 1 ? 'paragraph' : 'paragraphs'}`,
  );
  return `${lines.join('\n')}\n${report.hits.length} paragraphs open with scaffolding; at most ${report.max} may. Rewrite the openings of the others so they start with the point itself.`;
}
