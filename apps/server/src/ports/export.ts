/**
 * ExportPort: everything that turns a book into files. Two adapters implement it:
 * src/adapters/volume-export.ts (the real one, on @volume/export and @volume/core) and
 * src/adapters/mock-export.ts (deterministic placeholders marked MOCK). EXPORT_PROVIDER picks one.
 */

import type { OpenString } from '../lib/util.js';

export interface ExportSection {
  id: string;
  kind: string;
  area: 'front' | 'body' | 'back' | OpenString;
  position: number;
  number: number | null;
  title: string | null;
  /** Volume Markdown dialect. about_author is filled from the profile bio by the server. */
  bodyMd: string;
  wordCount: number;
}

export interface ExportBook {
  authorPhoto?: { mime: string; data: Uint8Array };
  projectId: string;
  title: string;
  subtitle: string | null;
  author: { penName: string; imprintName: string | null; bioThirdPerson: string; shortBio: string | null };
  language: string;
  trim: string;
  paper: string;
  edition: string | null;
  publicationYear: number;
  isbnPaperback: string | null;
  isbnEbook: string | null;
  bookTypeId: string | null;
  interiorThemeId: string | null;
  coverStyleId: string | null;
  aiDisclosure: { text: string; images: string; translation: string };
  /** What the book shows AI made (AI section versions, AI-made cover or spread pictures), whatever aiDisclosure says. */
  aiEvidence?: { text: boolean; images: boolean };
  illustrativeLine: boolean;
  sections: ExportSection[];
  /** sha256 of all enabled section text in order, to spot stale exports. */
  manuscriptHash: string;
  /** Book template id (config/book-templates/<id>.json) for the structure check. */
  templateId?: string | null;
  /** Section kinds the owner switched off on purpose (not a missing section in preflight). */
  sectionsOff?: string[];
  /** Approved blueprint summary (TXT SUMMARY block). */
  summary?: string | null;
  /** Listing from the approved blueprint. */
  listing?: { description: string | null; keywords: string[]; categories: string[]; backBlurb: string | null };
  /** Claims report rows for preflight and the pack. */
  claims?: ExportClaim[];
  /** True when the book type asks for every price to carry the month it was checked (preflight style.dated-prices). */
  datedPrices?: boolean;
  /** Marketing text for the pack's marketing/ folder. */
  marketing?: { tiktokScripts?: string; instagramCaptions?: string; launchEmail?: string };
  /** Covers the owner uploaded ("use my own cover", POST /books/:id/cover/own): checked against the KDP rules, not rebuilt. */
  ownCover?: { ebook: boolean; wrap: boolean };
}

export interface ExportClaim {
  /** Section heading the claim sits in. */
  chapter: string;
  sentence: string;
  category: string;
  check: string;
  status: 'open' | 'verified' | 'removed';
}

export interface ExportOptions {
  signal?: AbortSignal;
}

export interface EpubOptions extends ExportOptions {
  /** The eBook cover JPEG from the cover studio. Becomes the EPUB's cover image. */
  coverJpeg?: Uint8Array;
}

export interface ExportFile {
  filename: string;
  mime: string;
  data: Uint8Array;
  pageCount: number | null;
  /** True when produced by the mock adapter. */
  mock: boolean;
  /** What the file is, so the pack can place it. Adapters set it on the files they build. */
  role?: ExportFileRole;
}

export type ExportFileRole = 'interior_pdf' | 'docx' | 'epub' | 'txt' | 'md' | 'ebook_cover' | 'wrap_pdf' | 'pack';

export interface CoverInput {
  book: ExportBook;
  /** Chosen concept artwork (no text on it); typography is set by the exporter. */
  artwork: { mime: string; data: Uint8Array } | null;
  typography: Record<string, unknown>;
  coverStyleId: string | null;
}

export interface WrapCoverInput extends CoverInput {
  /** Interior page count from the built print PDF; required for the spine width. */
  pageCount: number;
  backBlurb: string;
  /** Colour ink for a colour interior (picture books, D-044): the spine uses the colour rule. Unset: black ink on the book's paper. */
  ink?: 'premium' | 'standard';
}

export type PreflightSeverity = 'pass' | 'warn' | 'block';

export interface PreflightItem {
  id: string;
  area: string;
  severity: PreflightSeverity;
  message: string;
  fix?: PreflightFix;
}

/**
 * Where the owner fixes a preflight item: a screen (route), optionally a place on it (anchor, for example the Cover
 * screen's own-cover panel), or an action the screen can run there (rerun-checks with the section id).
 */
export interface PreflightFix {
  route: string;
  label: string;
  anchor?: string;
  action?: 'rerun-checks';
  sectionId?: string;
}

export interface PreflightReport {
  ok: boolean;
  blocks: number;
  warnings: number;
  items: PreflightItem[];
  rulesVersion: string | null;
  mock: boolean;
}

/** One spread for the picture-book exporter (D-044). */
export interface PictureSpreadInput {
  n: number;
  /** Story text (inline Markdown, paragraphs split by a blank line). */
  text: string;
  layout: 'text-left' | 'text-right' | 'text-top' | 'text-bottom';
  sceneSummary: string;
  /** Key in `images`; null when the spread has no picture yet (preflight blocks). */
  imageKey: string | null;
}

export interface PictureBookInput {
  /** The book as for any export; its front and back sections become the matter pages. Spread sections are ignored here. */
  book: ExportBook;
  spreads: PictureSpreadInput[];
  /** Pictures by imageKey (PNG, JPEG or WebP, ideally 2:1). */
  images: Record<string, Uint8Array>;
  /** Colour ink. Picture books print on premium colour (D-044). */
  ink: 'premium' | 'standard';
  /** Covers from the cover studio, when built, for the pack's cover folder. */
  covers?: ExportFile[];
}

/** What the picture-book export built and found. pack is null while the preflight blocks. */
export interface PictureBookBuild {
  interior: ExportFile;
  preflight: PreflightReport;
  pack: ExportFile | null;
  /** Every PDF page, trim plus bleed, in inches. */
  pageSizeIn: { widthIn: number; heightIn: number };
  /** Text boxes outside the safe area (empty when all are inside). */
  safeAreaFindings: string[];
  /** Spread numbers with no picture on one or both pages. */
  missingImages: number[];
  /** KDP rule ids the layout used. */
  ruleIds: string[];
  warnings: string[];
}

export interface ExportPort {
  readonly name: 'mock' | 'volume-export';
  buildDocx(book: ExportBook, opts?: ExportOptions): Promise<ExportFile>;
  buildPdf(book: ExportBook, opts?: ExportOptions): Promise<ExportFile>;
  buildEpub(book: ExportBook, opts?: EpubOptions): Promise<ExportFile>;
  buildTxt(book: ExportBook, opts?: ExportOptions): Promise<ExportFile>;
  buildMd(book: ExportBook, opts?: ExportOptions): Promise<ExportFile>;
  buildEbookCover(input: CoverInput, opts?: ExportOptions): Promise<ExportFile>;
  buildWrapCover(input: WrapCoverInput, opts?: ExportOptions): Promise<ExportFile>;
  preflight(book: ExportBook, opts?: ExportOptions): Promise<PreflightReport>;
  /**
   * The final preflight on the built files (interior PDF page count, fonts, margins, covers). The export job
   * runs it before the pack and does not build the pack while it blocks. Pass the same array to buildPack.
   */
  finalPreflight?(book: ExportBook, files: ExportFile[], opts?: ExportOptions): Promise<PreflightReport>;
  /**
   * Picture books (D-044): the full-bleed print PDF, the preflight on it and, when nothing blocks, the upload pack.
   * No EPUB or DOCX for picture books.
   */
  buildPictureBook?(input: PictureBookInput, opts?: ExportOptions): Promise<PictureBookBuild>;
  /** Zips the given files into the KDP upload pack. */
  buildPack(book: ExportBook, files: ExportFile[], opts?: ExportOptions): Promise<ExportFile>;
  /** Frees shared resources (the Chromium browser). Called when the app closes. */
  close?(): Promise<void>;
}

export const EXPORT_KINDS = ['pdf_print', 'docx', 'epub', 'txt', 'md'] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];
