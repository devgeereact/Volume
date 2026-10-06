import type { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { AppError, parse } from '../http/errors.js';
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
