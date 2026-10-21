import type { RequestCtx } from '../auth/context.js';
import { AppError } from '../http/errors.js';
import type { PreflightItem, PreflightReport } from '../ports/export.js';
import { buildExportBook, withFieldDrift, withOwnerPlaceholders, withPackCovers } from './book-data.js';
import type { JobServices } from './runner.js';

type GateServices = Pick<JobServices, 'repos' | 'configDir' | 'blobs' | 'exporter'>;

/** The book's preflight report as GET /books/:id/preflight shows it, with the manuscript hash. */
export async function preflightReport(s: GateServices, ctx: RequestCtx, bookId: string): Promise<PreflightReport & { manuscriptHash: string }> {
  const book = await buildExportBook(s.repos, ctx, bookId, s.configDir, s.blobs);
  const cover = await s.repos.production.getCover(ctx, bookId);
  const report = withPackCovers(await withOwnerPlaceholders(s.repos, ctx, bookId, await s.exporter.preflight(book)), {
    ebook: !!cover?.ebookAssetId,
    wrap: !!cover?.wrapAssetId,
  });
  // Text that drifts out of the pen name's field (health terms in a book that is not a health book) warns only.
  await withFieldDrift(s.repos, ctx, s.configDir, await s.repos.books.require(ctx, bookId), report);
  const openClaims = await s.repos.manuscript.listClaims(ctx, { projectId: bookId, status: 'open' });
  // The real exporter reports claims itself (claims.open); the mock does not.
  if (openClaims.length > 0 && !report.items.some((i) => i.id === 'claims.open')) {
    report.items.push({
      id: 'claims.open',
      area: 'claims',
      severity: 'warn',
      message: `${openClaims.length} claims still need checking.`,
      fix: { route: 'editor', label: 'Review claims' },
    });
    report.warnings += 1;
  }
  return { ...report, manuscriptHash: book.manuscriptHash };
}

/** Result of the Volume mode quality gate for one book (P8-2). */
export interface QualityGate {
  ok: boolean;
  /** Preflight items with severity block. */
  blocks: Pick<PreflightItem, 'id' | 'area' | 'message'>[];
  /** Claims not yet verified, softened or removed. Any open claim fails the gate, warn or not. */
  openClaims: number;
}

/**
 * A batch book may be marked ready, scheduled (slot confirmed), packed or marked published only when preflight has
 * no block item and no claim is open (ROADMAP phase 8: no batch book skips preflight or claims review).
 */
export async function qualityGate(s: GateServices, ctx: RequestCtx, bookId: string): Promise<QualityGate> {
  const report = await preflightReport(s, ctx, bookId);
  const blocks = report.items.filter((i) => i.severity === 'block').map((i) => ({ id: i.id, area: i.area, message: i.message }));
  const openClaims = (await s.repos.manuscript.listClaims(ctx, { projectId: bookId, status: 'open' })).length;
  return { ok: blocks.length === 0 && openClaims === 0, blocks, openClaims };
}

/** Throws 409 quality_gate with the reasons when the book has not passed. */
export async function assertQualityGate(s: GateServices, ctx: RequestCtx, bookId: string, action: string): Promise<QualityGate> {
  const gate = await qualityGate(s, ctx, bookId);
  if (gate.ok) return gate;
  const reasons: string[] = [];
  if (gate.blocks.length > 0) reasons.push(`preflight has ${gate.blocks.length} blocking item${gate.blocks.length === 1 ? '' : 's'}`);
  if (gate.openClaims > 0) reasons.push(`${gate.openClaims} claim${gate.openClaims === 1 ? ' is' : 's are'} still open`);
  throw new AppError('quality_gate', `This book cannot be ${action} yet: ${reasons.join(' and ')}.`, gate);
}
