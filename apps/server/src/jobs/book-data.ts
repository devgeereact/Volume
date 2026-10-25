import { exportTemplate, toBookDoc } from '../adapters/volume-export.js';
import type { BlobStore } from '../files/blob-store.js';
import { dirname } from 'node:path';
import { generatedPage, isGeneratedSubtype, FENCED_SUBTYPES, type ContentsLine } from '@volume/export';
import { checkText, claimNeedsCheck, fieldDriftMessage, findHealthTerms, type CompiledHouseStyle } from '@volume/core';
import { loadHouseStyle } from '@volume/core/node';
import type { RequestCtx } from '../auth/context.js';
import { sha256Hex } from '../lib/util.js';
import { CODE_KINDS, fieldDriftAppliesTo, hasDatedPrices, loadBookStructure, promptTemplate, sectionKindFor } from '../config/book-structure.js';
import type { ExportBook, ExportClaim, ExportSection, PreflightReport } from '../ports/export.js';
import type { Book } from '../repos/books.js';
import type { Cover } from '../repos/production.js';
import type { Repos } from '../repos/index.js';
import type { WritingState } from '../repos/manuscript.js';

/** Sections whose text comes from code, never from the writer (docs/04, stage 7). */
export const CODE_WRITTEN_KINDS: ReadonlySet<string> = CODE_KINDS;

/** A section the AI or the owner writes: not a code-made page, not a part divider, not planned as code-written. */
export function writtenByPerson(s: Pick<WritingState, 'kind' | 'plan'>): boolean {
  return !CODE_WRITTEN_KINDS.has(s.kind) && s.kind !== 'part' && s.plan['writer'] !== 'code';
}

/**
 * Writing is complete (D-048, D-049): the book has at least one switched-on section the AI or the owner writes, and
 * every such section has a current version. One predicate for every template (nonfiction, fiction, workbook,
 * picture book spreads); it advances the stage to editor and opens marketing.
 */
export function isWritingComplete(sections: readonly WritingState[]): boolean {
  const mine = sections.filter((s) => s.enabled && writtenByPerson(s));
  return mine.length > 0 && mine.every(hasRealText);
}

/** A current version with words in it that is not the app's placeholder for the owner to fill. */
function hasRealText(s: WritingState): boolean {
  return s.currentVersionId !== null && s.wordCount > 0 && s.currentSource !== OWNER_PLACEHOLDER_SOURCE;
}

/** isWritingComplete for one book, read from the database. */
export async function bookWritingComplete(repos: Repos, ctx: RequestCtx, projectId: string): Promise<boolean> {
  return isWritingComplete((await repos.manuscript.writingStateFor(ctx, [projectId])).get(projectId) ?? []);
}

/** After a section save: moves the book to editor (forward only) once writing is complete. Returns whether it is. */
export async function advanceIfWritingComplete(repos: Repos, ctx: RequestCtx, projectId: string): Promise<boolean> {
  const done = await bookWritingComplete(repos, ctx, projectId);
  if (done) await repos.books.advanceStage(ctx, projectId, 'editor');
  return done;
}

/** Marketing counts when the template says nothing (AC12.1, AC12.2). */
export const DEFAULT_MARKETING_COUNT = 5;
export interface MarketingCounts {
  tiktok: number;
  instagram: number;
}

/**
 * TikTok scripts and Instagram posts to write, from the template's packages.marketing defaults (items
 * tiktok-scripts and instagram-captions, default.count). Anything missing or not a whole number from 1 to 20 is 5.
 */
export function marketingCountsOf(template: Record<string, unknown> | null): MarketingCounts {
  const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
  const packages = template && isRec(template['packages']) ? template['packages'] : {};
  const items = Array.isArray(packages['marketing']) ? packages['marketing'].filter(isRec) : [];
  const count = (id: string): number => {
    const d = items.find((i) => i['id'] === id)?.['default'];
    const n = isRec(d) ? d['count'] : undefined;
    return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 20 ? n : DEFAULT_MARKETING_COUNT;
  };
  return { tiktok: count('tiktok-scripts'), instagram: count('instagram-captions') };
}

/** The book's marketing counts from its template (book type first, then the template column). */
/** Counts per config folder, book type and template: template files do not change while the server runs. */
const marketingCountsCache = new Map<string, Promise<MarketingCounts>>();

export async function bookMarketingCounts(configDir: string, book: Pick<Book, 'bookTypeId' | 'template'>): Promise<MarketingCounts> {
  const key = `${configDir}\u0000${book.bookTypeId ?? ''}\u0000${book.template}`;
  let hit = marketingCountsCache.get(key);
  if (!hit) {
    hit = loadBookStructure(configDir, book.bookTypeId, book.template).then((st) => marketingCountsOf(st.template));
    // A failed read is not kept, so the next request tries again.
    hit.catch(() => marketingCountsCache.delete(key));
    marketingCountsCache.set(key, hit);
  }
  return hit;
}

/**
 * Puts each part divider directly before its own chapters. Approving a blueprint stores every part first and the
 * chapters after them (the tree groups them by partId, the flat position order does not), so an export that walked the
 * positions printed "Part I" and "Part II" back to back, before Chapter 1. Sections keep their position order; a part
 * is followed by the chapters whose partId is that part; chapters with no part stay where they are. Pure.
 */
export function orderPartsWithChapters<T extends { id: string; kind: string; area: string; partId: string | null }>(sections: readonly T[]): T[] {
  const partIds = new Set(sections.filter((s) => s.kind === 'part').map((s) => s.id));
  if (partIds.size === 0) return [...sections];
  const children = new Map<string, T[]>();
  for (const s of sections) {
    if (s.kind !== 'part' && s.partId && partIds.has(s.partId)) children.set(s.partId, [...(children.get(s.partId) ?? []), s]);
  }
  const out: T[] = [];
  for (const s of sections) {
    if (s.kind !== 'part' && s.partId && partIds.has(s.partId)) continue;
    out.push(s);
    if (s.kind === 'part') out.push(...(children.get(s.id) ?? []));
  }
  return out;
}

/** Gathers everything the exporter needs. About the author is the profile bio, verbatim. */
/** The blueprint's listing fields, as the owner edits them in the blueprint (PATCH /books/:id/blueprint). */
export const LISTING_FIELDS = ['description_draft', 'keywords', 'categories', 'back_blurb'] as const;
export type ListingField = (typeof LISTING_FIELDS)[number];

/**
 * The listing fields the owner wrote or changed by hand in this blueprint's history: a `human` version whose value
 * differs from its parent's (or a `human` version with no parent that has a value). The owner's text always wins over
 * the matter stage's, which never overwrites it (review of the listing job, 19 October 2026).
 */
export async function ownerListingFields(
  repos: Repos,
  ctx: RequestCtx,
  blueprint: { source: string; data: Record<string, unknown>; parentVersionId: string | null } | null,
): Promise<Set<ListingField>> {
  const out = new Set<ListingField>();
  const filled = (v: unknown): boolean => (typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) && v.length > 0);
  let cur = blueprint;
  for (let guard = 0; cur && guard < 500; guard += 1) {
    const parent = cur.parentVersionId ? await repos.planning.blueprintById(ctx, cur.parentVersionId).catch(() => null) : null;
    if (cur.source === 'human') {
      for (const f of LISTING_FIELDS) {
        const mine = cur.data[f];
        if (parent ? JSON.stringify(mine ?? null) !== JSON.stringify(parent.data[f] ?? null) : filled(mine)) out.add(f);
      }
    }
    cur = parent;
  }
  return out;
}

export async function buildExportBook(
  repos: Repos,
  ctx: RequestCtx,
  projectId: string,
  configDir: string,
  blobs?: BlobStore,
  opts: { lean?: boolean } = {},
): Promise<ExportBook> {
  const book = await repos.books.require(ctx, projectId);
  const profile = await repos.profiles.require(ctx, book.profileId);
  let authorPhoto: ExportBook['authorPhoto'];
  const photoId = profile.brand['photoAssetId'];
  if (blobs && typeof photoId === 'string') {
    const photo = await blobs.read(ctx, photoId);
    if (photo.meta.profileId !== profile.id || !['image/jpeg', 'image/png'].includes(photo.meta.mime))
      throw new Error('The author photo does not belong to this profile or has an unsupported format.');
    authorPhoto = { mime: photo.meta.mime, data: photo.data };
  }
  const allSections = await repos.manuscript.listSections(ctx, projectId);
  const sections = orderPartsWithChapters(allSections.filter((s) => s.enabled));
  // The exporters sort by position, so the reordered sections take the same positions in the new order (a book with no
  // parts keeps every position exactly as stored, and so its fingerprint).
  const slots = sections.map((s) => s.position).sort((a, b) => a - b);
  const structure = await loadBookStructure(configDir, book.bookTypeId, book.template);
  const alsoBy = await alsoByTitles(repos, ctx, book);
  const out: ExportSection[] = [];
  /** Switched-on pages left out of the book on purpose, so the book does not print a blank page for them. */
  const leftOut = new Set<string>();
  for (const [at, s] of sections.entries()) {
    let bodyMd = '';
    if (s.kind === 'about_author') bodyMd = `# About the author\n\n${profile.bioThirdPerson}`;
    else if (s.kind === 'also_by') bodyMd = alsoByMarkdown(alsoBy);
    else if (s.currentVersionId) bodyMd = (await repos.manuscript.getVersion(ctx, s.currentVersionId))?.bodyMd ?? '';
    // Also by lists the pen name's published books (none: left out). Any other front or back page the writer or the owner
    // writes and that holds no text is left out too, never printed as a heading above a blank page.
    if (isBlankMatter(s.kind, s.area, bodyMd)) {
      leftOut.add(s.kind);
      continue;
    }
    out.push({
      id: s.id,
      kind: s.kind,
      area: s.area,
      position: slots[at] ?? s.position,
      number: s.number,
      title: s.title,
      bodyMd,
      wordCount: s.kind === 'about_author' ? profile.bioThirdPerson.split(/\s+/).filter(Boolean).length : s.kind === 'also_by' ? wordsIn(bodyMd) : s.wordCount,
    });
  }
  // Lean: only what the pages the app builds need (the Editor's previews). Listing, claims, marketing and covers are left out.
  const lean = opts.lean === true;
  const blueprint = lean
    ? null
    : book.approvedBlueprintId
      ? await repos.planning.blueprintById(ctx, book.approvedBlueprintId)
      : await repos.planning.latestBlueprint(ctx, projectId);
  const bp = blueprint?.data ?? {};
  const listing = lean ? null : await repos.production.getListing(ctx, projectId);
  const owner = lean ? new Set<string>() : await ownerListingFields(repos, ctx, blueprint);
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []);
  const titleOf = new Map(
    allSections.map((s) => [s.id, s.kind === 'chapter' && s.number !== null ? `Chapter ${s.number}: ${s.title ?? ''}` : (s.title ?? s.kind)]),
  );
  const claims: ExportClaim[] = (lean ? [] : await repos.manuscript.listClaims(ctx, { projectId })).map((c) => ({
    chapter: (c.sectionId ? titleOf.get(c.sectionId) : null) ?? '',
    sentence: c.sentence,
    category: c.category,
    check: c.checkNeeded ?? '',
    status: c.status === 'verified' || c.status === 'softened' || c.status === 'author_experience' || c.status === 'removed' ? c.status : 'open',
    needsCheck: claimNeedsCheck(c),
  }));
  return {
    ...(authorPhoto ? { authorPhoto } : {}),
    projectId,
    title: book.title ?? book.idea ?? 'Untitled',
    subtitle: book.subtitle,
    author: { penName: profile.penName, imprintName: profile.imprintName, bioThirdPerson: profile.bioThirdPerson, shortBio: profile.shortBio },
    language: profile.language,
    trim: book.trim,
    paper: book.paper,
    edition: book.edition,
    publicationYear: book.publicationYear ?? new Date().getFullYear(),
    isbnPaperback: book.isbnPaperback,
    isbnEbook: book.isbnEbook,
    bookTypeId: book.bookTypeId,
    interiorThemeId: book.interiorThemeId,
    coverStyleId: book.coverStyleId,
    aiDisclosure: book.aiDisclosure,
    illustrativeLine: book.illustrativeLine,
    sections: out,
    manuscriptHash: sha256Hex(out.map((s) => `${s.id}:${s.bodyMd}`).join('\n') + (authorPhoto ? `\nphoto:${sha256Hex(Buffer.from(authorPhoto.data))}` : '')),
    templateId: structure.templateId,
    sectionsOff: [
      ...new Set([
        ...allSections.filter((s) => !s.enabled).map((s) => s.kind),
        ...leftOut,
        // Required template sections this book type leaves out are off on purpose (a tech how-to has no dedication).
        ...[...structure.front, ...structure.back].filter((x) => !x.inType).map((x) => sectionKindFor(x.id)),
      ]),
    ].filter((k) => !out.some((s) => s.kind === k)),
    summary: text(bp['summary']),
    // The owner's own blueprint edits win; then the matter stage's listing; then the blueprint's planning drafts
    // (D-049, pack listing/ files).
    listing: {
      description: !owner.has('description_draft') && listing?.descriptionHtml?.trim() ? listing.descriptionHtml : text(bp['description_draft']),
      keywords: !owner.has('keywords') && listing?.keywords.length ? listing.keywords : strings(bp['keywords']),
      categories: !owner.has('categories') && listing?.categories.length ? listing.categories : strings(bp['categories']),
      backBlurb: (!owner.has('back_blurb') ? text(listing?.backBlurb) : null) ?? text(bp['back_blurb']),
    },
    aiEvidence: lean ? { text: false, images: false } : await repos.manuscript.aiEvidence(ctx, projectId),
    claims,
    datedPrices: hasDatedPrices(structure),
    marketing: lean ? {} : await marketingText(repos, ctx, projectId),
    ownCover: lean ? { ebook: false, wrap: false } : await ownCoverOf(repos, ctx, projectId),
  };
}

const wordsIn = (md: string): number => md.split(/\s+/).filter(Boolean).length;

/**
 * True for a switched-on front or back page that holds no text and that the app does not build: a dedication nobody
 * wrote, say. Also by is built from published books, so it is blank when there are none. About the author, the contents,
 * the copyright and the title page are always built, so they are never blank.
 */
export function isBlankMatter(kind: string, area: string, bodyMd: string): boolean {
  if (area === 'body' || kind === 'part') return false;
  if (CODE_KINDS.has(kind) && kind !== 'also_by') return false;
  return bodyMd.replace(/^\s*#.*$/gm, '').trim().length === 0;
}

/** Titles of the other books published under this book's pen name (newest first), for the Also by page. */
export async function alsoByTitles(repos: Repos, ctx: RequestCtx, book: Pick<Book, 'id' | 'profileId'>): Promise<string[]> {
  const published = await repos.books.list(ctx, { profileId: book.profileId, published: 'true', limit: 100, offset: 0 });
  return published
    .filter((b) => b.id !== book.id)
    .map((b) => [b.title, b.subtitle].filter((t): t is string => typeof t === 'string' && t.trim().length > 0).join(': '))
    .filter((t) => t.length > 0);
}

/** The Also by page text: one title per paragraph. Empty when there is nothing published yet. */
export function alsoByMarkdown(titles: readonly string[]): string {
  return titles.length ? `# Also by\n\n${titles.join('\n\n')}` : '';
}

// ---------- What the Editor shows for pages the exporter builds or the owner writes ----------

/** Where the owner changes what a built page shows. The web app turns the target into a link. */
export interface PageEdit {
  target: 'titles' | 'blueprint' | 'profile' | 'published';
  label: string;
}

/** A page the app builds when the book is exported (title page, copyright, contents, About the author, Also by, part dividers). */
export interface GeneratedPageView {
  /** The lines the exported book prints, from the same code the exporters run. */
  lines: ContentsLine[];
  /** Words in those lines. */
  words: number;
  /** False for the pages before the contents: they print but do not count toward the manuscript's words (as TXT counts). */
  countsInTotal: boolean;
  note: string;
  edit: PageEdit | null;
  /** True when the exported book leaves this page out (Also by with no published book). */
  leftOut: boolean;
}

/** A page only the owner can write, with nothing (or only the app's placeholder) written yet. */
export interface OwnerPromptView {
  message: string;
  /** What the exported book holds for this page until the owner writes it. */
  placeholder: string;
  /** True when the exported book leaves the page out until it has text. */
  leftOut: boolean;
}

const BUILT_NOTE = 'Built from your book details when you export. You do not write this page.';
const PAGE_NOTES: Readonly<Record<string, { note: string; edit: PageEdit | null }>> = {
  titlepage: {
    note: `${BUILT_NOTE} The title and subtitle come from Titles, the author name from your pen name.`,
    edit: { target: 'titles', label: 'Change the title' },
  },
  halftitle: { note: `${BUILT_NOTE} It shows the book title only.`, edit: { target: 'titles', label: 'Change the title' } },
  copyright: {
    note: `${BUILT_NOTE} It holds the year, your pen name, the edition and any ISBNs, with the template's standard wording.`,
    edit: { target: 'profile', label: 'Edit the pen name details' },
  },
  contents: {
    note: `${BUILT_NOTE} It lists the headings of the book, so it always matches them. The eBook links each line and the print book adds page numbers.`,
    edit: { target: 'blueprint', label: 'Change chapter titles in the Blueprint' },
  },
  about_the_author: {
    note: `${BUILT_NOTE} It is your pen name's bio, word for word.`,
    edit: { target: 'profile', label: 'Edit the bio' },
  },
  also_by: {
    note: `${BUILT_NOTE} It lists the other books you have marked as published under this pen name.`,
    edit: { target: 'published', label: 'See your published books' },
  },
  part: {
    note: 'A divider page built from the part number and title when you export. It holds no text of its own.',
    edit: { target: 'blueprint', label: 'Rename the part in the Blueprint' },
  },
};

/** Pages only the owner can write (the AI writer never invents them for the dedication's names or the thanks). */
const OWNER_PAGE_KINDS: ReadonlySet<string> = new Set(['dedication', 'acknowledgements', 'epigraph']);

const OWNER_PROMPTS: Readonly<Record<string, string>> = {
  dedication:
    'This page is yours to write. Dedicate the book to someone, or to a group such as readers or colleagues. A short line is enough. Until you write it, the exported book leaves this page out.',
  acknowledgements:
    'Thank the people who helped you. Add their names in the book settings and write this page again, or write it yourself here. Until you do, the exported book leaves this page out.',
  epigraph:
    'Add a quotation you have the right to use, with who said it. The app never chooses one for you. Until you add it, the exported book leaves this page out.',
};
const LEFT_OUT_PLACEHOLDER = 'Nothing is printed for this page until you write it.';

export interface SectionPreviews {
  generated: Map<string, GeneratedPageView>;
  ownerPrompts: Map<string, OwnerPromptView>;
}

/**
 * What the Editor shows for the pages the writer does not write. A built page (title page, copyright, contents, About the
 * author, Also by, part divider) gets its real text, made by toBookDoc and generatedPage, the code the exporters run. An
 * owner page (dedication, acknowledgements, epigraph) that is switched on but empty, or still the app's placeholder, gets
 * a kind prompt and the text the exported book will hold for it.
 */
export async function sectionPreviews(repos: Repos, ctx: RequestCtx, projectId: string, configDir: string): Promise<SectionPreviews> {
  const generated = new Map<string, GeneratedPageView>();
  const ownerPrompts = new Map<string, OwnerPromptView>();
  const all = (await repos.manuscript.listSections(ctx, projectId)).filter((s) => s.enabled);
  const wantsBuilt = all.some((s) => CODE_KINDS.has(s.kind) || s.kind === 'part');
  if (wantsBuilt) {
    const eb = await buildExportBook(repos, ctx, projectId, configDir, undefined, { lean: true });
    const doc = toBookDoc(eb, exportTemplate(dirname(configDir), eb));
    const ordered = [...eb.sections].sort((a, b) => a.position - b.position);
    doc.sections.forEach((ds, i) => {
      const sec = ordered[i];
      if (!sec || !isGeneratedSubtype(ds.subtype)) return;
      // The owner's own copyright text replaces the built page, and that stays editable text.
      if (sec.kind === 'copyright' && sec.bodyMd.trim()) return;
      const page = generatedPage(doc, ds);
      const meta = PAGE_NOTES[ds.subtype];
      if (!page || !meta) return;
      generated.set(sec.id, { ...page, countsInTotal: !FENCED_SUBTYPES.has(ds.subtype), note: meta.note, edit: meta.edit, leftOut: false });
    });
    // A switched-on Also by that the export leaves out (no published book): say so instead of showing an empty page.
    for (const s of all) {
      if (s.kind !== 'also_by' || generated.has(s.id)) continue;
      const meta = PAGE_NOTES['also_by'];
      generated.set(s.id, {
        lines: [],
        words: 0,
        countsInTotal: true,
        note: 'You have no other book marked as published under this pen name, so the exported book leaves this page out. It appears when you mark one as published.',
        edit: meta?.edit ?? null,
        leftOut: true,
      });
    }
  }
  for (const s of all) {
    if (!OWNER_PAGE_KINDS.has(s.kind) && s.plan['writer'] !== 'owner') continue;
    const version = s.currentVersionId ? await repos.manuscript.getVersion(ctx, s.currentVersionId) : null;
    const body = version?.bodyMd.replace(/^\s*#.*$/gm, '').trim() ?? '';
    const placeholder = version?.source === OWNER_PLACEHOLDER_SOURCE;
    if (body && !placeholder) continue;
    const name = s.title ?? s.kind.replace(/_/g, ' ');
    ownerPrompts.set(s.id, {
      message: OWNER_PROMPTS[s.kind] ?? `${name} is yours to write. Until you do, the exported book leaves this page out.`,
      placeholder: placeholder ? body : LEFT_OUT_PLACEHOLDER,
      leftOut: !placeholder,
    });
  }
  return { generated, ownerPrompts };
}

/** Width of the export record's manuscript_hash column. */
const PACK_HASH_LENGTH = 64;

/**
 * A fingerprint of everything the upload pack carries: the manuscript, title and subtitle, author details, listing,
 * ISBNs and edition, AI disclosure, claims, every marketing post, and the covers (which concept, the type settings
 * and the built files). The pack job stores it; a later fingerprint that differs means the pack is out of date. The
 * `p1:` prefix tells it apart from the plain manuscript hash older packs carry.
 */
export function packHashOf(book: ExportBook, cover: Pick<Cover, 'chosenAssetId' | 'typography' | 'ebookAssetId' | 'wrapAssetId' | 'wrapSpec'> | null): string {
  const photo = book.authorPhoto ? sha256Hex(Buffer.from(book.authorPhoto.data)) : null;
  const parts = {
    title: book.title,
    subtitle: book.subtitle,
    author: book.author,
    language: book.language,
    trim: book.trim,
    paper: book.paper,
    edition: book.edition,
    year: book.publicationYear,
    isbns: [book.isbnPaperback, book.isbnEbook],
    kind: [book.bookTypeId, book.interiorThemeId, book.coverStyleId, book.templateId],
    ai: [book.aiDisclosure, book.illustrativeLine],
    manuscript: book.manuscriptHash,
    photo,
    listing: book.listing,
    claims: book.claims,
    marketing: book.marketing?.items ?? [],
    ownCover: book.ownCover,
    cover: cover
      ? [cover.chosenAssetId, cover.typography, cover.ebookAssetId, cover.wrapAssetId, cover.wrapSpec['pages'] ?? null, cover.wrapSpec['mock'] === true]
      : null,
  };
  // 64 characters at most: the export record's manuscript_hash column is 64 wide, and MariaDB cuts a longer value.
  return `p1:${sha256Hex(JSON.stringify(parts)).slice(0, PACK_HASH_LENGTH - 3)}`;
}

/** Which cover files are the owner's own uploads (cover.wrapSpec ownEbook and ownWrap, set by POST /cover/own). */
async function ownCoverOf(repos: Repos, ctx: RequestCtx, projectId: string): Promise<{ ebook: boolean; wrap: boolean }> {
  const cover = await repos.production.getCover(ctx, projectId);
  return { ebook: !!cover?.ebookAssetId && cover.wrapSpec['ownEbook'] === true, wrap: !!cover?.wrapAssetId && cover.wrapSpec['ownWrap'] === true };
}

/**
 * The chapter count the owner chose for this book in the new-book wizard (book settings `chapters`, a number or a
 * numeric string), or null. The blueprint uses it when the request names no count, before the workspace default.
 */
export function bookChapterCount(settings: Record<string, unknown>): number | null {
  const raw = settings['chapters'];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : Number.NaN;
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : null;
}

/** Marketing items as plain text for the pack's marketing/ folder. */
async function marketingText(repos: Repos, ctx: RequestCtx, projectId: string): Promise<NonNullable<ExportBook['marketing']>> {
  const items = await repos.production.listMarketing(ctx, projectId, {});
  const block = (kind: string): string | null => {
    const mine = items.filter((i) => i.kind === kind);
    if (!mine.length) return null;
    return `${mine
      .map((i, n) =>
        [
          `${n + 1}.${i.title ? ` ${i.title}` : ''}`,
          i.hook,
          i.body,
          i.cta ? `Call to action: ${i.cta}` : null,
          i.hashtags.length ? i.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' ') : null,
        ]
          .filter((x): x is string => !!x)
          .join('\n'),
      )
      .join('\n\n')}\n`;
  };
  const out: NonNullable<ExportBook['marketing']> = {};
  const posts = items.filter((i) => i.kind === 'tiktok_script' || i.kind === 'instagram_caption' || i.kind === 'launch_email');
  if (posts.length)
    out.items = posts.map((i) => ({
      kind: i.kind as 'tiktok_script' | 'instagram_caption' | 'launch_email',
      title: i.title,
      hook: i.hook,
      body: i.body,
      cta: i.cta,
      hashtags: i.hashtags,
      durationS: i.durationS,
      subjectLines: i.subjectLines,
      imageIdea: i.imageIdea,
    }));
  const tiktok = block('tiktok_script');
  const instagram = block('instagram_caption');
  const email = block('launch_email');
  if (tiktok) out.tiktokScripts = tiktok;
  if (instagram) out.instagramCaptions = instagram;
  if (email) out.launchEmail = email;
  return out;
}

/**
 * The book's template rules for prompts ({{template}}): the template file the book type picks, only the sections
 * this book type has, and the type's structure, word range and genre rules (for example dated prices for a tech
 * how-to). Null when there is no template.
 */
export async function loadTemplate(configDir: string, book: Pick<Book, 'bookTypeId' | 'template'>): Promise<unknown> {
  return promptTemplate(await loadBookStructure(configDir, book.bookTypeId, book.template));
}

const houseStyles = new Map<string, CompiledHouseStyle>();

/** config/house-style.json compiled once per config folder. */
export function houseStyle(configDir: string): CompiledHouseStyle {
  let style = houseStyles.get(configDir);
  if (!style) {
    style = loadHouseStyle(dirname(configDir));
    houseStyles.set(configDir, style);
  }
  return style;
}

export interface CodeCheck {
  checker: string;
  severity: 'info' | 'warn' | 'block';
  message: string;
  location?: Record<string, unknown>;
}

/**
 * Code checks that need no model: the house style (em and en dashes, banned phrases, US spellings,
 * UK phrasing) and the guardrail patterns (ISBNs, invented reviews and awards, claims) from
 * config/house-style.json, through @volume/core checkText.
 */
export function styleChecks(markdown: string, configDir: string): CodeCheck[] {
  return checkText(markdown, houseStyle(configDir)).map((f) => {
    const blocks = f.severity === 'error' && (f.rule !== 'guardrail' || f.action === 'block');
    const location: Record<string, unknown> = { start: f.start, end: f.end, line: f.line, col: f.col, match: f.match };
    if (f.suggestion !== undefined) location['suggestion'] = f.suggestion;
    if (f.id !== undefined) location['id'] = f.id;
    if (f.action !== undefined) location['action'] = f.action;
    return {
      checker: f.rule === 'emdash' ? 'em_dash' : f.rule === 'endash' ? 'en_dash' : f.rule,
      severity: blocks ? 'block' : f.severity === 'info' ? 'info' : 'warn',
      message: f.message,
      location,
    };
  });
}

/** Checker name of the field drift warning (owner, 21 October 2026). */
export const FIELD_DRIFT_CHECKER = 'field_drift';

/**
 * The field drift warning for one section (owner, 21 October 2026): in a book whose type is not a health type
 * (`applies`, from fieldDriftAppliesTo), the health-institution terms the text mentions (NHS, GP, hospital and so on),
 * as one warning with the matches. Null when the check does not apply or nothing matched. Never blocks.
 */
export function fieldDriftCheck(markdown: string, applies: boolean): CodeCheck | null {
  if (!applies) return null;
  const found = findHealthTerms(markdown);
  if (found.length === 0) return null;
  return {
    checker: FIELD_DRIFT_CHECKER,
    severity: 'warn',
    message: fieldDriftMessage(found),
    location: { matches: found.map((f) => f.label), counts: Object.fromEntries(found.map((f) => [f.label, f.count])) },
  };
}

/**
 * Adds a preflight warning for each switched-on section whose current text drifts out of the pen name's field
 * (fieldDriftCheck). Warnings never stop the pack. Returns the same report.
 */
export async function withFieldDrift(
  repos: Repos,
  ctx: RequestCtx,
  configDir: string,
  book: Pick<Book, 'id' | 'bookTypeId'>,
  report: PreflightReport,
): Promise<PreflightReport> {
  if (!(await fieldDriftAppliesTo(configDir, book.bookTypeId))) return report;
  for (const s of await repos.manuscript.listSections(ctx, book.id)) {
    if (!s.enabled || !s.currentVersionId) continue;
    const v = await repos.manuscript.getVersion(ctx, s.currentVersionId);
    const check = v ? fieldDriftCheck(v.bodyMd, true) : null;
    const id = `${s.area}.field-drift.${s.id}`;
    if (!check || report.items.some((i) => i.id === id)) continue;
    report.items.push({
      id,
      area: s.area,
      severity: 'warn',
      message: `${s.title ?? s.kind}: ${check.message}`,
      fix: { route: 'writing', label: 'Open the section' },
    });
    report.warnings += 1;
  }
  return report;
}

/** Names the owner gave for the acknowledgements: the book's own list wins over the profile's. Empty when none. */
export function acknowledgementNames(book: Pick<Book, 'settings'> | null, profilePublishing: Record<string, unknown>): string[] {
  const from = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
      : typeof v === 'string' && v.trim()
        ? v
            .split(/\n|;/)
            .map((x) => x.trim())
            .filter(Boolean)
        : [];
  const own = from(book?.settings['acknowledgements']);
  return own.length ? own : from(profilePublishing['acknowledgements']);
}

/**
 * Profile summary for prompts (no legal name, no private fields). It carries the profile facts every reader-facing
 * prompt gets ({{profile.facts}}): bio, short bio, credentials, links, location, the names the owner gave for
 * thanks and the book's illustrative-line choice. Prompts may state no personal fact beyond these.
 */
export async function profileSummary(
  repos: Repos,
  ctx: RequestCtx,
  profileId: string,
  book: Pick<Book, 'illustrativeLine' | 'settings'> | null = null,
): Promise<Record<string, unknown>> {
  const p = await repos.profiles.require(ctx, profileId);
  const memory = await repos.profiles.listMemory(ctx, profileId, { activeOnly: true });
  const out: Record<string, unknown> = {
    penName: p.penName,
    isRealPerson: p.isRealPerson,
    credentials: p.credentials,
    voice: p.voice,
    language: p.language,
    memory: memory.map((m) => ({ kind: m.kind, content: m.content })),
    bio: p.bioThirdPerson,
    shortBio: p.shortBio,
    links: p.links.map((l) => ({ label: l.label, url: l.url ?? l.value ?? null })),
    location: p.location,
    illustrativeLine: book ? book.illustrativeLine : p.illustrativeLineDefault,
    acknowledgementNames: acknowledgementNames(book, p.publishing),
  };
  if (typeof p.publishing['dedicationNames'] !== 'undefined') out['dedicationNames'] = p.publishing['dedicationNames'];
  // The pen name's own writing reaches the writer as voice samples (plan 2026-10-21, Task 3). No samples: no key, so
  // the prompts read exactly as before.
  const samples = (await repos.profiles.listSamples(ctx, profileId))
    .filter((s) => VOICE_SAMPLE_KINDS.includes(s.kind))
    .sort((a, b) => VOICE_SAMPLE_KINDS.indexOf(a.kind) - VOICE_SAMPLE_KINDS.indexOf(b.kind))
    .map((s) => trimSample(s.text))
    .filter((t) => t.length > 0)
    .slice(0, MAX_VOICE_SAMPLES);
  if (samples.length) out['samples'] = samples;
  return out;
}

/** Profile sample kinds sent to the writer as "sounds like" samples, in order of preference. */
const VOICE_SAMPLE_KINDS: readonly string[] = ['sounds_like', 'writing_sample'];
/** At most this many samples go to the writer. */
export const MAX_VOICE_SAMPLES = 2;
/** Each sample is cut to about this many words. */
export const VOICE_SAMPLE_WORDS = 600;

/**
 * A writing sample cut to its first `maxWords` words, ending at a paragraph boundary: whole paragraphs while they fit.
 * A first paragraph longer than the limit is cut at the last full sentence inside it (or at the word limit when it has
 * no sentence end there).
 */
export function trimSample(text: string, maxWords = VOICE_SAMPLE_WORDS): string {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const countWords = (s: string): number => s.split(/\s+/).filter(Boolean).length;
  const kept: string[] = [];
  let total = 0;
  for (const p of paragraphs) {
    const n = countWords(p);
    if (total + n > maxWords) break;
    kept.push(p);
    total += n;
  }
  if (kept.length || paragraphs.length === 0) return kept.join('\n\n');
  const head = (paragraphs[0] as string).split(/\s+/).slice(0, maxWords).join(' ');
  if (/[.?!]["”’)]?$/.test(head)) return head;
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('? '), head.lastIndexOf('! '));
  return end > 0 ? head.slice(0, end + 1) : head;
}

/** Checker name of the blocking flag on a saved version whose summary failed (owner decision, 7 October 2026). */
export const SUMMARY_MISSING_CHECKER = 'summary_missing';
/** Checker name of the blocking flag on a saved version whose claims and consistency check failed (live run, 7 October 2026). */
export const CHECKS_MISSING_CHECKER = 'checks_missing';

/** Version source of a page the app saved as a placeholder for the owner to fill (acknowledgements with no names). */
export const OWNER_PLACEHOLDER_SOURCE = 'app:placeholder';

/**
 * Adds a blocking preflight item for every switched-on section whose text is still the app's placeholder (for
 * example acknowledgements with nobody named to thank), and for every one whose current text carries an open
 * summary_missing or checks_missing flag (that step failed after the text was saved). The pack is not built until the owner fills,
 * reruns or switches it off. Returns the same report.
 */
export async function withOwnerPlaceholders(repos: Repos, ctx: RequestCtx, projectId: string, report: PreflightReport): Promise<PreflightReport> {
  const sections = (await repos.manuscript.listSections(ctx, projectId)).filter((s) => s.enabled && s.currentVersionId);
  for (const s of sections) {
    // A saved section whose summary or claims and consistency check failed (an open flag on its current text) blocks
    // until the step is rerun.
    const open = (await repos.manuscript.listChecks(ctx, { versionId: s.currentVersionId as string })).filter((c) => c.status === 'open');
    const name = s.title ?? s.kind;
    const missing = [
      {
        checker: SUMMARY_MISSING_CHECKER,
        id: `body.summary-missing.${s.id}`,
        message: `${name} has no summary: its text is saved, but the summary failed. Run the summary again for this section.`,
      },
      {
        checker: CHECKS_MISSING_CHECKER,
        id: `body.checks-missing.${s.id}`,
        message: `${name} has not been checked: its text is saved, but its claims and consistency check failed. Run the checks again for this section.`,
      },
    ];
    for (const m of missing) {
      if (!open.some((c) => c.checker === m.checker) || report.items.some((i) => i.id === m.id)) continue;
      report.items.push({
        id: m.id,
        area: 'body',
        severity: 'block',
        message: m.message,
        // POST /sections/:id/recheck queues only the missing steps.
        fix: { route: 'writing', label: 'Run it again', action: 'rerun-checks', sectionId: s.id },
      });
      report.blocks += 1;
      report.ok = false;
    }
    const v = await repos.manuscript.getVersion(ctx, s.currentVersionId as string);
    if (v?.source !== OWNER_PLACEHOLDER_SOURCE) continue;
    const id = `front.owner-placeholder.${s.kind}`;
    if (report.items.some((i) => i.id === id)) continue;
    const what = s.kind === 'acknowledgements' ? 'Add the names of the people you want to thank in the book settings and write it again' : 'Write it yourself';
    report.items.push(
      s.kind === 'resources'
        ? {
            id,
            area: 'front',
            severity: 'block',
            message: 'Resources needs sources: tick sources in Research, then write Resources again, or switch the section off.',
            fix: { route: 'research', label: 'Tick sources' },
          }
        : {
            id,
            area: 'front',
            severity: 'block',
            message: `${s.title ?? s.kind} still holds a placeholder: ${what}, or switch the section off.`,
            fix: { route: 'writing', label: 'Open the section' },
          },
    );
    report.blocks += 1;
    report.ok = false;
  }
  return report;
}

/** Where the owner can upload a finished cover instead of building one: the Cover screen's own-cover panel. */
export const OWN_COVER_FIX = { route: 'cover', label: 'Upload your own cover', anchor: 'own-cover' } as const;
const OWN_COVER_HINT = 'or upload your own cover';

/**
 * The KDP pack needs a cover: with no eBook cover and no paperback wrap the pack is blocked (item cover.files) while
 * the single manuscript files still export (live run 3 built a pack with no cover folder). Added unless the
 * exporter's own report already has the item. Every cover.files block or warning (the exporter's too) also says the
 * owner can upload their own cover, with a fix pointing at the own-cover panel. Returns the same report.
 */
export function withPackCovers(report: PreflightReport, covers: { ebook: boolean; wrap: boolean }): PreflightReport {
  if (!covers.ebook && !covers.wrap && !report.items.some((i) => i.id === 'cover.files')) {
    report.items.push({
      id: 'cover.files',
      area: 'cover',
      severity: 'block',
      message: 'KDP pack covers: No eBook cover or paperback wrap yet. Build the covers in the cover studio. Single files still export.',
      fix: { route: 'cover', label: 'Open the cover studio' },
    });
    report.blocks += 1;
    report.ok = false;
  }
  for (const item of report.items) {
    if (item.id !== 'cover.files' || (item.severity !== 'block' && item.severity !== 'warn')) continue;
    if (!item.message.includes(OWN_COVER_HINT)) {
      item.message = item.message.includes('Build the covers in the cover studio.')
        ? item.message.replace('Build the covers in the cover studio.', `Build the covers in the cover studio ${OWN_COVER_HINT}.`)
        : `${item.message} Build it in the cover studio ${OWN_COVER_HINT}.`;
    }
    item.fix = { ...OWN_COVER_FIX };
  }
  return report;
}
