import type { CoverDesign, CoverPalette } from "../../demo";
import { layoutCover, withPalette, type TitlePosition } from "./concepts";
import type { CoverEdits } from "./coverEdit";
import type { CoverColours } from "./palettes";

/* What the owner sets in the cover studio, in one value so undo and redo can step through it: the palette (one of
   the design's own, or a picked one as colours), the title font, size and position, the subtitle switch and the
   edits made on the preview. Only fields the cover spec already has. */

export interface Look {
  /** One of the design's own palettes (index into its palette list). */
  paletteIdx: number;
  /** A picked palette (the book's own or one of the families), set as the spec's colours. Wins over paletteIdx. */
  colours: CoverColours | null;
  /** Title font chosen by the owner, or "" for the design's own. */
  titleFont: string;
  /** Title size as a percent of the design's. */
  size: number;
  position: TitlePosition;
  showSubtitle: boolean;
  edits: CoverEdits;
}

export const plainLook = (paletteIdx: number): Look => ({
  paletteIdx,
  colours: null,
  titleFont: "",
  size: 100,
  position: "style",
  showSubtitle: true,
  edits: {},
});

/** The colours a design draws with, in the spec's roles. */
export const coloursOf = (d: CoverDesign): CoverColours => ({
  background: d.palette.background,
  title: d.palette.title,
  subtitle: d.palette.subtitle,
  author: d.palette.author,
  accent: d.palette.motif,
  band: d.bandColour ?? d.palette.motifAlt,
});

/** A design's own palette as spec colours (for the Design tab of the colour picker). */
export const paletteColours = (p: CoverPalette): CoverColours => ({
  background: p.background,
  title: p.title,
  subtitle: p.subtitle,
  author: p.author,
  accent: p.motif,
  band: p.band ?? p.motifAlt,
});

/** The design drawn with the look applied (the demo cover, and the editing handles' first guess in server mode). */
export function designFor(base: CoverDesign, palette: CoverPalette | undefined, look: Look, subtitle: string | undefined): CoverDesign {
  const e = look.edits;
  const painted = palette ? withPalette(base, palette) : base;
  const c = look.colours;
  const coloured: CoverDesign = c
    ? {
        ...painted,
        palette: { background: c.background, title: c.title, subtitle: c.subtitle, author: c.author, motif: c.accent, motifAlt: c.band },
        bandColour: c.band,
      }
    : painted;
  const styled: CoverDesign = {
    ...coloured,
    ...(look.titleFont ? { titleFamily: look.titleFont } : {}),
    ...(e.titleAlign ? { titleAlign: e.titleAlign } : {}),
    ...(e.subtitleAlign ? { subtitleAlign: e.subtitleAlign } : {}),
    ...(e.authorAlign ? { authorAlign: e.authorAlign } : {}),
    ...(e.subtitleSize !== undefined ? { subtitleScale: e.subtitleSize } : {}),
    ...(e.authorSize !== undefined ? { authorScale: e.authorSize } : {}),
    ...(e.titleUppercase !== undefined ? { titleUppercase: e.titleUppercase } : {}),
  };
  return layoutCover(styled, { subtitle, size: look.size, position: look.position, titleTop: e.titleTop, subtitleTop: e.subtitleTop, authorTop: e.authorTop });
}
