import { AppError } from '../http/errors.js';

/**
 * Image uploads must be what they claim (D-050): the first bytes are checked against the declared type before
 * anything is stored. Signatures: PNG (RFC 2083 / ISO 15948), JPEG SOI marker FF D8 FF, WebP RIFF....WEBP.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);

const SIGNATURES: Record<string, { need: number; test: (head: Buffer) => boolean; label: string }> = {
  'image/png': { need: 8, test: (h) => h.subarray(0, 8).equals(PNG), label: 'PNG' },
  'image/jpeg': { need: 3, test: (h) => h.subarray(0, 3).equals(JPEG), label: 'JPEG' },
  'image/webp': {
    need: 12,
    test: (h) => h.subarray(0, 4).toString('latin1') === 'RIFF' && h.subarray(8, 12).toString('latin1') === 'WEBP',
    label: 'WebP',
  },
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
  const refuse = (): AppError => new AppError('unsupported_media_type', `This file is not a ${sig.label} image, although it was sent as one.`);
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
