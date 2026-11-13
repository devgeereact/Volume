import { describe, expect, it } from 'vitest';
import { contrastRatio, DEFAULT_COVER_STYLE, luminanceHex } from '@volume/core';
import { loadKdpRules } from '@volume/core/node';
import { applyCoverTypography, exportPaperbackWrap } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// The built wrap, not just the colour function: the HTML the studio previews and the build prints. Reported on
// 8 November 2026: on modern-grotesk the title on the spine was the colour of the spine (1.0 to 1) and could not be read.

const rules = loadKdpRules();
const meta = loadMiniBook().meta;

/** The background of the spine and the colour of its text, read from the generated page. */
async function spineColours(style: typeof DEFAULT_COVER_STYLE): Promise<{ background: string; ink: string }> {
  const wrap = await exportPaperbackWrap(meta, style, { rules, pages: 120, paper: 'cream', htmlOnly: true, blurb: 'A blurb.', shortBio: 'Bio.' });
  const html = wrap.html ?? '';
  const background = /\.spine \{[^}]*?background:\s*(#[0-9A-Fa-f]{3,8})/.exec(html)?.[1];
  const ink = /\.spine \.st \{[^}]*?color:\s*(#[0-9A-Fa-f]{3,8})/.exec(html)?.[1];
  expect(background, 'spine background in the page').toBeDefined();
  expect(ink, 'spine text colour in the page').toBeDefined();
  return { background: background!, ink: ink! };
}

const ratio = (a: string, b: string) => contrastRatio(luminanceHex(a), luminanceHex(b));

describe('spine text on a built wrap', () => {
  it('reads when the style puts the spine colour and the text colour on the same value', async () => {
    // modern-grotesk: the band (spine) colour and the background colour were both this gold.
    const style = applyCoverTypography(DEFAULT_COVER_STYLE, { colours: { background: '#E0A935', band: '#E0A935', title: '#1B2A4E' } });
    const { background, ink } = await spineColours(style);
    expect(ratio(ink, background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the default style colours, which already read', async () => {
    const { background, ink } = await spineColours(DEFAULT_COVER_STYLE);
    expect(ratio(ink, background)).toBeGreaterThanOrEqual(4.5);
    expect(ink.toLowerCase()).toBe('#f3eee1');
  });
});
