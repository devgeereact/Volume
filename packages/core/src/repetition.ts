// Book-level repetition checker: repeated sentences, definitions, advice and phrases across sections.
// Deterministic and model-free. Works on raw section bodies in the manuscript dialect (the server's
// bodyMd) or on a parsed BookDoc, and returns offsets the editor can turn into suggestions.

import type { BookDoc } from './model.ts';
import { enabledSections, sectionHeading } from './model.ts';
import { blockTexts } from './style.ts';

/** One piece of text to compare: a whole section body, or one block of a section. */
export interface RepetitionUnit {
  sectionId: string;
  /** Section body in the dialect, or one block's text. Offsets in findings point into this string. */
  text: string;
  /** Set when `text` is one block of the section (findBookRepetitions sets it). */
  blockIndex?: number;
  /** Display name for messages, for example "Chapter 2: Test It Before You Build It". Default: sectionId. */
  title?: string;
}

/** profile: a sentence that restates the profile bio in a later section (one use in the body is allowed). */
export type RepetitionKind = 'sentence' | 'definition' | 'advice' | 'phrase' | 'profile';

export interface RepetitionOccurrence {
  sectionId: string;
  blockIndex?: number;
  /** Offsets into the unit's text (UTF-16 code units). */
  start: number;
  end: number;
  /** The repeated text as written (the sentence, the gloss or the phrase). */
  text: string;
}

export interface RepetitionFinding {
  /** Stable id, for example "definition:chat assistant". */
  id: string;
  kind: RepetitionKind;
  severity: 'warn' | 'info';
  /** What repeats: the defined term, the shared phrase or a short form of the sentence. */
  key: string;
  message: string;
  suggestion: string;
  /** Highest pairwise similarity in the group (1 for definitions and exact phrases). */
  similarity: number;
  /** In reading order. The first is the one to keep; the rest are candidates to cut or reword. */
  occurrences: RepetitionOccurrence[];
}

export interface RepetitionOptions {
  /** Sentences with fewer distinct content words are not compared. Default 4. */
  minContentWords?: number;
  /** Weighted overlap at or above which two sentences count as the same sentence. Default 0.6. */
  sentenceThreshold?: number;
  /** Lower overlap at which two advice sentences (imperatives, "you should") count as the same advice. Default 0.45. */
  adviceThreshold?: number;
  /** Shortest repeated phrase, in words (at least three of them content words). Default 5. */
  minPhraseWords?: number;
  /** Look for repeated phrases. Default true. */
  phrases?: boolean;
}

// ---------- text units ----------

interface Word {
  norm: string;
  stem: string;
  stop: boolean;
  start: number;
  end: number;
}

interface Sentence {
  idx: number;
  unit: number;
  sectionId: string;
  start: number;
  end: number;
  text: string;
  words: Word[];
  content: Set<string>;
  advice: boolean;
}

const STOP = new Set(
  (
    "a about above after again against all also am an and any are as at away back be because been before being below between both but by can can't cannot could " +
    "couldn't did didn't do does doesn't doing don't down during each even ever every few for from further get gets got had hadn't has hasn't have " +
    "haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself " +
    "just let let's like me might more most much must mustn't my myself no nor not now of off on once one only or other ought our ours ourselves out " +
    "over own quite rather really same she she'd she'll she's should shouldn't so some still such than that that's the their theirs them themselves " +
    "then there there's these they they'd they'll they're they've this those though through to too under until up upon us very was wasn't we we'd " +
    "we'll we're we've were weren't what what's when when's where where's whether which while who who's whom why why's will with without won't would " +
    "wouldn't yet you you'd you'll you're you've your yours yourself yourselves s t ll ve re d"
  ).split(' '),
);

/** Verbs that open a clause of advice ("Check your contract", "then ask"). Never used as anchors. */
const ADVICE_VERBS =
  'check read ask look write keep set protect test try use avoid stop start price pick choose send take talk tell remember give note plan budget delete store find go make'.split(
    ' ',
  );
/** Words that start a clause of advice: imperatives and "you should" forms. */
const ADVICE_RE = new RegExp(
  String.raw`(?:^|[,;:(]\s*|\b(?:then|and|so|but|first|always|never|just)\s+)(?:${ADVICE_VERBS.filter((v) => v !== 'go' && v !== 'make').join('|')}|don['’]t|do not|never|always|be (?:wary|clear|careful|honest)|make sure|go back)\b|\byou (?:should|must|need to|ought to|have to)\b|\bmake sure\b|\bbefore you\b|\bis worth (?:a|checking|reading)\b`,
  'iu',
);
const ANCHOR_SKIP = new Set(ADVICE_VERBS.map(stem));

function stem(w: string): string {
  let s = w.replace(/['’]s$/, '');
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ied')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss') && !s.endsWith('us')) s = s.slice(0, -1);
  return s;
}

function wordsOf(text: string, offset: number): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu)) {
    const norm = m[0].toLowerCase().replace(/’/g, "'");
    const start = offset + (m.index ?? 0);
    out.push({ norm, stem: stem(norm), stop: STOP.has(norm) || /^\d+$/.test(norm), start, end: start + m[0].length });
  }
  return out;
}

/** A dialect line that holds prose: skip headings, fences, tables, images and scene breaks. */
function proseStart(line: string): number | null {
  const lead = line.length - line.trimStart().length;
  const t = line.slice(lead);
  if (!t.trim() || /^(?:#|:::|\||!\[|\*\*\*\s*$)/.test(t)) return null;
  const marker = /^(?:[-*+]\s+|\d+\.\s+|>\s?)/.exec(t);
  return lead + (marker ? marker[0].length : 0);
}

/** Split a unit's text into sentences with offsets. A full stop inside a word (GOV.UK) does not end a sentence. */
function splitSentences(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let at = 0;
  for (const line of text.split('\n')) {
    const from = proseStart(line);
    if (from !== null) {
      let s = from;
      const re = /[.!?]+["'”’)\]]*(?=\s|$)/g;
      re.lastIndex = from;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const end = m.index + m[0].length;
        const next = /\S/.exec(line.slice(end));
        if (next && /\p{Ll}/u.test(next[0])) continue; // "e.g. this": not a boundary
        push(s, end);
        s = end;
      }
      push(s, line.length);
    }
    at += line.length + 1;

    function push(a: number, b: number) {
      const seg = line.slice(a, b);
      const lead = seg.length - seg.trimStart().length;
      const trail = seg.length - seg.trimEnd().length;
      if (b - trail > a + lead) out.push({ start: at + a + lead, end: at + b - trail });
    }
  }
  return out;
}

function sentencesOf(units: readonly RepetitionUnit[]): Sentence[] {
  const out: Sentence[] = [];
  units.forEach((u, unit) => {
    for (const r of splitSentences(u.text)) {
      const text = u.text.slice(r.start, r.end);
      const words = wordsOf(text, r.start);
      out.push({
        idx: out.length,
        unit,
        sectionId: u.sectionId,
        start: r.start,
        end: r.end,
        text,
        words,
        content: new Set(words.filter((w) => !w.stop && w.norm.length > 1).map((w) => w.stem)),
        advice: ADVICE_RE.test(text.replace(/^[(*_\s]+/, '')),
      });
    }
  });
  return out;
}

// ---------- the checks ----------

const short = (t: string, n = 70) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s;
};

function occurrence(units: readonly RepetitionUnit[], unit: number, start: number, end: number): RepetitionOccurrence {
  const u = units[unit];
  const o: RepetitionOccurrence = { sectionId: u?.sectionId ?? '', start, end, text: (u?.text ?? '').slice(start, end) };
  if (u?.blockIndex !== undefined) o.blockIndex = u.blockIndex;
  return o;
}

function where(units: readonly RepetitionUnit[], occ: RepetitionOccurrence[]): string {
  const names: string[] = [];
  for (const o of occ) {
    const name = units.find((u) => u.sectionId === o.sectionId)?.title ?? o.sectionId;
    if (!names.includes(name)) names.push(name);
  }
  return names.join(', ');
}

/** Repeated sentences and repeated advice: weighted word overlap between sentences in different sections. */
function sentenceGroups(units: readonly RepetitionUnit[], sents: Sentence[], opts: Required<RepetitionOptions>): RepetitionFinding[] {
  const eligible = sents.filter((s) => s.content.size >= opts.minContentWords);
  const df = new Map<string, number>();
  for (const s of eligible) for (const w of s.content) df.set(w, (df.get(w) ?? 0) + 1);
  const n = Math.max(eligible.length, 2);
  const idf = (w: string) => Math.log((n + 1) / ((df.get(w) ?? 0) + 0.5));
  const mass = new Map<number, number>();
  for (const s of eligible)
    mass.set(
      s.idx,
      [...s.content].reduce((a, w) => a + idf(w) ** 2, 0),
    );
  const cap = Math.max(6, Math.ceil(n * 0.03));
  const rare = (w: string) => (df.get(w) ?? 0) <= cap;
  /** Cosine of idf-weighted word sets, 0 when the pair shares too little to judge. */
  const simCache = new Map<string, number>();
  const sim = (a: Sentence, b: Sentence): number => {
    const key = a.idx < b.idx ? `${a.idx}:${b.idx}` : `${b.idx}:${a.idx}`;
    const hit = simCache.get(key);
    if (hit !== undefined) return hit;
    const shared = [...a.content].filter((w) => b.content.has(w));
    const v =
      shared.length < 3 && shared.filter(rare).length < 2
        ? 0
        : shared.reduce((x, w) => x + idf(w) ** 2, 0) / Math.sqrt((mass.get(a.idx) ?? 1) * (mass.get(b.idx) ?? 1));
    simCache.set(key, v);
    return v;
  };
  const linkAt = (a: Sentence, b: Sentence) => (a.advice && b.advice ? opts.adviceThreshold : opts.sentenceThreshold);

  // Candidate pairs share at least one uncommon word (common words alone never make a repeat).
  const index = new Map<string, number[]>();
  for (const s of eligible) for (const w of s.content) if (rare(w)) index.set(w, [...(index.get(w) ?? []), s.idx]);
  const edges: { a: Sentence; b: Sentence; v: number }[] = [];
  const seen = new Set<string>();
  for (const list of index.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const a = sents[list[i] ?? 0];
        const b = sents[list[j] ?? 0];
        if (!a || !b || a.sectionId === b.sectionId || seen.has(`${a.idx}:${b.idx}`)) continue;
        seen.add(`${a.idx}:${b.idx}`);
        const v = sim(a, b);
        if (v >= linkAt(a, b)) edges.push({ a, b, v });
      }

  // Average linkage: two groups merge only when their members are, on average, still alike.
  const groupOf = new Map<number, Sentence[]>();
  const get = (s: Sentence) => groupOf.get(s.idx) ?? [s];
  edges.sort((x, y) => y.v - x.v);
  for (const e of edges) {
    const ga = get(e.a);
    const gb = get(e.b);
    if (ga === gb || ga.includes(e.b)) continue;
    let total = 0;
    let pairs = 0;
    let need = 0;
    for (const x of ga)
      for (const y of gb) {
        if (x.sectionId === y.sectionId) continue;
        total += sim(x, y);
        need += linkAt(x, y);
        pairs++;
      }
    if (pairs && total / pairs < (0.8 * need) / pairs) continue;
    const merged = [...ga, ...gb];
    for (const m of merged) groupOf.set(m.idx, merged);
  }

  const out: RepetitionFinding[] = [];
  for (const group of new Set(groupOf.values())) {
    if (new Set(group.map((s) => s.sectionId)).size < 2) continue;
    const members = [...group].sort((a, b) => a.idx - b.idx);
    let best = 0;
    for (const x of members) for (const y of members) if (x.idx < y.idx && x.sectionId !== y.sectionId) best = Math.max(best, sim(x, y));
    const kind: RepetitionKind = best < 0.8 && members.filter((s) => s.advice).length * 2 >= members.length ? 'advice' : 'sentence';
    out.push(groupFinding(units, kind, members, best));
  }
  const anchored = anchorGroups(units, eligible, df, out, sim);
  // A sentence group that sits wholly inside an anchor group is the same repeat, reported once.
  const inside = (f: RepetitionFinding) =>
    anchored.some((a) => f.occurrences.every((o) => a.occurrences.some((x) => x.sectionId === o.sectionId && x.start === o.start && x.end === o.end)));
  return [...out.filter((f) => !inside(f)), ...anchored];
}

/**
 * Advice repeated in other words: an uncommon word (such as "contract") that keeps coming back in
 * advice sentences across three or more sections, mostly as advice.
 */
function anchorGroups(
  units: readonly RepetitionUnit[],
  sents: Sentence[],
  df: Map<string, number>,
  already: RepetitionFinding[],
  sim: (a: Sentence, b: Sentence) => number,
): RepetitionFinding[] {
  const inFinding = (f: RepetitionFinding, m: Sentence) => f.occurrences.some((o) => o.sectionId === m.sectionId && o.start === m.start && o.end === m.end);
  const candidates: { w: string; members: Sentence[]; extra: number }[] = [];
  for (const [w, n] of df) {
    if (n < 3 || n > 6 || w.length < 4 || ANCHOR_SKIP.has(w)) continue;
    const members = sents.filter((s) => s.content.has(w));
    if (new Set(members.map((s) => s.sectionId)).size < 3) continue;
    const advice = members.filter((s) => s.advice);
    if (advice.length * 2 < members.length || new Set(advice.map((s) => s.sectionId)).size < 2) continue;
    // The sentences must say more than the one word in common: on average one more shared word per pair.
    let shared = 0;
    let pairs = 0;
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        if (!a || !b || a.sectionId === b.sectionId) continue;
        shared += [...a.content].filter((x) => x !== w && b.content.has(x)).length;
        pairs++;
      }
    const extra = pairs ? shared / pairs : 0;
    if (extra < 1) continue;
    // Nothing new when one sentence group already holds every one of these sentences.
    if (already.some((f) => members.every((m) => inFinding(f, m)))) continue;
    candidates.push({ w, members, extra });
  }
  // Bigger groups first; a group mostly inside one already chosen is the same advice.
  candidates.sort((x, y) => y.members.length - x.members.length || y.extra - x.extra || x.w.localeCompare(y.w));
  const chosen: Sentence[][] = [];
  const out: RepetitionFinding[] = [];
  for (const c of candidates) {
    if (chosen.some((g) => c.members.filter((m) => g.includes(m)).length * 2 >= c.members.length)) continue;
    chosen.push(c.members);
    let best = 0;
    for (const x of c.members) for (const y of c.members) if (x.idx < y.idx && x.sectionId !== y.sectionId) best = Math.max(best, sim(x, y));
    out.push(groupFinding(units, 'advice', c.members, best, c.w));
  }
  return out;
}

function groupFinding(units: readonly RepetitionUnit[], kind: RepetitionKind, members: Sentence[], best: number, anchor?: string): RepetitionFinding {
  const occ = members.map((s) => occurrence(units, s.unit, s.start, s.end));
  const first = members[0]?.text ?? '';
  const about = anchor ? ` about "${anchor}"` : '';
  return {
    id: `${kind}:${anchor ?? members[0]?.idx ?? 0}`,
    kind,
    severity: 'warn',
    key: anchor ?? short(first, 50),
    message:
      kind === 'advice'
        ? `The same advice${about} is given ${members.length} times (${where(units, occ)}): "${short(first)}". Give it once, where it matters most.`
        : `A near-identical sentence appears ${members.length} times (${where(units, occ)}): "${short(first)}".`,
    suggestion: 'Keep the first and cut or reword the others.',
    similarity: Math.round(best * 100) / 100,
    occurrences: occ,
  };
}

const META_TERMS = new Set(
  'first second third last next point idea trick trap answer question problem result goal aim rule catch truth difference reason thing way key best worst plan good news bad news short version honest version whole idea'.split(
    ' ',
  ),
);

/** Normalised defined term: last two non-stop words, lower case, light stem on the last word. */
function termKey(raw: string): string | null {
  const ws = raw
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean);
  while (ws.length && STOP.has(ws[0] ?? '')) ws.shift();
  if (!ws.length || ws.some((w) => STOP.has(w))) return null;
  const last2 = ws.slice(-2);
  const key = [...last2.slice(0, -1), stem(last2[last2.length - 1] ?? '')].join(' ');
  if (META_TERMS.has(key) || META_TERMS.has(ws.join(' ')) || key.length < 3) return null;
  return key;
}

const TERM = String.raw`((?:[\p{L}][\p{L}\-]*\s+){0,2}[\p{L}][\p{L}\-]*)`;
const DEF_PATTERNS: { re: RegExp; span: 'sentence' | 'match' }[] = [
  // "A chat assistant is a program you type to." / "A free plan is the no-cost version of a tool."
  {
    re: new RegExp(
      String.raw`^[(\s*_]*(?:an?|the)\s+${TERM}\s+(?:is|are|means)\s+(?:simply\s+|just\s+|basically\s+)?(?:an?|the|any|what|when|where|how|someone|something)\b`,
      'iu',
    ),
    span: 'sentence',
  },
  // "a chat assistant (the program you type to, and it writes back)"
  { re: new RegExp(String.raw`${TERM}\s+\((?:the|an?|which is|meaning|that is|i\.e\.,?)\s+[^)]{4,}\)`, 'iu'), span: 'match' },
  // "A prompt, which is simply the message you type, ..."
  { re: new RegExp(String.raw`${TERM},\s+which (?:is|are|means)\s+(?:simply\s+|just\s+)?(?:an?|the)\s+`, 'iu'), span: 'sentence' },
  // "a message, called a prompt, such as ..."
  {
    re: new RegExp(String.raw`,\s+(?:called|known as)\s+(?:an?\s+|the\s+)?((?:[\p{L}][\p{L}\-]*)(?:\s+[\p{L}][\p{L}\-]*)?)\s*[,.;:)]`, 'iu'),
    span: 'sentence',
  },
];

/** The same term defined in more than one section. */
function definitionGroups(units: readonly RepetitionUnit[], sents: Sentence[]): RepetitionFinding[] {
  const byTerm = new Map<string, { s: Sentence; start: number; end: number; term: string }[]>();
  for (const s of sents) {
    for (const p of DEF_PATTERNS) {
      const m = p.re.exec(s.text);
      const raw = m?.[1];
      if (!m || !raw) continue;
      // For a gloss the term is the last few words before the bracket.
      const key = termKey(raw);
      if (!key) continue;
      const start = p.span === 'match' ? s.start + m.index + m[0].indexOf('(') : s.start;
      const end = p.span === 'match' ? s.start + m.index + m[0].length : s.end;
      const list = byTerm.get(key) ?? [];
      if (!list.some((x) => x.s.idx === s.idx)) list.push({ s, start, end, term: raw.trim() });
      byTerm.set(key, list);
      break;
    }
  }
  const out: RepetitionFinding[] = [];
  for (const [key, list] of byTerm) {
    if (new Set(list.map((x) => x.s.sectionId)).size < 2) continue;
    list.sort((a, b) => a.s.idx - b.s.idx);
    const occ = list.map((x) => occurrence(units, x.s.unit, x.start, x.end));
    out.push({
      id: `definition:${key}`,
      kind: 'definition',
      severity: 'warn',
      key,
      message: `"${key}" is defined ${list.length} times (${where(units, occ)}). Define it once, at first use.`,
      suggestion: 'Keep the first definition and cut the later ones.',
      similarity: 1,
      occurrences: occ,
    });
  }
  return out;
}

/** The same run of words (a verbal tic such as "before you take a penny") in more than one section. */
function phraseGroups(units: readonly RepetitionUnit[], sents: Sentence[], minWords: number): RepetitionFinding[] {
  const index = new Map<string, { s: number; w: number }[]>();
  for (const s of sents) {
    for (let w = 0; w + minWords <= s.words.length; w++) {
      const gram = s.words.slice(w, w + minWords);
      if (gram.filter((x) => !x.stop).length < 2) continue;
      const k = gram.map((x) => x.norm).join(' ');
      index.set(k, [...(index.get(k) ?? []), { s: s.idx, w }]);
    }
  }
  // Pairs of sentences in different sections that share a gram, extended to the longest shared run.
  const runs = new Map<string, { s: number; start: number; end: number }[]>();
  const done = new Set<string>();
  for (const hits of index.values()) {
    if (hits.length < 2) continue;
    for (let i = 0; i < hits.length; i++)
      for (let j = i + 1; j < hits.length; j++) {
        const hi = hits[i];
        const hj = hits[j];
        const a = hi ? sents[hi.s] : undefined;
        const b = hj ? sents[hj.s] : undefined;
        if (!hi || !hj || !a || !b || a.sectionId === b.sectionId) continue;
        let x = hi.w;
        let y = hj.w;
        while (x > 0 && y > 0 && a.words[x - 1]?.norm === b.words[y - 1]?.norm) {
          x--;
          y--;
        }
        const tag = `${a.idx}:${x}:${b.idx}:${y}`;
        if (done.has(tag)) continue;
        done.add(tag);
        let len = 0;
        while (a.words[x + len] && a.words[x + len]?.norm === b.words[y + len]?.norm) len++;
        // Short runs of mostly small words ("the top of the pot") are ordinary English, not a tic.
        if (a.words.slice(x, x + len).filter((w) => !w.stop).length < 3) continue;
        const phrase = a.words
          .slice(x, x + len)
          .map((w) => w.norm)
          .join(' ');
        const list = runs.get(phrase) ?? [];
        for (const [s, w] of [
          [a, x],
          [b, y],
        ] as const) {
          const start = s.words[w]?.start ?? s.start;
          const end = s.words[w + len - 1]?.end ?? s.end;
          if (!list.some((r) => r.s === s.idx && r.start === start)) list.push({ s: s.idx, start, end });
        }
        runs.set(phrase, list);
      }
  }
  // Drop phrases that sit inside a longer repeated phrase at the same places.
  const phrases = [...runs.keys()].sort((p, q) => q.length - p.length);
  const out: RepetitionFinding[] = [];
  const covered: { s: number; start: number; end: number }[] = [];
  for (const phrase of phrases) {
    const list = (runs.get(phrase) ?? []).filter((r) => !covered.some((c) => c.s === r.s && c.start <= r.start && c.end >= r.end));
    if (new Set(list.map((r) => sents[r.s]?.sectionId)).size < 2) continue;
    covered.push(...list);
    list.sort((p, q) => p.s - q.s || p.start - q.start);
    const occ = list.map((r) => occurrence(units, sents[r.s]?.unit ?? 0, r.start, r.end));
    out.push({
      id: `phrase:${phrase}`,
      kind: 'phrase',
      severity: 'info',
      key: phrase,
      message: `The phrase "${occ[0]?.text ?? phrase}" is used ${occ.length} times (${where(units, occ)}).`,
      suggestion: 'Keep it once; say it differently or cut it elsewhere.',
      similarity: 1,
      occurrences: occ,
    });
  }
  return out;
}

const DEFAULTS: Required<RepetitionOptions> = { minContentWords: 4, sentenceThreshold: 0.6, adviceThreshold: 0.45, minPhraseWords: 5, phrases: true };

/**
 * Find repeated sentences, definitions, advice and phrases across sections. Only repeats that span
 * at least two sections are reported. Pass one unit per section body (offsets are into the body)
 * or one per block. Findings come in reading order of their first occurrence.
 */
export function findRepetitions(units: readonly RepetitionUnit[], options: RepetitionOptions = {}): RepetitionFinding[] {
  const opts = { ...DEFAULTS, ...options };
  const sents = sentencesOf(units);
  const definitions = definitionGroups(units, sents);
  const overlaps = (o: RepetitionOccurrence, x: RepetitionOccurrence) =>
    o.sectionId === x.sectionId && o.blockIndex === x.blockIndex && o.start < x.end && x.start < o.end;
  // A sentence group that mostly restates one definition is that definition, reported once.
  const restatesDefinition = (f: RepetitionFinding) =>
    definitions.some((d) => f.occurrences.filter((o) => d.occurrences.some((x) => overlaps(o, x))).length * 2 >= f.occurrences.length);
  const found = [...definitions, ...sentenceGroups(units, sents, opts).filter((f) => !restatesDefinition(f))];
  if (opts.phrases) {
    // A phrase that sits inside repeats already reported says nothing new.
    const known = (o: RepetitionOccurrence) => found.some((f) => f.occurrences.some((x) => overlaps(o, x)));
    for (const p of phraseGroups(units, sents, opts.minPhraseWords)) if (!p.occurrences.every(known)) found.push(p);
  }
  const order = new Map(units.map((u, i) => [`${u.sectionId}#${u.blockIndex ?? ''}`, i]));
  const pos = (o: RepetitionOccurrence | undefined) => (o ? (order.get(`${o.sectionId}#${o.blockIndex ?? ''}`) ?? 0) * 1e9 + o.start : 0);
  return found.sort((a, b) => pos(a.occurrences[0]) - pos(b.occurrences[0]) || a.id.localeCompare(b.id));
}

const SKIP_SUBTYPES = new Set(['titlepage', 'copyright', 'contents', 'halftitle', 'about_the_author']);

/** findRepetitions over a BookDoc: one unit per prose block of each enabled section (front fences and About the author skipped). */
export function findBookRepetitions(book: BookDoc, options: RepetitionOptions = {}): RepetitionFinding[] {
  const units: RepetitionUnit[] = [];
  for (const s of enabledSections(book)) {
    if (SKIP_SUBTYPES.has(s.subtype)) continue;
    const texts = blockTexts(s);
    s.blocks.forEach((b, k) => {
      if (b.type === 'paragraph' || b.type === 'list' || b.type === 'takeaways' || b.type === 'quote' || b.type === 'callout' || b.type === 'exercise')
        units.push({ sectionId: s.id, blockIndex: k, text: texts[k] ?? '', title: sectionHeading(s) });
    });
  }
  return findRepetitions(units, options);
}

// ---------- profile facts reused ----------

export interface ProfileUse {
  sectionId: string;
  blockIndex?: number;
  start: number;
  end: number;
  /** The body sentence as written. */
  text: string;
  /** The bio sentence it restates. */
  bioSentence: string;
}

export interface ProfileReuseOptions {
  /** Content words a body sentence must share with one bio sentence. Default 5. */
  minShared?: number;
  /** Share of the shorter sentence's content words that must match. Default 0.6. */
  minOverlap?: number;
}

/**
 * Body sentences that restate a sentence of the profile bio (the studio, the job, the place, the credentials),
 * in reading order. A sentence counts when it shares at least five content words with one bio sentence and
 * those make up most of the shorter of the two. Model-free.
 */
export function findProfileUses(units: readonly RepetitionUnit[], profileText: string, options: ProfileReuseOptions = {}): ProfileUse[] {
  const minShared = options.minShared ?? 5;
  const minOverlap = options.minOverlap ?? 0.6;
  if (!profileText.trim()) return [];
  const bio = sentencesOf([{ sectionId: '__profile__', text: profileText }]).filter((s) => s.content.size >= minShared);
  if (!bio.length) return [];
  const out: ProfileUse[] = [];
  for (const s of sentencesOf(units)) {
    if (s.content.size < minShared) continue;
    for (const b of bio) {
      const shared = [...s.content].filter((w) => b.content.has(w)).length;
      if (shared >= minShared && shared / Math.min(s.content.size, b.content.size) >= minOverlap) {
        const u = units[s.unit];
        const use: ProfileUse = { sectionId: s.sectionId, start: s.start, end: s.end, text: s.text, bioSentence: b.text };
        if (u?.blockIndex !== undefined) use.blockIndex = u.blockIndex;
        out.push(use);
        break;
      }
    }
  }
  return out;
}

/** Titles (or ids) of the sections that already state a profile fact, in reading order, for the writer's prompt. */
export function profileFactsUsedIn(units: readonly RepetitionUnit[], profileText: string, options: ProfileReuseOptions = {}): string[] {
  const names: string[] = [];
  for (const u of findProfileUses(units, profileText, options)) {
    const name = units.find((x) => x.sectionId === u.sectionId)?.title ?? u.sectionId;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * The author's background may be stated once in the body. The first section that restates the bio keeps it;
 * every sentence in a later section that restates the bio is a finding (kind "profile") to cut. Pass the body
 * sections only: About the author is the bio itself.
 */
export function findProfileReuse(units: readonly RepetitionUnit[], profileText: string, options: ProfileReuseOptions = {}): RepetitionFinding[] {
  const uses = findProfileUses(units, profileText, options);
  const first = uses[0]?.sectionId;
  if (first === undefined) return [];
  const later = uses.filter((u) => u.sectionId !== first);
  if (!later.length) return [];
  const keep = uses.filter((u) => u.sectionId === first);
  const occ = [...keep, ...later].map((u) => {
    const o: RepetitionOccurrence = { sectionId: u.sectionId, start: u.start, end: u.end, text: u.text };
    if (u.blockIndex !== undefined) o.blockIndex = u.blockIndex;
    return o;
  });
  const names = where(units, occ);
  return [
    {
      id: 'profile:bio',
      kind: 'profile',
      severity: 'warn',
      key: short(later[0]?.bioSentence ?? '', 50),
      message: `The author's background from the profile bio is stated in more than one section (${names}). State it once in the body; About the author already carries the bio.`,
      suggestion: 'Keep the first and cut the later ones.',
      similarity: 1,
      occurrences: occ,
    },
  ];
}
