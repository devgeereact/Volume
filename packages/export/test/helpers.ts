import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseManuscript, type BookDoc } from '@volume/core';

export const fixture = (name: string) => new URL(`./fixtures/${name}`, import.meta.url);
export const goldenPath = (name: string) => new URL(`./golden/${name}`, import.meta.url);

export function loadWindowsill(): { md: string; book: BookDoc } {
  const md = readFileSync(fixture('windowsill-herbs-manuscript.md'), 'utf8');
  return { md, book: parseManuscript(md) };
}

export function loadMiniBook(): BookDoc {
  const book = parseManuscript(readFileSync(fixture('mini-book.md'), 'utf8'));
  Object.assign(book.meta, JSON.parse(readFileSync(fixture('mini-book.meta.json'), 'utf8')) as Partial<BookDoc['meta']>);
  return book;
}

/** Read a golden file; with UPDATE_GOLDEN=1 (or when it is missing and WRITE_MISSING_GOLDEN=1) write `actual` first. */
export function golden(name: string, actual: string): string {
  const p = goldenPath(name);
  if (process.env.UPDATE_GOLDEN === '1' || (!existsSync(p) && process.env.WRITE_MISSING_GOLDEN === '1')) writeFileSync(p, actual);
  return readFileSync(p, 'utf8');
}

/**
 * PDF page references. The approved originals in golden/ were rasterised on macOS. pdf.js draws embedded fonts with
 * the platform's text rasteriser, and macOS font smoothing makes glyphs about 12% darker than FreeType on Linux, with
 * identical glyph positions. Other platforms therefore keep their own images in golden/<platform>/; layoutMismatch()
 * still checks every platform's render against the macOS originals.
 */
export const VISUAL_REFERENCE_PLATFORM = process.platform === 'darwin' ? 'darwin' : process.platform;
export const visualReferencePath = (name: string) =>
  VISUAL_REFERENCE_PLATFORM === 'darwin' ? goldenPath(name) : goldenPath(`${VISUAL_REFERENCE_PLATFORM}/${name}`);

/** Mean absolute grey-level difference of two equally sized greyscale rasters. */
export function meanGreyDifference(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let k = 0; k < a.length; k++) sum += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return sum / a.length;
}

/**
 * Layout check that ignores stroke weight: the share (0 to 1) of dark pixels in `actual` with no dark pixel within one
 * pixel in `reference`. Moved lines, words or page breaks raise it to several per cent; rasteriser weight does not.
 */
export function layoutMismatch(actual: Uint8Array, reference: Uint8Array, width: number, height: number, dark = 128): number {
  let ink = 0;
  let unmatched = 0;
  const inkAt = (buf: Uint8Array, x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && (buf[y * width + x] ?? 255) < dark;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inkAt(actual, x, y)) continue;
      ink++;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = inkAt(reference, x + dx, y + dy);
      if (!near) unmatched++;
    }
  }
  return ink ? unmatched / ink : 0;
}
