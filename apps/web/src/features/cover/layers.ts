import {
  COVER_SHAPE_NAMES,
  COVER_TEXTURE_INFO,
  hasLayers,
  layerContrast,
  normaliseCoverLayers,
  type CoverBackground,
  type CoverLayers,
  type CoverPicture,
  type CoverShape,
  type CoverShapeKind,
} from "@volume/core";
import type { StudioCheck } from "./Studio";

/* The cover layers in the studio: background mode, artwork settings, shapes, spine colours and the barcode box.
   They are the cover spec's own fields (packages/core cover-layers.ts), sent as typography keys and drawn by the
   build (packages/export covers.ts). The studio shows the build's own page, so the preview is the print. */

export interface StudioLayers extends CoverLayers {
  /** The white box under KDP's barcode on the wrap (default on). */
  showBarcodeBox?: boolean;
}

/** The typography keys the layers use, so taking one away counts as a change. */
export const LAYER_KEYS = ["background", "artwork", "shapes", "spine", "showBarcodeBox"] as const;

/** Layers from saved typography, cleaned by the same normaliser the build uses. */
export function layersFromSaved(t: Record<string, unknown>): StudioLayers {
  const out: StudioLayers = normaliseCoverLayers(t);
  if (t["showBarcodeBox"] === false) out.showBarcodeBox = false;
  return out;
}

/** The layer keys to send (only those set). */
export function layersToTypography(l: StudioLayers): Record<string, unknown> {
  return {
    ...(l.background ? { background: l.background } : {}),
    ...(l.artwork ? { artwork: l.artwork } : {}),
    ...(l.shapes?.length ? { shapes: l.shapes } : {}),
    ...(l.spine && Object.keys(l.spine).length ? { spine: l.spine } : {}),
    ...(l.showBarcodeBox === false ? { showBarcodeBox: false } : {}),
  };
}

/** A gradient that starts from the cover's own colour, so switching to it changes as little as possible. */
export const startGradient = (from: string, to: string): CoverBackground => ({
  mode: "gradient",
  span: "wrap",
  gradient: { type: "linear", from, to, angle: 160, centreX: 30, centreY: 25 },
});

/** A picture background with the settings a picture or a texture is made for. */
export function startPicture(src: { assetId: string } | { texture: keyof typeof COVER_TEXTURE_INFO }, span: CoverBackground["span"] = "wrap"): CoverBackground {
  const info = "texture" in src ? COVER_TEXTURE_INFO[src.texture] : null;
  const image: CoverPicture = {
    ...src,
    opacity: info?.opacity ?? 1,
    blend: info?.blend ?? "normal",
    scale: 1,
    focusX: 50,
    focusY: 50,
    blur: 0,
    greyscale: false,
  };
  return { mode: "image", span, image };
}

/** A new shape near the middle of the chosen surface, with an id no other shape has. */
export function newShape(kind: CoverShapeKind, surface: "front" | "back", colour: string, existing: readonly CoverShape[]): CoverShape {
  let n = existing.length + 1;
  while (existing.some((s) => s.id === `s${n}`)) n++;
  const pattern = kind === "stripes" || kind === "dots" || kind === "grid";
  const line = kind === "line";
  return {
    id: `s${n}`,
    kind,
    surface,
    x: pattern ? 0 : line ? 15 : 60,
    y: pattern ? 110 : line ? 100 : 70,
    w: pattern ? 100 : line ? 70 : 30,
    h: pattern ? 40 : line ? 1 : 30,
    rotation: 0,
    colour,
    opacity: pattern ? 0.5 : 0.9,
    layer: "behind",
  };
}

/** Names for the shapes list ("Circle", "Circle 2"). */
export function shapeLabel(s: CoverShape, all: readonly CoverShape[]): string {
  const same = all.filter((x) => x.kind === s.kind);
  const i = same.indexOf(s);
  return `${COVER_SHAPE_NAMES[s.kind]}${same.length > 1 ? ` ${i + 1}` : ""} (${s.surface === "front" ? "front" : "back"})`;
}

/**
 * The contrast checks for covers with layers: what the spec can show (plain and gradient backgrounds, shapes behind
 * the type), what needs a look (pictures, textures, shapes over the type, art with its own settings), and what the
 * build measured on the real pixels last time (wrapSpec.warnings) or the build's page says now (preview warnings).
 */
export function layerChecks(i: {
  layers: StudioLayers;
  colours: { background: string; title: string; subtitle: string; author: string };
  art: boolean;
  showSubtitle: boolean;
  built: readonly string[];
  page: readonly string[];
  show: (part: "title" | "subtitle" | "author") => void;
}): StudioCheck[] | null {
  if (!hasLayers(i.layers)) return null;
  const name = { title: "Title", subtitle: "Subtitle", author: "Author" } as const;
  const out: StudioCheck[] = layerContrast(i.layers, i.colours, { art: i.art, showSubtitle: i.showSubtitle }).map((c) => ({
    status: c.status === "look" ? "warn" : c.status,
    title: c.status === "look" ? `${name[c.part]} contrast needs a look` : `${name[c.part]} contrast`,
    detail: c.detail,
    onShow: () => i.show(c.part),
  }));
  // Rule status notes (the barcode area is a partial rule) are shown where the rule is, not as a cover problem.
  const real = (list: readonly string[]) => [...new Set(list)].filter((w) => !/^Rule \S+ is (partial|unverified)/.test(w));
  for (const w of real(i.page)) out.push({ status: "warn", title: "From the build's page", detail: w });
  for (const w of real(i.built)) out.push({ status: "warn", title: "Noted by the last build", detail: w });
  return out;
}
