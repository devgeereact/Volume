// Cover layers: background modes (colour, gradient, picture or texture with a tint), shape layers, artwork settings
// and spine colours. One spec, one set of drawing helpers: the build (packages/export covers.ts) writes this markup
// into the page it renders for the eBook JPEG and the paperback wrap PDF, and the Cover studio previews that same page
// (POST /cover/preview), so what the owner sees is what is built. Every field is optional: a cover without them
// draws exactly as before.

import { contrastRatio, luminanceHex } from './cover-ink.ts';

export const COVER_BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'color-burn', 'luminosity'] as const;
export type CoverBlend = (typeof COVER_BLENDS)[number];
export const COVER_BLEND_NAMES: Record<CoverBlend, string> = {
  normal: 'Normal',
  multiply: 'Multiply',
  screen: 'Screen',
  overlay: 'Overlay',
  'soft-light': 'Soft light',
  'color-burn': 'Colour burn',
  luminosity: 'Luminosity',
};

/** Simple vector kinds that draw the same in Chromium on screen, in the PDF and in the JPEG. */
export const COVER_SHAPE_KINDS = ['circle', 'ring', 'blob', 'arc', 'triangle', 'square', 'star', 'burst', 'wave', 'line', 'stripes', 'dots', 'grid'] as const;
export type CoverShapeKind = (typeof COVER_SHAPE_KINDS)[number];
export const COVER_SHAPE_NAMES: Record<CoverShapeKind, string> = {
  circle: 'Circle',
  ring: 'Ring',
  blob: 'Blob',
  arc: 'Arc',
  triangle: 'Triangle',
  square: 'Square',
  star: 'Star',
  burst: 'Burst',
  wave: 'Wave',
  line: 'Line',
  stripes: 'Stripes',
  dots: 'Dots',
  grid: 'Grid',
};

/** Built-in textures, drawn by code (SVG), not image files. Each has the blend and strength it is made for. */
export const COVER_TEXTURES = ['grain', 'clouds', 'marble', 'halftone', 'rays'] as const;
export type CoverTexture = (typeof COVER_TEXTURES)[number];
export const COVER_TEXTURE_INFO: Record<CoverTexture, { name: string; blend: CoverBlend; opacity: number; filtered: boolean }> = {
  grain: { name: 'Paper grain', blend: 'overlay', opacity: 0.55, filtered: true },
  clouds: { name: 'Soft clouds', blend: 'soft-light', opacity: 0.9, filtered: true },
  marble: { name: 'Marble', blend: 'multiply', opacity: 0.6, filtered: true },
  halftone: { name: 'Halftone', blend: 'soft-light', opacity: 0.7, filtered: false },
  rays: { name: 'Sunburst', blend: 'soft-light', opacity: 0.45, filtered: false },
};

/** Limits shared by the server's validation, the normaliser below and the studio's sliders. */
export const COVER_LAYER_LIMITS = {
  /** Shapes per cover. */
  shapes: 24,
  /** Picture blur in thousandths of the front cover's width. */
  blurMax: 40,
  scaleMin: 1,
  scaleMax: 3,
  tintMax: 0.9,
  /** Shape and artwork boxes, in front-cover-width percent (the type's own unit). */
  xMin: -50,
  xMax: 150,
  yMin: -50,
  yMax: 200,
  sizeMin: 1,
  sizeMax: 200,
} as const;

export interface CoverGradient {
  type: 'linear' | 'radial';
  from: string;
  to: string;
  /** Linear: CSS angle in degrees (0 points up, 90 to the right). */
  angle: number;
  /** Radial: the centre, in percent of the box across and down. */
  centreX: number;
  centreY: number;
}

export interface CoverPicture {
  /** An uploaded picture (asset kind cover_background or cover_concept of this book). */
  assetId?: string;
  /** Or one of the built-in textures. */
  texture?: CoverTexture;
  /** 0 to 1. */
  opacity: number;
  blend: CoverBlend;
  /** 1 to 3, zooming in on the focus point. */
  scale: number;
  /** The point kept in view, in percent across and down. */
  focusX: number;
  focusY: number;
  /** 0 to 40 thousandths of the front cover's width. */
  blur: number;
  greyscale: boolean;
  /** A colour laid over the picture, strength 0 to 0.9. */
  tint?: { colour: string; strength: number };
}

export interface CoverBackground {
  mode: 'solid' | 'gradient' | 'image';
  /** The paperback: one background across back, spine and front, or the front only. */
  span: 'wrap' | 'front';
  gradient?: CoverGradient;
  image?: CoverPicture;
}

export interface CoverShape {
  id: string;
  kind: CoverShapeKind;
  surface: 'front' | 'back';
  /** Box in percent of the panel's width (x, w) and of the panel's width again (y, h), as the type is placed. */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  colour: string;
  opacity: number;
  /** Behind the title, subtitle and author, or over them. */
  layer: 'behind' | 'over';
}

export interface CoverArtwork {
  opacity: number;
  rotation: number;
  /** Box in front-width percent; missing fills the front as before. */
  box?: { x: number; y: number; w: number; h: number };
}

export interface CoverSpine {
  /** Spine colour; missing follows the band colour as before. */
  colour?: string;
  /** Spine text colour; missing is the background colour as before. */
  textColour?: string;
  /** Let a whole-wrap background show on the spine instead of a colour. */
  showBackground?: boolean;
}

/** The cover layer fields of a cover style (packages/core CoverStyle). All optional. */
export interface CoverLayers {
  background?: CoverBackground;
  artwork?: CoverArtwork;
  shapes?: CoverShape[];
  spine?: CoverSpine;
}

// ---------- normalising (lenient: anything not valid is dropped, numbers are clamped) ----------

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hex = (v: unknown): string | undefined => (typeof v === 'string' && HEX.test(v) ? v : undefined);
const clamp = (v: unknown, min: number, max: number, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
const oneOf = <T extends string>(list: readonly T[], v: unknown, dflt: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : dflt);

function picture(raw: unknown): CoverPicture | undefined {
  if (!isObj(raw)) return undefined;
  const assetId = typeof raw['assetId'] === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw['assetId']) ? raw['assetId'] : undefined;
  const texture = (COVER_TEXTURES as readonly unknown[]).includes(raw['texture']) ? (raw['texture'] as CoverTexture) : undefined;
  if (!assetId && !texture) return undefined;
  const L = COVER_LAYER_LIMITS;
  const info = texture ? COVER_TEXTURE_INFO[texture] : undefined;
  const out: CoverPicture = {
    opacity: clamp(raw['opacity'], 0, 1, info?.opacity ?? 1),
    blend: oneOf(COVER_BLENDS, raw['blend'], info?.blend ?? 'normal'),
    scale: clamp(raw['scale'], L.scaleMin, L.scaleMax, 1),
    focusX: clamp(raw['focusX'], 0, 100, 50),
    focusY: clamp(raw['focusY'], 0, 100, 50),
    blur: clamp(raw['blur'], 0, L.blurMax, 0),
    greyscale: raw['greyscale'] === true,
  };
  if (assetId) out.assetId = assetId;
  else if (texture) out.texture = texture;
  const tint = raw['tint'];
  if (isObj(tint)) {
    const colour = hex(tint['colour']);
    const strength = clamp(tint['strength'], 0, L.tintMax, 0);
    if (colour && strength > 0) out.tint = { colour, strength };
  }
  return out;
}

function background(raw: unknown): CoverBackground | undefined {
  if (!isObj(raw)) return undefined;
  const mode = oneOf(['solid', 'gradient', 'image'] as const, raw['mode'], 'solid');
  const span = oneOf(['wrap', 'front'] as const, raw['span'], 'wrap');
  if (mode === 'gradient') {
    const g = raw['gradient'];
    if (!isObj(g)) return undefined;
    const from = hex(g['from']);
    const to = hex(g['to']);
    if (!from || !to) return undefined;
    return {
      mode,
      span,
      gradient: {
        type: oneOf(['linear', 'radial'] as const, g['type'], 'linear'),
        from,
        to,
        angle: clamp(g['angle'], 0, 360, 160),
        centreX: clamp(g['centreX'], 0, 100, 50),
        centreY: clamp(g['centreY'], 0, 100, 35),
      },
    };
  }
  if (mode === 'image') {
    const image = picture(raw['image']);
    return image ? { mode, span, image } : undefined;
  }
  return undefined; // solid is the cover's own background colour: nothing to store
}

function box(raw: unknown): { x: number; y: number; w: number; h: number } | undefined {
  if (!isObj(raw)) return undefined;
  const L = COVER_LAYER_LIMITS;
  return {
    x: clamp(raw['x'], L.xMin, L.xMax, 0),
    y: clamp(raw['y'], L.yMin, L.yMax, 0),
    w: clamp(raw['w'], L.sizeMin, L.sizeMax, 100),
    h: clamp(raw['h'], L.sizeMin, L.sizeMax, 100),
  };
}

function shape(raw: unknown, i: number): CoverShape | undefined {
  if (!isObj(raw)) return undefined;
  const kind = (COVER_SHAPE_KINDS as readonly unknown[]).includes(raw['kind']) ? (raw['kind'] as CoverShapeKind) : undefined;
  const colour = hex(raw['colour']);
  if (!kind || !colour) return undefined;
  const b = box(raw) ?? { x: 0, y: 0, w: 20, h: 20 };
  return {
    id: typeof raw['id'] === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(raw['id']) ? raw['id'] : `shape-${i + 1}`,
    kind,
    surface: oneOf(['front', 'back'] as const, raw['surface'], 'front'),
    ...b,
    rotation: clamp(raw['rotation'], -180, 180, 0),
    colour,
    opacity: clamp(raw['opacity'], 0, 1, 1),
    layer: oneOf(['behind', 'over'] as const, raw['layer'], 'behind'),
  };
}

/**
 * The layer fields read from a typography record (what the studio sends and Choose stores). Invalid parts are left
 * out, so the cover falls back to how it drew before. Pure.
 */
export function normaliseCoverLayers(t: Record<string, unknown>): CoverLayers {
  const out: CoverLayers = {};
  const bg = background(t['background']);
  if (bg) out.background = bg;
  const art = t['artwork'];
  if (isObj(art)) {
    const a: CoverArtwork = { opacity: clamp(art['opacity'], 0, 1, 1), rotation: clamp(art['rotation'], -180, 180, 0) };
    const b = box(art['box']);
    if (b) a.box = b;
    if (a.opacity !== 1 || a.rotation !== 0 || a.box) out.artwork = a;
  }
  const shapes = t['shapes'];
  if (Array.isArray(shapes)) {
    const list = shapes
      .slice(0, COVER_LAYER_LIMITS.shapes)
      .map(shape)
      .filter((s): s is CoverShape => !!s);
    if (list.length) out.shapes = list;
  }
  const sp = t['spine'];
  if (isObj(sp)) {
    const s: CoverSpine = {};
    const colour = hex(sp['colour']);
    const text = hex(sp['textColour']);
    if (colour) s.colour = colour;
    if (text) s.textColour = text;
    if (sp['showBackground'] === true) s.showBackground = true;
    if (Object.keys(s).length) out.spine = s;
  }
  return out;
}

// ---------- drawing (CSS and SVG strings, shared by the build and anything that previews it) ----------

const n = (v: number, d = 3) => String(Number(v.toFixed(d)));

export function gradientCss(g: CoverGradient): string {
  return g.type === 'radial'
    ? `radial-gradient(circle at ${n(g.centreX)}% ${n(g.centreY)}%, ${g.from}, ${g.to})`
    : `linear-gradient(${n(g.angle)}deg, ${g.from}, ${g.to})`;
}

const svgUri = (w: number, h: number, inner: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`)}`;

/** A built-in texture as an SVG data URL (white or grey marks meant to be blended over the colour below). */
export function textureDataUrl(t: CoverTexture): string {
  switch (t) {
    case 'grain':
      return svgUri(
        400,
        400,
        `<filter id="f"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .9 0"/></filter><rect width="100%" height="100%" filter="url(#f)"/>`,
      );
    case 'clouds':
      return svgUri(
        800,
        1200,
        `<filter id="f"><feTurbulence type="fractalNoise" baseFrequency=".004" numOctaves="5" seed="7"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.6 -.45"/></filter><rect width="100%" height="100%" filter="url(#f)"/>`,
      );
    case 'marble':
      return svgUri(
        800,
        1200,
        `<filter id="f"><feTurbulence type="turbulence" baseFrequency=".003 .012" numOctaves="4" seed="3"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="gamma" exponent=".5"/><feFuncG type="gamma" exponent=".5"/><feFuncB type="gamma" exponent=".5"/></feComponentTransfer></filter><rect width="100%" height="100%" filter="url(#f)"/>`,
      );
    case 'halftone':
      return svgUri(
        800,
        1200,
        `<defs><pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="5" fill="#fff"/></pattern><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="m"><rect width="100%" height="100%" fill="url(#g)"/></mask></defs><rect width="100%" height="100%" fill="url(#p)" mask="url(#m)"/>`,
      );
    case 'rays':
      return svgUri(
        800,
        1200,
        `<g transform="translate(400 700)">${Array.from({ length: 18 }, (_, i) => `<path d="M0 0L-70 -1400L70 -1400Z" fill="#fff" transform="rotate(${i * 20})"/>`).join('')}</g>`,
      );
  }
}

/**
 * Where the background box sits inside an eBook front when the background spans the paperback wrap: the front's share
 * of one wrap-wide box (left and width in percent of the front). Without the wrap's sizes the box is the front.
 */
export function wrapWindow(g: { trimWidthIn: number; spineIn: number; bleedIn: number } | undefined): { left: number; width: number } {
  if (!g || g.trimWidthIn <= 0) return { left: 0, width: 100 };
  const frontStart = g.bleedIn + g.trimWidthIn + g.spineIn;
  const wrapW = 2 * g.bleedIn + 2 * g.trimWidthIn + g.spineIn;
  return { left: (-frontStart / g.trimWidthIn) * 100, width: (wrapW / g.trimWidthIn) * 100 };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The background layer's markup: the colour or gradient, then the picture (blend, focus, zoom, blur, greyscale),
 * then the tint. `src` is the picture's URL (a data URL in the build); `blurUnit` is the CSS length of one
 * thousandth of the front cover's width. `boxStyle` places the layer (the whole parent when missing).
 */
export function backgroundLayerHtml(
  bg: CoverBackground,
  baseColour: string,
  opts: { src?: string | undefined; blurUnit: string; boxStyle?: string | undefined },
): string {
  const fill = bg.mode === 'gradient' && bg.gradient ? gradientCss(bg.gradient) : baseColour;
  const img = bg.mode === 'image' ? bg.image : undefined;
  const src = img ? (img.texture ? textureDataUrl(img.texture) : opts.src) : undefined;
  const filters = img ? [img.blur > 0 ? `blur(calc(${n(img.blur)} * ${opts.blurUnit}))` : '', img.greyscale ? 'grayscale(1)' : ''].filter(Boolean) : [];
  const picture =
    img && src
      ? `<img class="bgl-i" src="${esc(src)}" alt="" style="object-position: ${n(img.focusX)}% ${n(img.focusY)}%; transform-origin: ${n(img.focusX)}% ${n(img.focusY)}%; transform: scale(${n(img.scale)}); opacity: ${n(img.opacity)}; mix-blend-mode: ${img.blend};${filters.length ? ` filter: ${filters.join(' ')};` : ''}">`
      : '';
  const tint = img?.tint ? `<i class="bgl-t" style="background: ${img.tint.colour}; opacity: ${n(img.tint.strength)};"></i>` : '';
  return `<div class="bgl"${opts.boxStyle ? ` style="${opts.boxStyle}"` : ''}><i class="bgl-c" style="background: ${fill};"></i>${picture}${tint}</div>`;
}

/** CSS for the background layer (class names used by backgroundLayerHtml). */
export const BACKGROUND_LAYER_CSS = `.bgl { position: absolute; inset: 0; overflow: hidden; z-index: 0; isolation: isolate; }
.bgl > * { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.bgl .bgl-i { object-fit: cover; }`;

const BURST = Array.from({ length: 32 }, (_, i) => {
  const a = (i * Math.PI) / 16;
  const r = i % 2 ? 30 : 50;
  return `${(50 + r * Math.sin(a)).toFixed(1)},${(50 - r * Math.cos(a)).toFixed(1)}`;
}).join(' ');

/**
 * The pattern kinds as plain SVG geometry in the shape's own box (units are the panel's cqw, so the marks keep their
 * size whatever the box). No CSS repeating gradients and no SVG tiling patterns: those printed wrongly in the wrap PDF
 * (found by the parity test). Each mark is a path, which prints the same in Chromium's PDF, pdf.js and a print RIP.
 */
function patternPaths(kind: 'stripes' | 'dots' | 'grid', w: number, h: number, colour: string): string {
  const marks: string[] = [];
  if (kind === 'stripes') {
    // 2.2 wide stripes every 5.4, running down to the right.
    const r2 = Math.SQRT2;
    for (let c = Math.floor(-h / r2 / 5.4) * 5.4; c <= w / r2 + 5.4; c += 5.4) {
      const k = (c + 1.1) * r2; // x - y along the stripe's centre line
      marks.push(`M${n(-h - 4 + k, 2)} ${n(-h - 4, 2)}L${n(w + h + 4, 2)} ${n(w + h + 4 - k, 2)}`);
    }
    return `<path d="${marks.join('')}" stroke="${colour}" stroke-width="2.2" fill="none"/>`;
  }
  if (kind === 'dots') {
    for (let y = 2.3; y < h + 1; y += 4.6) for (let x = 2.3; x < w + 1; x += 4.6) marks.push(`M${n(x - 1, 2)} ${n(y, 2)}a1 1 0 1 0 2 0a1 1 0 1 0 -2 0Z`);
    return `<path d="${marks.join('')}" fill="${colour}"/>`;
  }
  for (let x = 0; x < w; x += 6) marks.push(`M${n(x, 2)} 0h0.35V${n(h, 2)}h-0.35Z`);
  for (let y = 0; y < h; y += 6) marks.push(`M0 ${n(y, 2)}H${n(w, 2)}v0.35H0Z`);
  return `<path d="${marks.join('')}" fill="${colour}"/>`;
}

/** The shape's drawing as SVG: a 100 by 100 box stretched to the layer, or a pattern drawn in the box's own units. */
export function shapeArt(kind: CoverShapeKind, colour: string, box: { w: number; h: number } = { w: 100, h: 100 }): string {
  if (kind === 'stripes' || kind === 'dots' || kind === 'grid')
    return `<svg viewBox="0 0 ${n(box.w)} ${n(box.h)}" preserveAspectRatio="none" style="overflow: hidden" aria-hidden="true">${patternPaths(kind, box.w, box.h, colour)}</svg>`;
  const body: Record<Exclude<CoverShapeKind, 'stripes' | 'dots' | 'grid'>, string> = {
    circle: '<circle cx="50" cy="50" r="50"/>',
    ring: `<circle cx="50" cy="50" r="43" fill="none" stroke="${colour}" stroke-width="14"/>`,
    blob: '<path d="M55 3C79 6 98 25 96 51C94 77 73 98 47 96C21 94 3 76 5 49C7 23 30 0 55 3Z"/>',
    arc: '<path d="M0 100A100 100 0 0 1 100 0V22A78 78 0 0 0 22 100Z"/>',
    triangle: '<path d="M50 0L100 100H0Z"/>',
    square: '<rect width="100" height="100"/>',
    star: '<path d="M50 0L61 35H98L68 57L79 91L50 70L21 91L32 57L2 35H39Z"/>',
    burst: `<polygon points="${BURST}"/>`,
    wave: '<path d="M0 50C17 30 33 30 50 50S83 70 100 50V100H0Z"/>',
    line: '<rect width="100" height="100"/>',
  };
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="none" fill="${colour}" aria-hidden="true">${body[kind]}</svg>`;
}

/** One shape layer's markup, placed in the panel's container units (cqw), as the title and author are. */
export function shapeHtml(s: CoverShape): string {
  const style = [
    `left: ${n(s.x)}cqw`,
    `top: ${n(s.y)}cqw`,
    `width: ${n(s.w)}cqw`,
    `height: ${n(s.h)}cqw`,
    `opacity: ${n(s.opacity)}`,
    s.rotation ? `transform: rotate(${n(s.rotation)}deg)` : '',
  ]
    .filter(Boolean)
    .join('; ');
  return `<i class="shp shp-${s.kind} ${s.layer === 'over' ? 'over' : 'behind'}" data-shape="${esc(s.id)}" style="${style};">${shapeArt(s.kind, s.colour, s)}</i>`;
}

/** CSS for shape layers: behind the type (z 1), over it (z 3); the type sits at z 2. */
export const SHAPE_CSS = `.shp { position: absolute; display: block; pointer-events: none; z-index: 1; }
.shp.over { z-index: 3; }
.shp svg { width: 100%; height: 100%; display: block; overflow: visible; }`;

/** Shapes on one surface, behind or over the type. */
export const shapesOn = (shapes: readonly CoverShape[] | undefined, surface: 'front' | 'back'): CoverShape[] =>
  (shapes ?? []).filter((s) => s.surface === surface);

/** CSS for the artwork (concept art) layer: opacity, rotation and an own box. Empty when nothing is set. */
export function artworkCss(a: CoverArtwork | undefined): string {
  if (!a) return '';
  const rules = [
    a.box ? `inset: auto; left: ${n(a.box.x)}cqw; top: ${n(a.box.y)}cqw; width: ${n(a.box.w)}cqw; height: ${n(a.box.h)}cqw;` : '',
    a.opacity !== 1 ? `opacity: ${n(a.opacity)};` : '',
    a.rotation ? `transform: rotate(${n(a.rotation)}deg);` : '',
  ].join(' ');
  return `.front .bg { ${rules.trim()} }`;
}

/**
 * Why a wrap with these layers is drawn as one image at the rules file's DPI rather than as vectors: blends, blur,
 * greyscale and filtered textures. Rasterising makes the PDF the same Chromium picture as the preview and the JPEG.
 */
export function layersNeedRaster(l: CoverLayers): string[] {
  const why: string[] = [];
  const img = l.background?.mode === 'image' ? l.background.image : undefined;
  if (img) {
    if (img.blend !== 'normal') why.push('a blend mode on the background picture');
    if (img.blur > 0) why.push('a blurred background picture');
    if (img.greyscale) why.push('a greyscale background picture');
    if (img.texture && COVER_TEXTURE_INFO[img.texture].filtered) why.push(`the ${COVER_TEXTURE_INFO[img.texture].name.toLowerCase()} texture`);
  }
  return why;
}

/** True when any layer field is set (the cover is not drawn the old way). */
export const hasLayers = (l: CoverLayers): boolean => !!(l.background || l.artwork || l.shapes?.length || l.spine);

// ---------- contrast, kept honest ----------

export type LayerContrastStatus = 'pass' | 'warn' | 'fail' | 'look';

export interface LayerContrast {
  part: 'title' | 'subtitle' | 'author';
  status: LayerContrastStatus;
  /** The worst measured ratio, when it can be worked out from the spec. */
  ratio?: number;
  detail: string;
}

const hexRgb = (h: string): [number, number, number] => {
  const s = h.replace('#', '');
  const f = s.length === 3 ? [...s].map((c) => c + c).join('') : s.slice(0, 6);
  const v = Number.parseInt(f, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const rgbHex = (c: [number, number, number]) => `#${c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
/** a over b at alpha (sRGB, as CSS composes a plain colour). */
export const mixHex = (a: string, b: string, alpha: number): string => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return rgbHex([0, 1, 2].map((i) => (x[i] ?? 0) * alpha + (y[i] ?? 0) * (1 - alpha)) as [number, number, number]);
};

/** The lowest contrast of `ink` against any point of the gradient (11 samples from end to end, sRGB as CSS draws it). */
export function gradientWorstContrast(ink: string, g: CoverGradient): number {
  let worst = Infinity;
  for (let k = 0; k <= 10; k++) worst = Math.min(worst, contrastRatio(luminanceHex(ink), luminanceHex(mixHex(g.to, g.from, k / 10))));
  return worst;
}

/**
 * What can honestly be said about text contrast for these layers. A plain or gradient background is measured
 * (a gradient at its worst point). Shapes behind the type are measured as if they sat behind it. A picture, a
 * texture, concept art with its own settings or a shape over the type cannot be judged from the spec, so they say
 * "look" and the build measures the real pixels (packages/export covers.ts).
 */
export function layerContrast(
  l: CoverLayers,
  colours: { background: string; title: string; subtitle: string; author: string },
  opts: { art: boolean; showSubtitle: boolean },
): LayerContrast[] {
  const parts: ['title' | 'subtitle' | 'author', number, string][] = [
    ['title', 3, colours.title],
    ...(opts.showSubtitle ? ([['subtitle', 4.5, colours.subtitle]] as ['subtitle', number, string][]) : []),
    ['author', 4.5, colours.author],
  ];
  const front = shapesOn(l.shapes, 'front');
  const over = front.filter((s) => s.layer === 'over');
  const behind = front.filter((s) => s.layer === 'behind' && s.opacity >= 0.3);
  const img = l.background?.mode === 'image' ? l.background.image : undefined;
  const look = img
    ? `The ${img.texture ? 'texture' : 'picture'} behind the type cannot be measured from the settings.`
    : opts.art
      ? l.artwork
        ? 'The art has its own opacity, angle or box, so the ink chosen from it is a guide only.'
        : 'Over the art the build picks the ink from the picture behind the type.'
      : null;
  return parts.map(([part, need, ink]): LayerContrast => {
    const name = part === 'title' ? 'Title' : part === 'subtitle' ? 'Subtitle' : 'Author';
    if (look) return { part, status: 'look', detail: `${look} The build measures the real cover; check it by eye too.` };
    if (over.length) return { part, status: 'look', detail: `A shape sits over the text. Check the ${name.toLowerCase()} is not covered.` };
    const g = l.background?.mode === 'gradient' ? l.background.gradient : undefined;
    let ratio = g ? gradientWorstContrast(ink, g) : contrastRatio(luminanceHex(ink), luminanceHex(colours.background));
    let where = g ? 'at the gradient’s weakest point' : 'on the background';
    for (const s of behind) {
      const base = g ? g.from : colours.background;
      const r = contrastRatio(luminanceHex(ink), luminanceHex(mixHex(s.colour, base, s.opacity)));
      if (r < ratio) {
        ratio = r;
        where = 'where a shape sits behind it';
      }
    }
    const status: LayerContrastStatus = ratio >= need ? 'pass' : ratio >= need * 0.75 ? 'warn' : 'fail';
    return {
      part,
      status,
      ratio,
      detail: `${ratio.toFixed(1)} to 1 ${where}. ${part === 'title' ? 'Large type needs 3 to 1.' : 'Small type needs 4.5 to 1.'}`,
    };
  });
}

/**
 * Contrast of a text colour against the pixels behind it, as the build measures it: the share of the area that is
 * worst for this ink (the 10% of pixels nearest the ink's luminance) sets the ratio, so a busy picture counts at its
 * weakest, not at its average. `lums` are relative luminances of the area with the text hidden.
 */
export function measuredContrast(ink: string, lums: readonly number[]): number {
  if (!lums.length) return Infinity;
  const L = luminanceHex(ink);
  const sorted = [...lums].map((x) => contrastRatio(L, x)).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.1)] ?? sorted[0] ?? Infinity;
}
