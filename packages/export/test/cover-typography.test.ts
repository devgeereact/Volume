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

  it('over concept art, leaves the art untouched and picks the palette colour that reads on it', async () => {
    // Plain white art: no overlay at the corners, and the title flips to the palette's dark colour.
    const art = await sharp({ create: { width: 400, height: 600, channels: 3, background: '#FFFFFF' } })
      .png()
      .toBuffer();
    const style = applyCoverTypography(DEFAULT_COVER_STYLE, { palette: { background: '#1F4B55' } });
    const r = await exportEbookCover(loadMiniBook().meta, style, { browser, rules: loadKdpRules(), background: art });
    const px = async (left: number, top: number) => {
      const { data } = await sharp(r.jpeg).extract({ left, top, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
      return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
    };
    for (const top of [4, 1700, 2556]) for (const c of await px(4, top)) expect(c).toBeGreaterThan(246);
    // Some ink in the title band is the dark teal, not the light cream.
    let dark = 0;
    const { data } = await sharp(r.jpeg).extract({ left: 100, top: 250, width: 1400, height: 500 }).raw().toBuffer({ resolveWithObject: true });
    for (let k = 0; k < data.length; k += 3) if ((data[k] ?? 255) < 90 && (data[k + 1] ?? 255) < 120) dark++;
    expect(dark).toBeGreaterThan(500);
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

describe('subtitle at a fixed height', () => {
  let browser2: Browser;
  beforeAll(async () => {
    browser2 = await acquireBrowser();
  });
  afterAll(async () => {
    await releaseBrowser();
  });

  it('moves down to clear a title that wraps onto many lines, and stays put when there is room', async () => {
    const meta = {
      ...loadMiniBook().meta,
      title: 'Calm on the Night Shift With Many Extra Words In It',
      subtitle: 'A practical guide for NHS nurses working nights',
    };
    const crowded = applyCoverTypography(DEFAULT_COVER_STYLE, { subtitleTopPct: 30 });
    const a = await exportEbookCover(meta, crowded, { browser: browser2, rules: loadKdpRules() });
    expect(a.subtitlePushed).toBe(true);
    const roomy = applyCoverTypography(DEFAULT_COVER_STYLE, { subtitleTopPct: 110, titleTopPct: 10 });
    const b = await exportEbookCover({ ...meta, title: 'Short' }, roomy, { browser: browser2, rules: loadKdpRules() });
    expect(b.subtitlePushed).toBe(false);
  });
});

describe('cover preview page', () => {
  let browser3: Browser;
  beforeAll(async () => {
    browser3 = await acquireBrowser();
  });
  afterAll(async () => {
    await releaseBrowser();
  });

  it('is the build page, and reports where the title, subtitle and author sit', async () => {
    const meta = { ...loadMiniBook().meta, title: 'Steady On Your Feet', subtitle: 'Build confidence in your first year' };
    const style = applyCoverTypography(DEFAULT_COVER_STYLE, { titleAlign: 'right', titleSize: 0.2 });
    const o = { browser: browser3, rules: loadKdpRules() };
    const preview = await exportEbookCover(meta, style, { ...o, htmlOnly: true });
    expect(preview.html).toBeTruthy();
    expect(preview.html).toContain('volume-cover-boxes');
    // The build's own page is the preview's page without the measuring script.
    const built = await exportEbookCover(meta, style, o);
    expect(built.jpeg.length).toBeGreaterThan(1000);

    const ctx = await browser3.newContext({ viewport: { width: 1600, height: 2560 } });
    try {
      const page = await ctx.newPage();
      await page.addInitScript(() => {
        (window as unknown as { __msg: unknown }).__msg = null;
        window.addEventListener('message', (e) => {
          (window as unknown as { __msg: unknown }).__msg = e.data;
        });
      });
      // A real navigation, so the listener added above survives (setContent rewrites the document and drops it).
      await page.route('http://cover.test/', (r) => r.fulfill({ body: preview.html ?? '', contentType: 'text/html' }));
      await page.goto('http://cover.test/', { waitUntil: 'load' });
      await page.waitForFunction('window.__msg !== null');
      const m = await page.evaluate<{
        type: string;
        width: number;
        title: { top: number; height: number; align: string };
        subtitle: { top: number };
        author: { top: number };
        titleSize: number;
      }>('window.__msg');
      expect(m.type).toBe('volume-cover-boxes');
      expect(m.width).toBe(1600);
      expect(m.title.align).toBe('right');
      expect(m.subtitle.top).toBeGreaterThan(m.title.top + m.title.height - 1);
      expect(m.author.top).toBeGreaterThan(m.subtitle.top);
      // 0.2 asked for: the fitted size can only be smaller, and is a share of the cover width.
      expect(m.titleSize).toBeGreaterThan(5);
      expect(m.titleSize).toBeLessThanOrEqual(20.01);
    } finally {
      await ctx.close();
    }
  });

  // Over real art, after owner edits: what the studio shows is what the build writes, pixel for pixel (JPEG noise aside).
  it.each([
    ['the style as it is', {}],
    ['a bigger title in another font and palette', { titleSize: 0.28, titlePosition: 'bottom', fonts: { title: 'Lora' } }],
    ['a centred title at an exact position', { titleAlign: 'center', titleTopPct: 30, titleSize: 0.16 }],
  ])('draws the same picture as the build: %s', async (_name, typography) => {
    const art = await sharp({ create: { width: 800, height: 1280, channels: 3, background: '#1d4f5e' } })
      .composite([
        {
          input: await sharp(
            Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1280"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8d9a8"/><stop offset="0.6" stop-color="#2a6f7f"/><stop offset="1" stop-color="#0d2a36"/></linearGradient></defs><rect width="800" height="1280" fill="url(#g)"/><circle cx="560" cy="880" r="150" fill="#f08a6a"/></svg>`,
            ),
          )
            .png()
            .toBuffer(),
        },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();
    const meta = { ...loadMiniBook().meta, title: 'Steady On Your Feet', subtitle: 'Build confidence, set boundaries and complete preceptorship' };
    const style = applyCoverTypography(DEFAULT_COVER_STYLE, typography);
    const o = { browser: browser3, rules: loadKdpRules(), background: art };
    const preview = await exportEbookCover(meta, style, { ...o, htmlOnly: true });
    const built = await exportEbookCover(meta, style, o);

    const ctx = await browser3.newContext({ viewport: { width: 1600, height: 2560 }, deviceScaleFactor: 1 });
    try {
      const page = await ctx.newPage();
      await page.route('http://cover.test/', (r) => r.fulfill({ body: preview.html ?? '', contentType: 'text/html' }));
      await page.goto('http://cover.test/', { waitUntil: 'load' });
      await page.waitForFunction('window.__coverReady === true');
      const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1600, height: 2560 } });
      const raw = async (b: Buffer): Promise<Buffer> => sharp(b).removeAlpha().resize(400, 640).raw().toBuffer();
      const [a, b] = await Promise.all([raw(shot), raw(built.jpeg)]);
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
      expect(sum / a.length).toBeLessThan(2);
    } finally {
      await ctx.close();
    }
  });
});
