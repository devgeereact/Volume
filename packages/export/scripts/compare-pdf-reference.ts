// Read-only diagnostic against the existing public fixture and unchanged golden PNGs.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { DEFAULT_INTERIOR_THEME } from '@volume/core';
import { acquireBrowser, BROWSER_ARGS, exportPrintPdf, loadFontLibrary, releaseBrowser, renderPdfPages } from '../src/index.ts';
import { goldenPath, layoutMismatch, loadWindowsill, meanGreyDifference, VISUAL_REFERENCE_PLATFORM, visualReferencePath } from '../test/helpers.ts';

const threshold = 1.5; // Same acceptance rules as test/pdf.test.ts, never write references here.
const layoutLimit = 0.01;
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
async function main(): Promise<void> {
  const browser = await acquireBrowser();
  try {
    const result = await exportPrintPdf(loadWindowsill().book, DEFAULT_INTERIOR_THEME, {
      browser,
      creationDate: new Date('2026-10-04T00:00:00Z'),
    });
    const opener = result.sections['chapter-1-read-your-windows-before-you-buy-a-plant']?.page;
    // Front matter is omitted from the numbered-section map, as in pdf.test.ts.
    const contents = result.sections.contents?.page ?? 3;
    if (!opener) throw new Error('Fixture chapter section is missing.');
    const pages = [1, contents, opener, opener + 1];
    const pngs = await renderPdfPages(result.buffer, pages, { browser, scale: 1 });
    const comparisons = [];
    for (const [index, png] of pngs.entries()) {
      const reference = `windowsill-page-${index + 1}.png`;
      const bytes = readFileSync(visualReferencePath(reference));
      const actual = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
      const expected = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
      const original = await sharp(readFileSync(goldenPath(reference)))
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const dimensionsMatch = actual.info.width === expected.info.width && actual.info.height === expected.info.height;
      const meanDifference = dimensionsMatch ? meanGreyDifference(actual.data, expected.data) : null;
      const sameSizeAsOriginal = actual.info.width === original.info.width && actual.info.height === original.info.height;
      const layoutMismatchAgainstMacOs = sameSizeAsOriginal ? layoutMismatch(actual.data, original.data, actual.info.width, actual.info.height) : null;
      comparisons.push({
        reference,
        page: pages[index],
        referenceSha256: sha256(bytes),
        dimensionsMatch,
        meanDifference,
        layoutMismatchAgainstMacOs,
        pass: meanDifference !== null && meanDifference < threshold && layoutMismatchAgainstMacOs !== null && layoutMismatchAgainstMacOs <= layoutLimit,
      });
    }
    const pass = comparisons.every((comparison) => comparison.pass);
    console.log(
      JSON.stringify(
        {
          status: pass ? 'PASS' : 'FAIL',
          platform: process.platform,
          architecture: process.arch,
          node: process.versions.node,
          chromium: browser.version(),
          browserArgs: BROWSER_ARGS,
          referencePlatform: VISUAL_REFERENCE_PLATFORM,
          threshold,
          layoutLimit,
          comparisons,
          fonts: loadFontLibrary()
            .files.filter((font) => font.source === 'assets')
            .map((font) => ({
              file: path.basename(font.path),
              sha256: sha256(readFileSync(font.path)),
            })),
        },
        null,
        2,
      ),
    );
    process.exitCode = pass ? 0 : 1;
  } finally {
    await releaseBrowser();
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'PDF comparison failed.');
  process.exitCode = 1;
});
