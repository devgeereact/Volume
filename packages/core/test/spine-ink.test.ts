import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, luminanceHex, spineInk } from '../src/index.ts';

// The spine of the paperback wrap took its text colour from the palette's background and its own colour from the
// palette's accent, with no check that one reads on the other. Measured on 8 November 2026 over cover-styles.json: 22 of
// 51 palettes had spine text under 3 to 1, and modern-grotesk was 1.0 to 1, so the title on the spine was invisible.
// Spine type is small (about 8 pt at 120 pages), so it has to reach the 4.5 to 1 that small text needs.

const ratio = (a: string, b: string) => contrastRatio(luminanceHex(a), luminanceHex(b));
const MIN = 4.5;

describe('spineInk', () => {
  it('keeps the style own colour when it already reads on the spine', () => {
    expect(spineInk('#1F4B55', ['#F5F1E8', '#FFFFFF'])).toBe('#F5F1E8');
  });

  it('moves to the next colour when the first is the same as the spine, the case that made the title invisible', () => {
    // modern-grotesk: spine colour and background colour were one and the same.
    const ink = spineInk('#E0A935', ['#E0A935', '#1B2A4E']);
    expect(ink).toBe('#1B2A4E');
    expect(ratio(ink, '#E0A935')).toBeGreaterThanOrEqual(MIN);
  });

  it('falls back to black or white, whichever reads better, when no palette colour reads', () => {
    expect(spineInk('#777777', ['#777777', '#808080'])).toBe('#000000');
    expect(spineInk('#222222', ['#222222', '#2A2A2A'])).toBe('#FFFFFF');
  });

  it('never hands back a colour under the minimum, whatever the spine colour', () => {
    for (let v = 0; v <= 255; v += 5) {
      const bg = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
      expect(ratio(spineInk(bg, [bg]), bg)).toBeGreaterThanOrEqual(MIN);
    }
  });

  it('reads on the spine of every palette of every cover style', () => {
    const file = fileURLToPath(new URL('../../../config/cover-styles.json', import.meta.url));
    const raw = JSON.parse(readFileSync(file, 'utf8')) as {
      styles: { id: string; palettes: Record<string, string>[] | Record<string, Record<string, string>> }[];
    };
    let checked = 0;
    for (const style of raw.styles) {
      const palettes = Array.isArray(style.palettes) ? style.palettes : Object.values(style.palettes);
      for (const p of palettes) {
        const band = ['band', 'stripe', 'motifAlt', 'accent', 'motif'].map((k) => p[k]).find((v): v is string => typeof v === 'string')!;
        const ink = spineInk(band, [p['background']!, p['title']!]);
        expect(ratio(ink, band), `${style.id} / ${p['id']}`).toBeGreaterThanOrEqual(MIN);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(51);
  });
});
