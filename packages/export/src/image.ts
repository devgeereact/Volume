// Every picture Volume decodes goes through openImage, so a small file that claims a huge size (a decompression
// bomb) is refused before it is decoded. sharp's own default is 268 million pixels, about 1 GB once decoded.
import sharp, { type Sharp, type SharpOptions } from 'sharp';

/**
 * 100 million pixels. The largest real input is far below it: a full paperback wrap at 300 dpi is about 20 MP, an
 * AI picture at 4K about 17 MP, a camera photo up to about 50 MP (audit L3, 1 November 2026).
 */
export const MAX_INPUT_PIXELS = 100_000_000;

export function openImage(input: Buffer | Uint8Array): Sharp;
export function openImage(options: SharpOptions): Sharp;
export function openImage(arg: Buffer | Uint8Array | SharpOptions): Sharp {
  if (arg instanceof Uint8Array) return sharp(arg, { limitInputPixels: MAX_INPUT_PIXELS });
  return sharp({ ...arg, limitInputPixels: MAX_INPUT_PIXELS });
}
