/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { DEFAULT_INTERIOR_THEME, marginsFor, normaliseCoverStyle, normaliseInteriorTheme, numberToWords } from '../src/index.ts';
import { loadCoverStyles, loadInteriorThemes } from '../src/node/index.ts';

describe('interior themes', () => {
  it('reads config/interior-themes.json when present', () => {
    const themes = loadInteriorThemes();
    if (!themes.length) return; // the file is optional; the default theme is used without it
    const classic = themes.find((t) => t.id === 'classic-novel');
    expect(classic).toBeDefined();
    expect(classic?.fonts.body).toBe('EB Garamond');
    expect(classic?.sizes.bodyPt).toBe(11);
    expect(classic?.sizes.chapterTitlePt).toBe(26);
    expect(classic?.leading).toBe(1.35);
    expect(classic?.paragraph).toEqual({ indentEm: 1.2, align: 'justify', hyphenate: true });
    expect(classic?.opener).toMatchObject({ style: 'centred', dropFolio: true, numberFormat: 'words', ornament: 'fleuron' });
    expect(classic?.chapterStart).toBe('right');
    expect(classic?.runningHeads).toEqual({ enabled: true, style: 'small-caps', left: 'author', right: 'book-title' });
    expect(classic?.dropCaps).toEqual({ enabled: true, lines: 2 });
    expect(classic?.extraInsideIn).toBe(0.125);
    expect(themes.every((t) => t.sizes.bodyPt >= 10)).toBe(true);
  });

  it('accepts loose shapes and aliases', () => {
    const t = normaliseInteriorTheme({
      id: 'x',
      fonts: { body: { family: "'Literata', serif", size: 11 }, heading: 'Fraunces' },
      lineHeight: '16pt',
      margins: { '6x9': { top: 0.8, bottom: 0.9, inside: 0.85, outside: 0.6 } },
      chapterOpener: 'minimal',
      runningHeads: false,
      dropCaps: 3,
      sceneBreak: { glyph: '❦', fallback: '~' },
    });
    expect(t.fonts.body).toBe('Literata');
    expect(t.sizes.bodyPt).toBe(11);
    expect(t.leading).toBeCloseTo(16 / 11, 6);
    expect(t.opener.style).toBe('minimal');
    expect(t.runningHeads.enabled).toBe(false);
    expect(t.dropCaps).toEqual({ enabled: true, lines: 3 });
    expect(t.sceneBreak).toBe('~');
    expect(marginsFor(t, '6x9')).toEqual({ topIn: 0.8, bottomIn: 0.9, insideIn: 0.85, outsideIn: 0.6 });
  });

  it('margins: house table, theme override, KDP minimum plus extra', () => {
    expect(marginsFor(DEFAULT_INTERIOR_THEME, '6x9')).toEqual({ topIn: 0.75, bottomIn: 0.8, insideIn: 0.8, outsideIn: 0.55 });
    const t = normaliseInteriorTheme({ margins: { extraInsideIn: 0.125, outsideIn: 0.6 } });
    expect(marginsFor(t, '6x9', 0.875).insideIn).toBe(1);
    expect(marginsFor(t, '6x9', 0.375).insideIn).toBe(0.8);
    expect(marginsFor(t, '6x9').outsideIn).toBe(0.6);
  });

  it('writes chapter numbers in words', () => {
    expect([1, 12, 21, 40].map(numberToWords)).toEqual(['One', 'Twelve', 'Twenty-One', 'Forty']);
  });
});

describe('cover styles', () => {
  it('reads config/cover-styles.json when present', () => {
    const styles = loadCoverStyles();
    if (!styles.length) return;
    const s = styles.find((x) => x.id === 'serene-serif');
    expect(s?.fonts).toEqual({ title: 'DM Serif Display', subtitle: 'Libre Franklin', author: 'Libre Franklin' });
    expect(s?.titleScale).toBeCloseTo(0.16, 6);
    expect(s?.titleTopPct).toBe(11);
    expect(s?.colours.background).toBe('#1F4B55');
    expect(s?.authorUppercase).toBe(true);
    expect(s?.align).toBe('left');
    expect(s?.ornament).toBe('waves');
  });

  it('picks a named palette', () => {
    const raw = {
      palettes: [
        { id: 'a', background: '#111111' },
        { id: 'b', background: '#222222' },
      ],
    };
    expect(normaliseCoverStyle(raw, undefined, 'b').colours.background).toBe('#222222');
    expect(normaliseCoverStyle(raw).colours.background).toBe('#111111');
  });
});
