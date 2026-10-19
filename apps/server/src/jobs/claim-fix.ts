import type { RequestCtx } from '../auth/context.js';
import type { Claim } from '../repos/manuscript.js';
import type { Repos } from '../repos/index.js';
import { CLAIM_FIX_APPROACHES, type ClaimFixApproach } from '../ports/ai.js';
import { findTemplateJunk } from '@volume/core';
import { profileSummary, styleChecks, type CodeCheck } from './book-data.js';

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

/** Source numbers cited with [[S<n>]] markers in a text. */
export function markersIn(text: string): number[] {
  return [...text.matchAll(MARKER_RE)].map((m) => Number(m[1]));
}

function numbersIn(text: string): string[] {
  return (text.replace(MARKER_RE, ' ').match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, ''));
}

/**
 * The zero-invention check on the model's options. An option is dropped when it cites a source marker the book does not
 * have, carries a link, holds a number that is in neither the sentence nor a source it cites, repeats the sentence
 * unchanged or repeats another option. `remove` always has empty text; `attribute` with no valid marker still needs a
 * source. At most three are kept.
 */
export function vetOptions(
  options: readonly ClaimFixOption[],
  sentence: string,
  sources: readonly { title: string | null; excerpt: string | null }[],
): { kept: ClaimFixOption[]; dropped: number } {
  const kept: ClaimFixOption[] = [];
  const allowed = new Set(numbersIn(sentence));
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
    if (seen.has(text)) continue;
    seen.add(text);
    const needsSource = o.needsSource || (o.approach === 'attribute' && cited.length === 0);
    kept.push({ text, approach: o.approach, rationale: o.rationale.trim(), needsSource });
    if (kept.length === 3) break;
  }
  return { kept, dropped: options.length - kept.length };
}

/**
 * The claim status after a fix: removed for a removal, verified for an attribution to one of the book's research
 * sources (a valid [[S<n>]] marker in the new text), softened for everything else.
 */
export function claimStatusFor(approach: ClaimFixApproach, text: string, sourceCount: number): 'removed' | 'verified' | 'softened' {
  if (approach === 'remove' || !text.trim()) return 'removed';
  const cited = markersIn(text);
  if (approach === 'attribute' && cited.length > 0 && cited.every((n) => n >= 1 && n <= sourceCount)) return 'verified';
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
  return {
    title: book.title,
    subtitle: book.subtitle,
    bookTypeId: book.bookTypeId,
    profile: await profileSummary(repos, ctx, book.profileId, book),
    sources: await bookSources(repos, ctx, claim.projectId),
    claim: { sentence: claim.sentence, category: claim.category, checkNeeded: claim.checkNeeded, ...aroundSentence(text, at, claim.sentence) },
    instruction,
  };
}

/** The code checks (house style and unfilled placeholders) on a fixed section's new text. No AI call. */
export function fixCodeChecks(markdown: string, configDir: string): CodeCheck[] {
  return [
    ...styleChecks(markdown, configDir),
    ...findTemplateJunk(markdown).map((j): CodeCheck => ({
      checker: 'placeholder',
      severity: 'block',
      message: `Unfilled placeholder "${j.match}". Replace or delete it.`,
      location: { start: j.start, end: j.end, match: j.match },
    })),
  ];
}
