import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { parse } from '../http/errors.js';
import { CODE_WRITTEN_KINDS, profileSummary } from '../jobs/book-data.js';
import { conceptCount } from '../jobs/handlers/production.js';
import { assertSpreadCount, matterStartsOn, pictureSettings, picturePlan, requirePictureBook, spreadSections, storyInput } from '../jobs/picture-book.js';
import { imageReservationUsd } from '../jobs/runner.js';
import { promptTemplate } from '../config/book-structure.js';
import { AI_STAGES, type AiStage, type AiStageInput } from '../ports/ai.js';
import { idOf } from './common.js';

const round = (n: number): number => Math.round(n * 10000) / 10000;

const PictureEstimateBody = z
  .object({
    /**
     * Spreads to price; the book's spreads, else the page plan from the KDP colour rules, when left out. Checked
     * against the template's range (spreads.count in config/book-templates/picture-book.json).
     */
    spreads: z.number().int().min(1).max(100).optional(),
    /** Main characters (one reference picture each); the book's, else the story input, else the template default. */
    characters: z.number().int().min(0).max(4).optional(),
  })
  .strict();

export interface PictureEstimate {
  lowUsd: number;
  highUsd: number;
  /** Paid calls: three text stages and one picture per spread and per main character. */
  calls: number;
  spreads: number;
  characters: number;
  /** Story, scene prompts and character reference prompts together. */
  text: { lowUsd: number; highUsd: number; model: string | null };
  /** One picture. priced false: the model list gave no price, so both ends are the job's budget reservation. */
  image: { lowUsd: number; highUsd: number; model: string | null; priced: boolean };
}

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
    return { stage: body.stage, model: await modelFor(body.stage), lowUsd: round(low), highUsd: round(high), calls, sections: sectionCount };
  });

  /**
   * POST /books/:id/picture-book/estimate: what a picture-book run would cost (P7-5, D-045): the story, the scene
   * prompts and the character reference prompts from the AI port's estimate with each stage's model, plus one picture
   * per spread and one reference picture per main character, priced from the model list for the image model.
   */
  app.post('/books/:id/picture-book/estimate', async (req): Promise<PictureEstimate> => {
    const id = idOf(req);
    const body = parse(PictureEstimateBody, req.body ?? {});
    const { book, structure } = await requirePictureBook(s.repos, req.ctx, s.configDir, id);
    const settings = pictureSettings(book.settings);

    if (body.spreads !== undefined) assertSpreadCount(structure.template, body.spreads);
    let spreads = body.spreads;
    if (spreads === undefined) {
      const have = (await spreadSections(s.repos, req.ctx, id)).length;
      if (have > 0) spreads = have;
      else {
        const all = await s.repos.manuscript.listSections(req.ctx, id);
        const on = all.filter((x) => x.enabled);
        const front = all.length ? on.filter((x) => x.area === 'front').length : structure.front.filter((x) => matterStartsOn(x, settings)).length;
        const back = all.length ? on.filter((x) => x.area === 'back').length : structure.back.filter((x) => matterStartsOn(x, settings)).length;
        spreads = (await picturePlan(s.configDir, front, back)).plan.spreads;
      }
    }
    let characters = body.characters;
    if (characters === undefined) {
      const main = (await s.repos.picture.listCharacters(req.ctx, id)).filter((c) => c.main).length;
      const rules = (structure.template?.['storyRules'] ?? {}) as Record<string, unknown>;
      const fallback = (rules['characterCount'] ?? {}) as Record<string, unknown>;
      characters = main || settings.story?.characterCount || (typeof fallback['default'] === 'number' ? fallback['default'] : 2);
    }

    const template = promptTemplate(structure);
    const profile = await profileSummary(s.repos, req.ctx, book.profileId, book);
    const story = storyInput(settings, structure.template, book.idea, spreads);
    const stages: { stage: AiStage; promptId: string; extra: Record<string, unknown> }[] = [
      { stage: 'picture_story', promptId: 'children.picture-book-story', extra: { title: book.title, idea: book.idea, cta: settings.story?.cta ?? null } },
      { stage: 'scene_prompts', promptId: 'children.scene-prompts', extra: { storyResult: settings.storyResult ?? {} } },
      { stage: 'character_reference', promptId: 'children.character-reference', extra: { storyResult: settings.storyResult ?? {}, scenePrompts: {} } },
    ];
    let textLow = 0;
    let textHigh = 0;
    for (const st of stages) {
      const model = await s.runner.resolveModel(req.ctx, id, st.stage);
      const e = await s.ai.estimate(
        st.stage,
        { promptId: st.promptId, variables: { story, template, profile, ...st.extra }, projectId: id },
        model ? { model } : {},
      );
      textLow += e.lowUsd;
      textHigh += e.highUsd;
    }

    const imageModel = await s.runner.resolveModel(req.ctx, id, 'cover_image');
    const priced = s.ai.estimateImage ? await s.ai.estimateImage(imageModel ? { model: imageModel } : {}) : null;
    // The high end is what the job reserves against the budget for each picture (imageReservationUsd: the priced
    // estimate, never below the floor), so the estimate never shows less than the run will hold back.
    const reserve = round(await imageReservationUsd(s.ai, imageModel));
    const image =
      priced && priced.priced
        ? { lowUsd: round(Math.min(priced.lowUsd, reserve)), highUsd: reserve, model: priced.model, priced: true }
        : { lowUsd: reserve, highUsd: reserve, model: priced?.model ?? imageModel, priced: false };
    const pictures = spreads + characters;
    return {
      lowUsd: round(textLow + pictures * image.lowUsd),
      highUsd: round(textHigh + pictures * image.highUsd),
      calls: stages.length + pictures,
      spreads,
      characters,
      text: { lowUsd: round(textLow), highUsd: round(textHigh), model: await s.runner.resolveModel(req.ctx, id, 'picture_story') },
      image,
    };
  });
}
