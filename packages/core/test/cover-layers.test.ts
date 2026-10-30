import { describe, expect, it } from 'vitest';
import {
  COVER_SHAPE_KINDS,
  COVER_TEXTURES,
  artworkCss,
  backgroundLayerHtml,
  gradientCss,
  gradientWorstContrast,
  hasLayers,
  layerContrast,
  layersNeedRaster,
  measuredContrast,
  mixHex,
  normaliseCoverLayers,
  shapeArt,
  shapeHtml,
  shapesOn,
  textureDataUrl,
  wrapWindow,
  type CoverLayers,
} from '../src/index.ts';

const colours = { background: '#1f2d4a', title: '#ffffff', subtitle: '#ffffff', author: '#ffffff' };

describe('normaliseCoverLayers', () => {
  it('returns nothing for an old typography record, so old covers draw as before', () => {
    expect(normaliseCoverLayers({})).toEqual({});
    expect(hasLayers(normaliseCoverLayers({ titleScale: 1 }))).toBe(false);
  });

  it('keeps a valid gradient and clamps its numbers', () => {
    const l = normaliseCoverLayers({
      background: { mode: 'gradient', span: 'front', gradient: { type: 'radial', from: '#000', to: '#ffffff', angle: 999, centreX: -5 } },
    });
    expect(l.background).toEqual({
      mode: 'gradient',
      span: 'front',
      gradient: { type: 'radial', from: '#000', to: '#ffffff', angle: 360, centreX: 0, centreY: 35 },
    });
  });

  it('drops a gradient without both colours, a solid mode and junk', () => {
    expect(normaliseCoverLayers({ background: { mode: 'gradient', gradient: { from: '#000' } } }).background).toBeUndefined();
    expect(normaliseCoverLayers({ background: { mode: 'gradient' } }).background).toBeUndefined();
    expect(normaliseCoverLayers({ background: { mode: 'solid' } }).background).toBeUndefined();
    expect(normaliseCoverLayers({ background: 'red' }).background).toBeUndefined();
  });

  it('reads a texture with its own defaults, and a tint only when it has strength', () => {
    const l = normaliseCoverLayers({ background: { mode: 'image', image: { texture: 'grain', tint: { colour: '#ff0000', strength: 0.4 } } } });
    expect(l.background?.image).toMatchObject({ texture: 'grain', blur: 0, greyscale: false, tint: { colour: '#ff0000', strength: 0.4 } });
    const none = normaliseCoverLayers({ background: { mode: 'image', image: { texture: 'grain', tint: { colour: '#ff0000', strength: 0 } } } });
    expect(none.background?.image?.tint).toBeUndefined();
  });

  it('reads an uploaded picture by asset id and refuses a bad id', () => {
    const ok = normaliseCoverLayers({ background: { mode: 'image', image: { assetId: 'abc_123', blur: 99, greyscale: true, blend: 'multiply' } } });
    expect(ok.background?.image).toMatchObject({ assetId: 'abc_123', greyscale: true, blend: 'multiply' });
    expect(ok.background?.image?.texture).toBeUndefined();
    expect(normaliseCoverLayers({ background: { mode: 'image', image: { assetId: '../etc' } } }).background).toBeUndefined();
    expect(normaliseCoverLayers({ background: { mode: 'image', image: 'x' } }).background).toBeUndefined();
  });

  it('keeps valid shapes, numbers them and leaves out bad ones', () => {
    const l = normaliseCoverLayers({
      shapes: [{ kind: 'star', colour: '#abc', surface: 'back', layer: 'over', rotation: 400 }, { kind: 'hexagon', colour: '#abc' }, { kind: 'circle' }, 'x'],
    });
    expect(l.shapes).toHaveLength(1);
    expect(l.shapes?.[0]).toMatchObject({ id: 'shape-1', kind: 'star', surface: 'back', layer: 'over', rotation: 180 });
    expect(normaliseCoverLayers({ shapes: [] }).shapes).toBeUndefined();
  });

  it('keeps artwork settings only when they differ from the default', () => {
    expect(normaliseCoverLayers({ artwork: { opacity: 1, rotation: 0 } }).artwork).toBeUndefined();
    expect(normaliseCoverLayers({ artwork: { opacity: 0.5, box: { x: 10, y: 10, w: 50, h: 50 } } }).artwork).toMatchObject({ opacity: 0.5 });
  });

  it('reads spine colours and the show-background switch', () => {
    expect(normaliseCoverLayers({ spine: { colour: '#111111', textColour: '#eeeeee', showBackground: true } }).spine).toEqual({
      colour: '#111111',
      textColour: '#eeeeee',
      showBackground: true,
    });
    expect(normaliseCoverLayers({ spine: { colour: 'blue' } }).spine).toBeUndefined();
  });
});

describe('drawing helpers', () => {
  it('writes linear and radial gradients as CSS', () => {
    expect(gradientCss({ type: 'linear', from: '#000', to: '#fff', angle: 90, centreX: 50, centreY: 50 })).toBe('linear-gradient(90deg, #000, #fff)');
    expect(gradientCss({ type: 'radial', from: '#000', to: '#fff', angle: 0, centreX: 20, centreY: 30 })).toBe(
      'radial-gradient(circle at 20% 30%, #000, #fff)',
    );
  });

  it('draws every texture as an SVG data URL', () => {
    for (const t of COVER_TEXTURES) expect(textureDataUrl(t)).toMatch(/^data:image\/svg\+xml,/);
  });

  it('places the wrap window over the front, or the whole front without sizes', () => {
    expect(wrapWindow(undefined)).toEqual({ left: 0, width: 100 });
    const w = wrapWindow({ trimWidthIn: 6, spineIn: 0.5, bleedIn: 0.125 });
    expect(w.left).toBeCloseTo((-(0.125 + 6 + 0.5) / 6) * 100);
    expect(w.width).toBeCloseTo(((0.25 + 12 + 0.5) / 6) * 100);
  });

  it('builds the background layer with picture filters and tint', () => {
    const l = normaliseCoverLayers({
      background: { mode: 'image', image: { assetId: 'a1', blur: 4, greyscale: true, tint: { colour: '#ff0000', strength: 0.3 } } },
    });
    const html = backgroundLayerHtml(l.background!, '#123456', { src: 'data:x"y', blurUnit: '1px', boxStyle: 'left: 0' });
    expect(html).toContain('blur(calc(4 * 1px))');
    expect(html).toContain('grayscale(1)');
    expect(html).toContain('class="bgl-t"');
    expect(html).toContain('&quot;');
    expect(html).toContain('style="left: 0"');
    const g = normaliseCoverLayers({ background: { mode: 'gradient', gradient: { from: '#000', to: '#fff' } } });
    expect(backgroundLayerHtml(g.background!, '#123456', { blurUnit: '1px' })).toContain('linear-gradient');
  });

  it('draws every shape kind as SVG and places it in container units', () => {
    for (const k of COVER_SHAPE_KINDS) expect(shapeArt(k, '#ff0000', { w: 30, h: 20 })).toContain('<svg');
    const [s] = normaliseCoverLayers({ shapes: [{ kind: 'dots', colour: '#fff', x: 5, y: 6, w: 20, h: 20, rotation: 10, layer: 'over' }] }).shapes!;
    const html = shapeHtml(s!);
    expect(html).toContain('left: 5cqw');
    expect(html).toContain('rotate(10deg)');
    expect(html).toContain('over');
    expect(shapesOn([s!], 'front')).toHaveLength(1);
    expect(shapesOn(undefined, 'back')).toEqual([]);
  });

  it('writes artwork CSS only when there is something to set', () => {
    expect(artworkCss(undefined)).toBe('');
    const css = artworkCss({ opacity: 0.5, rotation: 15, box: { x: 1, y: 2, w: 3, h: 4 } });
    expect(css).toContain('opacity: 0.5');
    expect(css).toContain('rotate(15deg)');
    expect(css).toContain('left: 1cqw');
  });

  it('says why a wrap must be one image', () => {
    const plain = normaliseCoverLayers({ background: { mode: 'image', image: { assetId: 'a1' } } });
    expect(layersNeedRaster(plain)).toEqual([]);
    const busy = normaliseCoverLayers({ background: { mode: 'image', image: { assetId: 'a1', blend: 'multiply', blur: 2, greyscale: true } } });
    expect(layersNeedRaster(busy)).toHaveLength(3);
    const grain = normaliseCoverLayers({ background: { mode: 'image', image: { texture: 'grain' } } });
    expect(layersNeedRaster(grain).some((w) => w.includes('texture'))).toBe(true);
  });
});

describe('contrast', () => {
  it('mixes colours and finds a gradient’s weakest point', () => {
    expect(mixHex('#ffffff', '#000000', 1)).toBe('#ffffff');
    expect(mixHex('#fff', '#000', 0)).toBe('#000000');
    const worst = gradientWorstContrast('#ffffff', { type: 'linear', from: '#000000', to: '#ffffff', angle: 0, centreX: 50, centreY: 50 });
    expect(worst).toBeCloseTo(1, 1);
  });

  it('measures a plain background and a shape behind the type', () => {
    expect(layerContrast({}, colours, { art: false, showSubtitle: true }).every((c) => c.status === 'pass')).toBe(true);
    const l = normaliseCoverLayers({ shapes: [{ kind: 'circle', colour: '#ffffff', layer: 'behind', opacity: 1 }] });
    const res = layerContrast(l, colours, { art: false, showSubtitle: false });
    expect(res).toHaveLength(2);
    expect(res[0]?.status).toBe('fail');
    expect(res[0]?.detail).toContain('shape');
  });

  it('measures a gradient at its weakest point', () => {
    const l = normaliseCoverLayers({ background: { mode: 'gradient', gradient: { from: '#000000', to: '#ffffff' } } });
    expect(layerContrast(l, colours, { art: false, showSubtitle: true })[0]?.detail).toContain('weakest');
  });

  it('says "look" when it cannot judge from the settings', () => {
    const pic: CoverLayers = normaliseCoverLayers({ background: { mode: 'image', image: { texture: 'clouds' } } });
    expect(layerContrast(pic, colours, { art: false, showSubtitle: true }).every((c) => c.status === 'look')).toBe(true);
    expect(layerContrast({}, colours, { art: true, showSubtitle: true })[0]?.status).toBe('look');
    expect(layerContrast({ artwork: { opacity: 0.5, rotation: 0 } }, colours, { art: true, showSubtitle: true })[0]?.detail).toContain('guide');
    const over = normaliseCoverLayers({ shapes: [{ kind: 'square', colour: '#000', layer: 'over' }] });
    expect(layerContrast(over, colours, { art: false, showSubtitle: true })[0]?.detail).toContain('over the text');
  });

  it('measures real pixels at their weakest tenth', () => {
    expect(measuredContrast('#ffffff', [])).toBe(Infinity);
    expect(measuredContrast('#ffffff', [0, 0, 0, 0, 0, 0, 0, 0, 0, 1])).toBeGreaterThan(1);
    expect(measuredContrast('#ffffff', [1])).toBeCloseTo(1);
  });
});
