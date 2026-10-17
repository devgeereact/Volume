/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { colourSpineWidthIn, spineWidthIn, wrapSizeIn } from '../src/index.ts';
import { findRepoRoot, loadKdpRules } from '../src/node/index.ts';

// Colour spine (rule paperback.spine.widthPerPage.colour in config/kdp-rules/2026-10-17.json): premium colour is
// 0.002347 in per page, standard colour 0.002252 in per page. Picture books print on premium colour (D-044).
const rules = loadKdpRules(findRepoRoot(), '2026-10-17');
const trim = { widthIn: 8.5, heightIn: 8.5 };

describe('colour spine width', () => {
  it.each([
    [24, 0.056328],
    [48, 0.112656],
    [100, 0.2347],
  ])('premium colour, %i pages: %f in', (pages, want) => {
    expect(colourSpineWidthIn(rules, pages, 'premium')).toBeCloseTo(want, 6);
    const wrap = wrapSizeIn(rules, { trim, pages, paper: 'white', ink: 'premium' });
    expect(wrap.spineIn).toBeCloseTo(want, 6);
    expect(wrap.ink).toBe('premium');
    // bleed 0.125 + back 8.5 + spine + front 8.5 + bleed 0.125
    expect(wrap.widthIn).toBeCloseTo(17.25 + want, 6);
    expect(wrap.heightIn).toBeCloseTo(8.75, 6);
  });

  it('is wider than the black-ink white-paper spine for premium, and the same for standard colour', () => {
    expect(colourSpineWidthIn(rules, 24, 'premium')).toBeGreaterThan(spineWidthIn(rules, 24, 'white'));
    expect(colourSpineWidthIn(rules, 80, 'standard')).toBeCloseTo(80 * 0.002252, 6);
  });

  it('keeps the paper spine when no ink is given', () => {
    const wrap = wrapSizeIn(rules, { trim, pages: 24, paper: 'white' });
    expect(wrap.spineIn).toBeCloseTo(spineWidthIn(rules, 24, 'white'), 9);
    expect(wrap.ink).toBeUndefined();
  });
});
