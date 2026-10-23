import type { AuthorProfile } from "./config";

/* Types for the prototype's mock data. Shapes follow docs/02-architecture/DATA-MODEL.md loosely, so screens
   can move to the real API in phase 1 with small changes. Everything here is demo data. */

/** Pipeline stages a book moves through (docs/02-architecture/DATA-MODEL.md, projects.status). */
export type StageId = "idea" | "research" | "title" | "blueprint" | "writing" | "editing" | "cover" | "export" | "published";

/** Book screens in the left nav, in order. Routes live under /books/:bookId/<step>. */
export type BookStepId = "research" | "titles" | "blueprint" | "writing" | "editor" | "cover" | "export" | "marketing";

/** State dot for a book step in the nav (08-DESIGN-GUIDE, Left nav). */
export type StepState = "not-started" | "in-progress" | "running" | "attention" | "done";

/** Structure templates in config/book-templates/ (file name without .json). */
export type TemplateId = "nonfiction" | "fiction" | "workbook" | "reference" | "picture-book" | "cookbook" | "journal" | "poetry";

/** ISO 8601 timestamp with offset, for example "2026-10-04T14:31:00+01:00". */
export type IsoDateTime = string;

/**
 * A profile as the screens use it. Built from config/profiles/<id>.json by data/penNames.ts; the full
 * config record is on `profile` (voice, publishing defaults, models, status).
 */
export interface PenName {
  id: string;
  name: string;
  initials: string;
  imprint: string | null;
  /** A real person writes under this name (shows the illustrative-line explanation in the editor). */
  realPerson: boolean;
  /** Third-person bio. About the Author prints this word for word. */
  bio: string;
  shortBio: string;
  /** Where the bio came from and whether it is approved. "pen-name" marks a fictional persona. */
  bioStatus: "sample-owner-to-confirm" | "confirmed" | "pen-name" | "demo";
  bioNote: string;
  credentials: string[];
  links: { label: string; value: string }[];
  /** Readable voice lines (tone, point of view, rhythm, vocabulary). The structured voice is on profile.voice. */
  voice: string[];
  defaultWriterModel: string;
  genres: string[];
  isDemo: boolean;
  createdAt: IsoDateTime;
  /** The full profile from config/profiles. */
  profile: AuthorProfile;
}

/** Cover title faces. Each maps to an OFL font in components/ui/Cover.tsx and config/cover-styles.json. */
export type CoverTypeface =
  | "serif-display"
  | "condensed-black"
  | "grotesk-heavy"
  | "italic-serif"
  | "slab-serif"
  | "didone-italic"
  | "playfair-italic"
  | "playfair-roman"
  | "wide-caps"
  | "soft-serif"
  | "friendly-round"
  | "tech-grotesk"
  | "garamond-caps"
  | "garamond-italic"
  | "stack-black"
  | "hyperlegible-bold";

export type CoverMotif =
  | "waves"
  | "rule"
  | "orbs"
  | "speech"
  | "loaf"
  | "sprig"
  | "stars-moon"
  | "kite"
  | "keyhole"
  | "circuit-grid"
  | "sun-sea"
  | "rays"
  | "magnifier"
  | "crest"
  | "blocks"
  | "none";

/** A typographic cover drawn by the Cover component. Positions and sizes are in container width units (cqw). */
export interface CoverDesign {
  palette: {
    background: string;
    title: string;
    subtitle: string;
    author: string;
    motif: string;
    /** Second motif colour (orb centre, loaf crust). */
    motifAlt: string;
  };
  typeface: CoverTypeface;
  /** The title as printed, one string per line. */
  titleLines: string[];
  titleSize: number;
  titleTop: number;
  titleUppercase: boolean;
  /** Subtitle position; null hides the subtitle on the cover. */
  subtitleTop: number | null;
  subtitleRightInset: number;
  motif: CoverMotif;
  motifBox: { top: number; left: number; width: number; height: number };
  /* Optional, set when the design comes from a cover style (config/cover-styles.json). */
  /** Style id the design was built from. */
  styleId?: string | undefined;
  /** Title and subtitle alignment. Default left. */
  align?: "left" | "center" | "right" | undefined;
  /** Own alignment for one line, set by the owner in the cover studio. Each falls back to `align`. */
  titleAlign?: "left" | "center" | "right" | undefined;
  subtitleAlign?: "left" | "center" | "right" | undefined;
  authorAlign?: "left" | "center" | "right" | undefined;
  /** Author line top in cover-width units. Without it the author sits at the foot of the cover. */
  authorTop?: number | undefined;
  /** Size multipliers for the subtitle and author lines (1 is the usual size). */
  subtitleScale?: number | undefined;
  authorScale?: number | undefined;
  /** CSS text-shadow for the title, subtitle and author, set over art when the ink needs a little lift. */
  textShadow?: string | undefined;
  /** Title font chosen by the owner in the cover studio (an installed OFL family); replaces the style's title face. */
  titleFamily?: string | undefined;
  /** Letter spacing for the title, as CSS (for example "0.14em"). */
  titleTracking?: string | undefined;
  /** Font family for the subtitle and author lines (an installed OFL family). Default the interface sans. */
  accentFamily?: string | undefined;
  /** Author line: spaced capitals (default), italic or plain. */
  authorStyle?: "caps" | "italic" | "plain" | undefined;
  /** Inset double frame in the motif colour. */
  frame?: boolean | undefined;
  /** Solid band across the cover, in cover-width units, filled with palette.band (or motifAlt). */
  band?: { top: number; height: number } | null | undefined;
  /** Band colour; falls back to motifAlt. */
  bandColour?: string | undefined;
}

export interface Book {
  id: string;
  title: string;
  subtitle: string;
  penNameId: string;
  template: TemplateId;
  stage: StageId;
  /** One status line, as on the Library card ("Ready to approve"). */
  statusLine: string;
  words: { written: number; target: number };
  cost: { spent: number; budget: number };
  trim: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  cover: CoverDesign | null;
  /** Server books: the real cover image (final: the built or uploaded eBook cover; otherwise the chosen concept art). */
  coverImage?: { src: string; final: boolean } | null | undefined;
  /** Steps that finished but need the owner to look (claims, warnings). */
  attentionSteps: BookStepId[];
  isDemo: boolean;
  archived: boolean;
  /** Book type id from config/book-types.json. */
  bookTypeId: string;
  /** Interior theme id from config/interior-themes.json. Every book has its own. */
  interiorThemeId: string;
  /** Cover style id from config/cover-styles.json. Every book has its own. */
  coverStyleId: string;
  /** Series name and number, when the book belongs to one. */
  series: { name: string; number: number } | null;
  /** Set once the book is live on Amazon (the Published shelf). */
  published: PublishedInfo | null;
  /** Every section is written (D-048). The one gate for marketing (D-049). */
  writingComplete: boolean;
  /** TikTok scripts and Instagram posts the template asks for (D-049). */
  marketingCounts: { tiktok: number; instagram: number };
}

export interface PublishedFormat {
  format: "Paperback" | "Kindle eBook" | "Hardcover";
  /** List price as shown in KDP, in pounds for amazon.co.uk. Demo values. */
  listPriceGbp: number;
  /** Date the format went live. */
  liveOn: IsoDateTime;
  pages: number | null;
}

export interface PublishedInfo {
  publishedOn: IsoDateTime;
  marketplace: string;
  formats: PublishedFormat[];
  /** AI disclosure as answered in KDP (ai.disclosure). */
  aiDisclosure: "AI-generated text" | "AI-generated text and images" | "AI-assisted";
  /** The export pack version that was uploaded. */
  packVersion: number;
}

export interface ActivityEvent {
  id: string;
  at: IsoDateTime;
  bookId: string;
  title: string;
  detail: string;
  live: boolean;
}

/* ---------- Blueprint ---------- */

export interface ChapterPlan {
  number: number;
  title: string;
  subheadings: string[];
  summary: string;
  wordTarget: number;
  claimIds: string[];
}

export interface MatterPart {
  id: string;
  title: string;
  source: "app" | "profile" | "writer" | "owner";
  wordTarget: number | null;
  note: string;
}

export interface ClaimToVerify {
  id: string;
  location: string;
  chapter: number | null;
  text: string;
  reason: string;
  suggestion: string;
  status: "open" | "verified" | "softened" | "removed";
}

export interface Blueprint {
  bookId: string;
  version: number;
  versions: { version: number; at: IsoDateTime; note: string; cost: number }[];
  approved: boolean;
  title: string;
  subtitle: string;
  summary: string;
  audience: string[];
  usps: string[];
  toneNotes: string[];
  wordTargets: { total: number; chapterRange: [number, number]; frontMatter: number; backMatter: number };
  frontMatter: MatterPart[];
  chapters: ChapterPlan[];
  backMatter: MatterPart[];
  listing: {
    amazonDescription: string;
    categories: string[];
    keywords: string[];
  };
  claims: ClaimToVerify[];
  marginNotes: { id: string; anchor: string; kind: "profile" | "selection" | "claim"; label: string; text: string }[];
  costBreakdown: { label: string; usd: number }[];
  model: string;
  missingForApproval: string[];
}

/* ---------- Research ---------- */

export interface ResearchSource {
  id: string;
  title: string;
  publisher: string;
  /** Domain of the real page (from url_citation annotations, resolved per D-020). */
  domain: string;
  url: string;
  /** True for the built-in demo data. */
  mock: boolean;
  /** True when the real page could not be found, so `url` is still a search redirect. */
  unresolved?: boolean;
  redirectUrl?: string | null;
  summary: string;
  useInBook: boolean;
}

export interface ResearchRun {
  id: string;
  bookId: string;
  at: IsoDateTime;
  model: string;
  costUsd: number;
  status: "done" | "running" | "failed";
  liveStatus: string[];
  audience: string;
  problems: string[];
  angles: { title: string; detail: string }[];
  competingThemes: string[];
  gaps: string[];
  keywordIdeas: string[];
  sources: ResearchSource[];
}

/* ---------- Titles ---------- */

export interface TopicDirection {
  id: string;
  name: string;
  pitch: string;
}

export interface TitleCheck {
  label: string;
  passed: boolean;
}

export interface TitleOption {
  id: string;
  directionId: string;
  title: string;
  subtitle: string;
  checks: TitleCheck[];
  chosen: boolean;
  /** Set when the option breaks a rule; the card is greyed with this reason. */
  invalidReason: string | null;
}

/* ---------- Writing ---------- */

export type SectionStatus = "queued" | "writing" | "checking" | "done" | "attention";

export interface WritingSection {
  id: string;
  number: number | null;
  title: string;
  status: SectionStatus;
  words: number;
  wordTarget: number;
  claims: number;
}

export interface WritingJob {
  id: string;
  bookId: string;
  label: string;
  startedAt: IsoDateTime;
  runningMinutes: number;
  minutesLeft: number;
  model: string;
  fallback: string;
  words: { written: number; target: number };
  cost: { spent: number; budget: number };
  sections: WritingSection[];
  current: {
    sectionId: string;
    chapterNumber: number;
    chapterTitle: string;
    wordsSoFar: number;
    wordTarget: number;
    /** Finished paragraphs of the current chapter, with optional subheadings. */
    blocks: ({ kind: "p"; text: string } | { kind: "h"; text: string })[];
    /** The paragraph being streamed, split into chunks that arrive at most every 250 ms. */
    streamingChunks: string[];
  };
  lastChecks: { chapter: number; items: { label: string; passed: boolean; attention: boolean }[] };
  needsAttention: { sectionId: string; text: string }[];
}

/* ---------- Models ---------- */

export type ModelCapability = "Long text" | "Tools" | "Web search" | "Structured output" | "Images";

export interface ModelInfo {
  slug: string;
  provider: string;
  mark: string;
  label: string;
  contextTokens: number | null;
  /** Example prices for the prototype only. The app reads live prices from OpenRouter with the date. */
  examplePrice: { inputPerMillion: number; outputPerMillion: number } | { perImage: number };
  capabilities: ModelCapability[];
  /** Rough example cost for a 40,000-word book at this stage. */
  exampleBookCostUsd: number | null;
}

export interface StageModelDefault {
  stage: string;
  label: string;
  tier: string;
  defaultModel: string;
  fallbacks: string[];
}

/* ---------- Export ---------- */

export type PreflightResult = "pass" | "warn" | "block";

export interface PreflightItem {
  id: string;
  area: "Manuscript" | "Listing" | "Interior" | "Cover" | "eBook";
  label: string;
  result: PreflightResult;
  detail: string;
  fixLabel: string | null;
  fixRoute: string | null;
  ruleId: string | null;
}

export interface ExportFormat {
  id: string;
  label: string;
  file: string;
  lastBuilt: IsoDateTime | null;
  stale: boolean;
  sizeLabel: string | null;
}

export interface RoyaltyLine {
  format: string;
  listPrice: string;
  printingCost: string | null;
  minimumPrice: string | null;
  royalty: string;
  ruleIds: string[];
}

export interface ExportState {
  bookId: string;
  pageCount: number;
  trim: string;
  paper: "cream" | "white";
  preflight: PreflightItem[];
  formats: ExportFormat[];
  royalties: RoyaltyLine[];
  rulesVersion: string;
}

/* ---------- Marketing ---------- */

export interface TikTokScript {
  id: string;
  hook: string;
  beats: string[];
  onScreenText: string[];
  caption: string;
  hashtags: string[];
  lengthSeconds: number;
}

export interface SocialCaption {
  id: string;
  caption: string;
  hashtags: string[];
  imageIdea: string;
}

export interface LaunchEmail {
  id: string;
  subject: string;
  preview: string;
  body: string[];
}

export interface MarketingPack {
  bookId: string;
  tiktok: TikTokScript[];
  instagram: SocialCaption[];
  email: LaunchEmail[];
}

/* ---------- Workspace ---------- */

export interface WorkspaceStatus {
  openRouter: { connected: boolean; keyPresent: boolean; creditUsd: number | null; checkedAt: IsoDateTime };
  spend: { monthLabel: string; spentUsd: number; budgetUsd: number };
  backups: { lastAt: IsoDateTime; location: string; keep: number };
  houseStyle: { version: number; bannedPhrases: number; spellingPairs: number };
  kdpRules: { version: string; rules: number; recheckDue: string };
}

export interface ArchivedItem {
  id: string;
  kind: "book" | "pen-name" | "marketing";
  title: string;
  detail: string;
  archivedAt: IsoDateTime;
}
