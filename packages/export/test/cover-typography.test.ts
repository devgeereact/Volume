import sharp from 'sharp';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_COVER_STYLE } from '@volume/core';
import { loadKdpRules } from '@volume/core/node';
import { acquireBrowser, applyCoverTypography, exportEbookCover, releaseBrowser } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// The owner's cover typography (title position, palette, sizes) on top of a cover style.

describe('applyCoverTypography', () => {
  it('applies position, size, colours, fonts and case, ignoring values that are not valid', () => {
    const s = applyCoverTypography(DEFAULT_COVER_STYLE, {
      titlePosition: 'middle',
      titleSize: 'small',
      palette: { background: '#102030', title: 'red' },
      colours: { accent: '#abc' },
      fonts: { title: 'Lora' },
      align: 'left',
      authorUppercase: false,
    });
    expect(s.titleTopPct).toBe(60);
    expect(s.titleScale).toBeCloseTo(DEFAULT_COVER_STYLE.titleScale * 0.8, 6);
    expect(s.colours).toMatchObject({ background: '#102030', title: DEFAULT_COVER_STYLE.colours.title, accent: '#abc' });
    expect(s.fonts.title).toBe('Lora');
    expect(s.align).toBe('left');
    expect(s.authorUppercase).toBe(false);
    expect(DEFAULT_COVER_STYLE.colours.background).toBe('#F3EEE1'); // the style itself is not changed
  });

  it('takes exact numbers and leaves the style alone for empty or odd input', () => {
    expect(applyCoverTypography(DEFAULT_COVER_STYLE, { titleTopPct: 20, titlePosition: 'bottom', titleSize: 18 })).toMatchObject({
      titleTopPct: 20,
      titleScale: 0.18,
    });
    expect(applyCoverTypography(DEFAULT_COVER_STYLE, { titleSize: 0.9, titleTopPct: -5 })).toEqual(DEFAULT_COVER_STYLE);
    expect(applyCoverTypography(DEFAULT_COVER_STYLE, null)).toEqual(DEFAULT_COVER_STYLE);
  });
});

describe('applyCoverTypography: editing the cover from the preview', () => {
  it('takes right alignment for the whole front and for each element, falling back to the front when unset', () => {
    const s = applyCoverTypography(DEFAULT_COVER_STYLE, { align: 'right', subtitleAlign: 'left', authorAlign: 'centre' });
    expect(s.align).toBe('right');
    expect(s.titleAlign).toBeUndefined(); // the title follows `align`
    expect(s.subtitleAlign).toBe('left');
    expect(s.authorAlign).toBe('center');
    expect(applyCoverTypography(DEFAULT_COVER_STYLE, { titleAlign: 'right' }).titleAlign).toBe('right');
    expect(applyCoverTypography(DEFAULT_COVER_STYLE, { titleAlign: 'middle' }).titleAlign).toBeUndefined();
  });

  it('takes the author position and the subtitle and author size multipliers within range', () => {
    const s = applyCoverTypography(DEFAULT_COVER_STYLE, { authorTopPct: 128.5, subtitleSize: 1.4, authorSize: 0.6 });
    expect(s).toMatchObject({ authorTopPct: 128.5, subtitleScale: 1.4, authorScale: 0.6 });
    expect(applyCoverTypography(DEFAULT_COVER_STYLE, { authorTopPct: 151, subtitleSize: 1.7, authorSize: 0.5 })).toEqual(DEFAULT_COVER_STYLE);
  });

  it('leaves covers saved before these fields unchanged', () => {
    const old = { styleId: 'x', paletteId: 'p', showSubtitle: true, titleTopPct: 12, titleSize: 0.14, sizePct: 100, align: 'left' };
    const s = applyCoverTypography(DEFAULT_COVER_STYLE, old);
    for (const k of ['titleAlign', 'subtitleAlign', 'authorAlign', 'authorTopPct', 'subtitleScale', 'authorScale'] as const) expect(s[k]).toBeUndefined();
    expect(s.align).toBe('left');
  });
});

describe('eBook cover with the owner palette', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await acquireBrowser();
  });
  afterAll(async () => {
    await releaseBrowser();
  });

  it('paints the chosen background colour', async () => {
    const style = applyCoverTypography(DEFAULT_COVER_STYLE, { palette: { background: '#1F4B55' } });
    const r = await exportEbookCover(loadMiniBook().meta, style, { browser, rules: loadKdpRules() });
    const { data } = await sharp(r.jpeg).extract({ left: 4, top: 1200, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    const [red = 0, green = 0, blue = 0] = data;
    expect(Math.abs(red - 0x1f)).toBeLessThan(12);
    expect(Math.abs(green - 0x4b)).toBeLessThan(12);
    expect(Math.abs(blue - 0x55)).toBeLessThan(12);
  });

  it('over concept art, washes it with the palette background like the Cover studio preview (not black)', async () => {
    // Plain white art: the corner should be 55% palette teal over white, not darkened grey.
    const art = await sharp({ create: { width: 400, height: 600, channels: 3, background: '#FFFFFF' } })
      .png()
      .toBuffer();
    const style = applyCoverTypography(DEFAULT_COVER_STYLE, { palette: { background: '#1F4B55' } });
    const r = await exportEbookCover(loadMiniBook().meta, style, { browser, rules: loadKdpRules(), background: art });
    const { data } = await sharp(r.jpeg).extract({ left: 4, top: 1200, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    const mix = (c: number) => Math.round(c * 0.55 + 255 * 0.45);
    const [red = 0, green = 0, blue = 0] = data;
    expect(Math.abs(red - mix(0x1f))).toBeLessThan(14);
    expect(Math.abs(green - mix(0x4b))).toBeLessThan(14);
    expect(Math.abs(blue - mix(0x55))).toBeLessThan(14);
  });

  it('puts a right-aligned author at its exact position', async () => {
    const style = applyCoverTypography(DEFAULT_COVER_STYLE, { authorAlign: 'right', authorTopPct: 100, titleTopPct: 10 });
    const r = await exportEbookCover(loadMiniBook().meta, style, { browser, rules: loadKdpRules() });
    // 100 cqw on a 1600 px wide cover is y = 1600. Count pixels that differ from the background in a band around it.
    const ink = async (left: number, width: number) => {
      const { data } = await sharp(r.jpeg).extract({ left, top: 1590, width, height: 140 }).raw().toBuffer({ resolveWithObject: true });
      let n = 0;
      for (let k = 0; k < data.length; k += 3) if (Math.abs((data[k] ?? 0) - 0xf3) + Math.abs((data[k + 1] ?? 0) - 0xee) > 60) n++;
      return n;
    };
    expect(await ink(0, 500)).toBe(0);
    expect(await ink(900, 700)).toBeGreaterThan(100);
  });
});
