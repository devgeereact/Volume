import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import type { RequestCtx } from '../auth/context.js';
import { AppError, parse } from '../http/errors.js';
import { approveBlueprint } from '../jobs/approve-blueprint.js';
import { tidyTitleChars } from '../jobs/house-style-fix.js';
import { isPictureBook, pictureStructure } from '../jobs/picture-book.js';
import { TERMINAL, type Job } from '../jobs/queue.js';
import { accepted, idOf, writer } from './common.js';

/**
 * Whole-book rebuild (owner, 22 October 2026). See jobs/handlers/rebuild.ts for the job.
 *
 * POST /books/:id/rebuild { title?, subtitle? }: 202 { jobId, job, number, note }. Sets the new title first (when
 *   given), keeps where every section stood (its current version and whether it was on) in the job, and queues
 *   rebuild_book. 409 conflict while a writing, blueprint or rebuild job runs on the book; 409 invalid_state for a
 *   picture book (its own pipeline) or an archived book.
 * GET /books/:id/rebuilds: { planTitle, hasText, rebuilds: [{ jobId, number, note, status, fromTitle, toTitle, createdAt,
 *   undoneAt }] }, newest first. planTitle is the title the approved blueprint was planned for.
 * POST /books/:id/rebuilds/:jobId/undo: puts the book back as it was before that rebuild: the title, the blueprint that
 *   was approved, and each section's text and on/off state. Every restored section gets a new version named
 *   "Back to before rebuild N", so the rebuild's text also stays in Versions. 409 while a job still runs on the book.
 */

/** Jobs that change the plan or the text: a rebuild waits until none runs, and so does an undo. */
const BUSY_KINDS: ReadonlySet<string> = new Set(['blueprint', 'blueprint_part', 'write_book', 'write_section', 'rebuild_book', 'batch_book', 'edit_pass']);

const RebuildBody = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    subtitle: z.string().trim().max(255).nullable().optional(),
  })
  .strict()
  .optional();

interface Snapshot {
  sections: { id: string; versionId: string | null; enabled: boolean }[];
  fromTitle: string | null;
  fromSubtitle: string | null;
  fromBlueprintVersion: number | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

function snapshotOf(job: Job): Snapshot | null {
  const s = job.payload['snapshot'];
  if (!s || typeof s !== 'object') return null;
  return s as Snapshot;
}

async function busyJob(s: AppServices, ctx: RequestCtx, projectId: string): Promise<Job | null> {
  const active = await s.queue.list(ctx, { projectId, active: true, limit: 200 });
  return active.find((j) => BUSY_KINDS.has(j.kind)) ?? null;
}

export function rebuildRoutes(app: FastifyInstance, s: AppServices): void {
  app.post('/books/:id/rebuild', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(RebuildBody, req.body) ?? {};
    const book = await s.repos.books.require(req.ctx, id);
    if (book.status === 'archived') throw new AppError('invalid_state', 'This book is archived. Restore it before rebuilding it.');
    if (isPictureBook(await pictureStructure(s.configDir, book)))
      throw new AppError('invalid_state', 'Picture books are rebuilt from the Spreads step: make the story again there.');
    const busy = await busyJob(s, req.ctx, id);
    if (busy) throw new AppError('conflict', 'A job is still working on this book. Wait for it to finish, or cancel it, then rebuild.', { jobId: busy.id });

    const previous = await s.queue.list(req.ctx, { projectId: id, kind: 'rebuild_book', limit: 1000 });
    const number = previous.length + 1;
    const newTitle = body.title ? tidyTitleChars(body.title) : null;
    const approved = book.approvedBlueprintId ? await s.repos.planning.blueprintById(req.ctx, book.approvedBlueprintId) : null;
    // A title chosen on Titles is saved to the book at once, so "new" means different from the plan the text follows.
    const target = newTitle ?? book.title;
    const titleChanged = target !== null && target !== (str(approved?.data['title']) ?? book.title);
    const note = titleChanged ? `Rebuild ${number} from new title: ${target}` : `Rebuild ${number}: whole book from the start`;

    const sections = await s.repos.manuscript.listSections(req.ctx, id);
    const snapshot: Snapshot = {
      sections: sections.map((x) => ({ id: x.id, versionId: x.currentVersionId, enabled: x.enabled })),
      fromTitle: book.title,
      fromSubtitle: book.subtitle,
      fromBlueprintVersion: approved?.version ?? null,
    };
    if (newTitle !== null || body.subtitle !== undefined) {
      await s.repos.books.update(req.ctx, id, {
        ...(newTitle !== null ? { title: newTitle } : {}),
        ...(body.subtitle !== undefined ? { subtitle: body.subtitle ? tidyTitleChars(body.subtitle) : null } : {}),
      });
    }
    const after = await s.repos.books.require(req.ctx, id);
    const job = await s.queue.enqueue(req.ctx, {
      kind: 'rebuild_book',
      projectId: id,
      payload: { number, note, toTitle: after.title, toSubtitle: after.subtitle, snapshot },
    });
    await s.bus.publish(req.ctx.workspaceId, { projectId: id, type: 'book.updated', data: { projectId: id, part: 'rebuild', jobId: job.id } });
    return { ...accepted(reply, job), number, note };
  });

  app.get('/books/:id/rebuilds', async (req) => {
    const id = idOf(req);
    const book = await s.repos.books.require(req.ctx, id);
    const undone = (book.settings['rebuildsUndone'] ?? {}) as Record<string, number>;
    const jobs = await s.queue.list(req.ctx, { projectId: id, kind: 'rebuild_book', limit: 1000 });
    const approved = book.approvedBlueprintId ? await s.repos.planning.blueprintById(req.ctx, book.approvedBlueprintId) : null;
    return {
      // The title the approved blueprint (and so the text) was planned for; differs from the book's after a new choice.
      planTitle: str(approved?.data['title']),
      // Words written so far: a rebuild is offered once the book has text.
      hasText: (await s.repos.manuscript.listSections(req.ctx, id)).some((x) => x.currentVersionId !== null),
      rebuilds: jobs.map((j) => ({
        jobId: j.id,
        number: typeof j.payload['number'] === 'number' ? j.payload['number'] : null,
        note: str(j.payload['note']),
        status: j.status,
        fromTitle: snapshotOf(j)?.fromTitle ?? null,
        toTitle: str(j.payload['toTitle']),
        createdAt: j.createdAt,
        undoneAt: undone[j.id] ?? null,
      })),
    };
  });

  app.post('/books/:id/rebuilds/:jobId/undo', async (req) => {
    writer(req);
    const id = idOf(req);
    const jobId = parse(z.object({ jobId: z.string().min(1).max(64) }), req.params).jobId;
    const book = await s.repos.books.require(req.ctx, id);
    const job = (await s.queue.list(req.ctx, { projectId: id, kind: 'rebuild_book', limit: 1000 })).find((j) => j.id === jobId);
    if (!job) throw new AppError('not_found', 'That rebuild was not found.');
    const snap = snapshotOf(job);
    if (!snap) throw new AppError('invalid_state', 'This rebuild kept no record of the book before it, so it cannot be undone.');
    if (!TERMINAL.has(job.status)) throw new AppError('conflict', 'This rebuild is still running. Cancel it first, then undo it.', { jobId: job.id });
    const busy = await busyJob(s, req.ctx, id);
    if (busy) throw new AppError('conflict', 'A job is still working on this book. Wait for it to finish, or cancel it, then undo.', { jobId: busy.id });
    const number = typeof job.payload['number'] === 'number' ? job.payload['number'] : null;
    const note = number ? `Back to before rebuild ${number}` : 'Back to before the rebuild';

    // The plan first: the blueprint that was approved, with the rebuild sync, puts the body back in its old shape.
    if (snap.fromBlueprintVersion !== null) await approveBlueprint(s, req.ctx, id, snap.fromBlueprintVersion, { rebuild: true });
    await s.repos.books.update(req.ctx, id, { title: snap.fromTitle, subtitle: snap.fromSubtitle });
    // Then each section's text and on/off state. Sections the rebuild added are switched off (their text stays).
    const kept = new Map(snap.sections.map((x) => [x.id, x]));
    let restored = 0;
    for (const sec of await s.repos.manuscript.listSections(req.ctx, id)) {
      const was = kept.get(sec.id);
      if (!was) {
        if (sec.enabled) await s.repos.manuscript.updateSectionPlan(req.ctx, sec.id, { enabled: false });
        continue;
      }
      if (was.enabled !== sec.enabled) await s.repos.manuscript.updateSectionPlan(req.ctx, sec.id, { enabled: was.enabled });
      if (was.versionId && was.versionId !== sec.currentVersionId) {
        await s.repos.manuscript.restoreVersion(req.ctx, sec.id, was.versionId, note);
        restored += 1;
      }
      if (!was.versionId && sec.currentVersionId) {
        // Written for the first time by the rebuild: nothing to go back to, so it is switched off; its text stays in Versions.
        await s.repos.manuscript.updateSectionPlan(req.ctx, sec.id, { enabled: false });
      }
    }
    await s.repos.books.setSetting(req.ctx, id, 'rebuildsUndone', {
      ...((book.settings['rebuildsUndone'] ?? {}) as Record<string, number>),
      [job.id]: Date.now(),
    });
    await s.bus.publish(req.ctx.workspaceId, { projectId: id, type: 'book.updated', data: { projectId: id, part: 'rebuild', undone: job.id } });
    return { restored, note, book: await s.repos.books.require(req.ctx, id) };
  });
}
