import { parseManuscript, serialiseManuscript } from '@volume/core';
import type { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { AppError, parse } from '../http/errors.js';
import { createRepos } from '../repos/index.js';
import { createTextChecker } from '../jobs/guardrails.js';
import { matchesSignature } from '../files/magic.js';
import { parseMultipart } from '../lib/multipart.js';
import { ProjectTransfer } from '../repos/transfer.js';
import { idOf, writer } from './common.js';

/** Project imports per client IP per minute (on top of the global write limit). */
export const PROJECT_IMPORT_RATE = { max: 5, timeWindow: 60_000 };

const ImportFields = z.object({ profileId: z.string().trim().min(1).max(64) }).strict();

/** Moving a book: a zip of its data and files out, and the same zip back in with new ids. */
export function transferRoutes(app: FastifyInstance, s: AppServices): void {
  const transfer = new ProjectTransfer(s.db, s.blobs);

  app.post('/books/:id/export-project', async (req, reply) => {
    writer(req);
    const { filename, zip } = await transfer.exportProject(req.ctx, idOf(req));
    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Length', String(zip.length))
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(zip);
  });

  app.post('/books/import-manuscript', async (req, reply) => {
    writer(req);
    const input = parse(z.object({ profileId: z.string().min(1).max(64), markdown: z.string().min(1).max(1500000) }), req.body);
    const profile = await s.repos.profiles.require(req.ctx, input.profileId);
    if (profile.status !== 'active') throw new AppError('invalid_state', 'Restore this pen name before importing a book.');
    let manuscript;
    try {
      manuscript = parseManuscript(input.markdown);
    } catch {
      throw new AppError('validation_failed', 'This manuscript could not be read. Use the Volume Markdown format.');
    }
    if (!manuscript.sections.length || manuscript.sections.length > 500)
      throw new AppError('validation_failed', 'The manuscript must contain between 1 and 500 sections.');
    const settings = await s.repos.settings.all(req.ctx);
    const result = await s.db.transaction().execute(async (trx) => {
      const repos = createRepos(trx);
      repos.manuscript.setTextChecker(createTextChecker(repos, s.config.configDir));
      const book = await repos.books.create(
        req.ctx,
        { profileId: profile.id, title: manuscript.meta.title, subtitle: manuscript.meta.subtitle, idea: `Imported manuscript: ${manuscript.meta.title}` },
        { budgetUsd: settings['budget.book_default_usd'] ?? 15, illustrativeLine: profile.illustrativeLineDefault },
      );
      let partId: string | null = null;
      for (const [index, section] of manuscript.sections.entries()) {
        const kind = section.subtype === 'about_the_author' ? 'about_author' : section.subtype;
        const [created] = await repos.manuscript.addSections(
          req.ctx,
          book.id,
          [
            {
              kind,
              area: section.kind === 'front' ? 'front' : section.kind === 'back' ? 'back' : 'body',
              title: section.title,
              number: section.number ?? null,
              enabled: section.enabled !== false,
              partId: section.kind === 'chapter' ? partId : null,
            },
          ],
          (index + 1) * 1000,
        );
        if (!created) throw new Error('Imported section was not created');
        if (kind === 'part') partId = created.id;
        else
          await repos.manuscript.saveVersion(req.ctx, created.id, {
            bodyMd: serialiseManuscript({ ...manuscript, sections: [section] }).trim(),
            source: 'import',
            note: 'Imported from Markdown',
          });
      }
      await trx.updateTable('projects').set({ stage: 'editor' }).where('id', '=', book.id).where('workspaceId', '=', req.ctx.workspaceId).execute();
      return { bookId: book.id, sections: manuscript.sections.length };
    });
    return reply.code(201).send(result);
  });

  void app.register((scope) => {
    scope.addContentTypeParser(['application/zip', 'application/octet-stream'], (_req, payload, done) => done(null, payload));

    // Body: the zip from export-project (Content-Type application/zip). Optional ?profileId= puts the book under an
    // existing pen name instead of a copy of the exported one.
    scope.post('/projects/import', { bodyLimit: s.config.maxUploadBytes }, async (req, reply) => {
      writer(req);
      const q = parse(z.object({ profileId: z.string().min(1).max(64).optional() }), req.query);
      const type = (req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
      if (type !== 'application/zip' && type !== 'application/octet-stream')
        throw new AppError('unsupported_media_type', 'Send the project zip with Content-Type: application/zip.');
      const parts: Buffer[] = [];
      let size = 0;
      for await (const chunk of req.body as Readable) {
        const b = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
        size += b.length;
        if (size > s.config.maxUploadBytes) throw new AppError('payload_too_large', 'The project file is larger than the allowed size.');
        parts.push(b);
      }
      const result = await transfer.importProject(req.ctx, Buffer.concat(parts), { profileId: q.profileId ?? null });
      void reply.code(201);
      return { ...result, book: await s.repos.books.require(req.ctx, result.bookId) };
    });
    return Promise.resolve();
  });

  // Moving a book from another Volume (D-051). multipart/form-data with two parts: profileId (a pen name in the
  // caller's workspace) and file (the project zip from export-project). Always makes a new book; nothing existing
  // is changed. Owner or editor. Nothing from the zip is logged.
  void app.register((scope) => {
    // Fastify collects the body as one buffer and answers 413 past the limit, before this parser runs.
    const bodyLimit = s.config.maxUploadBytes + 64 * 1024;
    scope.addContentTypeParser(/^multipart\/form-data/i, { parseAs: 'buffer', bodyLimit }, (_req, body, done) => done(null, body));

    scope.post('/books/import-project', { bodyLimit, config: { rateLimit: PROJECT_IMPORT_RATE } }, async (req, reply) => {
      writer(req);
      const body = req.body;
      const type = req.headers['content-type'] ?? '';
      if (!Buffer.isBuffer(body) || !/^multipart\/form-data/i.test(type))
        throw new AppError('unsupported_media_type', 'Send the project as multipart/form-data with the fields profileId and file.');
      const parts = parseMultipart(type, body);
      const files = parts.filter((p) => p.name === 'file');
      const fields = Object.fromEntries(parts.filter((p) => p.name !== 'file').map((p) => [p.name, p.data.toString('utf8')]));
      if (parts.length - files.length !== Object.keys(fields).length) throw new AppError('validation_failed', 'Send each form field once.');
      const input = parse(ImportFields, fields);
      const file = files[0];
      if (files.length !== 1 || !file || file.filename === null) throw new AppError('validation_failed', 'Attach one project zip in the file field.');
      if (file.data.byteLength > s.config.maxUploadBytes) throw new AppError('payload_too_large', 'The project file is larger than the allowed size.');
      if (!matchesSignature('application/zip', file.data)) throw new AppError('unsupported_media_type', 'This file is not a zip file.');
      const profile = await s.repos.profiles.require(req.ctx, input.profileId);
      if (profile.status !== 'active') throw new AppError('invalid_state', 'Restore this pen name before importing a book.');
      const result = await transfer.importProject(req.ctx, file.data, { profileId: profile.id, requireManifest: true });
      void reply.code(201);
      return {
        bookId: result.bookId,
        profileId: result.profileId,
        rows: result.rows,
        assets: result.assets,
        book: await s.repos.books.require(req.ctx, result.bookId),
      };
    });
    return Promise.resolve();
  });
}
