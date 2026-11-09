import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_COVER_STYLE } from '@volume/core';
import { loadKdpRules } from '@volume/core/node';
import { acquireBrowser, exportPaperbackWrap, releaseBrowser } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// Reported on 8 November 2026: on a book with a long title the spine text was cut off in the middle of the title
// ("... Windowsill in") and the author's name was gone, with no warning, because the spine text had a fixed size and
// the box simply clipped it. The page now fits the spine text: smaller first, then without the author, then with an
// ellipsis. The page is the same one the studio previews and the build prints, so this is measured in a browser.

const rules = loadKdpRules();
const meta = loadMiniBook().meta;
const LONG = 'The Complete Guide to Growing Fresh Herbs on a Narrow Windowsill in Any Weather';
const ABSURD = `${LONG}, With Notes on Light, Pots, Water, Harvests and Everything Else a Beginner Might Wonder About in the First Year`.repeat(2);

let browser: Browser;
beforeAll(async () => {
  browser = await acquireBrowser();
});
afterAll(async () => {
  await releaseBrowser();
});

interface SpineReading {
  clipped: boolean;
  fontPt: number;
  startPt: number;
  authorShown: boolean;
  ellipsis: boolean;
}

async function readSpine(title: string, pages: number): Promise<SpineReading> {
  const wrap = await exportPaperbackWrap({ ...meta, title }, DEFAULT_COVER_STYLE, {
    rules,
    pages,
    paper: 'cream',
    htmlOnly: true,
    blurb: 'A blurb.',
    shortBio: 'Bio.',
  });
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await page.setContent(wrap.html ?? '', { waitUntil: 'load' });
    await page.waitForFunction('window.__coverReady === true');
    return await page.evaluate(() => {
      const st = document.querySelector<HTMLElement>('.spine .st');
      if (!st) throw new Error('no spine text on the wrap');
      const au = st.querySelector<HTMLElement>('.au');
      return {
        clipped: st.scrollHeight > st.clientHeight + 1,
        fontPt: (parseFloat(getComputedStyle(st).fontSize) * 72) / 96,
        startPt: Number(st.getAttribute('data-start-pt') ?? '0'),
        authorShown: !!au && getComputedStyle(au).display !== 'none',
        ellipsis: st.getAttribute('data-ellipsis') === '1',
      };
    });
  } finally {
    await ctx.close();
  }
}

describe('spine text fits the spine', () => {
  it('shrinks a long title until all of it and the author fit, with nothing clipped', async () => {
    const s = await readSpine(LONG, 300);
    expect(s.clipped).toBe(false);
    expect(s.authorShown).toBe(true);
    expect(s.ellipsis).toBe(false);
    expect(s.fontPt).toBeGreaterThanOrEqual(6);
    expect(s.fontPt).toBeLessThan(s.startPt);
  });

  it('leaves a short title at its normal size', async () => {
    const s = await readSpine('Quiet Rooms', 300);
    expect(s.clipped).toBe(false);
    expect(s.authorShown).toBe(true);
    expect(s.fontPt).toBeCloseTo(s.startPt, 1);
  });

  it('drops the author, then ends the title with an ellipsis, when even the smallest size cannot hold it', async () => {
    const s = await readSpine(ABSURD, 300);
    expect(s.clipped).toBe(false);
    expect(s.authorShown).toBe(false);
    expect(s.ellipsis).toBe(true);
    expect(s.fontPt).toBeGreaterThanOrEqual(6);
  });
});
