import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { contentsEntriesFromTemplate, parseManuscript, pictureBookDocSchema, type BookDoc, type PictureBookDoc } from '@volume/core';
import { loadBookTemplate } from '@volume/core/node';

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

/** The phase 6 samples (P6-2): `fiction-mini` and `workbook-mini`, manuscripts in fixtures/. */
export type SampleName = 'fiction-mini' | 'workbook-mini';
export function loadSample(name: SampleName): { md: string; book: BookDoc } {
  const md = readFileSync(fixture(`${name}.md`), 'utf8');
  const book = parseManuscript(md);
  // As the server does: the template decides what the contents lists (fiction: chapters and parts only).
  book.meta.contentsEntries = contentsEntriesFromTemplate(loadBookTemplate(name === 'fiction-mini' ? 'fiction' : 'workbook'));
  return { md, book };
}

/** Normalise WordprocessingML for golden comparison: drop rsids and volatile ids, one tag per line. */
export function normaliseXml(xml: string): string {
  return xml
    .replace(/\s+w:rsid\w*="[^"]*"/g, '')
    .replace(/\s+w14:paraId="[^"]*"|\s+w14:textId="[^"]*"/g, '')
    .replace(/></g, '>\n<');
}

/** The phase 7 sample (P7-3): a 24-page picture book in fixtures/picture-mini.json. */
export function loadPictureMini(): PictureBookDoc {
  const raw = JSON.parse(readFileSync(fixture('picture-mini.json'), 'utf8')) as Record<string, unknown>;
  delete raw['$comment'];
  return pictureBookDocSchema.parse(raw) as PictureBookDoc;
}

/**
 * A deterministic 2:1 placeholder picture for spread `n` (PNG, 1200 x 600 px): a sky gradient whose hue moves with n,
 * a pale moon on the right half, a green hill along the bottom and a dark mark on each half so a split at the gutter
 * shows in the page images.
 */
export async function placeholderSpread(n: number): Promise<Buffer> {
  const width = 1200;
  const height = 600;
  const px = Buffer.alloc(width * height * 3);
  const hue = (n * 37) % 360;
  const sky = (t: number): [number, number, number] => {
    const k = (deg: number) => Math.round(150 + 90 * Math.cos(((hue + deg) * Math.PI) / 180) * (1 - t * 0.5));
    return [k(0), k(120), k(240)];
  };
  for (let y = 0; y < height; y++) {
    const [r, g, b] = sky(y / height);
    for (let x = 0; x < width; x++) {
      let c: [number, number, number] = [r, g, b];
      const hill = height * 0.78 + Math.sin((x / width) * Math.PI * 2 + n) * height * 0.05;
      if (y > hill) c = [70, 140 - (n % 5) * 8, 70];
      if ((x - width * 0.78) ** 2 + (y - height * 0.25) ** 2 < (height * 0.09) ** 2) c = [250, 246, 220];
      if (Math.abs(x - width * 0.25) < 30 && Math.abs(y - height * 0.66) < 30) c = [40, 40, 60];
      if (Math.abs(x - width * 0.6) < 22 && Math.abs(y - height * 0.7) < 22) c = [60, 40, 40];
      px[(y * width + x) * 3] = c[0];
      px[(y * width + x) * 3 + 1] = c[1];
      px[(y * width + x) * 3 + 2] = c[2];
    }
  }
  return sharp(px, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

/**
 * Compare rendered pages with the approved references. macOS originals live in golden/; other platforms keep their
 * own images in golden/<platform>/. Where a platform has no references yet, only the layout check against the macOS
 * originals runs. With UPDATE_GOLDEN=1 the platform's references are written first.
 */
export async function comparePages(prefix: string, pngs: Buffer[]): Promise<string[]> {
  const failures: string[] = [];
  for (const [i, png] of pngs.entries()) {
    const file = `${prefix}-page-${i + 1}.png`;
    const own = visualReferencePath(file);
    if (process.env.UPDATE_GOLDEN === '1') {
      mkdirSync(new URL('.', own), { recursive: true });
      writeFileSync(own, png);
    }
    const a = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
    if (!existsSync(goldenPath(file))) {
      failures.push(`${file}: macOS reference is missing.`);
      continue;
    }
    const original = await sharp(readFileSync(goldenPath(file)))
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (original.info.width !== a.info.width || original.info.height !== a.info.height) {
      failures.push(`${file}: dimensions differ from the macOS reference.`);
      continue;
    }
    if (existsSync(own)) {
      const b = await sharp(readFileSync(own)).greyscale().raw().toBuffer({ resolveWithObject: true });
      const mean = meanGreyDifference(a.data, b.data);
      if (mean >= 1.5) failures.push(`${file}: mean grey-level difference ${mean} exceeds 1.5 (${VISUAL_REFERENCE_PLATFORM}).`);
    }
    const moved = layoutMismatch(a.data, original.data, a.info.width, a.info.height);
    if (moved > 0.01) failures.push(`${file}: ${(moved * 100).toFixed(2)}% of the text ink has moved against the macOS reference.`);
  }
  return failures;
}
