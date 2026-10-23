import {
  coverFromStyle,
  coverStyles,
  getBookType,
  getCoverStyle,
  getPenName,
  type Book,
  type CoverDesign,
  type CoverPalette,
  type CoverStyle,
  type CoverTypeface,
} from "../../demo";

/* Screen-only data for the Cover studio: the brief and four concepts. Concepts are drawn as typographic
   covers with abstract art (no photos). Their colours are book content, like the covers in books.ts,
   not interface tokens. The image model would make the background art; Volume sets the type. */

export interface CoverBrief {
  genre: string[];
  mood: string[];
  colours: string[];
  symbols: string[];
  avoid: string;
}

export interface Concept {
  id: string;
  /** "Concept A". */
  name: string;
  /** The cover style it comes from (config/cover-styles.json). */
  style: CoverStyle;
  /** First sentence of the style's description. */
  note: string;
  /** True for the book's own style, as set when the book was made. */
  own: boolean;
  /** The design with its starting palette. */
  base: CoverDesign;
  /** Index of the starting palette in style.palettes. */
  paletteIndex: number;
}

export const genreOptions = ["Non-fiction", "Nursing", "Workplace", "Self-help", "Health", "Leadership", "Cookery", "Children's"];
export const moodOptions = ["Calm", "Brave", "Warm", "Serious", "Hopeful", "Practical", "Bold"];

export function briefFor(book: Book): CoverBrief {
  if (book.id === "speaking-up-safely")
    return {
      genre: ["Non-fiction", "Nursing", "Workplace"],
      mood: ["Brave", "Calm", "Hopeful"],
      colours: ["Plum", "Rose", "Cream"],
      symbols: ["Speech mark", "Open door"],
      avoid: "No stethoscopes, no stock photos of nurses, no red warning signs. Nothing that looks like a policy leaflet.",
    };
  const type = getBookType(book.bookTypeId);
  const style = getCoverStyle(book.coverStyleId);
  return {
    genre: type ? [type.name] : [],
    mood: (getPenName(book.penNameId)?.profile.voice.tone ?? []).slice(0, 3).map((t) => t.charAt(0).toUpperCase() + t.slice(1)),
    colours: style ? style.palettes.slice(0, 2).map((p) => p.name) : [],
    symbols: style ? [style.motif.description.replace(/\.$/, "")] : [],
    avoid: "No stock photos, no clip art, nothing that copies another book's cover.",
  };
}

function lines(title: string): string[] {
  const words = title.split(" ");
  if (words.length <= 1) return [title];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

/** The style's palette swapped into a design (background, type, motif and band colours). */
export function withPalette(d: CoverDesign, p: CoverPalette): CoverDesign {
  return {
    ...d,
    palette: { background: p.background, title: p.title, subtitle: p.subtitle, author: p.author, motif: p.motif, motifAlt: p.motifAlt },
    bandColour: p.band ?? p.motifAlt,
  };
}

/**
 * Four concepts, each from a different cover style: A is the book's own style (D-017), B to D are the
 * other styles that suit its book type first, then others, so the four never look alike.
 */
export function conceptsFor(book: Book): Concept[] {
  const ownStyle = getCoverStyle(book.coverStyleId) ?? coverStyles[0]!;
  const titleLines = book.cover?.titleLines ?? lines(book.title);
  const suits = coverStyles.filter((s) => s.id !== ownStyle.id && s.suits.includes(book.bookTypeId));
  // Styles that do not list the type come in an order that depends on the book, so two books never share all four.
  const pool = coverStyles.filter((s) => s.id !== ownStyle.id && !s.suits.includes(book.bookTypeId));
  const turn = [...book.id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 9973, 7) % Math.max(1, pool.length);
  const rest = [...pool.slice(turn), ...pool.slice(0, turn)];
  const others = [...suits, ...rest].slice(0, 3);
  const ownBase = book.cover ?? coverFromStyle(ownStyle.id, ownStyle.palettes[0]?.id ?? "", titleLines);
  const ownPalette = Math.max(
    0,
    ownStyle.palettes.findIndex((p) => p.background === ownBase.palette.background),
  );
  const firstSentence = (t: string) => t.split(/(?<=\.)\s/)[0] ?? t;
  return [
    { id: "a", name: "Concept A", style: ownStyle, note: firstSentence(ownStyle.description), own: true, base: ownBase, paletteIndex: ownPalette },
    ...others.map((style, i): Concept => {
      const paletteIndex = (i + 1) % Math.max(1, style.palettes.length);
      return {
        id: String.fromCharCode(98 + i),
        name: `Concept ${String.fromCharCode(66 + i)}`,
        style,
        note: firstSentence(style.description),
        own: false,
        base: coverFromStyle(style.id, style.palettes[paletteIndex]?.id ?? "", titleLines),
        paletteIndex,
      };
    }),
  ];
}

/* ---------- Layout: keep type, subtitle and drawing apart ---------- */

export type TitlePosition = "style" | "top" | "middle" | "bottom";

/** Rough average letter width per title face, in em, for fitting lines to the cover (mixed case). */
const letterWidth: Record<CoverTypeface, number> = {
  "serif-display": 0.48,
  "condensed-black": 0.38,
  "grotesk-heavy": 0.6,
  "italic-serif": 0.45,
  "slab-serif": 0.56,
  "didone-italic": 0.5,
  "playfair-italic": 0.48,
  "playfair-roman": 0.58,
  "wide-caps": 0.74,
  "soft-serif": 0.56,
  "friendly-round": 0.6,
  "tech-grotesk": 0.6,
  "garamond-caps": 0.52,
  "garamond-italic": 0.42,
  "stack-black": 0.64,
  "hyperlegible-bold": 0.6,
};
const lineHeight: Partial<Record<CoverTypeface, number>> = {
  "condensed-black": 0.84,
  "stack-black": 0.86,
  "wide-caps": 1.2,
  "slab-serif": 1.04,
  "garamond-caps": 1.06,
  "garamond-italic": 1.06,
};
const COVER_H = 150;
const SUB_SIZE = 5.2;

interface LayoutOptions {
  subtitle?: string | undefined;
  /** Title size as a percentage of the style's size. */
  size?: number;
  position?: TitlePosition;
  /** Exact tops the owner set by dragging or nudging in the preview (cover-width units). */
  titleTop?: number | undefined;
  subtitleTop?: number | undefined;
  authorTop?: number | undefined;
}

const clampTop = (n: number) => Math.min(150, Math.max(0, n));

/** Where the author line starts when nothing moved it: the top of its single line near the foot of the cover. */
export function defaultAuthorTop(d: Pick<CoverDesign, "frame" | "authorStyle" | "authorScale">): number {
  const size = (d.authorStyle === "caps" || d.authorStyle === undefined ? 4.4 : 5.6) * (d.authorScale ?? 1);
  return COVER_H - (d.frame ? 11 : 9) - size - 2;
}

/**
 * Lays out a design so nothing collides: the title shrinks to fit the width, the subtitle sits clear of
 * the title and the author line, and the drawing moves to the largest free space (or is left out) when
 * type would cross it. Units are the Cover component's: width 100, height 150.
 */
export function layoutCover(
  d: CoverDesign,
  { subtitle, size = 100, position = "style", titleTop: titleTopSet, subtitleTop: subtitleTopSet, authorTop: authorTopSet }: LayoutOptions = {},
): CoverDesign {
  const centred = d.align === "center";
  const upper = d.titleUppercase ? 1.12 : 1;
  const tracking = d.titleTracking?.endsWith("em") ? Number.parseFloat(d.titleTracking) || 0 : 0;
  const perChar = (letterWidth[d.typeface] ?? 0.55) * upper + tracking;
  const avail = centred ? 82 : 81;
  const longest = Math.max(1, ...d.titleLines.map((l) => l.length));
  let titleSize = (d.titleSize * size) / 100;
  // 0.9: the letter widths are averages, and wide letters (B, k, o) would otherwise wrap a line.
  titleSize = Math.min(titleSize, (avail * 0.9) / (longest * perChar));
  const blockH = titleSize * (lineHeight[d.typeface] ?? 1) * d.titleLines.length;

  const authorTop = defaultAuthorTop(d);
  const subWidth = centred ? 100 - 2 * d.subtitleRightInset : 90 - d.subtitleRightInset;
  const subShown = Boolean(subtitle) && d.subtitleTop !== null;
  const subScale = d.subtitleScale ?? 1;
  const subH = subShown ? Math.ceil(((subtitle ?? "").length * SUB_SIZE * subScale * 0.5) / Math.max(20, subWidth)) * SUB_SIZE * subScale * 1.3 : 0;

  let titleTop = d.titleTop;
  if (position === "top") titleTop = Math.min(d.titleTop, 12);
  else if (position === "middle") titleTop = (COVER_H - blockH) / 2 - (subShown ? subH / 2 + 2 : 0);
  else if (position === "bottom") titleTop = authorTop - 6 - blockH - (subShown ? subH + 4 : 0);
  titleTop = Math.max(6, titleTop);
  if (titleTopSet !== undefined) titleTop = clampTop(titleTopSet);
  const titleBottom = titleTop + blockH;

  let subtitleTop = d.subtitleTop;
  if (subShown && subtitleTop !== null) {
    const clashes = subtitleTop < titleBottom + 3 && subtitleTop + subH > titleTop - 2;
    if (position !== "style" || titleTopSet !== undefined || clashes) subtitleTop = titleBottom + 4;
    if (subtitleTop + subH > authorTop - 2) subtitleTop = Math.max(titleBottom + 2, authorTop - 2 - subH);
  }
  if (subShown && subtitleTopSet !== undefined) subtitleTop = clampTop(subtitleTopSet);

  // Free bands on the cover, between the type.
  const taken: [number, number][] = [[titleTop - 3, titleBottom + 3]];
  if (subShown && subtitleTop !== null) taken.push([subtitleTop - 3, subtitleTop + subH + 3]);
  taken.push(authorTopSet !== undefined ? [authorTopSet - 2, authorTopSet + 8] : [authorTop - 2, COVER_H]);
  taken.sort((a, b) => a[0] - b[0]);
  let motif = d.motif;
  let box = d.motifBox;
  const crosses = motif !== "none" && taken.some(([a, b]) => box.top < b && box.top + box.height > a);
  if (crosses) {
    const gaps: [number, number][] = [];
    let y = 4;
    for (const [a, b] of taken) {
      if (a > y) gaps.push([y, a]);
      y = Math.max(y, b);
    }
    const best = gaps.sort((g, h) => h[1] - h[0] - (g[1] - g[0]))[0];
    const room = best ? best[1] - best[0] - 4 : 0;
    if (!best || room < 14) motif = "none";
    else {
      const h = Math.min(box.height, room);
      const scale = h / box.height;
      const fullWidth = box.width >= 90;
      const w = fullWidth ? box.width : box.width * scale;
      const left = fullWidth ? box.left : box.left + (box.width - w) / 2;
      box = { top: best[0] + (best[1] - best[0] - h) / 2, left, width: w, height: h };
    }
  }

  return { ...d, titleSize, titleTop, subtitleTop, motif, motifBox: box, ...(authorTopSet !== undefined ? { authorTop: clampTop(authorTopSet) } : {}) };
}

/** Hit areas for the three lines, in cover-width units (width 100, height 150), for clicking and dragging in the preview. */
export function partBoxes(d: CoverDesign, subtitle: string | undefined): Record<"title" | "subtitle" | "author", { top: number; height: number } | null> {
  const lines = Math.max(1, d.titleLines.length);
  const titleH = d.titleSize * (lineHeight[d.typeface] ?? 1) * lines;
  const subScale = d.subtitleScale ?? 1;
  const width = d.align === "center" ? 100 - 2 * d.subtitleRightInset : 90 - d.subtitleRightInset;
  const subH =
    subtitle && d.subtitleTop !== null ? Math.ceil((subtitle.length * SUB_SIZE * subScale * 0.5) / Math.max(20, width)) * SUB_SIZE * subScale * 1.3 : 0;
  const authorH = (d.authorStyle === "caps" || d.authorStyle === undefined ? 4.4 : 5.6) * (d.authorScale ?? 1);
  const authorTop = d.authorTop ?? defaultAuthorTop(d);
  return {
    title: { top: d.titleTop, height: titleH },
    subtitle: subH > 0 && d.subtitleTop !== null ? { top: d.subtitleTop, height: subH } : null,
    author: { top: authorTop, height: authorH },
  };
}

/** Back cover blurb for the wrap preview (book content, written for the demo). */
export function blurbFor(book: Book): string {
  if (book.id === "speaking-up-safely")
    return "Raising a concern at work is one of the hardest things a nurse can do. This book walks through how to notice the moment, choose the right person, say it clearly and look after yourself afterwards.";
  return `${book.subtitle || book.title}. A practical guide, written in plain English.`;
}

/** The interior PDF's page count when it exists (the wrap uses the real count, never an estimate). */
export const interiorPages: Record<string, { pages: number; paper: "white" | "cream"; builtAt: string } | undefined> = {
  "speaking-up-safely": { pages: 164, paper: "cream", builtAt: "2026-10-01T15:52:00+01:00" },
  "sourdough-on-a-weeknight": { pages: 176, paper: "cream", builtAt: "2026-09-28T09:02:00+01:00" },
  "windowsill-herbs": { pages: 112, paper: "white", builtAt: "2026-09-10T11:00:00+01:00" },
};
