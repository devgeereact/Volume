import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { parse } from '../http/errors.js';
import { CODE_WRITTEN_KINDS, profileSummary } from '../jobs/book-data.js';
import { conceptCount } from '../jobs/handlers/production.js';
import { AI_STAGES, type AiStage, type AiStageInput } from '../ports/ai.js';
import { idOf } from './common.js';

/** Stages that run once per section; the estimate sums over the sections. */
const PER_SECTION: ReadonlySet<AiStage> = new Set(['writing', 'summarise', 'checks', 'editing', 'weave']);

/**
 * POST /books/:id/estimate: what a stage would cost before it runs, from the AI port's estimate with the model the
 * settings pick (book, then profile, then workspace, then config defaults: D-019). Writing a section also runs the
 * summary and the checks, so a writing estimate includes them (each with its own model).
 */
export function estimateRoutes(app: FastifyInstance, s: AppServices): void {
  app.post('/books/:id/estimate', async (req) => {
    const id = idOf(req);
    const body = parse(
      z.object({ stage: z.enum(AI_STAGES), sectionIds: z.array(z.string().min(1).max(64)).max(1000).optional(), partTarget: z.string().max(40).optional() }),
      req.body,
    );
    const book = await s.repos.books.require(req.ctx, id);
    const blueprint = book.approvedBlueprintId
      ? await s.repos.planning.blueprintById(req.ctx, book.approvedBlueprintId)
      : await s.repos.planning.latestBlueprint(req.ctx, id);
    const profile = await profileSummary(s.repos, req.ctx, book.profileId, book);
    const base = {
      title: book.title,
      subtitle: book.subtitle,
      idea: book.idea,
      notes: book.notes,
      template: book.template,
      bookTypeId: book.bookTypeId,
      profile,
      blueprint: blueprint?.data ?? null,
      wordTarget: book.wordTarget,
      // Cover concepts are one paid image each: the estimate counts as many as the book asks for.
      conceptCount: conceptCount(book.settings),
    };

    const models = new Map<AiStage, string | null>();
    const modelFor = async (stage: AiStage): Promise<string | null> => {
      if (!models.has(stage)) models.set(stage, await s.runner.resolveModel(req.ctx, id, stage));
      return models.get(stage) ?? null;
    };
    let low = 0;
    let high = 0;
    let calls = 0;
    const add = async (stage: AiStage, input: AiStageInput): Promise<void> => {
      const model = await modelFor(stage);
      const e = await s.ai.estimate(stage, input, model ? { model } : {});
      low += e.lowUsd;
      high += e.highUsd;
      calls += 1;
    };

    let sectionCount: number | null = null;
    if (PER_SECTION.has(body.stage)) {
      // Only sections the AI writes: not code pages, not owner pages, and not acknowledgements with no names to thank
      // (the writer saves a placeholder for the owner then, with no AI call).
      const noThanks = (profile['acknowledgementNames'] as string[]).length === 0;
      const all = (await s.repos.manuscript.listSections(req.ctx, id)).filter(
        (x) =>
          x.enabled &&
          !CODE_WRITTEN_KINDS.has(x.kind) &&
          x.kind !== 'part' &&
          x.plan['writer'] !== 'owner' &&
          x.plan['writer'] !== 'code' &&
          !(body.stage === 'writing' && x.kind === 'acknowledgements' && noThanks),
      );
      const chosen = body.sectionIds
        ? all.filter((x) => body.sectionIds?.includes(x.id))
        : body.stage === 'writing'
          ? all.filter((x) => x.status !== 'done')
          : all.filter((x) => x.currentVersionId);
      sectionCount = chosen.length;
      for (const sec of chosen) {
        const markdown = sec.currentVersionId ? ((await s.repos.manuscript.getVersion(req.ctx, sec.currentVersionId))?.bodyMd ?? '') : '';
        const section = { kind: sec.kind, title: sec.title, number: sec.number, word_target: sec.wordTarget, ...sec.plan };
        const v = { ...base, section, markdown };
        if (body.stage === 'writing') {
          const promptId =
            sec.kind === 'chapter'
              ? 'writing.chapter'
              : sec.kind === 'introduction'
                ? 'writing.introduction'
                : sec.kind === 'conclusion'
                  ? 'writing.conclusion'
                  : 'writing.front-matter';
          await add('writing', { promptId, variables: v, projectId: id });
          // Each written section is then summarised and checked.
          const target = ' word'.repeat(Math.max(200, Math.min(sec.wordTarget ?? 2500, 20000)));
          await add('summarise', { promptId: 'checks.summarise-and-ledger', variables: { markdown: target, section: { title: sec.title } }, projectId: id });
          await add('checks', { promptId: 'checks.claims-and-consistency', variables: { markdown: target, section: { title: sec.title } }, projectId: id });
        } else {
          const notes = body.stage === 'weave' ? await s.repos.manuscript.listNotes(req.ctx, { sectionId: sec.id, status: 'open' }) : [];
          await add(body.stage, { variables: { ...v, pass: 'line', notes: notes.map((n) => ({ id: n.id, note: n.note })) }, projectId: id });
        }
      }
    } else {
      const extra: Record<string, unknown> = {};
      if (body.stage === 'blueprint_part') extra['part'] = body.partTarget ?? 'summary';
      if (body.stage === 'marketing') extra['kinds'] = ['tiktok_script', 'instagram_caption', 'launch_email'];
      await add(body.stage, { variables: { ...base, ...extra }, projectId: id });
    }
    const round = (n: number): number => Math.round(n * 10000) / 10000;
    return { stage: body.stage, model: await modelFor(body.stage), lowUsd: round(low), highUsd: round(high), calls, sections: sectionCount };
  });
}
