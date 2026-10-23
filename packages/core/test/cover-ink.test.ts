import { describe, expect, it } from 'vitest';
import { chooseArtInk, contrastRatio, inkScrimCss, luminanceHex, zoneLuminance } from '../src/index.ts';

const dark = { background: '#14213d', title: '#f5f1e8', subtitle: '#bfe0dc', author: '#f5f1e8' };
const light = { background: '#f5f1e8', title: '#1e2b2a', subtitle: '#3c524d', author: '#1e2b2a' };

describe('cover ink over art', () => {
  it('keeps a light title on dark art and adds no scrim', () => {
    const ink = chooseArtInk(dark, 0.04, 0.05);
    expect(ink.title).toBe('#f5f1e8');
    expect(ink.top.alpha).toBe(0);
    expect(inkScrimCss(ink)).toBeNull();
  });

  it('flips to the palette dark colour on bright art', () => {
    const ink = chooseArtInk(dark, 0.8, 0.8);
    expect(ink.title).toBe('#14213d');
    expect(ink.author).toBe('#14213d');
    expect(ink.subtitle).toBe('#14213d');
  });

  it('adds a scrim only when no palette colour reads on the art (a low-contrast palette on mid-tone art)', () => {
    const flat = { background: '#808080', title: '#999999', subtitle: '#999999', author: '#999999' };
    const ink = chooseArtInk(flat, 0.3, 0.02);
    expect(ink.top.alpha).toBeGreaterThan(0);
    expect(ink.bottom.alpha).toBe(0);
    expect(inkScrimCss(ink)).toContain('linear-gradient');
    // A strongly contrasting palette never needs one.
    expect(inkScrimCss(chooseArtInk(dark, 0.3, 0.3))).toBeNull();
  });

  it('works for a light palette too', () => {
    expect(chooseArtInk(light, 0.04, 0.04).title).toBe('#f5f1e8');
    expect(chooseArtInk(light, 0.85, 0.85).title).toBe('#1e2b2a');
  });

  it('measures zones: a bright top and a dark foot', () => {
    const w = 4;
    const h = 20;
    const px = new Uint8Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.fill(y < 10 ? 255 : 0, (y * w + x) * 3, (y * w + x) * 3 + 3);
    const z = zoneLuminance(px, w, h);
    expect(z.top).toBeGreaterThan(0.9);
    expect(z.bottom).toBeLessThan(0.01);
    expect(contrastRatio(luminanceHex('#ffffff'), luminanceHex('#000000'))).toBeCloseTo(21, 0);
  });
});
