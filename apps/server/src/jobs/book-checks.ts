import { checkedMonth, findUndatedPrices, profileFactsUsedIn, type RepetitionUnit } from '@volume/core';
import type { RequestCtx } from '../auth/context.js';
import { hasDatedPrices, loadBookStructure } from '../config/book-structure.js';
import type { Book } from '../repos/books.js';
import type { Repos } from '../repos/index.js';
import { CODE_WRITTEN_KINDS, OWNER_PLACEHOLDER_SOURCE } from './book-data.js';

/**
 * Book-level facts the writer and the listing prompts need after live run 3 (5 October 2026): the dated-prices rule
 * and its check, where the author's background is already stated, and what the written chapters actually teach.
 */

/** Sections that carry written prose (not code pages, parts or owner placeholders), in reading order. */
export interface WrittenSection {
  id: string;
  kind: string;
  number: number | null;
  title: string;
  bodyMd: string;
  summary: string | null;
}

const BODY_KINDS: ReadonlySet<string> = new Set(['introduction', 'chapter', 'conclusion', 'epilogue']);

export function sectionTitle(s: { kind: string; number: number | null; title: string | null }): string {
  return s.kind === 'chapter' && s.number !== null ? `Chapter ${s.number}: ${s.title ?? ''}` : (s.title ?? s.kind);
}

export async function writtenSections(repos: Repos, ctx: RequestCtx, projectId: string): Promise<WrittenSection[]> {
  const sections = (await repos.manuscript.listSections(ctx, projectId))
    .filter((s) => s.enabled && s.currentVersionId && !CODE_WRITTEN_KINDS.has(s.kind) && s.kind !== 'part')
    .sort((a, b) => a.position - b.position);
  const out: WrittenSection[] = [];
  for (const s of sections) {
    const v = await repos.manuscript.getVersion(ctx, s.currentVersionId as string);
    if (!v || !v.bodyMd.trim() || v.source === OWNER_PLACEHOLDER_SOURCE) continue;
    out.push({ id: s.id, kind: s.kind, number: s.number, title: sectionTitle(s), bodyMd: v.bodyMd, summary: v.summary });
  }
  return out;
}

/** True when the book's type asks for every price to carry the month it was checked. */
export async function datedPricesRule(configDir: string, book: Pick<Book, 'bookTypeId' | 'template'>): Promise<boolean> {
  return hasDatedPrices(await loadBookStructure(configDir, book.bookTypeId, book.template));
}

/**
 * The dated-prices check over the written body (introduction, chapters, conclusion) as one line for the prompts:
 * "passed ...", "failed: N prices ..." or "not run ...". Only "passed" lets a page promise dated prices.
 */
export function pricesCheckLine(sections: readonly Pick<WrittenSection, 'kind' | 'bodyMd' | 'title'>[], plannedBody: number | null = null): string {
  const body = sections.filter((s) => BODY_KINDS.has(s.kind));
  const undated = body.flatMap((s) => findUndatedPrices(s.bodyMd).map((h) => `${h.match} in ${s.title}`));
  if (undated.length > 0)
    return `failed: ${undated.length} ${undated.length === 1 ? 'price has' : 'prices have'} no month checked (${undated.slice(0, 3).join(', ')})`;
  if (!body.some((s) => s.kind === 'chapter')) return 'not run: no chapters written yet';
  // A page written before the chapters (How to Use) cannot promise what the later chapters will do.
  if (plannedBody !== null && body.length < plannedBody) return `not run: ${body.length} of ${plannedBody} body sections written so far`;
  return 'passed: every price in the written chapters carries the month checked';
}

/** Enabled body sections (introduction, chapters, conclusion, epilogue) the book plans. */
export async function plannedBodyCount(repos: Repos, ctx: RequestCtx, projectId: string): Promise<number> {
  return (await repos.manuscript.listSections(ctx, projectId)).filter((s) => s.enabled && BODY_KINDS.has(s.kind)).length;
}

export interface DatedPrices {
  /** "yes" or "no" for {{book.datedPrices}}. */
  datedPrices: 'yes' | 'no';
  /** The write month for "(checked October 2026)". */
  checkedMonth: string;
  /** The check line for {{book.pricesCheck}}. */
  pricesCheck: string;
}

/** Everything the prompts need for the dated-prices rule. `now` is the book's write date. */
export async function datedPricesVars(
  configDir: string,
  book: Pick<Book, 'bookTypeId' | 'template'>,
  sections: readonly WrittenSection[],
  plannedBody: number | null = null,
  now: Date = new Date(),
): Promise<DatedPrices> {
  const rule = await datedPricesRule(configDir, book);
  return {
    datedPrices: rule ? 'yes' : 'no',
    checkedMonth: checkedMonth(now),
    pricesCheck: rule ? pricesCheckLine(sections, plannedBody) : 'not run: this book type has no dated-prices rule',
  };
}

/** Sections (by title) whose text already restates the profile bio, for {{profile.factsUsedIn}}. */
export function factsUsedIn(sections: readonly WrittenSection[], bio: string, exceptId: string | null = null): string[] {
  const units: RepetitionUnit[] = sections.filter((s) => s.id !== exceptId).map((s) => ({ sectionId: s.id, text: s.bodyMd, title: s.title }));
  return profileFactsUsedIn(units, bio);
}

/** The "### Key Takeaways" list items of a written section. */
export function takeawaysOf(markdown: string): string[] {
  const m = /^#{2,4}\s*key takeaways?\s*$([\s\S]*?)(?=^#{1,4}\s|(?![\s\S]))/im.exec(markdown);
  if (!m) return [];
  return (m[1] ?? '')
    .split('\n')
    .map((l) => /^\s*(?:[-*+]|\d+\.)\s+(.+)$/.exec(l)?.[1]?.trim() ?? '')
    .filter(Boolean);
}

/**
 * What the written book teaches, as previous summaries for the marketing and listing prompts: each written body
 * section's saved summary plus its key takeaways. Marketing must describe only these.
 */
export function writtenSummaries(sections: readonly WrittenSection[]): { number: number; title: string; summary: string }[] {
  return sections
    .filter((s) => BODY_KINDS.has(s.kind))
    .flatMap((s, i) => {
      const takeaways = takeawaysOf(s.bodyMd);
      const summary = [s.summary?.trim() ?? '', takeaways.length ? `Key takeaways: ${takeaways.join('; ')}` : ''].filter(Boolean).join('\n');
      return summary ? [{ number: s.number ?? i + 1, title: s.title, summary }] : [];
    });
}
