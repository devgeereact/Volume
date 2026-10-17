import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { AppError, parse } from '../http/errors.js';
import { approveBlueprint } from '../jobs/approve-blueprint.js';
import { bookChapterCount } from '../jobs/book-data.js';
import { BlueprintPartKeySchema, BlueprintSchema } from '../ports/ai.js';
import { accepted, idOf, writer } from './common.js';

const TitlesBody = z
  .object({
    instruction: z.string().max(2000).optional(),
    /** A direction key from an earlier title set (the latest set unless titleSetId is given). */
    directionKey: z.string().trim().min(1).max(64).optional(),
    titleSetId: z.string().min(1).max(64).optional(),
    /** A direction the owner wrote. */
    direction: z
      .object({
        key: z.string().trim().min(1).max(64).optional(),
        label: z.string().trim().min(1).max(300),
        angle: z.string().max(2000).optional(),
        audience: z.string().max(2000).optional(),
        promise: z.string().max(2000).optional(),
      })
      .optional(),
  })
  .refine((b) => !(b.directionKey && b.direction), { message: 'Send directionKey or direction, not both.' });

const VersionParams = z.object({ id: z.string().min(1).max(64), version: z.coerce.number().int().min(1) });

export function planningRoutes(app: FastifyInstance, s: AppServices): void {
  const { books, planning } = s.repos;

  // ---------- research ----------

  app.post('/books/:id/research', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(z.object({ audienceHint: z.string().max(2000).optional() }).optional(), req.body) ?? {};
    const book = await books.require(req.ctx, id);
    const run = await planning.createRun(req.ctx, id, { idea: book.idea, notes: book.notes, audienceHint: body.audienceHint ?? null }, null);
    const job = await s.queue.enqueue(req.ctx, { kind: 'research', projectId: id, payload: { runId: run.id, audienceHint: body.audienceHint ?? null } });
    await s.db.updateTable('researchRuns').set({ jobId: job.id }).where('id', '=', run.id).where('workspaceId', '=', req.ctx.workspaceId).execute();
    return { ...accepted(reply, job), runId: run.id };
  });

  app.get('/books/:id/research', async (req) => {
    const id = idOf(req);
    await books.require(req.ctx, id);
    const runs = await planning.listRuns(req.ctx, id);
    const latest = runs[0] ?? null;
    return { latest: latest ? { ...latest, sources: await planning.listSources(req.ctx, { runId: latest.id }) } : null, runs };
  });

  app.get('/research-runs/:id', async (req) => {
    const run = await planning.requireRun(req.ctx, idOf(req));
    return { ...run, sources: await planning.listSources(req.ctx, { runId: run.id }) };
  });

  app.patch('/research-sources/:id', async (req) => {
    writer(req);
    const body = parse(z.object({ useInBook: z.boolean() }), req.body);
    return planning.setSourceUse(req.ctx, idOf(req), body.useInBook);
  });

  // ---------- titles ----------

  app.post('/books/:id/title-sets', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(TitlesBody.optional(), req.body) ?? {};
    await books.require(req.ctx, id);
    // Titles for the direction the owner chose: one of an earlier set's directions (by key), or one they wrote.
    // With neither, the job suggests directions and writes titles for the first one.
    let direction: Record<string, unknown> | null = null;
    let directions: unknown[] | null = null;
    if (body.directionKey) {
      const set = body.titleSetId ? await planning.requireTitleSet(req.ctx, body.titleSetId) : ((await planning.listTitleSets(req.ctx, id))[0] ?? null);
      if (!set || set.projectId !== id) throw new AppError('validation_failed', 'There is no title set to choose a direction from. Generate titles first.');
      const found = set.directions.find(
        (d): d is Record<string, unknown> => !!d && typeof d === 'object' && (d as Record<string, unknown>)['key'] === body.directionKey,
      );
      if (!found) throw new AppError('validation_failed', `That title set has no direction "${body.directionKey}".`);
      direction = found;
      directions = set.directions;
    } else if (body.direction) {
      direction = { key: 'owner', angle: '', audience: '', promise: '', ...body.direction };
    }
    const job = await s.queue.enqueue(req.ctx, { kind: 'titles', projectId: id, payload: { instruction: body.instruction ?? null, direction, directions } });
    return accepted(reply, job);
  });

  app.get('/books/:id/title-sets', async (req) => {
    const id = idOf(req);
    await books.require(req.ctx, id);
    return { items: await planning.listTitleSets(req.ctx, id) };
  });

  app.patch('/title-sets/:id/options/:index', async (req) => {
    writer(req);
    const p = parse(z.object({ id: z.string().min(1).max(64), index: z.coerce.number().int().min(0).max(1000) }), req.params);
    const body = parse(z.object({ favourite: z.boolean() }), req.body);
    return { titleSet: await planning.setFavourite(req.ctx, p.id, p.index, body.favourite) };
  });

  app.post('/title-sets/:id/choose', async (req) => {
    writer(req);
    const body = parse(
      z.object({ index: z.number().int().min(0), title: z.string().trim().min(1).max(255).optional(), subtitle: z.string().max(255).optional() }),
      req.body,
    );
    const set = await planning.chooseTitle(req.ctx, idOf(req), body.index);
    const option = (set.options[body.index] ?? {}) as { title?: string; subtitle?: string };
    const title = body.title ?? option.title ?? null;
    const subtitle = body.subtitle ?? option.subtitle ?? null;
    const book = await books.update(req.ctx, set.projectId, { title, subtitle });
    await books.advanceStage(req.ctx, set.projectId, 'titles');
    return { titleSet: set, book };
  });

  // ---------- blueprints ----------

  app.post('/books/:id/blueprints', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body =
      parse(z.object({ instruction: z.string().max(4000).optional(), chapterCount: z.number().int().min(1).max(60).optional() }).optional(), req.body) ?? {};
    const book = await books.require(req.ctx, id);
    // Without a chapter count in the request: the count chosen in the new-book wizard (settings.chapters), then the
    // workspace default for new books (setting book.defaults) when set.
    const chapterCount = body.chapterCount ?? bookChapterCount(book.settings) ?? (await s.repos.settings.get(req.ctx, 'book.defaults'))?.chapterCount ?? null;
    const job = await s.queue.enqueue(req.ctx, { kind: 'blueprint', projectId: id, payload: { instruction: body.instruction ?? null, chapterCount } });
    return accepted(reply, job);
  });

  app.get('/books/:id/blueprint', async (req) => {
    const id = idOf(req);
    await books.require(req.ctx, id);
    const latest = await planning.latestBlueprint(req.ctx, id);
    if (!latest) return { blueprint: null, validation: null };
    const v = BlueprintSchema.safeParse(latest.data);
    return {
      blueprint: latest,
      validation: v.success ? { ok: true, issues: [] } : { ok: false, issues: v.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
    };
  });

  app.get('/books/:id/blueprint/versions', async (req) => {
    const id = idOf(req);
    await books.require(req.ctx, id);
    return { items: await planning.blueprintVersions(req.ctx, id) };
  });

  app.get('/books/:id/blueprint/versions/:version', async (req) => {
    const p = parse(VersionParams, req.params);
    return planning.blueprintByVersion(req.ctx, p.id, p.version);
  });

  /** Owner edits: merge the given top-level parts into a new draft version. */
  app.patch('/books/:id/blueprint', async (req) => {
    writer(req);
    const id = idOf(req);
    const body = parse(
      z.object({ parts: z.record(z.string(), z.unknown()), note: z.string().max(500).optional(), baseVersion: z.number().int().optional() }),
      req.body,
    );
    const latest = await planning.latestBlueprint(req.ctx, id);
    if (!latest) throw new AppError('invalid_state', 'Build the blueprint first.');
    if (body.baseVersion !== undefined && body.baseVersion !== latest.version) {
      throw new AppError('conflict', 'The blueprint changed since you opened it.', { latestVersion: latest.version });
    }
    const merged = { ...latest.data, ...body.parts };
    const v = BlueprintSchema.safeParse(merged);
    if (!v.success)
      throw new AppError(
        'validation_failed',
        'The blueprint is not complete.',
        v.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    return planning.addBlueprintVersion(req.ctx, id, v.data, { source: 'human', note: body.note ?? 'Edited by the owner', parentVersionId: latest.id });
  });

  app.post('/books/:id/blueprint/regenerate', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(z.object({ part: BlueprintPartKeySchema, instruction: z.string().max(4000).optional() }), req.body);
    const latest = await planning.latestBlueprint(req.ctx, id);
    if (!latest) throw new AppError('invalid_state', 'Build the blueprint first.');
    const job = await s.queue.enqueue(req.ctx, { kind: 'blueprint_part', projectId: id, payload: { part: body.part, instruction: body.instruction ?? null } });
    return accepted(reply, job);
  });

  app.post('/books/:id/blueprint/approve', async (req) => {
    writer(req);
    const id = idOf(req);
    const body = parse(z.object({ version: z.number().int().min(1).optional() }).optional(), req.body) ?? {};
    return approveBlueprint(s, req.ctx, id, body.version);
  });
}
