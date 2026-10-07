// Read-only diagnostic against the existing public fixture and unchanged golden PNGs.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { DEFAULT_INTERIOR_THEME } from '@volume/core';
import { acquireBrowser, exportPrintPdf, loadFontLibrary, releaseBrowser, renderPdfPages } from '../src/index.ts';
import { goldenPath, loadWindowsill } from '../test/helpers.ts';

const threshold = 1.5; // Same acceptance rule as test/pdf.test.ts, never write references here.
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
      const bytes = readFileSync(goldenPath(reference));
      const actual = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
      const expected = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
      const dimensionsMatch = actual.info.width === expected.info.width && actual.info.height === expected.info.height;
      let meanDifference: number | null = null;
      if (dimensionsMatch) {
        let sum = 0;
        for (let pixel = 0; pixel < actual.data.length; pixel++) sum += Math.abs((actual.data[pixel] ?? 0) - (expected.data[pixel] ?? 0));
        meanDifference = sum / actual.data.length;
      }
      comparisons.push({
        reference,
        page: pages[index],
        referenceSha256: sha256(bytes),
        dimensionsMatch,
        meanDifference,
        pass: dimensionsMatch && meanDifference !== null && meanDifference < threshold,
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
          threshold,
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
