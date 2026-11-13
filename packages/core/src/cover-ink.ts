// Ink for a cover drawn over concept art. The art stays untouched: the title, subtitle and author take whichever of the
// palette's own colours reads best against the part of the art behind them, and a light scrim appears only where even
// the best colour would not read. The Cover studio preview (apps/web ArtCover) and the build (packages/export covers.ts)
// both call this, each measuring the art the same way (a 32 by 48 sample), so the preview is what gets built.

export interface InkPalette {
  background: string;
  title: string;
  subtitle: string;
  author: string;
}

export interface ScrimEnd {
  /** The colour to fade in from the edge: the palette colour the ink is not. */
  colour: string;
  /** 0 (none) to 1. */
  alpha: number;
}

export interface ArtInk {
  title: string;
  subtitle: string;
  author: string;
  /** CSS text-shadow for the type, or null. */
  shadow: string | null;
  top: ScrimEnd;
  bottom: ScrimEnd;
}

/** Share of the art height read behind the title and subtitle (from the top) and behind the author (from the foot). */
export const INK_TOP_ZONE = 0.45;
export const INK_BOTTOM_ZONE = 0.15;
/** WCAG large-text ratio; type on covers is large. */
const WANT = 3.2;

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance (0 black to 1 white) of an sRGB colour. */
export function luminanceRgb(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function luminanceHex(hex: string): number {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6);
  const n = Number.parseInt(f, 16);
  return luminanceRgb((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

export const contrastRatio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Spine type is small (about 8 pt at 120 pages), so it needs the 4.5 to 1 that small text needs. */
export const SPINE_INK_MIN_CONTRAST = 4.5;

/**
 * The colour for the text on the spine of a paperback wrap. The first of the candidates (the style's own choices, in
 * order of preference) that reads on the spine colour is used; when none does, black or white, whichever reads better.
 * One of those two always reaches 4.5 to 1, so the spine text can never be invisible (modern-grotesk had its title in
 * the colour of the spine, 1.0 to 1, until 8 November 2026).
 */
export function spineInk(spine: string, candidates: readonly string[], min = SPINE_INK_MIN_CONTRAST): string {
  const surface = luminanceHex(spine);
  for (const c of candidates) if (contrastRatio(luminanceHex(c), surface) >= min) return c;
  return contrastRatio(luminanceHex('#000000'), surface) >= contrastRatio(luminanceHex('#FFFFFF'), surface) ? '#000000' : '#FFFFFF';
}

/**
 * Mean relative luminance of the top zone and the bottom zone of a w by h sample of RGB pixels (3 bytes each, row
 * by row). Both the build (sharp) and the preview (canvas) pass the same 32 by 48 stretch of the art.
 */
export function zoneLuminance(rgb: ArrayLike<number>, w: number, h: number): { top: number; bottom: number } {
  const zone = (from: number, to: number) => {
    let sum = 0;
    let n = 0;
    for (let y = from; y < to; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        sum += luminanceRgb(rgb[i] ?? 0, rgb[i + 1] ?? 0, rgb[i + 2] ?? 0);
        n++;
      }
    return n ? sum / n : 0.5;
  };
  return { top: zone(0, Math.max(1, Math.round(h * INK_TOP_ZONE))), bottom: zone(Math.min(h - 1, Math.round(h * (1 - INK_BOTTOM_ZONE))), h) };
}

/** The palette colour that reads best on a surface of this luminance, and its contrast ratio. */
function best(p: InkPalette, surface: number): { colour: string; ratio: number; other: string } {
  const a = { colour: p.title, ratio: contrastRatio(luminanceHex(p.title), surface), other: p.background };
  const b = { colour: p.background, ratio: contrastRatio(luminanceHex(p.background), surface), other: p.title };
  return b.ratio > a.ratio + 0.25 ? b : a;
}

const scrimFor = (ratio: number, colour: string): ScrimEnd => ({
  colour,
  alpha: ratio >= WANT ? 0 : Math.min(0.6, 0.2 + ((WANT - ratio) / WANT) * 0.7),
});

export function chooseArtInk(p: InkPalette, topLum: number, bottomLum: number): ArtInk {
  const t = best(p, topLum);
  const a = best(p, bottomLum);
  const subtitle = t.colour === p.title ? (contrastRatio(luminanceHex(p.subtitle), topLum) >= 4.5 ? p.subtitle : t.colour) : t.colour;
  const light = luminanceHex(t.colour) > 0.5;
  return {
    title: t.colour,
    subtitle,
    author: a.colour,
    shadow: light ? '0 0.3cqw 1.8cqw rgba(0, 0, 0, 0.4)' : '0 0 1.6cqw rgba(255, 255, 255, 0.35)',
    top: scrimFor(t.ratio, t.other),
    bottom: scrimFor(a.ratio, a.other),
  };
}

/** The CSS background for the scrim over art, or null when both ends read without one. */
export function inkScrimCss(ink: ArtInk): string | null {
  if (ink.top.alpha === 0 && ink.bottom.alpha === 0) return null;
  const mix = (e: ScrimEnd, alpha: number) => `color-mix(in srgb, ${e.colour} ${Math.round(alpha * 100)}%, transparent)`;
  return `linear-gradient(to bottom, ${mix(ink.top, ink.top.alpha)} 0%, ${mix(ink.top, 0)} 55%, ${mix(ink.bottom, 0)} 72%, ${mix(ink.bottom, ink.bottom.alpha)} 100%)`;
}
