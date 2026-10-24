import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import type { RequestCtx } from '../auth/context.js';
import { AppError, parse } from '../http/errors.js';
import { bookWritingComplete, buildExportBook, packHashOf } from '../jobs/book-data.js';
import { KeyedLock } from '../lib/keyed-lock.js';
import { assertQualityGate, preflightAcks, preflightReport } from '../jobs/quality-gate.js';
import { EXPORT_KINDS } from '../ports/export.js';
import { MARKETING_KINDS, MarketingPatchSchema } from '../repos/production.js';
import { CoverBriefSchema, CoverTypographySchema } from './body-schemas.js';
import { accepted, idOf, writer } from './common.js';

function safeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

/** Streams an asset by id (never by a path from the request). */
export async function sendAsset(s: AppServices, ctx: RequestCtx, reply: FastifyReply, assetId: string, inline = false): Promise<FastifyReply> {
  const { meta, body } = await s.blobs.stream(ctx, assetId);
  void reply
    .header('Content-Type', meta.mime)
    .header('Content-Length', String(meta.bytes))
    .header(
      'Content-Disposition',
      `${inline && meta.mime.startsWith('image/') && meta.mime !== 'image/svg+xml' ? 'inline' : 'attachment'}; filename="${safeFilename(meta.filename)}"`,
    )
    .header('Content-Security-Policy', "default-src 'none'; sandbox")
    .header('Cache-Control', 'private, max-age=0, must-revalidate');
  if (meta.sha256) void reply.header('ETag', `"${meta.sha256}"`);
  return reply.send(body);
}

/**
 * Marketing quotes the finished book (D-049): refused with 409 writing_incomplete until writing is complete (the
 * D-048 predicate, every switched-on section the AI or the owner writes has a current version).
 */
export async function requireWritingComplete(s: AppServices, ctx: RequestCtx, bookId: string): Promise<void> {
  if (!(await bookWritingComplete(s.repos, ctx, bookId))) {
    throw new AppError('writing_incomplete', 'Finish writing every chapter before marketing.');
  }
}

export function productionRoutes(app: FastifyInstance, s: AppServices): void {
  const listingLock = new KeyedLock();
  // Ticks on preflight warnings read and rewrite the book's settings, so two quick ticks must not run at the same time.
  const ackLock = new KeyedLock();
  const p = s.repos.production;

  // ---------- covers ----------

  app.get('/books/:id/cover', async (req) => {
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    return { cover: await p.getCover(req.ctx, id) };
  });

  app.put('/books/:id/cover/brief', async (req) => {
    writer(req);
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    const body = parse(z.object({ brief: CoverBriefSchema }).strict(), req.body);
    return { cover: await p.upsertCover(req.ctx, id, { brief: body.brief, status: 'brief' }) };
  });

  app.post('/books/:id/cover/concepts', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(z.object({ regenerateBrief: z.boolean().optional() }).optional(), req.body) ?? {};
    await s.repos.books.require(req.ctx, id);
    const job = await s.queue.enqueue(req.ctx, { kind: 'cover_concepts', projectId: id, payload: { regenerateBrief: body.regenerateBrief ?? false } });
    return accepted(reply, job);
  });

  app.post('/books/:id/cover/choose', async (req) => {
    writer(req);
    const id = idOf(req);
    const body = parse(z.object({ assetId: z.string().min(1).max(64), typography: CoverTypographySchema.optional() }).strict(), req.body);
    const cover = await p.getCover(req.ctx, id);
    if (!cover || !cover.concepts.some((c) => c.assetId === body.assetId))
      throw new AppError('validation_failed', 'That concept does not belong to this book.');
    const patch: Parameters<typeof p.upsertCover>[2] = { chosenAssetId: body.assetId, status: 'chosen' };
    if (body.typography) patch.typography = body.typography;
    return { cover: await p.upsertCover(req.ctx, id, patch) };
  });

  /**
   * The page a cover build would render for these settings, as HTML, without building or saving anything and without
   * an AI call. The Cover studio shows exactly this page, so what it previews is what the build makes (same code,
   * same fonts, same art, same ink). Typography defaults to the saved settings.
   */
  app.post('/books/:id/cover/preview', async (req) => {
    const id = idOf(req);
    const body = parse(
      z
        .object({
          kind: z.enum(['ebook', 'wrap']),
          typography: CoverTypographySchema.optional(),
          pages: z.number().int().min(24).max(1000).optional(),
          /** A concept to preview before it is chosen; defaults to the chosen one. */
          assetId: z.string().min(1).max(64).optional(),
        })
        .strict(),
      req.body,
    );
    const cover = await p.getCover(req.ctx, id);
    const assetId = body.assetId ?? cover?.chosenAssetId;
    if (!cover || !assetId) throw new AppError('invalid_state', 'Choose a cover concept first.');
    if (!cover.concepts.some((c) => c.assetId === assetId)) throw new AppError('validation_failed', 'That concept does not belong to this book.');
    const book = await buildExportBook(s.repos, req.ctx, id, s.configDir, s.blobs);
    const art = await s.blobs.read(req.ctx, assetId);
    const exports = await p.listExports(req.ctx, id);
    const printed = exports.find((e) => e.kind === 'pdf_print' && e.status === 'done' && e.manuscriptHash === book.manuscriptHash)?.pageCount ?? null;
    const built = typeof cover.wrapSpec['pages'] === 'number' ? cover.wrapSpec['pages'] : null;
    return s.exporter.coverPreviewHtml(
      {
        book,
        artwork: { mime: art.meta.mime, data: art.data },
        typography: body.typography ?? cover.typography,
        coverStyleId: book.coverStyleId,
        pageCount: body.pages ?? printed ?? built ?? 120,
        backBlurb: book.listing?.backBlurb ?? '',
      },
      body.kind,
    );
  });

  app.post('/books/:id/cover/build', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const cover = await p.getCover(req.ctx, id);
    if (!cover?.chosenAssetId) throw new AppError('invalid_state', 'Choose a cover concept first.');
    if (cover.wrapSpec['ownEbook'] === true && cover.wrapSpec['ownWrap'] === true && cover.ebookAssetId && cover.wrapAssetId)
      throw new AppError('invalid_state', 'Both covers are your own uploads. Take one out to build that one from the concept.');
    const job = await s.queue.enqueue(req.ctx, { kind: 'cover_build', projectId: id, payload: {} });
    return accepted(reply, job);
  });

  /**
   * "Use my own cover": put the owner's uploaded eBook cover (asset kind own_ebook_cover) and paperback wrap (kind
   * own_wrap_pdf) in place of built covers, or take them out again with null. The pack then uses them as uploaded and
   * the final preflight checks them against config/kdp-rules (ownCovers). wrapSpec.ownEbook and ownWrap record which.
   */
  app.post('/books/:id/cover/own', async (req) => {
    writer(req);
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    const AssetRef = z.string().min(1).max(64).nullable().optional();
    const body = parse(
      z
        .object({ ebookAssetId: AssetRef, wrapAssetId: AssetRef })
        .refine((b) => b.ebookAssetId !== undefined || b.wrapAssetId !== undefined, { message: 'Send ebookAssetId, wrapAssetId or both.' }),
      req.body,
    );
    const cover = await p.getCover(req.ctx, id);
    const spec: Record<string, unknown> = { ...(cover?.wrapSpec ?? {}) };
    const patch: Parameters<typeof p.upsertCover>[2] = {};
    const slots = [
      { value: body.ebookAssetId, field: 'ebookAssetId', kind: 'own_ebook_cover', flag: 'ownEbook', name: 'eBook cover' },
      { value: body.wrapAssetId, field: 'wrapAssetId', kind: 'own_wrap_pdf', flag: 'ownWrap', name: 'paperback wrap' },
    ] as const;
    for (const slot of slots) {
      if (slot.value === undefined) continue;
      if (slot.value === null) {
        // Only an own file is taken out; a built cover stays until it is built again.
        if (spec[slot.flag] === true) patch[slot.field] = null;
        delete spec[slot.flag];
        continue;
      }
      const asset = await s.blobs.get(req.ctx, slot.value);
      if (!asset || asset.projectId !== id || asset.kind !== slot.kind)
        throw new AppError('validation_failed', `Upload your ${slot.name} to this book first (asset kind ${slot.kind}).`);
      patch[slot.field] = slot.value;
      spec[slot.flag] = true;
    }
    // The built wrap's page count and the test-model mark describe built covers, not the owner's own wrap.
    if (spec['ownWrap'] === true) for (const k of ['pages', 'trim', 'paper', 'ink']) delete spec[k];
    if (spec['ownWrap'] === true && spec['ownEbook'] === true) delete spec['mock'];
    patch.wrapSpec = spec;
    return { cover: await p.upsertCover(req.ctx, id, patch) };
  });

  // ---------- exports ----------

  app.get('/books/:id/preflight', async (req) => preflightReport(s, req.ctx, idOf(req)));

  /** Ticks (on) or unticks (off) "I have checked this" for one warning. Only a warning in the current report can be ticked. */
  app.put('/books/:id/preflight/acknowledgements', async (req) => {
    writer(req);
    const id = idOf(req);
    const body = parse(z.object({ itemId: z.string().min(1).max(200), on: z.boolean() }).strict(), req.body);
    return ackLock.run(`${req.ctx.workspaceId}:${id}`, async () => {
      const book = await s.repos.books.require(req.ctx, id);
      const acks = preflightAcks(book);
      if (body.on) {
        const item = (await preflightReport(s, req.ctx, id)).items.find((i) => i.id === body.itemId && i.severity === 'warn');
        if (!item) throw new AppError('not_found', 'That warning is no longer in the preflight. Run the checks again.');
        acks[body.itemId] = item.message;
      } else delete acks[body.itemId];
      await s.repos.books.update(req.ctx, id, { settings: { ...book.settings, preflightAcks: acks } });
      return preflightReport(s, req.ctx, id);
    });
  });

  app.post('/books/:id/exports', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(z.object({ kinds: z.array(z.enum(EXPORT_KINDS)).min(1).optional(), pack: z.boolean().optional() }).optional(), req.body) ?? {};
    await s.repos.books.require(req.ctx, id);
    // Volume mode: a book that is or ever was in a batch is packed only after preflight and claims review (P8-2).
    if (body.pack !== false && (await s.repos.batches.everBatched(req.ctx, id))) await assertQualityGate(s, req.ctx, id, 'packed');
    const job = await s.queue.enqueue(req.ctx, {
      kind: 'export_pack',
      projectId: id,
      payload: { kinds: body.kinds ?? [...EXPORT_KINDS], pack: body.pack ?? true },
    });
    return accepted(reply, job);
  });

  app.get('/books/:id/exports', async (req) => {
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    const book = await buildExportBook(s.repos, req.ctx, id, s.configDir, s.blobs);
    const items = await p.listExports(req.ctx, id);
    // A pack carries the marketing files too: marketing generated, edited, archived or restored after the pack
    // was built makes it stale, like a manuscript change does for every file.
    const marketing = await p.listMarketing(req.ctx, id, { includeArchived: true });
    const marketingChangedAt = marketing.reduce((n, m) => Math.max(n, m.updatedAt), 0);
    const now = packHashOf(book, await p.getCover(req.ctx, id));
    return {
      items: items.map((e) => {
        // A pack built since the fingerprint was added stores one for everything it carries (titles, listing, covers,
        // marketing, claims and the manuscript): any difference is a change since the export. Older packs only know
        // the manuscript and the marketing time.
        if (e.kind === 'pack' && e.manuscriptHash?.startsWith('p1:')) {
          const changed = e.status === 'done' && e.manuscriptHash !== now;
          return { ...e, stale: changed, staleReason: changed ? 'changed' : null };
        }
        const manuscript = e.manuscriptHash !== null && e.manuscriptHash !== book.manuscriptHash;
        const marketingStale = e.kind === 'pack' && e.status === 'done' && marketingChangedAt > e.createdAt;
        return { ...e, stale: manuscript || marketingStale, staleReason: manuscript ? 'manuscript' : marketingStale ? 'marketing' : null };
      }),
    };
  });

  app.get('/exports/:id/download', async (req, reply) => {
    const rec = await p.requireExport(req.ctx, idOf(req));
    if (!rec.assetId) throw new AppError('invalid_state', 'This export has no file.');
    return sendAsset(s, req.ctx, reply, rec.assetId);
  });

  // ---------- marketing ----------

  app.post('/books/:id/marketing', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(z.object({ kinds: z.array(z.enum(MARKETING_KINDS)).min(1).optional() }).optional(), req.body) ?? {};
    await s.repos.books.require(req.ctx, id);
    await requireWritingComplete(s, req.ctx, id);
    const job = await s.queue.enqueue(req.ctx, { kind: 'marketing', projectId: id, payload: { kinds: body.kinds ?? [...MARKETING_KINDS] } });
    return accepted(reply, job);
  });

  // ---------- listing (matter stage) ----------

  /** The listing the matter stage wrote (null before it has run); the pack falls back to the blueprint drafts. */
  app.get('/books/:id/listing', async (req) => {
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    return { listing: await p.getListing(req.ctx, id) };
  });

  /** Writes the listing again from the finished chapters: Amazon description, back-cover blurb, keywords, categories. */
  app.post('/books/:id/listing', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    parse(z.object({}).strict().optional(), req.body);
    await s.repos.books.require(req.ctx, id);
    if (!(await bookWritingComplete(s.repos, req.ctx, id))) {
      throw new AppError('writing_incomplete', 'Finish writing every chapter before writing the listing.');
    }
    // One listing job at a time: a second would race the first and spend twice. The check and the enqueue run under a
    // per-book lock, so two requests at once (a double click) queue exactly one job.
    const job = await listingLock.run(`${req.ctx.workspaceId}:${id}`, async () => {
      const [running] = await s.queue.list(req.ctx, { projectId: id, kind: 'listing', active: true, limit: 1 });
      if (running) throw new AppError('conflict', 'The listing is already being written. Wait for it to finish or cancel it.', { jobId: running.id });
      return s.queue.enqueue(req.ctx, { kind: 'listing', projectId: id, payload: {} });
    });
    return accepted(reply, job);
  });

  app.get('/books/:id/marketing', async (req) => {
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    const q = parse(z.object({ kind: z.enum(MARKETING_KINDS).optional(), includeArchived: z.enum(['true', 'false']).optional() }), req.query);
    const filter: { kind?: string; includeArchived?: boolean } = { includeArchived: q.includeArchived === 'true' };
    if (q.kind) filter.kind = q.kind;
    return { items: await p.listMarketing(req.ctx, id, filter) };
  });

  app.get('/marketing', async (req) => {
    const q = parse(
      z.object({
        status: z.enum(['draft', 'used', 'archived']).optional(),
        kind: z.enum(MARKETING_KINDS).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      }),
      req.query,
    );
    const filter: { status?: string; kind?: string; limit: number } = { limit: q.limit };
    if (q.status) filter.status = q.status;
    if (q.kind) filter.kind = q.kind;
    return { items: await p.listAllMarketing(req.ctx, filter) };
  });

  app.patch('/marketing/:id', async (req) => {
    writer(req);
    return p.updateMarketing(req.ctx, idOf(req), parse(MarketingPatchSchema, req.body));
  });

  app.post('/marketing/:id/regenerate', async (req, reply) => {
    writer(req);
    const body = parse(z.object({ instruction: z.string().max(2000).optional() }).optional(), req.body) ?? {};
    const item = await p.requireMarketing(req.ctx, idOf(req));
    await requireWritingComplete(s, req.ctx, item.projectId);
    const job = await s.queue.enqueue(req.ctx, {
      kind: 'marketing',
      projectId: item.projectId,
      payload: { itemId: item.id, kinds: [item.kind], instruction: body.instruction ?? null },
    });
    return accepted(reply, job);
  });

  app.post('/marketing/:id/archive', async (req) => {
    writer(req);
    return p.updateMarketing(req.ctx, idOf(req), { status: 'archived', archivedAt: Date.now() });
  });

  app.post('/marketing/:id/restore', async (req) => {
    writer(req);
    return p.updateMarketing(req.ctx, idOf(req), { status: 'draft', archivedAt: null });
  });
}
