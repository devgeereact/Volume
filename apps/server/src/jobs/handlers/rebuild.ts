import { approveBlueprint } from '../approve-blueprint.js';
import { bookChapterCount } from '../book-data.js';
import { JobFailed } from '../errors.js';
import { TERMINAL } from '../queue.js';
import type { JobHandler, JobOutcome } from '../runner.js';
import { blueprintHandler } from './planning.js';
import { writeBookHandler } from './writing.js';

/**
 * Rebuild the whole book from the start (owner, 22 October 2026). POST /books/:id/rebuild sets the new title (when one
 * is given), notes where every section stood and queues this job. The job builds a new blueprint for the title, approves
 * it with the rebuild sync (the body follows the new plan exactly; nothing is deleted), then writes every section the AI
 * writes again, front matter to back matter, and the listing after them. The blueprint version and every section
 * version it saves carry the rebuild's name ("Rebuild 2 from new title: ..."), so the owner can see where each began,
 * and POST /books/:id/rebuilds/:jobId/undo puts the whole book back as it was before.
 *
 * Resume: a re-run after a restart skips what is done (the named blueprint, its approval) and never queues the
 * sections twice.
 */
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

export const rebuildBookHandler: JobHandler = async (jc): Promise<JobOutcome> => {
  const { repos, queue } = jc.services;
  const projectId = jc.job.projectId;
  if (!projectId) throw new JobFailed('Rebuild job is missing its book.');
  const note = str(jc.payload['note']);
  if (!note) throw new JobFailed('Rebuild job is missing its name.');
  const children = await queue.list(jc.ctx, { parentId: jc.job.id, limit: 1000 });
  if (children.length > 0) {
    if (children.some((c) => !TERMINAL.has(c.status))) return { waitForChildren: true };
    return { result: { sections: children.filter((c) => c.kind === 'write_section').length } };
  }
  const book = await repos.books.require(jc.ctx, projectId);
  if (book.status === 'archived') throw new JobFailed('This book is archived. Restore it before rebuilding it.', 'invalid_state');

  let bp = await repos.planning.latestBlueprint(jc.ctx, projectId);
  if (!bp || bp.note !== note) {
    await jc.progress(0.05, 'Building the blueprint for the title');
    const chapterCount = bookChapterCount(book.settings) ?? (await repos.settings.get(jc.ctx, 'book.defaults'))?.chapterCount ?? null;
    await blueprintHandler({ ...jc, payload: { instruction: null, chapterCount, note, keepTitle: true } });
    bp = await repos.planning.latestBlueprint(jc.ctx, projectId);
  }
  if (!bp) throw new JobFailed('The new blueprint could not be built.');
  await jc.checkpoint();
  if ((await repos.books.require(jc.ctx, projectId)).approvedBlueprintId !== bp.id) {
    await jc.progress(0.2, 'Planning every section from the new blueprint');
    await approveBlueprint(jc.services, jc.ctx, projectId, bp.version, { rebuild: true });
  }
  await jc.checkpoint();
  await jc.progress(0.3, 'Writing the book from the front matter to the end');
  return writeBookHandler({ ...jc, payload: { onlyEmpty: false, note } });
};
