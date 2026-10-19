import { isTiff } from '@volume/export';
import { AppError } from '../http/errors.js';

/**
 * Image uploads must be what they claim (D-050): the first bytes are checked against the declared type before
 * anything is stored. Signatures: PNG (RFC 2083 / ISO 15948), JPEG SOI marker FF D8 FF, WebP RIFF....WEBP, TIFF II*\0 or MM\0* (the owner's own eBook cover), PDF %PDF-, zip PK 03 04.
 * Kinds that hold pictures do not take application/octet-stream, so an image cannot skip the check that way.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const SIGNATURES: Record<string, { need: number; test: (head: Buffer) => boolean; label: string }> = {
  'image/png': { need: 8, test: (h) => h.subarray(0, 8).equals(PNG), label: 'PNG' },
  'image/jpeg': { need: 3, test: (h) => h.subarray(0, 3).equals(JPEG), label: 'JPEG' },
  'image/webp': {
    need: 12,
    test: (h) => h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP',
    label: 'WebP',
  },
  // TIFF 6.0 header: byte order II or MM, then 42. The same check names a TIFF eBook cover in the pack.
  'image/tiff': { need: 4, test: (h) => isTiff(h), label: 'TIFF' },
  // PDF files begin with the %PDF- header (ISO 32000-1, 7.5.2).
  'application/pdf': { need: 5, test: (h) => h.subarray(0, 5).toString('latin1') === '%PDF-', label: 'PDF' },
  // Zip files (project zips) begin with a local file header, PK 03 04 (PKWARE APPNOTE 4.3.7).
  'application/zip': { need: 4, test: (h) => h.subarray(0, 4).equals(ZIP), label: 'zip' },
};

/** Checks a whole buffer's first bytes against the declared type. */
export function matchesSignature(mime: string, head: Uint8Array): boolean {
  const sig = SIGNATURES[mime];
  if (!sig) return true;
  const b = Buffer.from(head.buffer, head.byteOffset, head.byteLength);
  return b.length >= sig.need && sig.test(b);
}

/**
 * Passes the upload through unchanged, after holding back its first bytes until they can be checked. A mismatch
 * (or a body too short to tell) throws 415 before the first byte reaches the store.
 */
export async function* sniffed(mime: string, source: AsyncIterable<Uint8Array | string>): AsyncGenerator<Uint8Array> {
  const sig = SIGNATURES[mime];
  if (!sig) {
    for await (const piece of source) yield typeof piece === 'string' ? Buffer.from(piece) : piece;
    return;
  }
  const refuse = (): AppError => new AppError('unsupported_media_type', `This file is not a ${sig.label} file, although it was sent as one.`);
  let head: Buffer = Buffer.alloc(0);
  let checked = false;
  for await (const piece of source) {
    const b = typeof piece === 'string' ? Buffer.from(piece) : Buffer.from(piece.buffer, piece.byteOffset, piece.byteLength);
    if (checked) {
      yield b;
      continue;
    }
    head = Buffer.concat([head, b]);
    if (head.length < sig.need) continue;
    if (!sig.test(head)) throw refuse();
    checked = true;
    yield head;
  }
  if (!checked) throw refuse();
}

/** Upload kinds that hold pictures: they must declare an image type, never application/octet-stream. */
export const IMAGE_KINDS: ReadonlySet<string> = new Set(['logo', 'interior_image', 'author_photo', 'cover_concept']);
