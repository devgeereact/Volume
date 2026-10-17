import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { readModelDefaults } from '../config/catalogue.js';
import { AppError, parse } from '../http/errors.js';
import { assertQualityGate } from '../jobs/quality-gate.js';
import type { RequestCtx } from '../auth/context.js';
import { BookInputSchema, BookListQuerySchema, BookPatchSchema, type Book } from '../repos/books.js';
import type { BookExtras } from '../repos/library.js';
import { idOf, owner, writer } from './common.js';

export function bookRoutes(app: FastifyInstance, s: AppServices): void {
  const r = s.repos.books;

  /** A book with its list extras (words, sections, running job, cover, formats, pack version). */
  const full = async (ctx: RequestCtx, book: Book): Promise<Book & BookExtras> => ({ ...book, ...(await s.repos.library.extrasFor(ctx, book)) });

  app.get('/books', async (req) => {
    const books = await r.list(req.ctx, parse(BookListQuerySchema, req.query));
    const extras = await s.repos.library.extras(req.ctx, books);
    return { items: books.map((b) => ({ ...b, ...extras.get(b.id) })) };
  });

  app.post('/books', async (req, reply) => {
    writer(req);
    const body = parse(BookInputSchema, req.body);
    // Budgets are the owner's (D-047); an editor's new book takes the workspace default.
    if (body.budgetUsd !== undefined) owner(req);
    const profile = await s.repos.profiles.require(req.ctx, body.profileId);
    if (profile.status !== 'active') throw new AppError('invalid_state', 'Restore this pen name before starting a book with it.');
    const settings = await s.repos.settings.all(req.ctx);
    const defaults = await readModelDefaults(s.config.configDir);
    const cfgBudget = Number(defaults.budgets?.['perBookDefaultUSD'] ?? 15);
    if (body.bookTypeId === undefined && profile.defaultBookTypeId) body.bookTypeId = profile.defaultBookTypeId;
    // Workspace defaults for new books (setting book.defaults) fill what the request and the pen name left out.
    const d = settings['book.defaults'] ?? {};
    if (body.bookTypeId === undefined && d.bookTypeId !== undefined) body.bookTypeId = d.bookTypeId;
    if (body.trim === undefined && d.trim !== undefined) body.trim = d.trim;
    if (body.paper === undefined && d.paper !== undefined) body.paper = d.paper;
    if (body.interiorThemeId === undefined && d.interiorThemeId !== undefined) body.interiorThemeId = d.interiorThemeId;
    if (body.coverStyleId === undefined && d.coverStyleId !== undefined) body.coverStyleId = d.coverStyleId;
    if (body.wordTarget === undefined && d.wordTarget !== undefined) body.wordTarget = d.wordTarget;
    const book = await r.create(req.ctx, body, {
      budgetUsd: settings['budget.book_default_usd'] ?? cfgBudget,
      illustrativeLine: profile.illustrativeLineDefault,
    });
    void reply.code(201);
    return full(req.ctx, book);
  });

  app.get('/books/:id', async (req) => {
    const id = idOf(req);
    const book = await r.require(req.ctx, id);
    const tree = await s.repos.manuscript.tree(req.ctx, id);
    const jobs = await s.queue.list(req.ctx, { projectId: id, limit: 10 });
    return { ...(await full(req.ctx, book)), totals: tree.totals, recentJobs: jobs };
  });

  app.patch('/books/:id', async (req) => {
    writer(req);
    const id = idOf(req);
    const patch = parse(BookPatchSchema, req.body);
    if (patch.budgetUsd !== undefined) owner(req);
    if (patch.profileId) await s.repos.profiles.require(req.ctx, patch.profileId);
    return full(req.ctx, await r.update(req.ctx, id, patch));
  });

  for (const action of ['archive', 'restore', 'publish', 'unpublish'] as const) {
    app.post(`/books/:id/${action}`, async (req) => {
      writer(req);
      const id = idOf(req);
      // Volume mode: a book that is or ever was in a batch is marked published only after preflight and claims review
      // (P8-2). The gate runs now, so a `ready` mark that later edits made stale does not count.
      if (action === 'publish') {
        await r.require(req.ctx, id);
        if (await s.repos.batches.everBatched(req.ctx, id)) {
          try {
            await assertQualityGate(s, req.ctx, id, 'marked published');
          } catch (err) {
            // A stale `ready` mark goes back to planned, so the planner shows the book needs another look.
            const item = await s.repos.batches.itemOfBook(req.ctx, id);
            if (item) await s.repos.batches.setItemStatus(req.ctx, item.id, 'planned');
            throw err;
          }
        }
      }
      const book = await r.setStatus(req.ctx, id, action);
      await s.bus.publish(req.ctx.workspaceId, { projectId: book.id, type: 'book.updated', data: { projectId: book.id, status: book.status } });
      return full(req.ctx, book);
    });
  }

  // Owner-confirmed delete: archived first, body { confirm: "<exact title>" }. 409 otherwise.
  app.delete('/books/:id', async (req, reply) => {
    writer(req);
    const body = parse(z.object({ confirm: z.string().max(300).default('') }), req.body ?? {});
    await r.deleteArchived(req.ctx, idOf(req), body.confirm);
    return reply.code(204).send();
  });

  app.post('/books/:id/duplicate', async (req, reply) => {
    writer(req);
    const source = await r.require(req.ctx, idOf(req));
    const copy = await r.insertCopy(req.ctx, source, {});
    const bp = source.approvedBlueprintId
      ? await s.repos.planning.blueprintById(req.ctx, source.approvedBlueprintId)
      : await s.repos.planning.latestBlueprint(req.ctx, source.id);
    if (bp) {
      const nb = await s.repos.planning.addBlueprintVersion(req.ctx, copy.id, bp.data, { source: 'copy', note: `Copied from ${source.title ?? source.id}` });
      if (bp.status === 'approved') {
        await s.repos.planning.approveBlueprint(req.ctx, nb.id);
        await r.setApprovedBlueprint(req.ctx, copy.id, nb.id, null, null);
      }
    }
    await s.repos.manuscript.copyManuscript(req.ctx, source.id, copy.id);
    void reply.code(201);
    return full(req.ctx, await r.require(req.ctx, copy.id));
  });

  app.get('/books/:id/costs', async (req) => {
    const id = idOf(req);
    const book = await r.require(req.ctx, id);
    return { budgetUsd: book.budgetUsd, costToDateUsd: book.costToDateUsd, runs: await s.repos.production.listPromptRuns(req.ctx, id) };
  });

  // ---------- Library live panel and archive ----------

  app.get('/activity', async (req) => {
    const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(200).default(30) }), req.query);
    return { items: await s.repos.library.activity(req.ctx, q.limit) };
  });

  app.get('/archive', async (req) => ({ items: await s.repos.library.archive(req.ctx) }));
}
