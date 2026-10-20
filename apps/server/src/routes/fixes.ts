import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import type { RequestCtx } from '../auth/context.js';
import { AppError, notFound, parse } from '../http/errors.js';
import { KeyedLock } from '../lib/keyed-lock.js';
import { AutosaveSchema, type Claim, type Section, type SectionVersion } from '../repos/manuscript.js';
import { advanceIfWritingComplete, houseStyle, profileSummary } from '../jobs/book-data.js';
import { fixHouseStyle, ownerTexts } from '../jobs/house-style-fix.js';
import {
  bookSources,
  CLAIM_FIX_APPROACHES,
  claimFixVariables,
  claimHint,
  claimStatusFor,
  fixCodeChecks,
  locateSentence,
  markersIn,
  spliceSentence,
} from '../jobs/claim-fix.js';
import type { AiStage, AiStageInput } from '../ports/ai.js';
import { writer } from './common.js';

// Claim fixes and autosave (owner request, 19 October 2026). Every route is scoped to
// the book in the path: a section or claim of another book is 404.

const Id = z.string().min(1).max(64);
const BookSection = z.object({ id: Id, sectionId: Id });
const BookClaim = z.object({ id: Id, claimId: Id });

const SuggestBody = z
  .object({ instruction: z.string().trim().max(2000).optional() })
  .strict()
  .optional();
const ApplyBody = z
  .object({
    text: z.string().max(5000),
    /** 'own': the owner rewrote the sentence themselves (saved as owner:claim-fix, claim softened or verified). */
    approach: z.enum([...CLAIM_FIX_APPROACHES, 'own']),
    /** The suggest job the text came from: the version source is ai:claim-fix only when the text is one of its options unchanged. */
    jobId: Id.optional(),
    /** The version the owner saw; a different current version is a 409 conflict. */
    baseVersionId: Id.optional(),
    note: z.string().max(2000).optional(),
  })
  .strict()
  .refine((b) => b.approach === 'remove' || b.text.trim().length > 0, { message: 'Write the new sentence, or choose remove.', path: ['text'] });
const SuggestResult = z.object({ options: z.array(z.object({ text: z.string(), approach: z.string() })) });

const round = (n: number): number => Math.round(n * 10000) / 10000;

/** Cost of stage runs with the models the settings pick (as POST /books/:id/estimate does). */
export async function estimateRuns(
  s: AppServices,
  ctx: RequestCtx,
  bookId: string,
  runs: { stage: AiStage; input: AiStageInput }[],
): Promise<{ lowUsd: number; highUsd: number }> {
  let low = 0;
  let high = 0;
  for (const r of runs) {
    const model = await s.runner.resolveModel(ctx, bookId, r.stage);
    const e = await s.ai.estimate(r.stage, r.input, model ? { model } : {});
    low += e.lowUsd;
    high += e.highUsd;
  }
  return { lowUsd: round(low), highUsd: round(high) };
}

export function fixRoutes(app: FastifyInstance, s: AppServices): void {
  const m = s.repos.manuscript;
  const suggestLock = new KeyedLock();

  const sectionOfBook = async (ctx: RequestCtx, bookId: string, sectionId: string): Promise<Section> => {
    await s.repos.books.require(ctx, bookId);
    const section = await m.requireSection(ctx, sectionId);
    if (section.projectId !== bookId) throw notFound('Section');
    return section;
  };

  const claimOfBook = async (ctx: RequestCtx, bookId: string, claimId: string): Promise<Claim> => {
    await s.repos.books.require(ctx, bookId);
    const claim = await m.requireClaim(ctx, claimId);
    if (claim.projectId !== bookId) throw notFound('Claim');
    return claim;
  };

  /** The claim's sentence in its section's current text, or 409 when the text no longer holds it. */
  const claimInText = async (ctx: RequestCtx, claim: Claim): Promise<{ current: SectionVersion; at: number }> => {
    if (!claim.sectionId) throw new AppError('invalid_state', 'This claim is not in a section, so there is no sentence to fix.');
    const current = await m.currentVersion(ctx, claim.sectionId);
    if (!current) throw new AppError('invalid_state', 'This section has no text yet.');
    const at = locateSentence(current.bodyMd, claim.sentence, claimHint(claim, current.id));
    if (at === null) {
      throw new AppError('conflict', 'The sentence is not in the current text any more. Open the section to check it.', { currentVersionId: current.id });
    }
    return { current, at };
  };

  // ---------- claim fixes ----------

  /**
   * Claims across this book: every claim (open by default; `status=all` for every status), oldest books included,
   * with its section and whether its sentence is still in the section's current text, ordered as the book reads.
   * 200 { counts: { open, verified, softened, removed, author_experience }, items: [{ ...claim, section, inCurrentText }] }.
   */
  app.get('/books/:id/claims/overview', async (req) => {
    const p = parse(z.object({ id: Id }), req.params);
    const q = parse(z.object({ status: z.enum(['open', 'verified', 'softened', 'removed', 'author_experience', 'all']).optional() }), req.query);
    await s.repos.books.require(req.ctx, p.id);
    const all = await m.listClaims(req.ctx, { projectId: p.id });
    const counts = { open: 0, verified: 0, softened: 0, removed: 0, author_experience: 0 } as Record<string, number>;
    for (const c of all) counts[c.status] = (counts[c.status] ?? 0) + 1;
    const want = q.status ?? 'open';
    const chosen = want === 'all' ? all : all.filter((c) => c.status === want);
    const sections = new Map((await m.listSections(req.ctx, p.id)).map((x) => [x.id, x]));
    const texts = new Map<string, string>();
    const textOf = async (sectionId: string): Promise<string> => {
      if (!texts.has(sectionId)) texts.set(sectionId, (await m.currentVersion(req.ctx, sectionId))?.bodyMd ?? '');
      return texts.get(sectionId) ?? '';
    };
    const items: (Claim & {
      section: { id: string; title: string | null; kind: string; number: number | null; enabled: boolean; position: number } | null;
      inCurrentText: boolean;
    })[] = [];
    for (const c of chosen) {
      const sec = c.sectionId ? sections.get(c.sectionId) : undefined;
      items.push({
        ...c,
        section: sec ? { id: sec.id, title: sec.title, kind: sec.kind, number: sec.number, enabled: sec.enabled, position: sec.position } : null,
        inCurrentText: sec ? (await textOf(sec.id)).includes(c.sentence) : false,
      });
    }
    const start = (c: (typeof items)[number]): number => (typeof c.location['start'] === 'number' ? c.location['start'] : 0);
    items.sort((a, b) => (a.section?.position ?? Infinity) - (b.section?.position ?? Infinity) || start(a) - start(b));
    return { counts, items };
  });

  /**
   * 202 with the claim_fix job and its estimate. The job's result is { claimId, sectionId, baseVersionId, sentence, options }.
   * 409 conflict { jobId } while a claim_fix job for the same claim is unfinished; one lock per claim makes the check
   * and the enqueue one step, so a double click cannot pay twice.
   */
  app.post('/books/:id/claims/:claimId/suggest', async (req, reply) => {
    writer(req);
    const p = parse(BookClaim, req.params);
    const body = parse(SuggestBody, req.body) ?? {};
    const claim = await claimOfBook(req.ctx, p.id, p.claimId);
    return suggestLock.run(claim.id, async () => {
      const running = await s.queue.activeWhere(req.ctx, p.id, (j) => j.kind === 'claim_fix' && j.payload['claimId'] === claim.id);
      if (running[0]) throw new AppError('conflict', 'Fixes for this claim are already being made. Wait for them.', { jobId: running[0].id });
      const { current, at } = await claimInText(req.ctx, claim);
      const instruction = body.instruction ? body.instruction : null;
      const variables = await claimFixVariables(s.repos, req.ctx, claim, current.bodyMd, at, instruction);
      const cost = await estimateRuns(s, req.ctx, p.id, [{ stage: 'claim_fix', input: { promptId: 'editing.claim-fix', variables, projectId: p.id } }]);
      const job = await s.queue.enqueue(req.ctx, {
        kind: 'claim_fix',
        projectId: p.id,
        payload: { claimId: claim.id, sectionId: claim.sectionId, instruction },
      });
      void reply.code(202);
      return { jobId: job.id, job, estimate: cost };
    });
  });

  /**
   * Replaces the claim's sentence in the current text as a new version, resolves the claim and reruns the code checks
   * on the new text. Source ai:claim-fix when the text is one of the suggest job's options unchanged, else owner:claim-fix.
   */
  app.post('/books/:id/claims/:claimId/apply', async (req) => {
    writer(req);
    const p = parse(BookClaim, req.params);
    const body = parse(ApplyBody, req.body);
    const claim = await claimOfBook(req.ctx, p.id, p.claimId);
    const { current, at } = await claimInText(req.ctx, claim);
    if (body.baseVersionId !== undefined && body.baseVersionId !== current.id) {
      throw new AppError('conflict', 'This section changed since the fixes were made. Ask for fixes again.', { currentVersionId: current.id });
    }
    const text = body.approach === 'remove' ? '' : body.text.trim();
    let fromAi = false;
    let unchanged = false;
    if (body.jobId) {
      const job = await s.queue.require(req.ctx, body.jobId);
      const result = SuggestResult.safeParse(job.result);
      if (job.kind !== 'claim_fix' || job.payload['claimId'] !== claim.id || !result.success) {
        throw new AppError('validation_failed', 'That job did not make fixes for this claim.', [{ path: 'jobId', message: 'not a fix job for this claim' }]);
      }
      fromAi = true;
      unchanged = result.data.options.some((o) => o.approach === body.approach && o.text.trim() === text);
    }
    const sources = await bookSources(s.repos, req.ctx, p.id);
    const cited = markersIn(text);
    if (cited.some((n) => n < 1 || n > sources.length)) {
      throw new AppError('validation_failed', `Cite only the book's research sources, [[S1]] to [[S${sources.length}]].`, [
        { path: 'text', message: 'unknown source marker' },
      ]);
    }
    const bodyMd = spliceSentence(current.bodyMd, at, claim.sentence, text);
    const version = await m.saveVersion(req.ctx, current.sectionId, {
      bodyMd,
      source: unchanged ? 'ai:claim-fix' : 'owner:claim-fix',
      baseVersionId: current.id,
      note: `Claim fix: ${body.approach}`,
      createdBy: req.ctx.userId,
    });
    if (fromAi) await s.repos.books.setAiDisclosure(req.ctx, p.id, 'text', 'ai_generated');
    // Code checks on the new text (the guardrail report is stored with the version by saveVersion).
    const checks = fixCodeChecks(bodyMd, s.configDir);
    await m.addCheckResults(req.ctx, p.id, current.sectionId, version.id, checks);
    const status = claimStatusFor(body.approach, text, sources.length);
    const sourceUrl = status === 'verified' ? (sources[(cited[0] ?? 1) - 1]?.url ?? null) : null;
    const resolved = await m.resolveClaim(req.ctx, claim.id, status, {
      ownerNote: body.note ?? `Fixed in the editor (${body.approach}).`,
      ...(sourceUrl ? { sourceUrl } : {}),
    });
    await advanceIfWritingComplete(s.repos, req.ctx, p.id);
    await s.bus.publish(req.ctx.workspaceId, {
      projectId: p.id,
      type: 'section.saved',
      data: { sectionId: current.sectionId, versionId: version.id, version: version.version, wordCount: version.wordCount, source: version.source },
    });
    return {
      claim: resolved,
      version,
      checks: { blocks: checks.filter((c) => c.severity === 'block').length, warnings: checks.filter((c) => c.severity === 'warn').length },
    };
  });

  /**
   * The owner's "Fix house style in the whole book": em and en dashes and US spellings in every switched-on section's
   * current text, with the same rules as the automatic fix after writing (the profile bio is never changed). Each
   * changed section gets a new version, so every change can be undone from Versions. No AI, no cost.
   * 200 { sections, dashes, spellings }.
   */
  app.post('/books/:id/fix-house-style', async (req) => {
    writer(req);
    const p = parse(z.object({ id: Id }), req.params);
    const book = await s.repos.books.require(req.ctx, p.id);
    const profile = await profileSummary(s.repos, req.ctx, book.profileId, book);
    const style = houseStyle(s.configDir);
    let sections = 0;
    let dashes = 0;
    let spellings = 0;
    for (const sec of await m.listSections(req.ctx, p.id)) {
      if (!sec.enabled) continue;
      const cur = await m.currentVersion(req.ctx, sec.id);
      if (!cur?.bodyMd) continue;
      const fix = fixHouseStyle(cur.bodyMd, style, { protect: ownerTexts(profile) });
      if (fix.text === cur.bodyMd) continue;
      const version = await m.saveVersion(req.ctx, sec.id, {
        bodyMd: fix.text,
        source: 'owner:style-fix',
        baseVersionId: cur.id,
        note: 'House style fix for the whole book',
        createdBy: req.ctx.userId,
      });
      await m.addCheckResults(req.ctx, p.id, sec.id, version.id, fixCodeChecks(fix.text, s.configDir));
      await s.bus.publish(req.ctx.workspaceId, {
        projectId: p.id,
        type: 'section.saved',
        data: { sectionId: sec.id, versionId: version.id, version: version.version, wordCount: version.wordCount, source: version.source },
      });
      sections++;
      dashes += fix.dashes;
      spellings += fix.spellings;
    }
    return { sections, dashes, spellings };
  });

  // ---------- autosave ----------

  /** 200 with the saved version plus coalesced. 409 conflict { details: { currentVersionId } } when baseVersionId is not the current version. */
  app.put('/books/:id/sections/:sectionId/autosave', async (req) => {
    writer(req);
    const p = parse(BookSection, req.params);
    const body = parse(AutosaveSchema, req.body);
    const section = await sectionOfBook(req.ctx, p.id, p.sectionId);
    const input: Parameters<typeof m.autosave>[2] = { bodyMd: body.bodyMd, baseVersionId: body.baseVersionId };
    if (body.baseRevision !== undefined) input.baseRevision = body.baseRevision;
    if (body.content !== undefined) input.content = body.content;
    const { version: v, coalesced } = await m.autosave(req.ctx, section.id, input);
    await advanceIfWritingComplete(s.repos, req.ctx, p.id);
    await s.bus.publish(req.ctx.workspaceId, {
      projectId: p.id,
      type: 'section.saved',
      data: { sectionId: section.id, versionId: v.id, version: v.version, wordCount: v.wordCount, source: v.source, coalesced },
    });
    return { ...v, coalesced };
  });
}
