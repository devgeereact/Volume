/* Typed access to the repository's config/ folder (D-017, D-018). The prototype and the server read
   the same files: config/profiles/*.json, config/book-types.json, config/interior-themes.json and
   config/cover-styles.json. The "@config" alias is set in vite.config.ts and tsconfig.json.

   Type safety: TypeScript checks each imported JSON file against the interfaces below when it is
   assigned, so a missing or misspelt field fails `npm run typecheck`. Fields that are unions (category,
   motif, typeface and so on) are checked at load time by small guards that throw a clear error. */

import bookTypesJson from "@config/book-types.json";
import coverStylesJson from "@config/cover-styles.json";
import interiorThemesJson from "@config/interior-themes.json";
import elenaMarshJson from "@config/profiles/elena-marsh.json";
import gideonJson from "@config/profiles/gideon-akinlotan.json";
import harniJson from "@config/profiles/harni-muharami.json";
import jrKadeJson from "@config/profiles/jr-kade.json";
import tobiRhymesJson from "@config/profiles/tobi-rhymes.json";
import type { CoverMotif, CoverTypeface } from "./types";

/* ---------- Guards ---------- */

function oneOf<T extends string>(allowed: readonly T[], value: string, where: string): T {
  const hit = allowed.find((a) => a === value);
  if (hit === undefined) throw new Error(`config: "${value}" is not allowed in ${where}. Use one of: ${allowed.join(", ")}.`);
  return hit;
}

/* ---------- Profiles ---------- */

export const STAGE_IDS = [
  "research",
  "titles",
  "blueprint",
  "writing",
  "summarise",
  "checks",
  "editing",
  "matter_metadata",
  "cover_brief",
  "cover_image",
  "marketing",
] as const;
export type ModelStageId = (typeof STAGE_IDS)[number];

export interface ProfileVoice {
  tone: string[];
  pov: string;
  rhythm: string;
  vocabulary: string;
  readingLevel: string;
  dialogueStyle: string;
  locale: string;
  bannedPhrases: string[];
  sampleParagraph: string;
  heatLevel?: string | undefined;
  heatLevelOptions?: string[] | undefined;
  series?: { ready: boolean; note: string } | undefined;
  audience?: { ageMin: number; ageMax: number } | undefined;
  newWordPerBook?: boolean | undefined;
  contentRulesFrom?: string | undefined;
  planning?: { twistPlan: boolean; clueLedger: boolean; note: string } | undefined;
}

export interface ProfilePublishing {
  copyrightTemplate: string;
  copyrightName: string;
  disclaimer: string;
  illustrativeLine: string | null;
  defaultBookType: string;
  defaultWordTarget: number;
  defaultTrim: string;
  defaultInteriorTheme: string;
  defaultCoverStyle: string;
}

export type ProfileBioStatus = "owner-to-confirm" | "confirmed" | "pen-name";

/** One author profile from config/profiles/<id>.json (schema in config/profiles/README.md). */
export interface AuthorProfile {
  id: string;
  name: string;
  initials: string;
  realPerson: boolean;
  legalName: string | null;
  location: string | null;
  imprint: string | null;
  bio: string;
  shortBio: string;
  credentials: string[];
  links: { label: string; value: string }[];
  genres: string[];
  bookTypes: string[];
  voice: ProfileVoice;
  publishing: ProfilePublishing;
  /** Per-stage model overrides; null uses config/models.defaults.json. */
  models: Record<ModelStageId, string | null>;
  modelNotes: string;
  status: { bio: ProfileBioStatus; note: string };
  createdAt: string;
}

interface RawProfile extends Omit<AuthorProfile, "models" | "status"> {
  models: Partial<Record<ModelStageId, string | null>>;
  status: { bio: string; note: string };
}

function toProfile(raw: RawProfile): AuthorProfile {
  const models = {} as Record<ModelStageId, string | null>;
  for (const s of STAGE_IDS) models[s] = raw.models[s] ?? null;
  return {
    ...raw,
    models,
    status: { bio: oneOf(["owner-to-confirm", "confirmed", "pen-name"] as const, raw.status.bio, `profile ${raw.id} status.bio`), note: raw.status.note },
  };
}

/** The five starter profiles, in the order the app lists them. */
export const profiles: AuthorProfile[] = [
  toProfile(gideonJson),
  toProfile(harniJson),
  toProfile(elenaMarshJson),
  toProfile(tobiRhymesJson),
  toProfile(jrKadeJson),
];

export function getProfile(id: string | undefined): AuthorProfile | undefined {
  return profiles.find((p) => p.id === id);
}

/* ---------- Book types ---------- */

export const BOOK_CATEGORY_IDS = ["fiction", "childrens", "nonfiction", "workbooks-journals"] as const;
export type BookCategoryId = (typeof BOOK_CATEGORY_IDS)[number];

export const TEMPLATE_FILES = [
  "fiction.json",
  "nonfiction.json",
  "picture-book.json",
  "workbook.json",
  "reference.json",
  "cookbook.json",
  "journal.json",
  "poetry.json",
] as const;
export type TemplateFile = (typeof TEMPLATE_FILES)[number];

export interface BookTypeCategory {
  id: BookCategoryId;
  name: string;
  description: string;
}

export interface BookType {
  id: string;
  name: string;
  category: BookCategoryId;
  description: string;
  templateFile: TemplateFile;
  structure: { frontMatter: string[]; bodyUnit: string; backMatter: string[] };
  wordRange: { min: number; max: number; default: number };
  /** Range for the body unit (chapters, stories, spreads, entries, recipes, poems or pages). */
  chapterRange: { min: number; max: number; default: number };
  genreRules: {
    expectations: string[];
    mustHaves: string[];
    tropes?: string[] | undefined;
    avoid: string[];
    readerAge?: string | undefined;
  };
  defaultInteriorTheme: string;
  defaultCoverStyle: string;
  defaultTrim: string;
  interior: "black-and-white" | "colour";
  lowContent: boolean;
  kdpNotes: { text: string; ruleIds: string[] }[];
}

interface RawBookType extends Omit<BookType, "category" | "templateFile" | "interior"> {
  category: string;
  templateFile: string;
  interior: string;
}

export const bookCategories: BookTypeCategory[] = bookTypesJson.categories.map((c) => ({
  ...c,
  id: oneOf(BOOK_CATEGORY_IDS, c.id, "book-types.json categories"),
}));

const rawBookTypes: RawBookType[] = bookTypesJson.types;
export const bookTypes: BookType[] = rawBookTypes.map((t) => ({
  ...t,
  category: oneOf(BOOK_CATEGORY_IDS, t.category, `book type ${t.id} category`),
  templateFile: oneOf(TEMPLATE_FILES, t.templateFile, `book type ${t.id} templateFile`),
  interior: oneOf(["black-and-white", "colour"] as const, t.interior, `book type ${t.id} interior`),
}));

export function getBookType(id: string | undefined): BookType | undefined {
  return bookTypes.find((t) => t.id === id);
}

export function bookTypesIn(category: BookCategoryId): BookType[] {
  return bookTypes.filter((t) => t.category === category);
}

/* ---------- Interior themes ---------- */

export interface InteriorTheme {
  id: string;
  name: string;
  description: string;
  bodyFont: string;
  headingFont: string;
  accentFont: string | null;
  sizes: { bodyPt: number; lineHeight: number; headingPt: number; chapterTitlePt: number; footnotePt: number };
  text: { align: string; hyphenate: boolean; paragraphIndentEm: number; firstParagraphIndent: boolean; widowsOrphans: number };
  margins: {
    approach: string;
    kdpRuleIds: string[];
    status: string;
    note: string;
    extraInsideIn: number;
    outsideIn: number;
    topIn: number;
    bottomIn: number;
    bleed: boolean;
  };
  chapterOpener: { style: string; startsOn: string; dropFolio: boolean; numberFormat: string };
  sceneBreak: { glyph: string; centred: boolean; fallback?: string | undefined };
  ornament: string;
  runningHeads: string;
  dropCaps: { enabled: boolean; lines: number };
  colourInterior: boolean;
  readability: string[];
  suitsBookTypes: string[];
}

export const interiorThemes: InteriorTheme[] = interiorThemesJson.themes;

export function getInteriorTheme(id: string | undefined): InteriorTheme | undefined {
  return interiorThemes.find((t) => t.id === id);
}

/* ---------- Cover styles ---------- */

export const COVER_TYPEFACES: readonly CoverTypeface[] = [
  "serif-display",
  "condensed-black",
  "grotesk-heavy",
  "italic-serif",
  "slab-serif",
  "didone-italic",
  "playfair-italic",
  "playfair-roman",
  "wide-caps",
  "soft-serif",
  "friendly-round",
  "tech-grotesk",
  "garamond-caps",
  "garamond-italic",
  "stack-black",
  "hyperlegible-bold",
];

export const COVER_MOTIFS: readonly CoverMotif[] = [
  "waves",
  "rule",
  "orbs",
  "speech",
  "loaf",
  "sprig",
  "stars-moon",
  "kite",
  "keyhole",
  "circuit-grid",
  "sun-sea",
  "rays",
  "magnifier",
  "crest",
  "blocks",
  "none",
];

export interface CoverPalette {
  id: string;
  name: string;
  background: string;
  title: string;
  subtitle: string;
  author: string;
  motif: string;
  motifAlt: string;
  band?: string | undefined;
}

export interface CoverStyle {
  id: string;
  name: string;
  description: string;
  suits: string[];
  typography: {
    typeface: CoverTypeface;
    titleFont: string;
    titleWeight: number;
    titleItalic: boolean;
    titleCase: "as-written" | "upper";
    titleTracking: string;
    subtitleFont: string;
    authorFont: string;
    authorStyle: "caps" | "italic" | "plain";
  };
  layout: {
    name: string;
    align: "left" | "center";
    titleTop: number;
    titleSize: number;
    subtitleTop: number | null;
    subtitleRightInset: number;
    frame: boolean;
    band: { top: number; height: number } | null;
    authorPosition: string;
  };
  motif: { kind: CoverMotif; box: { top: number; left: number; width: number; height: number }; description: string };
  palettes: CoverPalette[];
}

interface RawCoverStyle extends Omit<CoverStyle, "typography" | "layout" | "motif"> {
  typography: Omit<CoverStyle["typography"], "typeface" | "titleCase" | "authorStyle"> & { typeface: string; titleCase: string; authorStyle: string };
  layout: Omit<CoverStyle["layout"], "align"> & { align: string };
  motif: Omit<CoverStyle["motif"], "kind"> & { kind: string };
}

const rawCoverStyles: RawCoverStyle[] = coverStylesJson.styles;
export const coverStyles: CoverStyle[] = rawCoverStyles.map((s) => ({
  ...s,
  typography: {
    ...s.typography,
    typeface: oneOf(COVER_TYPEFACES, s.typography.typeface, `cover style ${s.id} typeface`),
    titleCase: oneOf(["as-written", "upper"] as const, s.typography.titleCase, `cover style ${s.id} titleCase`),
    authorStyle: oneOf(["caps", "italic", "plain"] as const, s.typography.authorStyle, `cover style ${s.id} authorStyle`),
  },
  layout: { ...s.layout, align: oneOf(["left", "center"] as const, s.layout.align, `cover style ${s.id} align`) },
  motif: { ...s.motif, kind: oneOf(COVER_MOTIFS, s.motif.kind, `cover style ${s.id} motif`) },
}));

export function getCoverStyle(id: string | undefined): CoverStyle | undefined {
  return coverStyles.find((s) => s.id === id);
}
