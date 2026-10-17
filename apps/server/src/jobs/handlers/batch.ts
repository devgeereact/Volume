import { approveBlueprint } from '../approve-blueprint.js';
import { bookChapterCount } from '../book-data.js';
import { JobFailed } from '../errors.js';
import { TERMINAL } from '../queue.js';
import type { JobContext, JobHandler, JobOutcome } from '../runner.js';
import { blueprintHandler } from './planning.js';
import { writeBookHandler } from './writing.js';

/**
 * Volume mode batch runs (P8-2). batch_run is the parent: one batch_book child per book that is not ready yet, each
 * depending on the one before, so a batch runs one book at a time (plan section 6) and never starves the owner's
 * other work. batch_book drives the existing pipeline for its book: blueprint (when none), approval, then the
 * write_section children of write_book. Every AI call goes through jc.runAi, so the book and monthly budgets apply.
 *
 * Resume: both handlers look at what already exists before doing anything, so a job re-queued after a restart
 * does not repeat finished work or enqueue its children twice.
 */

/** True when this job already enqueued children (a re-run after a restart): wait for them instead. */
async function hasChildren(jc: JobContext): Promise<boolean> {
  const children = await jc.services.queue.list(jc.ctx, { parentId: jc.job.id, limit: 1000 });
  return children.length > 0;
}

export const batchRunHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const batchId = typeof jc.payload['batchId'] === 'string' ? jc.payload['batchId'] : null;
  if (!batchId) throw new JobFailed('Batch job is missing its batch.');
  if (await hasChildren(jc)) return { waitForChildren: true };
  await repos.batches.require(jc.ctx, batchId);
  const items = (await repos.batches.items(jc.ctx, batchId)).filter((i) => i.status !== 'ready' && i.book.status !== 'archived');
  let previous: string | null = null;
  for (const item of items) {
    await jc.checkpoint();
    const child = await jc.enqueueChild({
      kind: 'batch_book',
      projectId: item.bookId,
      payload: { batchId, itemId: item.id, chapterCount: jc.payload['chapterCount'] ?? null },
      dependsOnJobId: previous,
    });
    await repos.batches.setItemJob(jc.ctx, item.id, child.id);
    previous = child.id;
  }
  await jc.emit('batch.updated', { batchId, queued: items.length });
  if (items.length === 0) return { result: { books: 0 } };
  return { waitForChildren: true, result: { books: items.length } };
};

export const batchBookHandler: JobHandler = async (jc): Promise<JobOutcome> => {
  const { repos } = jc.services;
  const projectId = jc.job.projectId;
  if (!projectId) throw new JobFailed('Batch book job is missing its book.');
  if (await hasChildren(jc)) {
    const open = (await jc.services.queue.list(jc.ctx, { parentId: jc.job.id, limit: 1000 })).some((c) => !TERMINAL.has(c.status));
    if (open) return { waitForChildren: true };
  }
  const book = await repos.books.require(jc.ctx, projectId);
  if (book.status === 'archived') throw new JobFailed('This book is archived. Restore it to run it in the batch.', 'invalid_state');
  if (!book.approvedBlueprintId) {
    if (!(await repos.planning.latestBlueprint(jc.ctx, projectId))) {
      await jc.progress(0.1, 'Building the blueprint');
      const chapterCount =
        jc.payload['chapterCount'] ?? bookChapterCount(book.settings) ?? (await repos.settings.get(jc.ctx, 'book.defaults'))?.chapterCount ?? null;
      await blueprintHandler({ ...jc, payload: { instruction: null, chapterCount } });
    }
    await jc.checkpoint();
    // Volume mode is fully automatic: the latest blueprint is approved as the route would (validated first).
    await approveBlueprint(jc.services, jc.ctx, projectId);
  }
  await jc.checkpoint();
  await jc.progress(0.3, 'Writing the book');
  return writeBookHandler({ ...jc, payload: { onlyEmpty: true } });
};
