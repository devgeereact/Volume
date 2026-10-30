import type { RequestCtx } from '../auth/context.js';
import { AppError } from '../http/errors.js';
import type { BlobStore } from './blob-store.js';

/** Asset kinds a cover's background picture may name: an upload for it, or one of the book's own concepts. */
export const COVER_PICTURE_KINDS: ReadonlySet<string> = new Set(['cover_background', 'cover_concept']);

/** The asset id an image background layer names in a typography record, if any. */
export function backgroundAssetId(typography: Record<string, unknown> | null | undefined): string | null {
  const bg = typography?.['background'];
  if (typeof bg !== 'object' || bg === null) return null;
  const b = bg as Record<string, unknown>;
  const image = b['image'];
  if (b['mode'] !== 'image' || typeof image !== 'object' || image === null) return null;
  const id = (image as Record<string, unknown>)['assetId'];
  return typeof id === 'string' && id ? id : null;
}

/**
 * The background picture for a cover, read through the existing asset store. Only a picture of this book, of a
 * picture kind, is used; anything else is refused when `strict` (saving settings) and left out otherwise (a build
 * or a preview then draws the background colour and says so in its warnings).
 */
export async function coverPicture(
  blobs: BlobStore,
  ctx: RequestCtx,
  projectId: string,
  typography: Record<string, unknown> | null | undefined,
  strict = false,
): Promise<{ mime: string; data: Uint8Array } | null> {
  const id = backgroundAssetId(typography);
  if (!id) return null;
  const meta = await blobs.get(ctx, id);
  if (!meta || meta.projectId !== projectId || !COVER_PICTURE_KINDS.has(meta.kind) || !meta.mime.startsWith('image/')) {
    if (strict) throw new AppError('validation_failed', 'Upload the background picture to this book first (asset kind cover_background).');
    return null;
  }
  const { data } = await blobs.read(ctx, id);
  return { mime: meta.mime, data };
}
