import { checkText, type CompiledHouseStyle, type StyleFinding } from '@volume/core';

/**
 * House style auto-fix for AI-written text (config/house-style.json rules no-em-dash and no-en-dash-as-dash, autofix
 * true, and british-spelling). The live acceptance run of 18 October 2026 saved 35 to 62 em dashes per manuscript,
 * all left for the owner to fix by hand. The findings come from @volume/core checkText, so the fix follows exactly
 * what the checks report:
 *
 * - an em dash, or an en dash used as a dash, becomes the configured replacement (", "), or nothing where a comma
 *   would sit next to other punctuation or at the start or end of a line;
 * - an en dash in a number range becomes " to ";
 * - a US spelling becomes the British one, except words whose meaning decides (spellingExceptions: program, check,
 *   practice ...), which the checks keep as information for the owner.
 *
 * Code spans, fenced code, URLs and link targets are never touched. Only AI text goes through here: owner-written text
 * is never changed automatically. With `keep`, paragraphs that already stood in that earlier text (the owner's, for
 * example) are left exactly as they were.
 */

const FIX_RULES = ['emdash', 'endash', 'spelling'] as const;
const H_SPACE = /[ \t\u00a0]/;
const BEFORE_NOTHING = /[,;:.!?([{"'‘“/-]$/;
const AFTER_NOTHING = /^[,;:.!?)\]}"'’”]/;

export interface HouseStyleFix {
  text: string;
  /** Dashes replaced. */
  dashes: number;
  /** US spellings made British. */
  spellings: number;
}

/** Ranges never edited: fenced code, inline code, URLs and markdown link targets. */
function protectedRanges(text: string): [number, number][] {
  const out: [number, number][] = [];
  const add = (re: RegExp) => {
    for (const m of text.matchAll(re)) out.push([m.index, m.index + m[0].length]);
  };
  add(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm);
  add(/`[^`\n]+`/g);
  add(/\bhttps?:\/\/[^\s)>\]]+/g);
  add(/\bwww\.[^\s)>\]]+/g);
  add(/\]\([^)\n]*\)/g);
  add(/<[^>\n]+>/g);
  return out;
}

/** Paragraph ranges whose text (trimmed) already stood in `keep`. */
function keptRanges(text: string, keep: string): [number, number][] {
  const before = new Set(
    keep
      .split(/\n[ \t]*\n/)
      .map((p) => p.trim())
      .filter(Boolean),
  );
  const out: [number, number][] = [];
  const re = /[^\n]+(?:\n(?![ \t]*\n)[^\n]*)*/g;
  for (const m of text.matchAll(re)) if (before.has(m[0].trim())) out.push([m.index, m.index + m[0].length]);
  return out;
}

const inside = (ranges: [number, number][], start: number, end: number) => ranges.some(([a, b]) => start < b && end > a);

function dashReplacement(f: StyleFinding, before: string, after: string, style: CompiledHouseStyle): string {
  if (f.rule === 'endash' && /\d$/.test(before) && /^\d/.test(after)) return style.enDash.replacement;
  // At the start or end of a line (a dialogue dash, a dangling dash) the dash goes with no comma.
  if (before === '' || before.endsWith('\n') || after === '' || after.startsWith('\n')) return '';
  if (BEFORE_NOTHING.test(before)) return ' ';
  if (AFTER_NOTHING.test(after)) return '';
  return style.emDash.replacement;
}

/** Applies the house style auto-fixes to AI-written text. Returns the text unchanged when there is nothing to fix. */
export function fixHouseStyle(text: string, style: CompiledHouseStyle, opts: { keep?: string | null; protect?: readonly string[] } = {}): HouseStyleFix {
  const result: HouseStyleFix = { text, dashes: 0, spellings: 0 };
  if (!text) return result;
  const findings = checkText(text, style, { rules: FIX_RULES }).filter(
    (f) => f.severity === 'error' && (f.rule === 'spelling' ? typeof f.suggestion === 'string' && f.suggestion.length > 0 : true),
  );
  if (findings.length === 0) return result;
  const blocked = [...protectedRanges(text), ...(opts.keep ? keptRanges(text, opts.keep) : [])];
  // Owner-written passages quoted word for word (the profile bio) are never changed.
  for (const p of opts.protect ?? []) {
    if (!p.trim()) continue;
    for (let i = text.indexOf(p); i >= 0; i = text.indexOf(p, i + p.length)) blocked.push([i, i + p.length]);
  }
  let out = text;
  let limit = text.length;
  for (const f of [...findings].sort((a, b) => b.start - a.start)) {
    if (f.end > limit || inside(blocked, f.start, f.end)) continue;
    if (f.rule === 'spelling') {
      out = out.slice(0, f.start) + (f.suggestion ?? f.match) + out.slice(f.end);
      result.spellings += 1;
      limit = f.start;
      continue;
    }
    let start = f.start;
    let end = f.end;
    while (start > 0 && H_SPACE.test(out.charAt(start - 1))) start--;
    while (end < limit && H_SPACE.test(out.charAt(end))) end++;
    const before = out.slice(0, start);
    const after = out.slice(end);
    out = before + dashReplacement(f, before, after, style) + after;
    result.dashes += 1;
    limit = start;
  }
  result.text = out;
  return result;
}

/** The owner's own words a writer may quote (profile bio and short bio): protected from the fix. */
export function ownerTexts(profile: Record<string, unknown>): string[] {
  return [profile['bio'], profile['shortBio']].filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/** An information check saying what the auto-fix changed, or null when it changed nothing. */
export function styleFixCheck(fix: HouseStyleFix): { checker: string; severity: 'info'; message: string; location: Record<string, unknown> } | null {
  if (fix.dashes + fix.spellings === 0) return null;
  const parts = [
    fix.dashes ? `${fix.dashes} dash${fix.dashes === 1 ? '' : 'es'}` : '',
    fix.spellings ? `${fix.spellings} US spelling${fix.spellings === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return {
    checker: 'style_autofix',
    severity: 'info',
    message: `House style fixed automatically: ${parts.join(' and ')}. Read the changed sentences once.`,
    location: { dashes: fix.dashes, spellings: fix.spellings },
  };
}

/** Fixes every string in an AI answer (blurbs, listings, marketing), leaving the keys in `skip` alone. */
export function fixHouseStyleDeep<T>(value: T, style: CompiledHouseStyle, skip: ReadonlySet<string> = new Set()): { value: T; fixes: number } {
  let fixes = 0;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const r = fixHouseStyle(v, style);
      fixes += r.dashes + r.spellings;
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = skip.has(k) ? x : walk(x);
      return out;
    }
    return v;
  };
  return { value: walk(value) as T, fixes };
}
