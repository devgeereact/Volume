import type { RequestCtx } from '../auth/context.js';
import type { Claim } from '../repos/manuscript.js';
import type { Repos } from '../repos/index.js';
import { CLAIM_FIX_APPROACHES, type ClaimFixApproach } from '../ports/ai.js';
import { checkText, findTemplateJunk, type CompiledHouseStyle } from '@volume/core';
import { fieldDriftCheck, profileSummary, styleChecks, type CodeCheck } from './book-data.js';

// Claim fixes (owner request, 19 October 2026): three replacement options for one sentence on the claims-to-verify
// report from editing.claim-fix, vetted in code so no option adds a figure, link or source the book does not have.

export { CLAIM_FIX_APPROACHES, type ClaimFixApproach };

export interface ClaimFixOption {
  text: string;
  approach: ClaimFixApproach;
  rationale: string;
  needsSource: boolean;
}

/** Characters of text on each side of the sentence sent with it. */
const CONTEXT_CHARS = 800;
const MARKER_RE = /\[\[S(\d+)\]\]/g;
const NUMBER_RE = /\d+(?:[.,]\d+)*/g;
/**
 * Amounts in words that read as a statistic: "one in five", "nine in every ten", "seventy per cent", "three times more
 * likely", "half of", "a third of", "most of", "thousands of", "twice". The house-style guardrail patterns only see
 * digits, so an option that adds one of these is dropped like a new figure.
 */
const UNIT = 'one|two|three|four|five|six|seven|eight|nine';
const TEEN = 'ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen';
const TENS = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
/** A number in words up to ninety-nine, or a hundred. */
const NUMBER_WORD = `(?:(?:${TENS})(?:[- ](?:${UNIT}))?|${TEEN}|${UNIT}|zero|a hundred|one hundred)`;
const BIG = 'hundred|thousand|million|billion';
const AMOUNT_WORDS_RE = new RegExp(
  [
    // "one in five", "nine in every ten", "one out of a hundred", "one in a million"
    `\\b${NUMBER_WORD}\\s+(?:in|out of)\\s+(?:every\\s+)?(?:${NUMBER_WORD}|a (?:${BIG})|${BIG})\\b`,
    // "three times more likely", "twice as", "ten times less"
    `\\b(?:${NUMBER_WORD}|\\d+(?:\\.\\d+)?)\\s+times\\s+(?:more|less|as|higher|lower|greater|fewer|likelier)\\b`,
    // "seventy per cent", "twenty-five percent", "a hundred per cent"
    `\\b(?:${NUMBER_WORD}|${BIG})\\s+(?:per ?cent|percent)\\b`,
    // "half of", "a quarter of", "two thirds of", "the majority of", "most of", "a minority of"
    '\\b(?:half|a (?:quarter|third|fifth|tenth)|(?:two|three|four) (?:thirds|quarters|fifths)|(?:the |a )?(?:majority|minority)|most)\\s+of\\b',
    '\\b(?:dozens|hundreds|thousands|millions|billions)\\s+of\\b',
    '\\b(?:twice|double|triple|treble|tenfold|hundredfold)\\b',
  ].join('|'),
  'gi',
);

/**
 * Where the claim sentence sits in the text: at `hint` when the text there still matches (the claim's own offset on
 * the version it was found in), else the first exact occurrence. Null when the sentence is not in the text any more.
 */
export function locateSentence(text: string, sentence: string, hint?: number | null): number | null {
  if (!sentence) return null;
  if (typeof hint === 'number' && hint >= 0 && text.slice(hint, hint + sentence.length) === sentence) return hint;
  const i = text.indexOf(sentence);
  return i < 0 ? null : i;
}

/** The claim's offset on the version it was found in, when that version is the one given. */
export function claimHint(claim: Claim, versionId: string): number | null {
  const start = claim.location['start'];
  return claim.versionId === versionId && typeof start === 'number' ? start : null;
}

/**
 * Replaces the sentence at `at` with `replacement`. An empty replacement removes the sentence and one space beside it,
 * and a paragraph left empty goes too, so a removal leaves no double space or blank paragraph.
 */
export function spliceSentence(text: string, at: number, sentence: string, replacement: string): string {
  let start = at;
  let end = at + sentence.length;
  const next = replacement.trim();
  if (!next) {
    if (text[end] === ' ') end += 1;
    else if (start > 0 && text[start - 1] === ' ') start -= 1;
    return text
      .slice(0, start)
      .concat(text.slice(end))
      .replace(/\n{3,}/g, '\n\n');
  }
  return text.slice(0, start) + next + text.slice(end);
}

/** The text either side of the sentence, for the prompt. */
export function aroundSentence(text: string, at: number, sentence: string): { before: string; after: string } {
  return { before: text.slice(Math.max(0, at - CONTEXT_CHARS), at), after: text.slice(at + sentence.length, at + sentence.length + CONTEXT_CHARS) };
}

const SENTENCE_RE = /[^.!?\n]+[.!?]+["'\u2019\u201D)]*|[^.!?\n]+$/g;

function sentencesOf(text: string): string[] {
  return (text.match(SENTENCE_RE) ?? []).map((x) => x.trim()).filter((x) => x.length > 0 && !x.startsWith('#'));
}

/**
 * The paragraph holding the sentence and the sentences either side of it (across a paragraph break when the sentence
 * opens or closes its paragraph), so a fix can join the text around it.
 */
export function paragraphAround(
  text: string,
  at: number,
  sentence: string,
): { paragraph: string; previousSentence: string | null; nextSentence: string | null } {
  const end = at + sentence.length;
  const pStart = text.lastIndexOf('\n\n', at);
  const pEnd = text.indexOf('\n\n', end);
  const paragraph = text.slice(pStart < 0 ? 0 : pStart + 2, pEnd < 0 ? text.length : pEnd).trim();
  const previousSentence = sentencesOf(text.slice(Math.max(0, at - CONTEXT_CHARS), at)).at(-1) ?? null;
  const nextSentence = sentencesOf(text.slice(end, end + CONTEXT_CHARS))[0] ?? null;
  return { paragraph, previousSentence, nextSentence };
}

const wordSet = (t: string): Set<string> =>
  new Set(
    t
      .toLowerCase()
      .replace(MARKER_RE, ' ')
      .match(/[a-z0-9']+/g) ?? [],
  );

/** How much of `part` (its distinct words) appears in `whole`, 0 to 1. */
export function coverage(part: string, whole: string): number {
  const x = wordSet(part);
  const y = wordSet(whole);
  if (x.size === 0) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both += 1;
  return both / x.size;
}

/** Word overlap of two texts (Jaccard over lower-case words), 0 to 1. */
export function similarity(a: string, b: string): number {
  const words = (t: string): Set<string> =>
    new Set(
      t
        .toLowerCase()
        .replace(MARKER_RE, ' ')
        .match(/[a-z0-9']+/g) ?? [],
    );
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both += 1;
  return both / (x.size + y.size - both);
}

/** Options closer than this to each other count as the same option; closer than this to a neighbour, a repeat. */
export const NEAR_DUPLICATE = 0.8;

/** Source numbers cited with [[S<n>]] markers in a text. */
export function markersIn(text: string): number[] {
  return [...text.matchAll(MARKER_RE)].map((m) => Number(m[1]));
}

/** Amounts in words in a text, lower case with single spaces. */
export function amountWordsIn(text: string): string[] {
  return (text.match(AMOUNT_WORDS_RE) ?? []).map((m) =>
    m
      .toLowerCase()
      .replace(/-/g, ' ')
      .replace(/\bpercent\b/g, 'per cent')
      .replace(/\s+/g, ' '),
  );
}

/** Ids of the house-style guardrail patterns (according to, studies show, award words, percentages ...) a text hits. */
export function guardrailIdsIn(text: string, style: CompiledHouseStyle): Set<string> {
  return new Set(
    checkText(text, style)
      .filter((f) => f.rule === 'guardrail' && f.action !== 'autofix' && f.id !== undefined)
      .map((f) => f.id as string),
  );
}

function numbersIn(text: string): string[] {
  return (text.replace(MARKER_RE, ' ').match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, ''));
}

/**
 * The zero-invention check on the model's options. An option is dropped when it cites a source marker the book does not
 * have, carries a link, holds a number that is in neither the sentence nor a source it cites, adds an amount in words
 * ("one in five", "half of") or a house-style guardrail pattern (according to, studies show, award words, a
 * percentage ...) the sentence does not have, repeats the sentence unchanged, is a near-duplicate of an option already
 * kept, or repeats the sentence before or after it (the passage would then say the same thing twice). `remove` always has empty text; `attribute` with no valid marker still needs a
 * source. At most three are kept.
 */
export function vetOptions(
  options: readonly ClaimFixOption[],
  sentence: string,
  sources: readonly { title: string | null; excerpt: string | null }[],
  style: CompiledHouseStyle,
  around: { previousSentence?: string | null; nextSentence?: string | null } = {},
): { kept: ClaimFixOption[]; dropped: number } {
  const neighbours = [around.previousSentence, around.nextSentence].filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  const kept: ClaimFixOption[] = [];
  const allowed = new Set(numbersIn(sentence));
  const sentenceAmounts = new Set(amountWordsIn(sentence));
  const sentencePatterns = guardrailIdsIn(sentence, style);
  const seen = new Set<string>();
  for (const o of options) {
    const text = o.approach === 'remove' ? '' : o.text.trim();
    if (o.approach !== 'remove' && (!text || text === sentence.trim())) continue;
    if (/https?:\/\/|www\./i.test(text)) continue;
    const cited = markersIn(text);
    if (cited.some((n) => n < 1 || n > sources.length)) continue;
    const citedText = cited.map((n) => `${sources[n - 1]?.title ?? ''} ${sources[n - 1]?.excerpt ?? ''}`).join(' ');
    const fromSources = new Set(numbersIn(citedText));
    if (numbersIn(text).some((n) => !allowed.has(n) && !fromSources.has(n))) continue;
    if (amountWordsIn(text).some((a) => !sentenceAmounts.has(a))) continue;
    if ([...guardrailIdsIn(text, style)].some((id) => !sentencePatterns.has(id))) continue;
    if (seen.has(text)) continue;
    if (text && kept.some((k) => k.text && similarity(k.text, text) >= NEAR_DUPLICATE)) continue;
    // A neighbour of four words or more whose words the option mostly repeats: the passage would say it twice.
    if (text && neighbours.some((n) => similarity(n, text) >= NEAR_DUPLICATE || (wordSet(n).size >= 4 && coverage(n, text) >= NEAR_DUPLICATE))) continue;
    seen.add(text);
    const needsSource = o.needsSource || (o.approach === 'attribute' && cited.length === 0);
    kept.push({ text, approach: o.approach, rationale: o.rationale.trim(), needsSource });
    if (kept.length === 3) break;
  }
  return { kept, dropped: options.length - kept.length };
}

/**
 * The claim status after a fix: removed for a removal; verified only when the owner wrote the sentence themselves
 * ('own') and cited one of the book's research sources with a valid [[S<n>]] marker; softened for everything else. An
 * AI attribution is never verified: the model citing a source is not the owner checking that it says so.
 */
export function claimStatusFor(approach: ClaimFixApproach | 'own', text: string, sourceCount: number): 'removed' | 'verified' | 'softened' {
  if (approach === 'remove' || !text.trim()) return 'removed';
  const cited = markersIn(text);
  if (approach === 'own' && cited.length > 0 && cited.every((n) => n >= 1 && n <= sourceCount)) return 'verified';
  return 'softened';
}

/** The ticked research sources in the order the writer numbers them ([[S1]] is the first). */
export async function bookSources(repos: Repos, ctx: RequestCtx, projectId: string): Promise<{ title: string | null; url: string; excerpt: string | null }[]> {
  return (await repos.planning.listSources(ctx, { projectId, useInBook: true })).map((s) => ({ title: s.title, url: s.url, excerpt: s.excerpt }));
}

/** Prompt variables for the claim_fix stage (also used for its cost estimate). */
export async function claimFixVariables(
  repos: Repos,
  ctx: RequestCtx,
  claim: Claim,
  text: string,
  at: number,
  instruction: string | null,
): Promise<Record<string, unknown>> {
  const book = await repos.books.require(ctx, claim.projectId);
  const section = claim.sectionId ? await repos.manuscript.getSection(ctx, claim.sectionId) : null;
  const blueprint = book.approvedBlueprintId ? await repos.planning.blueprintById(ctx, book.approvedBlueprintId) : null;
  const tone = blueprint?.data['tone'];
  return {
    ...(typeof tone === 'string' && tone.trim() ? { tone } : {}),
    title: book.title,
    subtitle: book.subtitle,
    bookTypeId: book.bookTypeId,
    profile: await profileSummary(repos, ctx, book.profileId, book),
    sources: await bookSources(repos, ctx, claim.projectId),
    claim: {
      sentence: claim.sentence,
      category: claim.category,
      checkNeeded: claim.checkNeeded,
      sectionTitle: section?.title ?? null,
      ...aroundSentence(text, at, claim.sentence),
      ...paragraphAround(text, at, claim.sentence),
    },
    instruction,
  };
}

/**
 * The code checks (house style, unfilled placeholders and, when `fieldDrift` is true, health terms in a book that is not
 * a health book) on a fixed section's new text. No AI call.
 */
export function fixCodeChecks(markdown: string, configDir: string, fieldDrift = false): CodeCheck[] {
  const drift = fieldDriftCheck(markdown, fieldDrift);
  return [
    ...styleChecks(markdown, configDir),
    ...(drift ? [drift] : []),
    ...findTemplateJunk(markdown).map((j): CodeCheck => ({
      checker: 'placeholder',
      severity: 'block',
      message: `Unfilled placeholder "${j.match}". Replace or delete it.`,
      location: { start: j.start, end: j.end, match: j.match },
    })),
  ];
}
