import type { RequestCtx } from '../auth/context.js';
import type { Book } from '../repos/books.js';
import type { Repos } from '../repos/index.js';
import { profileSummary } from './book-data.js';
import { BODY_KINDS, datedPricesVars, plannedBodyCount, writtenSections, writtenSummaries } from './book-checks.js';

/** A section the estimate expects to be written before the listing job runs, with its stand-in summary. */
export interface PendingSummary {
  id: string;
  kind: string;
  number: number | null;
  title: string;
  summary: string;
}

/**
 * The matter stage's variables for a book (AI-PIPELINE stage 7), shared by the listing job and the writing estimate so
 * the estimate prices exactly what the job sends: the approved blueprint, the written sections' summaries, the research
 * run and ticked sources, the dated-prices check, the latest print page count and the profile. `pending` adds body
 * sections that are not written yet (the estimate's stand-ins for the summaries they will have).
 */
export async function listingVariables(
  repos: Repos,
  configDir: string,
  ctx: RequestCtx,
  book: Book,
  pending: readonly PendingSummary[] = [],
): Promise<Record<string, unknown>> {
  const projectId = book.id;
  const blueprint = book.approvedBlueprintId
    ? await repos.planning.blueprintById(ctx, book.approvedBlueprintId)
    : await repos.planning.latestBlueprint(ctx, projectId);
  const written = await writtenSections(repos, ctx, projectId);
  const research = (await repos.planning.listRuns(ctx, projectId)).find((r) => r.status === 'done')?.output ?? null;
  const sources = await repos.planning.listSources(ctx, { projectId, useInBook: true });
  const print = (await repos.production.listExports(ctx, projectId)).find((e) => e.kind === 'pdf_print' && e.status === 'done');
  const writtenIds = new Set(written.map((s) => s.id));
  const stillToWrite = pending.filter((p) => BODY_KINDS.has(p.kind) && !writtenIds.has(p.id));
  const previousSummaries = [
    ...writtenSummaries(written),
    ...stillToWrite.map((p, i) => ({ number: p.number ?? i + 1, title: p.title, summary: p.summary })),
  ].sort((a, b) => a.number - b.number);
  return {
    title: book.title,
    subtitle: book.subtitle,
    bookTypeId: book.bookTypeId,
    summary: blueprint?.data['summary'] ?? null,
    blueprint: blueprint?.data ?? null,
    previousSummaries,
    research,
    sources: sources.map((s) => ({ title: s.title, url: s.url, excerpt: s.excerpt })),
    ...(print?.pageCount ? { pageCount: print.pageCount } : {}),
    ...(await datedPricesVars(configDir, book, written, await plannedBodyCount(repos, ctx, projectId))),
    profile: await profileSummary(repos, ctx, book.profileId, book),
  };
}
