import houseStyle from "@config/house-style.json";

/* Text tools for the Editor mock: word counts, the deterministic checks (house style from
   config/house-style.json), a word-level diff for compare and suggestions, find matching, and the
   demo results for selection rewrites. */

export function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/* ---------- Checks ---------- */

const usToUk = houseStyle.usToUkSpelling as Record<string, string>;
const banned = houseStyle.bannedPhrases;
const EM_DASH = houseStyle.emDash.char;
const inflections = houseStyle.bannedPhraseMatching.singleWordInflections;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const bannedRes: { phrase: string; re: RegExp }[] = banned.map((phrase) => {
  const single = !/\s/.test(phrase);
  let body = escapeRe(phrase).replace(/'/g, "['’]");
  if (single) {
    const stem = phrase.endsWith("e") ? escapeRe(phrase.slice(0, -1)) : null;
    const forms = [body + `(?:${inflections.join("|")})?`];
    if (stem) forms.push(`${stem}(?:ing|ed)`);
    body = `(?:${forms.join("|")})`;
  }
  return { phrase, re: new RegExp(`\\b${body}\\b`, "gi") };
});

export interface Issue {
  kind: "em-dash" | "spelling" | "banned";
  blockId: string;
  found: string;
  fix: string | null;
}

export function findIssues(blocks: { id: string; text: string }[]): Issue[] {
  const out: Issue[] = [];
  for (const b of blocks) {
    let n = 0;
    for (const ch of b.text) if (ch === EM_DASH) n++;
    for (let i = 0; i < n; i++) out.push({ kind: "em-dash", blockId: b.id, found: EM_DASH, fix: ", " });
    for (const m of b.text.matchAll(/[A-Za-z]+/g)) {
      const w = m[0];
      const uk = usToUk[w.toLowerCase()];
      if (uk) out.push({ kind: "spelling", blockId: b.id, found: w, fix: w[0] === w[0]?.toUpperCase() ? uk[0]?.toUpperCase() + uk.slice(1) : uk });
    }
    for (const { re } of bannedRes) {
      for (const m of b.text.matchAll(re)) out.push({ kind: "banned", blockId: b.id, found: m[0], fix: null });
    }
  }
  return out;
}

/* ---------- Diff ---------- */

export interface DiffPart {
  type: "same" | "add" | "del";
  text: string;
}

/** Word-level diff (LCS over words and the spaces between them). Fine for paragraphs. */
export function diffWords(a: string, b: string): DiffPart[] {
  const x = a.split(/(\s+)/).filter((t) => t !== "");
  const y = b.split(/(\s+)/).filter((t) => t !== "");
  const n = x.length;
  const m = y.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    const row = dp[i]!;
    const below = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j--) row[j] = x[i] === y[j] ? below[j + 1]! + 1 : Math.max(below[j]!, row[j + 1]!);
  }
  const parts: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      push("same", x[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push("del", x[i]!);
      i++;
    } else {
      push("add", y[j]!);
      j++;
    }
  }
  while (i < n) push("del", x[i++]!);
  while (j < m) push("add", y[j++]!);
  return parts;
}

/* ---------- Find ---------- */

export interface FindOptions {
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
}

export function findRegex(o: FindOptions): RegExp | null {
  if (!o.query) return null;
  const body = escapeRe(o.query);
  return new RegExp(o.wholeWord ? `\\b${body}\\b` : body, o.matchCase ? "g" : "gi");
}

export function findRanges(text: string, re: RegExp | null): [number, number][] {
  if (!re) return [];
  const out: [number, number][] = [];
  for (const m of text.matchAll(re)) if (m[0].length > 0 && m.index !== undefined) out.push([m.index, m.index + m[0].length]);
  return out;
}

/* ---------- Selection rewrites (demo results) ---------- */

export type RewriteKind = "expand" | "shorten" | "rephrase" | "warmer" | "direct" | "formal";

export const rewriteLabels: Record<RewriteKind, string> = {
  expand: "Expand",
  shorten: "Shorten",
  rephrase: "Rephrase",
  warmer: "Warmer tone",
  direct: "More direct",
  formal: "More formal",
};

const fillers = /\b(really|very|just|actually|quite|a little|a bit|simply|even|usually|often)\s+/gi;
const hedges = /\b(try to|it is fine to|you might want to|perhaps|maybe|it can help to)\s+/gi;
const plain: [RegExp, string][] = [
  [/\bstarts\b/g, "begins"],
  [/\bhelp\b/g, "support"],
  [/\bquick\b/g, "brief"],
  [/\bfind\b/g, "look for"],
  [/\bfix\b/g, "sort out"],
  [/\bspeak to\b/g, "talk to"],
];
const formalMap: [RegExp, string][] = [
  [/\bdon't\b/gi, "do not"],
  [/\bcan't\b/gi, "cannot"],
  [/\bit's\b/gi, "it is"],
  [/\bget\b/g, "obtain"],
  [/\bask\b/g, "request"],
];

function tidy(s: string): string {
  return s.replace(/\s{2,}/g, " ").trim();
}

function sentenceCase(original: string, result: string): string {
  if (!original || !result) return result;
  const first = original.charAt(0);
  return first === first.toUpperCase() ? result.charAt(0).toUpperCase() + result.slice(1) : result.charAt(0).toLowerCase() + result.slice(1);
}

/** A deterministic demo result for a selection rewrite. The real app asks the editor model. */
export function mockRewrite(kind: RewriteKind, text: string): string {
  const endsWithStop = /[.!?]$/.test(text.trim());
  let out = text;
  switch (kind) {
    case "shorten": {
      out = text.replace(fillers, "");
      const comma = out.indexOf(", ");
      if (out === text && comma > 20) out = out.slice(0, comma) + (endsWithStop ? "." : "");
      if (out === text) {
        const words = text.trim().split(/\s+/);
        out = words.slice(0, Math.max(3, Math.ceil(words.length * 0.7))).join(" ") + (endsWithStop ? "." : "");
      }
      break;
    }
    case "expand":
      out = endsWithStop
        ? `${text.trim()} Give it a moment before you move on, so the people around you can catch up.`
        : `${text.trim()}, and give it a moment before you move on`;
      break;
    case "rephrase": {
      out = text;
      for (const [re, to] of plain) out = out.replace(re, to);
      if (out === text) out = `Put simply, ${text.trim().charAt(0).toLowerCase()}${text.trim().slice(1)}`;
      break;
    }
    case "warmer":
      out = endsWithStop ? `${text.trim()} Be kind to yourself while you learn this.` : `${text.trim()}, gently`;
      break;
    case "direct":
      out = text.replace(hedges, "").replace(fillers, "");
      if (out === text) out = text.replace(/\bcan\b/, "will").replace(/\bshould\b/, "must");
      break;
    case "formal": {
      out = text;
      for (const [re, to] of formalMap) out = out.replace(re, to);
      if (out === text) out = text.replace(/\byou\b/, "the nurse in charge");
      break;
    }
  }
  return sentenceCase(text, tidy(out));
}

/* ---------- Author notes (demo results) ---------- */

const instruction =
  /^(please\s+)?(add|mention|include|talk about|say|write about|write|explain|describe|put in|cover|note)\s+(that\s+|the bit about\s+|a bit about\s+|something about\s+|about\s+)?/i;

/** Rough note words as one clean sentence: no instruction verb, a capital, "I" for "i", a full stop. */
function noteSentences(note: string): string {
  let t = note.replace(/\s+/g, " ").trim().replace(instruction, "");
  t = t
    .replace(/&/g, "and")
    .replace(/\bi\b/g, "I")
    .replace(/\bim\b/gi, "I'm")
    .replace(/\s*\u2014\s*/g, ", ");
  t = t
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
    .join(" ");
  return t;
}

const bridges: Record<string, string[]> = {
  "the-new-charge-nurse": [
    "It is a small thing, but small things are what a shift is made of.",
    "Moments like that are easy to miss on a busy ward, which is exactly why they matter.",
    "Nobody writes that down at handover, and it is often the part that matters most.",
  ],
  handover: ["That is the part of the story a handover sheet cannot hold.", "Say it out loud at the desk, even when the list feels finished."],
};
const defaultBridges = ["It is worth saying plainly, because the reader will meet the same moment.", "Keep that in mind as the chapter goes on."];

/** The editor's demo answer to "Weave in": the note as finished prose in the book's voice. */
export function weaveNote(note: string, bookId: string, n = 0): string {
  const pool = bridges[bookId] ?? defaultBridges;
  const body = noteSentences(note);
  return body ? `${body} ${pool[n % pool.length]}` : "";
}

/** The editor's demo answer to "Expand into a section": a subheading and three paragraphs. */
export function expandNote(note: string, bookId: string, n = 0): { heading: string; paragraphs: string[] } {
  const body = noteSentences(note);
  const words = body
    .replace(/[.!?,:;]/g, "")
    .split(" ")
    .filter((w) => !/^(the|a|an|and|that|who|my|in|of|to)$/i.test(w));
  const heading = words.slice(0, 4).join(" ");
  return {
    heading: heading ? heading.charAt(0).toUpperCase() + heading.slice(1).toLowerCase() : "A note from the floor",
    paragraphs: [
      weaveNote(note, bookId, n),
      "Think about what made that moment work. It was rarely a policy or a form. It was someone noticing, and choosing to act before they were asked.",
      "Try it on your next shift. Pick one small thing you would usually let pass, deal with it early, and notice how the rest of the shift goes.",
    ],
  };
}
