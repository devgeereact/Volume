import { parseManuscript, serialiseManuscript } from '@volume/core';
import type { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { AppError, parse } from '../http/errors.js';
import { createRepos } from '../repos/index.js';
import { createTextChecker } from '../jobs/guardrails.js';
import { ProjectTransfer } from '../repos/transfer.js';
import { idOf, writer } from './common.js';

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
}
