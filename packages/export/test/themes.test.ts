import sharp from 'sharp';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadCoverStyles, loadInteriorThemes, loadKdpRules } from '@volume/core/node';
import {
  acquireBrowser,
  exportEbookCover,
  exportPaperbackWrap,
  exportPrintPdf,
  inspectPdf,
  isVariableOnly,
  loadFontLibrary,
  releaseBrowser,
} from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

const themes = loadInteriorThemes();
const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const styles = loadCoverStyles();
const rules = loadKdpRules();
let browser: Browser;
beforeAll(async () => {
  browser = await acquireBrowser();
});
afterAll(async () => {
  await releaseBrowser();
});

describe('config/interior-themes.json', () => {
  it.skipIf(themes.length === 0).each(themes.map((t) => [t.id, t] as const))('%s prints with every font embedded and no Type 3', async (_id, theme) => {
    const lib = loadFontLibrary();
    const fams = [theme.fonts.body, theme.fonts.heading, theme.fonts.display];
    for (const fam of fams) expect(lib.has(fam), fam).toBe(true);
    const r = await exportPrintPdf(loadMiniBook(), theme, { browser, rules });
    const info = await inspectPdf(r.buffer, { text: false });
    expect(info.pageSizes).toEqual([{ widthPt: 432, heightPt: 648 }]);
    // KDP-safe: every font embedded, no Type 3, and the theme's own families used (static files installed)
    expect(info.fonts.filter((f) => !f.embedded || f.type3).map((f) => f.name)).toEqual([]);
    for (const fam of fams) expect(isVariableOnly(lib, fam), `${fam} has static files`).toBe(false);
    expect(r.warnings).toEqual([]);
    const embedded = info.fonts.map((f) => letters(f.name.replace(/^[A-Z]{6}\+/, '')));
    for (const fam of new Set([theme.fonts.body, theme.fonts.heading]))
      expect(
        embedded.some((n) => n.startsWith(letters(fam))),
        `${fam} in ${embedded.join(', ')}`,
      ).toBe(true);
  });
});

describe('config/cover-styles.json', () => {
  it.skipIf(styles.length === 0).each(styles.map((s) => [s.id, s] as const))('%s makes a 1600 x 2560 cover with its own fonts', async (_id, style) => {
    const r = await exportEbookCover(loadMiniBook().meta, style, { browser, rules });
    const m = await sharp(r.jpeg).metadata();
    expect([m.width, m.height, m.format]).toEqual([1600, 2560, 'jpeg']);
    expect(r.warnings.filter((w) => w.startsWith('Font'))).toEqual([]);
    const wrap = await exportPaperbackWrap(loadMiniBook().meta, style, { rules, pages: 120, paper: 'cream', browser });
    const info = await inspectPdf(wrap.pdf, { text: false });
    expect(info.fonts.filter((f) => !f.embedded || f.type3)).toEqual([]);
    expect(Math.abs((info.pageSizes[0]?.widthPt ?? 0) / 72 - wrap.size.widthIn)).toBeLessThan(0.001);
  });
});
