import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  contentsEntriesFromTemplate,
  DEFAULT_COVER_STYLE,
  DEFAULT_INTERIOR_THEME,
  kindForSubtype,
  normaliseCoverStyle,
  parseBlocks,
  partLabel,
  pictureBookToBookDoc,
  slugify,
  titlePageLines,
  type BookDoc,
  type BookMeta,
  type CompiledHouseStyle,
  type CoverStyle,
  type InteriorTheme,
  type KdpRules,
  type Paper,
  type PictureBookDoc,
  type Section,
  type SectionSubtype,
} from '@volume/core';
import { loadBookTemplate, loadCoverStyles, loadHouseStyle, loadInteriorThemes, loadKdpRules } from '@volume/core/node';
import {
  acquireBrowser,
  applyCoverTypography,
  buildUploadPack,
  exportDocx,
  exportEbookCover,
  exportEpub,
  exportMarkdown,
  exportPaperbackWrap,
  exportPictureBookPdf,
  exportPrintPdf,
  exportTxt,
  loadFontLibrary,
  releaseBrowser,
  runPreflight,
  type FontLibrary,
  type PackFiles,
  type PreflightInput,
  type PreflightReport as VolumePreflightReport,
} from '@volume/export';
import type {
  CoverInput,
  EpubOptions,
  ExportBook,
  ExportFile,
  ExportFileRole,
  ExportOptions,
  ExportPort,
  ExportSection,
  PictureBookBuild,
  PictureBookInput,
  PreflightItem,
  PreflightReport,
  WrapCoverInput,
} from '../ports/export.js';

/**
 * The real export adapter: implements ExportPort with @volume/export and @volume/core.
 *
 * The server's sections (Volume Markdown per section) become one BookDoc. Code-written pages
 * (title page, copyright, contents) are built here from the book and the template; About the
 * author is the profile bio word for word (buildExportBook supplies it). The interior theme and
 * cover style are looked up by id in config, then the book type's default, then the package
 * default. One Chromium is launched on first use, shared by every PDF and cover build, and
 * released by close() when the app shuts down.
 */

/** Playwright's Browser, named through the package so the server needs no direct playwright dependency. */
type Browser = Awaited<ReturnType<typeof acquireBrowser>>;

const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  txt: 'text/plain; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  jpeg: 'image/jpeg',
  zip: 'application/zip',
} as const;

/** Picture books print on 8.5 x 8.5 in by default (D-044). */
const PICTURE_BOOK_TRIM = '8.5x8.5';

/** Server section kind to the core subtype. Kinds not listed keep their own name. */
const KIND_TO_SUBTYPE: Readonly<Record<string, SectionSubtype>> = {
  half_title: 'halftitle',
  title_page: 'titlepage',
  about_author: 'about_the_author',
};

/** Server section kind to the template section id (config/book-templates, sections[].id). */
const KIND_TO_TEMPLATE_ID: Readonly<Record<string, string>> = {
  half_title: 'half-title',
  title_page: 'title-page',
  about_author: 'about-the-author',
  also_by: 'also-by',
  review_request: 'review-request',
  newsletter: 'newsletter-socials',
  part: 'parts',
  chapter: 'chapters',
};

const SUBTYPES: ReadonlySet<string> = new Set<SectionSubtype>([
  'titlepage',
  'copyright',
  'contents',
  'halftitle',
  'dedication',
  'epigraph',
  'foreword',
  'preface',
  'acknowledgements',
  'introduction',
  'part',
  'chapter',
  'conclusion',
  'epilogue',
  'appendix',
  'resources',
  'glossary',
  'references',
  'about_the_author',
  'also_by',
  'review_request',
  'newsletter',
  'other',
]);

/** Used only when the template has no copyright lines of its own. */
const FALLBACK_COPYRIGHT = ['Copyright © {year} {authorName}. All rights reserved.', '{edition}', '{isbnLine}', '{imprintLine}'];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

function subtypeFor(kind: string): SectionSubtype {
  const mapped = KIND_TO_SUBTYPE[kind];
  if (mapped) return mapped;
  return SUBTYPES.has(kind) ? (kind as SectionSubtype) : 'other';
}

/** Drops a leading `# heading` (the exporter sets the heading) and turns any other H1 into a subheading. */
function bodyLines(md: string): string[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && (lines[i] ?? '').trim() === '') i += 1;
  if ((lines[i] ?? '').startsWith('# ')) lines.splice(0, i + 1);
  return lines.map((l) => (l.startsWith('# ') ? `#${l}` : l));
}

/** The last single-quoted sentence in a template field note, for example the default disclaimer. */
function quotedDefault(note: unknown): string | null {
  if (typeof note !== 'string') return null;
  const all = [...note.matchAll(/'([^']{20,})'/g)];
  return all.length ? (all[all.length - 1]?.[1] ?? null) : null;
}

function templateSection(template: unknown, id: string): Rec | null {
  if (!isRec(template) || !Array.isArray(template['sections'])) return null;
  const sections: unknown[] = template['sections'];
  const found = sections.find((s) => isRec(s) && s['id'] === id);
  return isRec(found) ? found : null;
}

/** Copyright page lines from the template, filled from the book. Lines with nothing to show are left out. */
export function copyrightLines(book: ExportBook, template: unknown): string[] {
  const section = templateSection(template, 'copyright');
  const lines = Array.isArray(section?.['template']) ? section['template'].filter((l): l is string => typeof l === 'string') : FALLBACK_COPYRIGHT;
  const fields = isRec(section?.['fields']) ? section['fields'] : {};
  const isbns = [book.isbnPaperback ? `ISBN (paperback): ${book.isbnPaperback}` : null, book.isbnEbook ? `ISBN (eBook): ${book.isbnEbook}` : null].filter(
    (x): x is string => x !== null,
  );
  const values: Record<string, string> = {
    year: String(book.publicationYear),
    authorName: book.author.penName,
    disclaimer: quotedDefault(fields['disclaimer']) ?? '',
    illustrativeStoriesLine: book.illustrativeLine ? (quotedDefault(fields['illustrativeStoriesLine']) ?? '') : '',
    edition: book.edition ?? '',
    isbnLine: isbns.join('\n\n'),
    imprintLine: book.author.imprintName ? `Published by ${book.author.imprintName}` : '',
  };
  const out: string[] = [];
  for (const line of lines) {
    let unknown = false;
    const filled = line.replace(/\{([a-zA-Z_][\w.]*)\}/g, (_m, name: string) => {
      const v = values[name];
      if (v === undefined) unknown = true;
      return v ?? '';
    });
    if (!unknown && filled.trim()) out.push(...filled.split('\n\n').filter((p) => p.trim()));
  }
  return out;
}

/** Maps the server's book onto the package's BookDoc. */
export function toBookDoc(book: ExportBook, template: unknown): BookDoc {
  const meta: BookMeta = { title: book.title, author: book.author.penName, language: book.language, year: book.publicationYear, identifier: book.projectId };
  if (book.subtitle) meta.subtitle = book.subtitle;
  if (book.edition) meta.edition = book.edition;
  if (book.author.imprintName) meta.imprint = book.author.imprintName;
  if (book.isbnPaperback) meta.isbnPrint = book.isbnPaperback;
  if (book.isbnEbook) meta.isbnEbook = book.isbnEbook;
  if (book.summary) meta.summary = book.summary;
  if (book.listing) {
    const listing: NonNullable<BookMeta['listing']> = { keywords: book.listing.keywords, categories: book.listing.categories };
    if (book.listing.description) listing.description = descriptionHtml(book.listing.description);
    meta.listing = listing;
  }

  const sections: Section[] = [];
  const used = new Set<string>();
  let seenChapter = false;
  const ordered = [...book.sections].sort((a, b) => a.position - b.position);
  for (const s of ordered) {
    const subtype = subtypeFor(s.kind);
    if (subtype === 'chapter') seenChapter = true;
    const section = toSection(s, subtype, kindForSubtype(subtype, seenChapter), meta, book, template);
    let id = section.id;
    for (let n = 2; used.has(id); n += 1) id = `${section.id}-${n}`;
    used.add(id);
    sections.push({ ...section, id });
  }
  return { meta, sections };
}

function toSection(s: ExportSection, subtype: SectionSubtype, kind: Section['kind'], meta: BookMeta, book: ExportBook, template: unknown): Section {
  const title = s.title ?? s.kind;
  const base = { id: slugify(title) || s.kind, kind, subtype, title };
  switch (subtype) {
    case 'titlepage':
      return { ...base, id: 'title-page', title: 'Title Page', lines: titlePageLines(meta).filter((l) => l.trim()), blocks: [] };
    case 'halftitle':
      return { ...base, id: 'half-title', title: meta.title, lines: [meta.title], blocks: [] };
    case 'contents':
      return { ...base, id: 'contents', title: 'Contents', blocks: [] };
    case 'copyright': {
      // The owner's own copyright text wins when they wrote one.
      const own = s.bodyMd.trim();
      const blocks = own ? parseBlocks(bodyLines(own)) : copyrightLines(book, template).map((text) => ({ type: 'paragraph' as const, text }));
      return { ...base, id: 'copyright', title: 'Copyright', blocks };
    }
    case 'part': {
      const kicker = s.number !== null ? partLabel(s.number) : 'Part';
      return {
        ...base,
        id: slugify(`${kicker} ${title}`),
        kicker,
        ...(s.number !== null ? { number: s.number } : {}),
        blocks: parseBlocks(bodyLines(s.bodyMd)),
      };
    }
    case 'chapter': {
      const n = s.number ?? 0;
      return { ...base, id: slugify(`chapter ${n} ${title}`), kicker: `Chapter ${n}`, number: n, blocks: parseBlocks(bodyLines(s.bodyMd)) };
    }
    case 'about_the_author':
      return { ...base, title: 'About the Author', id: 'about-the-author', blocks: parseBlocks(bodyLines(s.bodyMd)) };
    default:
      return { ...base, blocks: parseBlocks(bodyLines(s.bodyMd)) };
  }
}

/** The listing description is plain text in the blueprint; KDP takes simple HTML. */
function descriptionHtml(text: string): string {
  if (/<\/?(p|b|i|em|strong|ul|ol|li|br|h[1-6])\b/i.test(text)) return text;
  const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join('');
}

function aiFlags(book: ExportBook): NonNullable<PreflightInput['aiDisclosure']> {
  const d = book.aiDisclosure;
  const values = [d.text, d.images, d.translation];
  return {
    aiWroteText: d.text !== 'none',
    aiMadeImages: d.images !== 'none',
    disclosed: values.includes('ai_generated') ? 'ai-generated' : values.includes('ai_assisted') ? 'ai-assisted' : 'none',
  };
}

const FIX_ROUTES: Readonly<Record<string, { route: string; label: string }>> = {
  structure: { route: 'writing', label: 'Open the manuscript' },
  style: { route: 'writing', label: 'Open the manuscript' },
  front: { route: 'writing', label: 'Open the manuscript' },
  honesty: { route: 'profile', label: 'Check the profile bio' },
  claims: { route: 'editor', label: 'Review claims' },
  kdp: { route: 'export', label: 'Set the AI disclosure' },
  listing: { route: 'blueprint', label: 'Edit the listing' },
  interior: { route: 'export', label: 'Rebuild the interior' },
  cover: { route: 'cover', label: 'Open the cover studio' },
};

function toServerReport(r: VolumePreflightReport, rulesVersion: string): PreflightReport {
  const items: PreflightItem[] = r.items.map((i) => {
    const area = i.id.split('.')[0] ?? 'other';
    const severity = i.level === 'fail' ? 'block' : i.level;
    const item: PreflightItem = { id: i.id, area, severity, message: `${i.label}: ${i.detail}` };
    const fix = FIX_ROUTES[area];
    if (severity !== 'pass' && fix) item.fix = fix;
    return item;
  });
  return { ok: r.ok, blocks: r.counts.fail, warnings: r.counts.warn, items, rulesVersion, mock: false };
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError');
}

const bytes = (b: Buffer): Uint8Array => new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
const buf = (u: Uint8Array): Buffer => Buffer.from(u.buffer, u.byteOffset, u.byteLength);

export interface VolumeExportOptions {
  /** Repo root: config/ is read from here. */
  root: string;
  /** Tests: a fixed date for reproducible files and the pack name. */
  now?: () => Date;
}

interface Config {
  rules: KdpRules;
  houseStyle: CompiledHouseStyle;
  themes: InteriorTheme[];
  coverStyles: CoverStyle[];
  /** config/cover-styles.json styles as written (palettes by id), for the owner's chosen palette. */
  rawCoverStyles: Rec[];
  bookTypes: Rec[];
  fonts: FontLibrary;
}

export class VolumeExportAdapter implements ExportPort {
  readonly name = 'volume-export' as const;
  private cfg: Config | null = null;
  private browser: Promise<Browser> | null = null;
  /** Inside margin of the last interior PDF per manuscript hash, for the pack's margin check. */
  private readonly margins = new Map<string, number>();
  private readonly now: () => Date;

  constructor(private readonly opts: VolumeExportOptions) {
    this.now = opts.now ?? (() => new Date());
  }

  // ----- config and the shared browser -----

  private config(): Config {
    if (this.cfg) return this.cfg;
    const root = this.opts.root;
    let bookTypes: Rec[] = [];
    try {
      const raw: unknown = JSON.parse(readFileSync(join(root, 'config', 'book-types.json'), 'utf8'));
      if (isRec(raw) && Array.isArray(raw['types'])) bookTypes = raw['types'].filter(isRec);
    } catch {
      bookTypes = [];
    }
    let rawCoverStyles: Rec[] = [];
    try {
      const raw: unknown = JSON.parse(readFileSync(join(root, 'config', 'cover-styles.json'), 'utf8'));
      if (isRec(raw) && Array.isArray(raw['styles'])) rawCoverStyles = raw['styles'].filter(isRec);
    } catch {
      rawCoverStyles = [];
    }
    this.cfg = {
      rules: loadKdpRules(root),
      houseStyle: loadHouseStyle(root),
      themes: loadInteriorThemes(root),
      coverStyles: loadCoverStyles(root),
      rawCoverStyles,
      bookTypes,
      fonts: loadFontLibrary(root),
    };
    return this.cfg;
  }

  private bookTypeDefault(book: ExportBook, field: 'defaultInteriorTheme' | 'defaultCoverStyle'): string | null {
    const t = this.config().bookTypes.find((x) => x['id'] === book.bookTypeId);
    const v = t?.[field];
    return typeof v === 'string' ? v : null;
  }

  /** The book's interior theme by id, then its book type's default, then the package default. */
  theme(book: ExportBook): InteriorTheme {
    const { themes } = this.config();
    for (const id of [book.interiorThemeId, this.bookTypeDefault(book, 'defaultInteriorTheme')]) {
      const found = id ? themes.find((t) => t.id === id) : undefined;
      if (found) return found;
    }
    return DEFAULT_INTERIOR_THEME;
  }

  coverStyle(book: ExportBook, id: string | null): CoverStyle {
    const { coverStyles } = this.config();
    for (const candidate of [id, book.coverStyleId, this.bookTypeDefault(book, 'defaultCoverStyle')]) {
      const found = candidate ? coverStyles.find((s) => s.id === candidate) : undefined;
      if (found) return found;
    }
    return DEFAULT_COVER_STYLE;
  }

  /**
   * The cover style for a build: the owner's typography (POST /cover/choose) on top of the style. Its styleId picks
   * the style (else the cover input's, the book's, the book type's), paletteId picks one of the style's palettes,
   * and title position, palette, sizes, fonts and case are applied by applyCoverTypography.
   */
  styleForCover(book: ExportBook, coverStyleId: string | null, typography: Record<string, unknown>): CoverStyle {
    const styleId = typeof typography['styleId'] === 'string' && typography['styleId'] ? typography['styleId'] : coverStyleId;
    let style = this.coverStyle(book, styleId);
    const paletteId = typeof typography['paletteId'] === 'string' ? typography['paletteId'] : null;
    if (paletteId) {
      const raw = this.config().rawCoverStyles.find((r) => r['id'] === style.id);
      const palettes = raw?.['palettes'];
      if (raw && Array.isArray(palettes) && palettes.some((p) => isRec(p) && p['id'] === paletteId))
        style = normaliseCoverStyle(raw, DEFAULT_COVER_STYLE, paletteId);
    }
    return applyCoverTypography(style, typography);
  }

  /** Book meta for a cover: the subtitle is left off when the owner switched it off. */
  private coverMeta(input: CoverInput): BookMeta {
    const meta = this.doc(input.book).meta;
    if (input.typography['showSubtitle'] === false) delete meta.subtitle;
    return meta;
  }

  private template(book: ExportBook): unknown {
    const id = book.templateId ?? 'nonfiction';
    try {
      return loadBookTemplate(id, this.opts.root);
    } catch {
      return undefined;
    }
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser) {
      const b = await this.browser.catch(() => null);
      if (b?.isConnected()) return b;
      this.browser = null;
      if (b) await releaseBrowser();
    }
    const pending = acquireBrowser();
    this.browser = pending;
    try {
      return await pending;
    } catch (e) {
      this.browser = null;
      throw e;
    }
  }

  /** Releases the shared Chromium. Safe to call more than once. */
  async close(): Promise<void> {
    const pending = this.browser;
    this.browser = null;
    if (!pending) return;
    const b = await pending.catch(() => null);
    if (b) await releaseBrowser();
  }

  private doc(book: ExportBook, includePhoto = true): BookDoc {
    const template = this.template(book);
    const doc = toBookDoc(book, template);
    // What the printed contents lists comes from the template's contents rule (fiction: chapters and parts only).
    doc.meta.contentsEntries = contentsEntriesFromTemplate(template);
    const about = doc.sections.find((section) => section.subtype === 'about_the_author');
    if (about && includePhoto && book.authorPhoto)
      about.blocks.unshift({
        type: 'image',
        src: `data:${book.authorPhoto.mime};base64,${Buffer.from(book.authorPhoto.data).toString('base64')}`,
        alt: `${book.author.penName} portrait`,
      });
    return doc;
  }

  private file(book: ExportBook, role: ExportFileRole, ext: string, mime: string, data: Buffer, pageCount: number | null = null): ExportFile {
    const slug = slugify(book.title) || 'book';
    const names: Record<ExportFileRole, string> = {
      interior_pdf: `${slug}-interior-${book.trim}`,
      docx: slug,
      epub: slug,
      txt: slug,
      md: slug,
      ebook_cover: `${slug}-ebook-cover`,
      wrap_pdf: `${slug}-paperback-wrap-${book.trim}-${book.paper}`,
      pack: `${slug}-kdp-pack`,
    };
    return { filename: `${names[role]}.${ext}`, mime, data: bytes(data), pageCount, mock: false, role };
  }

  // ----- formats -----

  buildTxt(book: ExportBook, opts: ExportOptions = {}): Promise<ExportFile> {
    throwIfAborted(opts.signal);
    return Promise.resolve(this.file(book, 'txt', 'txt', MIME.txt, exportTxt(this.doc(book, false))));
  }

  buildMd(book: ExportBook, opts: ExportOptions = {}): Promise<ExportFile> {
    throwIfAborted(opts.signal);
    return Promise.resolve(this.file(book, 'md', 'md', MIME.md, exportMarkdown(this.doc(book, false))));
  }

  async buildDocx(book: ExportBook, opts: ExportOptions = {}): Promise<ExportFile> {
    throwIfAborted(opts.signal);
    const data = await exportDocx(this.doc(book), this.theme(book), { trim: book.trim, fonts: this.config().fonts });
    return this.file(book, 'docx', 'docx', MIME.docx, data);
  }

  async buildEpub(book: ExportBook, opts: EpubOptions = {}): Promise<ExportFile> {
    throwIfAborted(opts.signal);
    const o: Parameters<typeof exportEpub>[2] = { fonts: this.config().fonts, modified: this.now() };
    if (opts.coverJpeg) o.coverJpeg = buf(opts.coverJpeg);
    const data = await exportEpub(this.doc(book), this.theme(book), o);
    return this.file(book, 'epub', 'epub', MIME.epub, data);
  }

  async buildPdf(book: ExportBook, opts: ExportOptions = {}): Promise<ExportFile> {
    throwIfAborted(opts.signal);
    const { rules, fonts } = this.config();
    const browser = await this.getBrowser();
    throwIfAborted(opts.signal);
    const r = await exportPrintPdf(this.doc(book), this.theme(book), { trim: book.trim, browser, rules, fonts, creationDate: this.now() });
    this.margins.set(book.manuscriptHash, r.insideMarginIn);
    return this.file(book, 'interior_pdf', 'pdf', MIME.pdf, r.buffer, r.pageCount);
  }

  async buildEbookCover(input: CoverInput, opts: ExportOptions = {}): Promise<ExportFile> {
    throwIfAborted(opts.signal);
    const { rules, fonts } = this.config();
    const browser = await this.getBrowser();
    const o: Parameters<typeof exportEbookCover>[2] = { browser, rules, fonts };
    if (input.artwork) o.background = buf(input.artwork.data);
    const r = await exportEbookCover(this.coverMeta(input), this.styleForCover(input.book, input.coverStyleId, input.typography), o);
    return this.file(input.book, 'ebook_cover', 'jpg', MIME.jpeg, r.jpeg);
  }

  async buildWrapCover(input: WrapCoverInput, opts: ExportOptions = {}): Promise<ExportFile> {
    throwIfAborted(opts.signal);
    const { rules, fonts } = this.config();
    const browser = await this.getBrowser();
    const o: Parameters<typeof exportPaperbackWrap>[2] = { rules, pages: input.pageCount, paper: paperOf(input.book), trim: input.book.trim, browser, fonts };
    if (input.backBlurb) o.blurb = input.backBlurb;
    if (input.ink) o.ink = input.ink;
    if (input.book.author.shortBio) o.shortBio = input.book.author.shortBio;
    if (input.artwork) o.background = buf(input.artwork.data);
    const r = await exportPaperbackWrap(this.coverMeta(input), this.styleForCover(input.book, input.coverStyleId, input.typography), o);
    const f = this.file(input.book, 'wrap_pdf', 'pdf', MIME.pdf, r.pdf, 1);
    return { ...f, filename: f.filename.replace(/\.pdf$/, `-${input.pageCount}p.pdf`) };
  }

  // ----- picture books (D-044) -----

  /**
   * The picture book as the package's PictureBookDoc: the book's front and back sections become the matter pages (in
   * their order, built exactly as for any export), and the spreads come from the input. Spread sections in the book
   * are left out of the matter.
   */
  pictureDoc(input: PictureBookInput): PictureBookDoc {
    const matter = [...input.book.sections].filter((s) => s.kind !== 'spread').sort((a, b) => a.position - b.position);
    const doc = this.doc({ ...input.book, sections: matter });
    const front: Section[] = [];
    const back: Section[] = [];
    doc.sections.forEach((section, i) => {
      if (matter[i]?.area === 'back') back.push(section.kind === 'front' ? { ...section, kind: 'back' } : section);
      else front.push(section);
    });
    return {
      meta: doc.meta,
      front,
      back,
      spreads: [...input.spreads]
        .sort((a, b) => a.n - b.n)
        .map((sp) => ({ n: sp.n, text: sp.text, imageKey: sp.imageKey, layout: sp.layout, sceneSummary: sp.sceneSummary })),
    };
  }

  /** Full-bleed print PDF, preflight on it, and the pack when nothing blocks. Print only: no EPUB or DOCX (D-044). */
  async buildPictureBook(input: PictureBookInput, opts: ExportOptions = {}): Promise<PictureBookBuild> {
    throwIfAborted(opts.signal);
    const { rules, fonts } = this.config();
    const book = { ...input.book, trim: PICTURE_BOOK_TRIM };
    const doc = this.pictureDoc({ ...input, book });
    const images: Record<string, Buffer> = {};
    for (const [k, v] of Object.entries(input.images)) images[k] = buf(v);
    const browser = await this.getBrowser();
    throwIfAborted(opts.signal);
    const r = await exportPictureBookPdf(doc, rules, { images, trim: PICTURE_BOOK_TRIM, browser, fonts, creationDate: this.now() });
    const interior = this.file(book, 'interior_pdf', 'pdf', MIME.pdf, r.buffer, r.pageCount);
    throwIfAborted(opts.signal);

    const covers = input.covers ?? [];
    const { pack: coverFiles } = packFilesOf(covers);
    const pre: PreflightInput = {
      ...this.preflightInput(book, { ...coverFiles, interiorPdf: r.buffer }, true),
      book: pictureBookToBookDoc(doc),
      trim: PICTURE_BOOK_TRIM,
      pictureBook: { doc, ink: input.ink, layout: r.layout },
    };
    const report = await runPreflight(pre);
    const preflight = toServerReport(report, rules.version);
    let pack: ExportFile | null = null;
    if (report.ok) {
      const ai = aiFlags(book);
      const packInput: Parameters<typeof buildUploadPack>[0] = {
        book: pictureBookToBookDoc(doc),
        files: { ...coverFiles, interiorPdf: r.buffer },
        trim: PICTURE_BOOK_TRIM,
        paper: paperOf(book),
        pages: r.pageCount,
        rules,
        ruleIds: r.ruleIds,
        preflight: report,
        claims: book.claims ?? [],
        ai: { aiWroteText: ai.aiWroteText, aiMadeImages: ai.aiMadeImages },
        pictureBook: true,
        date: this.now(),
      };
      if (book.edition) packInput.metadata = { edition: book.edition };
      if (book.marketing) packInput.marketing = book.marketing;
      const { fileName, zip } = await buildUploadPack(packInput);
      pack = { filename: fileName, mime: MIME.zip, data: bytes(zip), pageCount: null, mock: false, role: 'pack' };
    }
    return {
      interior,
      preflight,
      pack,
      pageSizeIn: { widthIn: r.geometry.page.widthIn, heightIn: r.geometry.page.heightIn },
      safeAreaFindings: r.safeArea.map((f) => f.message),
      missingImages: r.layout.missingImages,
      ruleIds: r.ruleIds,
      warnings: r.warnings,
    };
  }

  // ----- preflight and pack -----

  private preflightInput(book: ExportBook, files: PackFiles = {}, pack = false): PreflightInput {
    const { rules, houseStyle } = this.config();
    const doc = this.doc(book);
    const input: PreflightInput = {
      book: doc,
      // ISBNs the owner entered may appear on the copyright page; the package allow-lists them (any other ISBN
      // still blocks). The listing check validates each one's checksum.
      isbns: [book.isbnPaperback, book.isbnEbook].filter((x): x is string => !!x),
      rules,
      houseStyle,
      trim: book.trim,
      paper: paperOf(book),
      listing: listingOf(book),
      profileBio: book.author.bioThirdPerson,
      aiDisclosure: aiFlags(book),
      copyrightYear: book.publicationYear,
      sectionsOff: (book.sectionsOff ?? []).map((k) => KIND_TO_TEMPLATE_ID[k] ?? k),
      manuscriptHash: book.manuscriptHash,
      now: this.now(),
    };
    if (pack) input.pack = true;
    if (book.datedPrices) input.datedPrices = true;
    const template = this.template(book);
    if (template !== undefined) input.template = template;
    if (book.claims) input.claims = book.claims;
    if (files.interiorPdf) {
      input.interiorPdf = files.interiorPdf;
      const margin = this.margins.get(book.manuscriptHash);
      if (margin !== undefined) input.insideMarginIn = margin;
    }
    if (files.wrapPdf) input.wrapPdf = files.wrapPdf;
    if (files.ebookCover) input.ebookCover = files.ebookCover;
    return input;
  }

  async preflight(book: ExportBook, opts: ExportOptions = {}): Promise<PreflightReport> {
    throwIfAborted(opts.signal);
    const report = await runPreflight(this.preflightInput(book));
    return toServerReport(report, this.config().rules.version);
  }

  /** Final preflight per files array, so buildPack reuses the report finalPreflight made for the same files. */
  private readonly finals = new WeakMap<ExportFile[], VolumePreflightReport>();

  /** The preflight on the built files (page count from the real interior PDF, fonts, margins, covers). */
  async finalPreflight(book: ExportBook, files: ExportFile[], opts: ExportOptions = {}): Promise<PreflightReport> {
    throwIfAborted(opts.signal);
    const { pack } = packFilesOf(files);
    const report = await runPreflight(this.preflightInput(book, pack, true));
    this.finals.set(files, report);
    return toServerReport(report, this.config().rules.version);
  }

  /** Runs the full preflight on the built files (or reuses finalPreflight's) and zips the KDP upload pack. */
  async buildPack(book: ExportBook, files: ExportFile[], opts: ExportOptions = {}): Promise<ExportFile> {
    throwIfAborted(opts.signal);
    const { pack, pages } = packFilesOf(files);
    const preflight = this.finals.get(files) ?? (await runPreflight(this.preflightInput(book, pack, true)));
    throwIfAborted(opts.signal);
    const ai = aiFlags(book);
    const input: Parameters<typeof buildUploadPack>[0] = {
      book: this.doc(book),
      files: pack,
      trim: book.trim,
      paper: paperOf(book),
      rules: this.config().rules,
      preflight,
      claims: book.claims ?? [],
      ai: { aiWroteText: ai.aiWroteText, aiMadeImages: ai.aiMadeImages },
      date: this.now(),
    };
    if (pages !== undefined) input.pages = pages;
    if (book.edition) input.metadata = { edition: book.edition };
    if (book.marketing) input.marketing = book.marketing;
    const { fileName, zip } = await buildUploadPack(input);
    return { filename: fileName, mime: MIME.zip, data: bytes(zip), pageCount: null, mock: false, role: 'pack' };
  }
}

/** Sorts built files into the package's PackFiles by role (or name), with the interior page count. */
function packFilesOf(files: ExportFile[]): { pack: PackFiles; pages: number | undefined } {
  const pack: PackFiles = {};
  let pages: number | undefined;
  for (const f of files) {
    const role = f.role ?? roleFromName(f);
    const data = buf(f.data);
    if (role === 'interior_pdf') {
      pack.interiorPdf = data;
      if (f.pageCount !== null) pages = f.pageCount;
    } else if (role === 'docx') pack.docx = data;
    else if (role === 'epub') pack.epub = data;
    else if (role === 'txt') pack.txt = data;
    else if (role === 'md') pack.md = data;
    else if (role === 'ebook_cover' && f.mime === MIME.jpeg) pack.ebookCover = data;
    else if (role === 'wrap_pdf' && f.mime === MIME.pdf) pack.wrapPdf = data;
  }
  return { pack, pages };
}

function paperOf(book: ExportBook): Paper {
  return book.paper === 'cream' ? 'cream' : 'white';
}

function listingOf(book: ExportBook): PreflightInput['listing'] {
  const l: PreflightInput['listing'] = { title: book.title };
  if (book.subtitle) l.subtitle = book.subtitle;
  if (book.listing?.description) l.description = descriptionHtml(book.listing.description);
  if (book.listing) {
    l.keywords = book.listing.keywords;
    l.categories = book.listing.categories;
  }
  if (book.isbnPaperback) l.isbnPrint = book.isbnPaperback;
  if (book.isbnEbook) l.isbnEbook = book.isbnEbook;
  return l;
}

/** Files from another adapter (or older records) carry no role: fall back to the name and type. */
function roleFromName(f: ExportFile): ExportFileRole | null {
  const n = f.filename.toLowerCase();
  if (n.endsWith('.docx')) return 'docx';
  if (n.endsWith('.epub')) return 'epub';
  if (n.endsWith('.txt')) return 'txt';
  if (n.endsWith('.md')) return 'md';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'ebook_cover';
  if (n.endsWith('.pdf')) return n.includes('wrap') ? 'wrap_pdf' : 'interior_pdf';
  return null;
}
