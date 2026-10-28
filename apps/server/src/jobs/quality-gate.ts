import { claimNeedsCheck } from '@volume/core';
import type { RequestCtx } from '../auth/context.js';
import { AppError } from '../http/errors.js';
import type { PreflightItem, PreflightReport } from '../ports/export.js';
import { RESOURCES_AUTO_OFF_KEY, RESOURCES_AUTO_OFF_NOTE } from './handlers/writing.js';
import { buildExportBook, withFieldDrift, withOriginality, withOwnerPlaceholders, withPackCovers } from './book-data.js';
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
  const bookRow = await s.repos.books.require(ctx, bookId);
  await withFieldDrift(s.repos, ctx, s.configDir, bookRow, report);
  // Passages copied word for word from the voice samples or a research source warn only (originality, 27 October 2026).
  await withOriginality(s.repos, ctx, bookRow, report);
  // Resources the app switched off for lack of ticked sources: say so, and say how to undo it. It does not block.
  const sectionRows = await s.repos.manuscript.listSections(ctx, bookId);
  if (sectionRows.some((x) => x.kind === 'resources' && !x.enabled && x.plan[RESOURCES_AUTO_OFF_KEY] !== undefined)) {
    report.items.push({
      id: 'resources.auto-off',
      area: 'back',
      severity: 'pass',
      message: RESOURCES_AUTO_OFF_NOTE,
      fix: { route: 'research', label: 'Tick sources' },
    });
  }
  // Only claims that need the owner's check hold a batch book back; claims listed for the record do not (owner, 21 October 2026).
  const openClaims = (await s.repos.manuscript.listClaims(ctx, { projectId: bookId, status: 'open' })).filter(claimNeedsCheck);
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
  // A warning the owner ticked stays listed but counts as checked, for as long as its wording is unchanged.
  const acks = preflightAcks(await s.repos.books.require(ctx, bookId));
  for (const i of report.items) if (i.severity === 'warn' && acks[i.id] === i.message) i.acknowledged = true;
  return { ...report, manuscriptHash: book.manuscriptHash };
}

/** Warnings the owner has ticked as checked: item id to the message they saw. Stored in the book settings. */
export function preflightAcks(book: { settings: Record<string, unknown> }): Record<string, string> {
  const raw = book.settings['preflightAcks'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/** Result of the Volume mode quality gate for one book (P8-2). */
export interface QualityGate {
  ok: boolean;
  /** Preflight items with severity block. */
  blocks: Pick<PreflightItem, 'id' | 'area' | 'message'>[];
  /**
   * Open claims that need the owner's check (claim tier "needs your check"). These fail the gate. Name kept for the
   * clients that already read it.
   */
  openClaims: number;
  /** Open claims listed for the record only (low or medium risk, harmless if wrong). They never block (owner, 21 October 2026). */
  claimsForRecord: number;
}

/**
 * A batch book may be marked ready, scheduled (slot confirmed), packed or marked published only when preflight has
 * no block item and no open claim that needs the owner's check (claim tiers, owner, 21 October 2026; ROADMAP phase 8: no batch book skips preflight or claims review).
 */
export async function qualityGate(s: GateServices, ctx: RequestCtx, bookId: string): Promise<QualityGate> {
  const report = await preflightReport(s, ctx, bookId);
  const blocks = report.items.filter((i) => i.severity === 'block').map((i) => ({ id: i.id, area: i.area, message: i.message }));
  const open = await s.repos.manuscript.listClaims(ctx, { projectId: bookId, status: 'open' });
  const openClaims = open.filter(claimNeedsCheck).length;
  const claimsForRecord = open.length - openClaims;
  return { ok: blocks.length === 0 && openClaims === 0, blocks, openClaims, claimsForRecord };
}

/** Throws 409 quality_gate with the reasons when the book has not passed. */
export async function assertQualityGate(s: GateServices, ctx: RequestCtx, bookId: string, action: string): Promise<QualityGate> {
  const gate = await qualityGate(s, ctx, bookId);
  if (gate.ok) return gate;
  const reasons: string[] = [];
  if (gate.blocks.length > 0) reasons.push(`preflight has ${gate.blocks.length} blocking item${gate.blocks.length === 1 ? '' : 's'}`);
  if (gate.openClaims > 0) {
    const record = gate.claimsForRecord > 0 ? ` (${gate.claimsForRecord} more listed for the record do not block)` : '';
    reasons.push(`${gate.openClaims} open claim${gate.openClaims === 1 ? ' needs' : 's need'} your check${record}`);
  }
  throw new AppError('quality_gate', `This book cannot be ${action} yet: ${reasons.join(' and ')}.`, gate);
}
