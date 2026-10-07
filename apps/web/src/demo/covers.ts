import { getCoverStyle } from "./config";
import type { CoverDesign } from "./types";

/** What a book may change on top of its cover style. Everything else comes from config/cover-styles.json. */
export type CoverOverrides = Partial<
  Pick<CoverDesign, "titleSize" | "titleTop" | "subtitleTop" | "subtitleRightInset" | "motif" | "motifBox" | "align" | "titleUppercase">
>;

/**
 * Builds a typographic cover from a style and one of its palettes (config/cover-styles.json), with the
 * book's own title lines and any overrides. Throws when the style is missing so a typo fails loudly.
 */
export function coverFromStyle(styleId: string, paletteId: string, titleLines: string[], overrides: CoverOverrides = {}): CoverDesign {
  const style = getCoverStyle(styleId);
  if (!style) throw new Error(`Unknown cover style "${styleId}" (config/cover-styles.json).`);
  const palette = style.palettes.find((p) => p.id === paletteId) ?? style.palettes[0];
  if (!palette) throw new Error(`Cover style "${styleId}" has no palettes.`);
  const { typography: type, layout, motif } = style;
  return {
    styleId: style.id,
    palette: {
      background: palette.background,
      title: palette.title,
      subtitle: palette.subtitle,
      author: palette.author,
      motif: palette.motif,
      motifAlt: palette.motifAlt,
    },
    typeface: type.typeface,
    titleLines,
    titleSize: layout.titleSize,
    titleTop: layout.titleTop,
    titleUppercase: type.titleCase === "upper",
    subtitleTop: layout.subtitleTop,
    subtitleRightInset: layout.subtitleRightInset,
    motif: motif.kind,
    motifBox: motif.box,
    align: layout.align,
    titleTracking: type.titleTracking === "normal" ? undefined : type.titleTracking,
    accentFamily: type.subtitleFont,
    authorStyle: type.authorStyle,
    frame: layout.frame,
    band: layout.band,
    bandColour: palette.band ?? palette.motifAlt,
    ...overrides,
  };
}
