// Cover layers (background modes, shapes, artwork settings, spine colours) with print parity:
// - old covers render byte for byte as before (hashes of the pre-layer HTML in golden/covers/legacy-html.sha256.json);
// - each mode has golden files: the layer markup exact, and small renders of the eBook JPEG and the wrap PDF;
// - parity: the page the studio previews (htmlOnly) and the built JPEG and PDF are the same picture.
// UPDATE_GOLDEN=1 writes the golden files first.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { backgroundLayerHtml, DEFAULT_COVER_STYLE, layerContrast, layersNeedRaster, normaliseCoverLayers, shapeHtml, type CoverStyle } from '@volume/core';
import { loadKdpRules } from '@volume/core/node';
import { acquireBrowser, applyCoverTypography, exportEbookCover, exportPaperbackWrap, releaseBrowser, renderPdfPages } from '../src/index.ts';
import { golden, goldenPath, loadMiniBook, placeholderSpread } from './helpers.ts';

const rules = loadKdpRules();
const meta = loadMiniBook().meta;
let browser: Browser;
let picture: Buffer;
let art: Buffer;
beforeAll(async () => {
  browser = await acquireBrowser();
  picture = await placeholderSpread(4);
  art = await placeholderSpread(1);
});
afterAll(async () => {
  await releaseBrowser();
});

const NAVY = { background: '#0B1F4D', title: '#FFFFFF', subtitle: '#F2F6FF', author: '#FFFFFF', accent: '#FFB547', band: '#1D4E9E' };

/** Each new mode as the studio would send it (typography keys). */
const MODES: Record<string, { typography: Record<string, unknown>; picture?: boolean; art?: boolean }> = {
  'gradient-linear-wrap': {
    typography: { colours: NAVY, background: { mode: 'gradient', span: 'wrap', gradient: { type: 'linear', from: '#0B1F4D', to: '#7A2E5E', angle: 120 } } },
  },
  'gradient-radial-front': {
    typography: {
      colours: NAVY,
      background: { mode: 'gradient', span: 'front', gradient: { type: 'radial', from: '#13909B', to: '#072A3F', centreX: 30, centreY: 25 } },
    },
  },
  'image-upload': {
    picture: true,
    typography: {
      colours: NAVY,
      background: { mode: 'image', span: 'wrap', image: { assetId: 'PIC1', opacity: 0.9, blend: 'normal', scale: 1.2, focusX: 30, focusY: 40 } },
    },
  },
  'image-texture': {
    typography: { colours: NAVY, background: { mode: 'image', span: 'front', image: { texture: 'halftone' } } },
  },
  tint: {
    picture: true,
    typography: {
      colours: NAVY,
      background: {
        mode: 'image',
        span: 'front',
        image: { assetId: 'PIC1', opacity: 1, blend: 'normal', greyscale: true, blur: 6, tint: { colour: '#1B1035', strength: 0.55 } },
      },
    },
  },
  shapes: {
    typography: {
      colours: NAVY,
      shapes: [
        { id: 'a', kind: 'circle', surface: 'front', x: 55, y: 70, w: 60, h: 60, colour: '#FFB547', opacity: 0.8, layer: 'behind' },
        { id: 'b', kind: 'star', surface: 'front', x: 8, y: 118, w: 16, h: 16, rotation: 12, colour: '#F28FD0', opacity: 1, layer: 'over' },
        { id: 'c', kind: 'stripes', surface: 'back', x: 0, y: 120, w: 100, h: 30, colour: '#1D4E9E', opacity: 0.7, layer: 'behind' },
        { id: 'd', kind: 'ring', surface: 'back', x: 60, y: 10, w: 30, h: 30, colour: '#FFB547', opacity: 0.6, layer: 'behind' },
      ],
    },
  },
  spine: {
    typography: { colours: NAVY, spine: { colour: '#C2185B', textColour: '#FFF59D' } },
  },
  artwork: {
    art: true,
    typography: { colours: NAVY, artwork: { opacity: 0.6, rotation: 8, box: { x: 10, y: 20, w: 80, h: 80 } } },
  },
};

const styleFor = (name: string): CoverStyle => applyCoverTypography(DEFAULT_COVER_STYLE, MODES[name]!.typography);
const optsFor = (name: string) => ({
  ...(MODES[name]!.picture ? { backgroundImage: picture } : {}),
  ...(MODES[name]!.art ? { background: art } : {}),
});
const WRAP = { trimWidthIn: 6, spineIn: 0.27, bleedIn: 0.125 };

/** With COVER_DUMP=<folder>, the renders are written there for a look by eye (the side-by-side shots in the report). */
function dump(file: string, data: Buffer): void {
  const dir = process.env.COVER_DUMP;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/${file}`, data);
}

/** Mean absolute RGB difference (0 to 255) of two images scaled to the same small size. */
async function meanDiff(a: Buffer, b: Buffer, width: number): Promise<number> {
  const ra = await sharp(a).removeAlpha().resize({ width, fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const rb = await sharp(b).removeAlpha().resize({ width: ra.info.width, height: ra.info.height, fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < ra.data.length; i++) sum += Math.abs((ra.data[i] ?? 0) - (rb.data[i] ?? 0));
  return sum / ra.data.length;
}

/** A small render, compared with its golden PNG (written with UPDATE_GOLDEN=1). Small enough that font rasterisers do not matter. */
async function pixelGolden(name: string, png: Buffer, width: number): Promise<number> {
  const small = await sharp(png).removeAlpha().resize({ width }).png().toBuffer();
  const path = goldenPath(`covers/${name}.png`);
  if (process.env.UPDATE_GOLDEN === '1' || !existsSync(path)) {
    mkdirSync(goldenPath('covers/'), { recursive: true });
    if (process.env.UPDATE_GOLDEN === '1' || process.env.WRITE_MISSING_GOLDEN === '1') writeFileSync(path, small);
  }
  return meanDiff(small, readFileSync(path), width);
}

/** The preview page (what the studio shows) as the browser draws it. */
async function shot(html: string, w: number, h: number): Promise<Buffer> {
  const ctx = await browser.newContext({ viewport: { width: Math.ceil(w), height: Math.ceil(h) }, deviceScaleFactor: 1 });
  try {
    const p = await ctx.newPage();
    await p.setContent(html, { waitUntil: 'load' });
    await p.waitForFunction('window.__coverReady === true');
    return await p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: Math.ceil(w), height: Math.ceil(h) } });
  } finally {
    await ctx.close();
  }
}

describe('old covers', () => {
  it('render byte for byte as before the layers (HTML hashes recorded on the pre-layer code)', async () => {
    const want = JSON.parse(readFileSync(goldenPath('covers/legacy-html.sha256.json'), 'utf8')) as Record<string, string>;
    const square = await sharp({ create: { width: 400, height: 640, channels: 3, background: '#3f7f4b' } })
      .png()
      .toBuffer();
    const typo = applyCoverTypography(DEFAULT_COVER_STYLE, { titlePosition: 'middle', colours: { background: '#112233' }, authorTopPct: 120 });
    const h = (s: string | undefined) =>
      createHash('sha256')
        .update(s ?? '')
        .digest('hex');
    const got: Record<string, string> = {};
    for (const [name, style] of [
      ['default', DEFAULT_COVER_STYLE],
      ['typo', typo],
    ] as const) {
      for (const bg of [undefined, square]) {
        const k = `${name}-${bg ? 'art' : 'plain'}`;
        const e = await exportEbookCover(meta, style, { rules, htmlOnly: true, ...(bg ? { background: bg } : {}) });
        const w = await exportPaperbackWrap(meta, style, {
          rules,
          pages: 120,
          paper: 'cream',
          htmlOnly: true,
          blurb: 'A blurb.',
          shortBio: 'Bio.',
          ...(bg ? { background: bg } : {}),
        });
        got[`ebook-${k}`] = h(e.html);
        got[`wrap-${k}`] = h(w.html);
      }
    }
    expect(got).toEqual(want);
  });

  it('typography saved before the layers gives no layer fields', () => {
    const saved = { styleId: 'x', paletteId: 'y', showSubtitle: true, titlePosition: 'top', colours: { title: '#000000' }, sizePct: 100 };
    const s = applyCoverTypography(DEFAULT_COVER_STYLE, saved);
    expect([s.background, s.artwork, s.shapes, s.spine]).toEqual([undefined, undefined, undefined, undefined]);
    expect(normaliseCoverLayers({})).toEqual({});
  });

  it('drops layer values that are not valid instead of failing', () => {
    const l = normaliseCoverLayers({
      background: { mode: 'gradient', gradient: { from: 'red', to: '#000' } },
      shapes: [{ kind: 'hexagon', colour: '#fff' }, { kind: 'circle', colour: '#fff', x: 999, opacity: 7 }, null],
      spine: { colour: 'blue' },
      artwork: { opacity: 1, rotation: 0 },
    });
    expect(l.background).toBeUndefined();
    expect(l.spine).toBeUndefined();
    expect(l.artwork).toBeUndefined();
    expect(l.shapes).toHaveLength(1);
    expect(l.shapes?.[0]).toMatchObject({ kind: 'circle', x: 150, opacity: 1, surface: 'front', layer: 'behind' });
  });

  it('a project move that nulls a missing picture id leaves the colour, not a broken picture', () => {
    expect(normaliseCoverLayers({ background: { mode: 'image', image: { assetId: null } } })).toEqual({});
  });
});

describe('layer markup goldens (exact)', () => {
  it.each(Object.keys(MODES))('%s', (name) => {
    const s = styleFor(name);
    const parts = [
      s.background ? backgroundLayerHtml(s.background, s.colours.background, { src: 'data:PIC', blurUnit: '1.6px' }) : '',
      ...(s.shapes ?? []).map(shapeHtml),
      s.spine ? JSON.stringify(s.spine) : '',
      s.artwork ? JSON.stringify(s.artwork) : '',
    ]
      .filter(Boolean)
      .join('\n');
    const out = `${parts}\n`;
    expect(out).toBe(golden(`covers/${name}.layers.txt`, out));
  });
});

describe.each(Object.keys(MODES))('%s: eBook JPEG and wrap PDF', (name) => {
  const style = () => styleFor(name);

  it('eBook JPEG matches its golden render and the studio preview', async () => {
    const opts = { rules, browser, wrap: WRAP, ...optsFor(name) };
    const built = await exportEbookCover(meta, style(), opts);
    expect(await pixelGolden(`${name}.ebook`, built.jpeg, 80)).toBeLessThan(4);
    const preview = await exportEbookCover(meta, style(), { ...opts, htmlOnly: true });
    const seen = await shot(preview.html ?? '', built.widthPx, built.heightPx);
    dump(`${name}.ebook.preview.png`, seen);
    dump(`${name}.ebook.jpg`, built.jpeg);
    expect(await meanDiff(seen, built.jpeg, 200)).toBeLessThan(2);
  });

  it('wrap PDF matches its golden render and the studio preview', async () => {
    const opts = { rules, browser, pages: 120, paper: 'cream' as const, blurb: 'A short blurb for the back.', shortBio: 'A short bio.', ...optsFor(name) };
    const built = await exportPaperbackWrap(meta, style(), opts);
    // Rendered at the preview's own 96 DPI, so neither side is shrunk by a different resampler.
    const [page] = await renderPdfPages(built.pdf, [1], { browser, scale: 96 / 72 });
    expect(await pixelGolden(`${name}.wrap`, page!, 240)).toBeLessThan(4);
    const preview = await exportPaperbackWrap(meta, style(), { ...opts, htmlOnly: true });
    const seen = await shot(preview.html ?? '', built.size.widthIn * 96, built.size.heightIn * 96);
    dump(`${name}.wrap.preview.png`, seen);
    dump(`${name}.wrap.pdf.png`, page!);
    expect(await meanDiff(seen, page!, 240)).toBeLessThan(3);
  });
});

describe('what the layers do', () => {
  it('a spine colour and spine text colour replace the band and background colours', async () => {
    const r = await exportPaperbackWrap(meta, styleFor('spine'), { rules, pages: 120, paper: 'cream', htmlOnly: true });
    expect(r.html).toMatch(/\.spine \{[^}]*background: #C2185B;/);
    expect(r.html).toMatch(/\.spine \.st \{[^}]*color: #FFF59D;/);
  });

  it('a whole-wrap background sits under the back, spine and front; a front-only one inside the front', async () => {
    const wide = await exportPaperbackWrap(meta, styleFor('gradient-linear-wrap'), { rules, pages: 120, paper: 'cream', htmlOnly: true });
    expect(wide.html).toContain('<div class="wrap">\n<div class="bgl">');
    const front = await exportPaperbackWrap(meta, styleFor('gradient-radial-front'), { rules, pages: 120, paper: 'cream', htmlOnly: true });
    expect(front.html).not.toContain('<div class="wrap">\n<div class="bgl">');
    expect(front.html).toMatch(/<div class="front [^"]*">\n<div class="bgl">/);
  });

  it('on the eBook a whole-wrap background shows the front share of the wrap', async () => {
    const r = await exportEbookCover(meta, styleFor('gradient-linear-wrap'), { rules, htmlOnly: true, wrap: WRAP });
    expect(r.html).toMatch(/<div class="bgl" style="left: -106\.5833%; width: 208\.6667%; right: auto;">/);
  });

  it('blends, blur, greyscale and filtered textures make the wrap one 300 DPI image, so it prints as previewed', async () => {
    expect(layersNeedRaster(styleFor('tint'))).toEqual(['a blurred background picture', 'a greyscale background picture']);
    expect(layersNeedRaster(styleFor('image-texture'))).toEqual(['a blend mode on the background picture']);
    expect(layersNeedRaster(styleFor('gradient-linear-wrap'))).toEqual([]);
    const r = await exportPaperbackWrap(meta, styleFor('tint'), { rules, browser, pages: 120, paper: 'cream', backgroundImage: picture });
    expect(r.rasterised).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/blurred background picture.*300 DPI image/);
  });

  it('the artwork sits in its own box, faded and turned', async () => {
    const r = await exportEbookCover(meta, styleFor('artwork'), { rules, browser, background: art });
    // Above the box (20 cover-width percent down = 320 px) the cover is its background colour, not art.
    const { data } = await sharp(r.jpeg).extract({ left: 700, top: 20, width: 40, height: 20 }).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
    expect(Math.abs((data[0] ?? 0) - 0x0b) + Math.abs((data[1] ?? 0) - 0x1f) + Math.abs((data[2] ?? 0) - 0x4d)).toBeLessThan(30);
    const html = (await exportEbookCover(meta, styleFor('artwork'), { rules, htmlOnly: true, background: art })).html ?? '';
    expect(html).toContain('.front .bg { inset: auto; left: 10cqw; top: 20cqw; width: 80cqw; height: 80cqw; opacity: 0.6; transform: rotate(8deg); }');
  });

  it('a missing background picture warns and falls back to the colour', async () => {
    const r = await exportEbookCover(meta, styleFor('image-upload'), { rules, htmlOnly: true });
    expect(r.warnings).toContain('The background picture was not found, so the cover uses its background colour there.');
    expect(r.html).not.toContain('<img class="bgl-i"');
  });

  it('a low resolution background picture gets the KDP DPI warning', async () => {
    const r = await exportPaperbackWrap(meta, styleFor('image-upload'), { rules, pages: 120, paper: 'cream', htmlOnly: true, backgroundImage: picture });
    expect(r.warnings.join(' ')).toMatch(/Background picture is about \d+ DPI where it prints; KDP asks for 300 DPI/);
  });
});

describe('contrast stays honest', () => {
  it('gradients are measured at their weakest point, pictures and shapes over the type ask for a look', () => {
    const c = { background: '#FFFFFF', title: '#111111', subtitle: '#111111', author: '#111111' };
    const g = normaliseCoverLayers({ background: { mode: 'gradient', gradient: { from: '#FFFFFF', to: '#222222' } } });
    const r = layerContrast(g, c, { art: false, showSubtitle: true });
    expect(r.map((x) => x.status)).toEqual(['fail', 'fail', 'fail']);
    expect(r[0]?.detail).toMatch(/gradient’s weakest point/);
    const pic = layerContrast(normaliseCoverLayers(MODES['image-upload']!.typography), c, { art: false, showSubtitle: false });
    expect(pic.map((x) => x.status)).toEqual(['look', 'look']);
    const over = layerContrast(normaliseCoverLayers(MODES['shapes']!.typography), NAVY, { art: false, showSubtitle: false });
    expect(over.every((x) => x.status === 'look')).toBe(true);
    const behind = layerContrast(normaliseCoverLayers({ shapes: [{ kind: 'square', colour: '#FFFFFF', opacity: 1, x: 0, y: 0, w: 100, h: 100 }] }), NAVY, {
      art: false,
      showSubtitle: false,
    });
    expect(behind[0]).toMatchObject({ status: 'fail' });
    expect(behind[0]?.detail).toMatch(/where a shape sits behind it/);
  });

  it('the build measures the real pixels behind each line and warns when they are too close', async () => {
    const pale = applyCoverTypography(DEFAULT_COVER_STYLE, {
      colours: { ...NAVY, title: '#F7B538' },
      background: { mode: 'gradient', span: 'front', gradient: { type: 'linear', from: '#F7B538', to: '#F5C15C', angle: 180 } },
    });
    const r = await exportEbookCover(meta, pale, { rules, browser });
    const title = r.contrast?.find((c) => c.part === 'title');
    expect(title?.ratio).toBeLessThan(1.5);
    expect(r.warnings.join(' ')).toMatch(/The title reads at about 1\.\d to 1 against what is behind it/);
    const good = await exportEbookCover(meta, styleFor('gradient-linear-wrap'), { rules, browser });
    expect(good.contrast?.find((c) => c.part === 'title')?.ratio).toBeGreaterThan(3);
  });

  it('covers without layers are not measured (no change to their builds)', async () => {
    const r = await exportEbookCover(meta, DEFAULT_COVER_STYLE, { rules, browser });
    expect(r.contrast).toBeUndefined();
  });
});
