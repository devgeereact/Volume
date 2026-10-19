import type { BlobStore } from '../files/blob-store.js';
import { dirname } from 'node:path';
import { checkText, type CompiledHouseStyle } from '@volume/core';
import { loadHouseStyle } from '@volume/core/node';
import type { RequestCtx } from '../auth/context.js';
import { sha256Hex } from '../lib/util.js';
import { CODE_KINDS, hasDatedPrices, loadBookStructure, promptTemplate, sectionKindFor } from '../config/book-structure.js';
import type { ExportBook, ExportClaim, ExportSection, PreflightReport } from '../ports/export.js';
import type { Book } from '../repos/books.js';
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

export async function buildExportBook(repos: Repos, ctx: RequestCtx, projectId: string, configDir: string, blobs?: BlobStore): Promise<ExportBook> {
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
  const sections = allSections.filter((s) => s.enabled);
  const structure = await loadBookStructure(configDir, book.bookTypeId, book.template);
  const out: ExportSection[] = [];
  for (const s of sections) {
    let bodyMd = '';
    if (s.kind === 'about_author') bodyMd = `# About the author\n\n${profile.bioThirdPerson}`;
    else if (s.currentVersionId) bodyMd = (await repos.manuscript.getVersion(ctx, s.currentVersionId))?.bodyMd ?? '';
    out.push({
      id: s.id,
      kind: s.kind,
      area: s.area,
      position: s.position,
      number: s.number,
      title: s.title,
      bodyMd,
      wordCount: s.kind === 'about_author' ? profile.bioThirdPerson.split(/\s+/).filter(Boolean).length : s.wordCount,
    });
  }
  const blueprint = book.approvedBlueprintId
    ? await repos.planning.blueprintById(ctx, book.approvedBlueprintId)
    : await repos.planning.latestBlueprint(ctx, projectId);
  const bp = blueprint?.data ?? {};
  const listing = await repos.production.getListing(ctx, projectId);
  const owner = await ownerListingFields(repos, ctx, blueprint);
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : []);
  const titleOf = new Map(
    allSections.map((s) => [s.id, s.kind === 'chapter' && s.number !== null ? `Chapter ${s.number}: ${s.title ?? ''}` : (s.title ?? s.kind)]),
  );
  const claims: ExportClaim[] = (await repos.manuscript.listClaims(ctx, { projectId })).map((c) => ({
    chapter: (c.sectionId ? titleOf.get(c.sectionId) : null) ?? '',
    sentence: c.sentence,
    category: c.category,
    check: c.checkNeeded ?? '',
    status: c.status === 'verified' ? 'verified' : c.status === 'removed' ? 'removed' : 'open',
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
        // Required template sections this book type leaves out are off on purpose (a tech how-to has no dedication).
        ...[...structure.front, ...structure.back].filter((x) => !x.inType).map((x) => sectionKindFor(x.id)),
      ]),
    ].filter((k) => !sections.some((s) => s.kind === k)),
    summary: text(bp['summary']),
    // The owner's own blueprint edits win; then the matter stage's listing; then the blueprint's planning drafts
    // (D-049, pack listing/ files).
    listing: {
      description: !owner.has('description_draft') && listing?.descriptionHtml?.trim() ? listing.descriptionHtml : text(bp['description_draft']),
      keywords: !owner.has('keywords') && listing?.keywords.length ? listing.keywords : strings(bp['keywords']),
      categories: !owner.has('categories') && listing?.categories.length ? listing.categories : strings(bp['categories']),
      backBlurb: (!owner.has('back_blurb') ? text(listing?.backBlurb) : null) ?? text(bp['back_blurb']),
    },
    aiEvidence: await repos.manuscript.aiEvidence(ctx, projectId),
    claims,
    datedPrices: hasDatedPrices(structure),
    marketing: await marketingText(repos, ctx, projectId),
  };
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
  return out;
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
        // POST /books/:id/sections/:sectionId/rerun-checks queues only the missing steps.
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
