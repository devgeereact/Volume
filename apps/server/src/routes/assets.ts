import type { FastifyInstance } from 'fastify';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { sniffed } from '../files/magic.js';
import { AppError, parse } from '../http/errors.js';
import { idOf, writer } from './common.js';
import { sendAsset } from './production.js';

/** Upload types accepted in v1 (docs/10: imports are Markdown; images for logos and covers). */
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'text/markdown', 'text/plain', 'application/pdf', 'application/octet-stream']);

const UploadQuery = z.object({
  kind: z.enum(['import', 'logo', 'interior_image', 'author_photo', 'cover_concept', 'other']),
  filename: z.string().trim().min(1).max(255),
  mime: z.string().max(100).optional(),
  projectId: z.string().max(64).optional(),
  profileId: z.string().max(64).optional(),
});

export function assetRoutes(app: FastifyInstance, s: AppServices): void {
  app.get('/assets/:id', async (req) => s.blobs.require(req.ctx, idOf(req)));

  app.get('/assets/:id/download', async (req, reply) => {
    const q = parse(z.object({ inline: z.enum(['1', 'true']).optional() }), req.query);
    return sendAsset(s, req.ctx, reply, idOf(req), q.inline !== undefined);
  });

  // Raw body upload, streamed into 1 MB chunks. Registered in its own scope so
  // the octet-stream parser and the larger body limit apply only here.
  void app.register((scope) => {
    scope.addContentTypeParser(
      ['application/octet-stream', 'image/png', 'image/jpeg', 'image/webp', 'text/markdown', 'application/pdf'],
      (_req, payload, done) => {
        done(null, payload);
      },
    );

    scope.post('/assets', { bodyLimit: s.config.maxUploadBytes }, async (req, reply) => {
      writer(req);
      const q = parse(UploadQuery, req.query);
      const mime = (q.mime ?? req.headers['content-type'] ?? 'application/octet-stream').split(';')[0]?.trim().toLowerCase() ?? '';
      if (!ALLOWED_MIME.has(mime)) throw new AppError('unsupported_media_type', 'This file type cannot be uploaded.');
      if (q.kind === 'import' && !/\.md$/i.test(q.filename)) throw new AppError('unsupported_media_type', 'Imports accept Markdown (.md) files only.');
      if (q.kind === 'author_photo' && (!q.profileId || !['image/jpeg', 'image/png'].includes(mime)))
        throw new AppError('validation_failed', 'Author photos need a saved profile and a JPEG or PNG image.');
      if (q.projectId) await s.repos.books.require(req.ctx, q.projectId);
      if (q.profileId) await s.repos.profiles.require(req.ctx, q.profileId);
      const raw = req.body as Readable | undefined;
      if (!raw) throw new AppError('validation_failed', 'The upload body is empty.');
      // D-050: an image must start with its type's signature, or nothing is stored (415).
      const body = sniffed(mime, raw as AsyncIterable<Uint8Array | string>);
      const meta = await s.blobs.put(
        req.ctx,
        {
          kind: q.kind,
          filename: q.filename,
          mime,
          projectId: q.projectId ?? null,
          profileId: q.profileId ?? null,
          maxBytes: q.kind === 'author_photo' ? Math.min(s.config.maxUploadBytes, 5 * 1024 * 1024) : s.config.maxUploadBytes,
        },
        body,
      );
      void reply.code(201);
      return meta;
    });
    return Promise.resolve();
  });
}
