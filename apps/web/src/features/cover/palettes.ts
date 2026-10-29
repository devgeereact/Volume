/* Cover palettes for the cover studio's colour picker (approved Volume Studio design). Cover colours are book
   content, not interface colours, so their values live here as data, like the cover styles' own palettes.

   A palette sets the six colour roles the cover spec already has (CoverStyle.colours in packages/core, sent as
   typography.colours and applied by applyCoverTypography in packages/export): background, title, subtitle,
   author, accent and band. Nothing else changes, so the preview and the build stay the same picture. */

/** The cover spec's colour roles (packages/core CoverStyle.colours). Hex only. */
export interface CoverColours {
  background: string;
  title: string;
  subtitle: string;
  author: string;
  accent: string;
  band: string;
}

export interface NamedPalette {
  name: string;
  colours: CoverColours;
}

/** Each row: name, background, title ink, soft ink (subtitle and author), accent, band. */
type Row = readonly [string, string, string, string, string, string];

const FAMILY_ROWS: readonly (readonly [string, readonly Row[]])[] = [
  [
    "Jewel",
    [
      ["Amethyst", "#2E1247", "#FBEFFF", "#E3C8F5", "#F28FD0", "#5B2A86"],
      ["Emerald", "#06392B", "#F1FAF3", "#BFE8D0", "#F5C15C", "#0F6B4F"],
      ["Sapphire", "#0B1F4D", "#F2F6FF", "#C4D6FF", "#FFB547", "#1D4E9E"],
      ["Garnet", "#4A0D1C", "#FFF3F1", "#F7C9C6", "#FF8A65", "#8C1C33"],
    ],
  ],
  [
    "Sunset",
    [
      ["Apricot", "#FFB38A", "#2A1330", "#4A2340", "#7A2E5E", "#FF7B6B"],
      ["Golden hour", "#F7B538", "#2B1607", "#4D2A0E", "#A23E48", "#DB7C26"],
      ["Coral reef", "#FF6F61", "#22102A", "#3B1838", "#FFE3B3", "#D94F70"],
      ["Rose quartz", "#F7CAC9", "#3A1A2B", "#5C2A45", "#B0466E", "#E8A0BF"],
    ],
  ],
  [
    "Ocean",
    [
      ["Deep sea", "#072A3F", "#EAF8F7", "#B5E3E0", "#3CC9B4", "#0B5C73"],
      ["Lagoon", "#0A5E66", "#F3FFFD", "#CDEFED", "#FFB86B", "#13909B"],
      ["Seafoam", "#DDF4EE", "#0D3B3A", "#1F5655", "#E07A5F", "#A8E0D3"],
      ["Harbour", "#1C2B3A", "#F4F1EA", "#CFD8E3", "#E4B363", "#33506B"],
    ],
  ],
  [
    "Botanical",
    [
      ["Fern", "#23361F", "#F4F1E1", "#D3DDBE", "#B6D46A", "#3F5F35"],
      ["Sage", "#CDD8C4", "#1E2B20", "#33473A", "#6B8F5E", "#A9BD9C"],
      ["Olive grove", "#4D5A2A", "#FBF6E6", "#E3E1C2", "#E9B44C", "#6E7D3A"],
      ["Lavender field", "#E4DDF4", "#2A1E47", "#463670", "#7B5FC4", "#C3B5E8"],
    ],
  ],
  [
    "Neon",
    [
      ["Electric", "#0D0221", "#FAF7FF", "#D6CCFF", "#FF2E88", "#2A0A4A"],
      ["Acid lime", "#101410", "#F4FFE8", "#CFE8BC", "#C6FF3A", "#1E2A1B"],
      ["Ultraviolet", "#1A0638", "#FFFFFF", "#E2CCFF", "#B14BFF", "#4A0E8F"],
      ["Synthwave", "#1B1035", "#FFF5FB", "#FFCFE8", "#FF6EC7", "#3D1A6E"],
    ],
  ],
  [
    "Pastel",
    [
      ["Lilac", "#EADFF7", "#2D1C4A", "#4A3570", "#9C7BD8", "#D4C2F0"],
      ["Mint cream", "#DFF6EA", "#10362A", "#275446", "#3BA676", "#BDEBD4"],
      ["Peach", "#FFE4D6", "#3E1D14", "#5E3122", "#EE8A64", "#FFC9B0"],
      ["Powder blue", "#DCEAF8", "#0F2741", "#24476B", "#4B88CF", "#B9D4F1"],
    ],
  ],
  [
    "Earth",
    [
      ["Terracotta", "#A8492B", "#FFF4E8", "#F9E2CF", "#F2C27B", "#7E3420"],
      ["Clay", "#E8D3BF", "#33221A", "#54392B", "#A0563A", "#D2B496"],
      ["Charcoal gold", "#1F2022", "#F3EFE7", "#D4CEC3", "#D4A72C", "#3A3B3F"],
      ["Desert", "#D9A066", "#2A170B", "#43260F", "#7A2F1C", "#B8743F"],
    ],
  ],
  [
    "Mono",
    [
      ["Paper", "#F4F0E8", "#141414", "#2E2E2E", "#141414", "#E4DED2"],
      ["Ink", "#121212", "#F4F0E8", "#D7D2C8", "#F4F0E8", "#2A2A2A"],
      ["Signal red", "#C8231B", "#FFFFFF", "#FFE6E3", "#141414", "#8F1711"],
      ["Cobalt", "#1F3FBF", "#FFFFFF", "#DCE4FF", "#FFD84D", "#142C8C"],
    ],
  ],
];

const fromRow = ([name, background, title, soft, accent, band]: Row): NamedPalette => ({
  name,
  colours: { background, title, subtitle: soft, author: soft, accent, band },
});

/** Eight families of four palettes each (32 in all). */
export const PALETTE_FAMILIES: readonly { name: string; palettes: NamedPalette[] }[] = FAMILY_ROWS.map(([name, rows]) => ({
  name,
  palettes: rows.map(fromRow),
}));

/* ---------- colour maths (WCAG relative luminance) ---------- */

const HEX6 = /^#?([0-9a-f]{6})$/i;
const HEX3 = /^#?([0-9a-f]{3})$/i;

function rgb(hex: string): [number, number, number] {
  const six = HEX6.exec(hex)?.[1] ?? (HEX3.exec(hex)?.[1] ?? "000").replace(/./g, (c) => c + c);
  return [0, 2, 4].map((i) => Number.parseInt(six.slice(i, i + 2), 16)) as [number, number, number];
}

const hex2 = (n: number) =>
  Math.round(Math.max(0, Math.min(255, n)))
    .toString(16)
    .padStart(2, "0");

/** Relative luminance, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `a` moved towards `b` by `t` (0 to 1). */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return ("#" + x.map((v, i) => hex2(v + ((y[i] ?? 0) - v) * t)).join("")).toUpperCase();
}

function hsl(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return ("#" + [f(0), f(8), f(4)].map((x) => hex2(x * 255)).join("")).toUpperCase();
}

/* ---------- the book's own palette ---------- */

function hashStr(s: string): number {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HUE_NAMES = ["Crimson", "Coral", "Amber", "Saffron", "Lime", "Jade", "Teal", "Lagoon", "Azure", "Indigo", "Violet", "Orchid", "Magenta", "Rose"];

type Hsl = [number, number, number];

/**
 * A palette made from the book alone: the hue, mood and accents come from the book's id (so every book starts
 * with its own colours and the same book always gets the same ones), and the inks are pushed until they pass
 * contrast (7 to 1 for the title, 4.8 to 1 for the soft ink). `n` gives the next palettes in the same family.
 */
export function bookPalette(bookId: string, n = 0): NamedPalette {
  const r = rng(hashStr(bookId) + n * 7919);
  const H = Math.floor(r() * 360);
  const mood = Math.floor(r() * 5);
  const sp = 25 + r() * 50;
  const moods: [string, Hsl, Hsl, Hsl, Hsl, Hsl][] = [
    ["Deep", [H, 55 + r() * 25, 13 + r() * 7], [H, 35, 96], [H, 50, 84], [H + 150 + sp, 85, 66], [H + 24, 60, 26]],
    ["Bright", [H, 82, 62 + r() * 6], [H + 200, 70, 11], [H + 200, 50, 20], [H + 210, 65, 26], [H + 28, 85, 50]],
    ["Pastel", [H, 62, 89], [H, 60, 15], [H, 42, 26], [H + 30, 58, 52], [H + 34, 58, 79]],
    ["Neon", [H, 75, 7], [H, 20, 97], [H, 65, 86], [H + 120, 100, 60], [H + 36, 75, 17]],
    ["Earthy", [(H % 50) + 8, 48, 32 + r() * 10], [40, 45, 95], [40, 38, 86], [(H % 50) + 32, 72, 68], [(H % 50) + 2, 52, 22]],
  ];
  const [moodName, bg, title, soft, accent, band] = moods[mood] ?? moods[0]!;
  const background = hsl(...bg);
  // Push the inks towards whichever of white or black stands out more on this background.
  const towards = contrast(background, "#FFFFFF") >= contrast(background, "#000000") ? "#FFFFFF" : "#000000";
  let t = hsl(...title);
  for (let i = 0; i < 12 && contrast(t, background) < 7; i++) t = mix(t, towards, 0.25);
  let s = hsl(...soft);
  for (let i = 0; i < 12 && contrast(s, background) < 4.8; i++) s = mix(s, towards, 0.25);
  // A mid-tone background can stop short of the target: then the ink is pure white or black, which is always 4.5 to 1 or more.
  if (contrast(t, background) < 4.5) t = towards;
  if (contrast(s, background) < 4.5) s = towards;
  const hueName = HUE_NAMES[Math.floor((((H % 360) + 360) % 360) / (360 / HUE_NAMES.length))] ?? "Teal";
  return { name: `${moodName} ${hueName}`, colours: { background, title: t, subtitle: s, author: s, accent: hsl(...accent), band: hsl(...band) } };
}

/** Four of the book's own palettes, starting at `from`. */
export const bookPalettes = (bookId: string, from = 0): NamedPalette[] => [0, 1, 2, 3].map((k) => bookPalette(bookId, from + k));

/** Same colours (case does not matter), for marking the palette in use. */
export function sameColours(a: Partial<CoverColours> | null | undefined, b: CoverColours): boolean {
  if (!a) return false;
  return (["background", "title", "subtitle", "author", "accent", "band"] as const).every((k) => (a[k] ?? "").toUpperCase() === b[k].toUpperCase());
}

const HEX_ANY = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Saved typography.colours back to a full set, or null when it is missing or not complete. */
export function coloursFromSaved(v: unknown): CoverColours | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out: Partial<CoverColours> = {};
  for (const k of ["background", "title", "subtitle", "author", "accent", "band"] as const) {
    const c = o[k];
    if (typeof c !== "string" || !HEX_ANY.test(c)) return null;
    out[k] = c;
  }
  return out as CoverColours;
}
