import type { FastifyInstance } from 'fastify';
import type { Readable } from 'node:stream';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { IMAGE_KINDS, sniffed } from '../files/magic.js';
import { AppError, parse } from '../http/errors.js';
import { idOf, writer } from './common.js';
import { sendAsset } from './production.js';

/** Upload types accepted in v1 (docs/10: imports are Markdown; images for logos and covers). */
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/tiff',
  'text/markdown',
  'text/plain',
  'application/pdf',
  'application/octet-stream',
]);

/**
 * The owner's own cover files ("use my own cover"): the eBook front cover is JPEG or TIFF (rule ebook.cover
 * fileTypes in config/kdp-rules) and the paperback wrap is one PDF. Both belong to a book, and the first bytes must
 * match the type before anything is stored (`sniffed`, files/magic.ts), whatever the name says.
 */
export const OWN_COVER_KINDS = {
  own_ebook_cover: { mimes: ['image/jpeg', 'image/tiff'], label: 'a JPEG or TIFF image' },
  own_wrap_pdf: { mimes: ['application/pdf'], label: 'a PDF' },
} as const;
type OwnCoverKind = keyof typeof OWN_COVER_KINDS;
const isOwnCoverKind = (k: string): k is OwnCoverKind => k in OWN_COVER_KINDS;

const UploadQuery = z.object({
  kind: z.enum(['import', 'logo', 'interior_image', 'author_photo', 'cover_concept', 'cover_background', 'own_ebook_cover', 'own_wrap_pdf', 'other']),
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
      ['application/octet-stream', 'image/png', 'image/jpeg', 'image/webp', 'image/tiff', 'text/markdown', 'application/pdf'],
      (_req, payload, done) => {
        done(null, payload);
      },
    );

    scope.post('/assets', { bodyLimit: s.config.maxUploadBytes }, async (req, reply) => {
      writer(req);
      const q = parse(UploadQuery, req.query);
      const mime = (q.mime ?? req.headers['content-type'] ?? 'application/octet-stream').split(';')[0]?.trim().toLowerCase() ?? '';
      if (!ALLOWED_MIME.has(mime)) throw new AppError('unsupported_media_type', 'This file type cannot be uploaded.');
      if (IMAGE_KINDS.has(q.kind) && !mime.startsWith('image/'))
        throw new AppError('unsupported_media_type', 'Pictures must be sent as PNG, JPEG or WebP images.');
      if (q.kind === 'import' && !/\.md$/i.test(q.filename)) throw new AppError('unsupported_media_type', 'Imports accept Markdown (.md) files only.');
      if (q.kind === 'author_photo' && (!q.profileId || !['image/jpeg', 'image/png'].includes(mime)))
        throw new AppError('validation_failed', 'Author photos need a saved profile and a JPEG or PNG image.');
      if (isOwnCoverKind(q.kind)) {
        const own = OWN_COVER_KINDS[q.kind];
        if (!q.projectId || !(own.mimes as readonly string[]).includes(mime))
          throw new AppError('validation_failed', `Your own ${q.kind === 'own_ebook_cover' ? 'eBook cover' : 'paperback wrap'} needs a book and ${own.label}.`);
      }
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
