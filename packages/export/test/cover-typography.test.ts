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
});
