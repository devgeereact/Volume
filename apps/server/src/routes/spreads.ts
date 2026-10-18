import { SPREAD_LAYOUTS } from '@volume/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { AppError, notFound, parse } from '../http/errors.js';
import {
  assertSpreadCount,
  characterView,
  loadSpreadView,
  pictureBookView,
  pictureSettings,
  PICTURE_TRIM,
  PictureStoryInputSchema,
  requirePictureBook,
  SPREAD_KIND,
  type CharacterView,
  type PictureBookView,
  type SpreadView,
} from '../jobs/picture-book.js';
import { advanceIfWritingComplete } from '../jobs/book-data.js';
import { TERMINAL } from '../jobs/queue.js';
import { imageReservationUsd } from '../jobs/runner.js';
import type { Section } from '../repos/manuscript.js';
import { accepted, EmptyBody, idOf, writer } from './common.js';

/**
 * Picture books (P7-5, D-044, D-045). Every route is workspace-scoped through the repositories; writes need the
 * editor role or above, reads are open to viewers.
 *
 * POST  /books/:id/picture-book          start (or resume) the run: story, scene prompts, references, spread images
 * GET   /books/:id/spreads               PictureBookView
 * GET   /books/:id/characters            { characters: CharacterView[] }
 * POST  /books/:id/picture-book/export   full-bleed PDF, preflight and pack
 * PATCH /spreads/:id                     edit one spread's text or layout -> { spread: SpreadView }
 * POST  /spreads/:id/image               paint one spread again (budget checked first)
 */

const StartBody = z
  .object({
    story: PictureStoryInputSchema.optional(),
    /**
     * Spreads to ask for; the page plan from the KDP colour rules when left out. Checked against the template's range
     * (spreads.count in config/book-templates/picture-book.json).
     */
    spreads: z.number().int().min(1).max(100).optional(),
    /** Write the story again even when the spreads already have text. */
    regenerateStory: z.boolean().optional(),
  })
  .strict()
  .optional();

const SpreadPatch = z
  .object({
    text: z.string().max(5000).optional(),
    layout: z.enum(SPREAD_LAYOUTS).optional(),
    /** The versionId the edit started from; a mismatch returns 409 conflict. */
    baseVersionId: z.string().max(64).nullable().optional(),
  })
  .strict()
  .refine((b) => b.text !== undefined || b.layout !== undefined, { message: 'Send text or layout.' });

async function requireSpread(s: AppServices, req: FastifyRequest): Promise<Section> {
  const section = await s.repos.manuscript.requireSection(req.ctx, idOf(req));
  if (section.kind !== SPREAD_KIND) throw notFound('Spread');
  return section;
}

export function spreadRoutes(app: FastifyInstance, s: AppServices): void {
  app.post('/books/:id/picture-book', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(StartBody, req.body) ?? {};
    const { book, structure } = await requirePictureBook(s.repos, req.ctx, s.configDir, id);
    if (body.spreads !== undefined) assertSpreadCount(structure.template, body.spreads);
    const running = (await s.queue.list(req.ctx, { projectId: id, limit: 200 })).find((j) => j.kind === 'picture_book' && !TERMINAL.has(j.status));
    if (running) throw new AppError('conflict', 'This picture book is already being made. Wait for it to finish or cancel it.', { jobId: running.id });
    if (body.story) {
      const settings = pictureSettings(book.settings);
      await s.repos.books.setSetting(req.ctx, id, 'pictureBook', { ...settings, story: { ...(settings.story ?? {}), ...body.story } });
    }
    // Picture books print on 8.5 x 8.5 in (D-044); the cover wrap and the exports read the book's trim.
    if (book.trim !== PICTURE_TRIM) await s.repos.books.update(req.ctx, id, { trim: PICTURE_TRIM });
    const payload: Record<string, unknown> = { regenerateStory: body.regenerateStory ?? false };
    if (body.spreads !== undefined) payload['spreads'] = body.spreads;
    const job = await s.queue.enqueue(req.ctx, { kind: 'picture_book', projectId: id, payload });
    return accepted(reply, job);
  });

  app.get('/books/:id/spreads', async (req): Promise<PictureBookView> => {
    const id = idOf(req);
    const { book } = await requirePictureBook(s.repos, req.ctx, s.configDir, id);
    const latest = (await s.queue.list(req.ctx, { projectId: id, limit: 200 })).find((j) => j.kind === 'picture_book') ?? null;
    return pictureBookView(s.repos, req.ctx, s.configDir, book, latest);
  });

  app.get('/books/:id/characters', async (req): Promise<{ characters: CharacterView[] }> => {
    const id = idOf(req);
    await requirePictureBook(s.repos, req.ctx, s.configDir, id);
    return { characters: (await s.repos.picture.listCharacters(req.ctx, id)).map(characterView) };
  });

  app.post('/books/:id/picture-book/export', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    parse(EmptyBody, req.body);
    await requirePictureBook(s.repos, req.ctx, s.configDir, id);
    const job = await s.queue.enqueue(req.ctx, { kind: 'picture_export', projectId: id, payload: {} });
    return accepted(reply, job);
  });

  app.patch('/spreads/:id', async (req): Promise<{ spread: SpreadView }> => {
    writer(req);
    const body = parse(SpreadPatch, req.body);
    const section = await requireSpread(s, req);
    if (body.layout !== undefined) await s.repos.manuscript.setSpread(req.ctx, section.id, { layout: body.layout });
    if (body.text !== undefined) {
      const input: Parameters<typeof s.repos.manuscript.saveVersion>[2] = { bodyMd: body.text, source: 'human' };
      if (body.baseVersionId !== undefined) input.baseVersionId = body.baseVersionId;
      await s.repos.manuscript.saveVersion(req.ctx, section.id, input);
      await advanceIfWritingComplete(s.repos, req.ctx, section.projectId);
    }
    await s.bus.publish(req.ctx.workspaceId, {
      projectId: section.projectId,
      type: 'book.updated',
      data: { projectId: section.projectId, part: 'spreads', sectionId: section.id },
    });
    return { spread: await loadSpreadView(s.repos, req.ctx, await s.repos.manuscript.requireSection(req.ctx, section.id)) };
  });

  app.post('/spreads/:id/image', async (req, reply) => {
    writer(req);
    parse(EmptyBody, req.body);
    const section = await requireSpread(s, req);
    if (typeof section.plan['imagePrompt'] !== 'string')
      throw new AppError('invalid_state', 'This spread has no scene prompt yet. Make the picture book first.');
    // D-025: refuse before queueing when one more picture would pass the book's budget (the job checks again).
    // The same per-picture reservation the job makes: the priced estimate, never below the $0.20 floor.
    const book = await s.repos.books.require(req.ctx, section.projectId);
    const reserve = await imageReservationUsd(s.ai, await s.runner.resolveModel(req.ctx, section.projectId, 'cover_image'));
    if (book.costToDateUsd + reserve > book.budgetUsd)
      throw new AppError(
        'budget_exceeded',
        `One more picture needs about $${reserve.toFixed(2)} more than this book's budget allows. Raise the budget first.`,
        {
          scope: 'book',
          limitUsd: book.budgetUsd,
          spentUsd: book.costToDateUsd,
          estimateUsd: reserve,
        },
      );
    const running = (await s.queue.list(req.ctx, { projectId: section.projectId, limit: 500 })).find(
      (j) => j.kind === 'spread_image' && j.payload['sectionId'] === section.id && !TERMINAL.has(j.status),
    );
    if (running) throw new AppError('conflict', 'A new picture for this spread is already being made.', { jobId: running.id });
    const job = await s.queue.enqueue(req.ctx, { kind: 'spread_image', projectId: section.projectId, payload: { sectionId: section.id, regenerate: true } });
    return accepted(reply, job);
  });
}
