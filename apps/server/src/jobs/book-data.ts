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

/** Sections whose text comes from code, never from the writer (docs/04, stage 7). */
export const CODE_WRITTEN_KINDS: ReadonlySet<string> = CODE_KINDS;

/** Gathers everything the exporter needs. About the author is the profile bio, verbatim. */
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
    listing: {
      description: text(bp['description_draft']),
      keywords: strings(bp['keywords']),
      categories: strings(bp['categories']),
      backBlurb: text(bp['back_blurb']),
    },
    claims,
    datedPrices: hasDatedPrices(structure),
    marketing: await marketingText(repos, ctx, projectId),
  };
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

/** Version source of a page the app saved as a placeholder for the owner to fill (acknowledgements with no names). */
export const OWNER_PLACEHOLDER_SOURCE = 'app:placeholder';

/**
 * Adds a blocking preflight item for every switched-on section whose text is still the app's placeholder (for
 * example acknowledgements with nobody named to thank). The pack is not built until the owner fills or switches
 * it off. Returns the same report.
 */
export async function withOwnerPlaceholders(repos: Repos, ctx: RequestCtx, projectId: string, report: PreflightReport): Promise<PreflightReport> {
  const sections = (await repos.manuscript.listSections(ctx, projectId)).filter((s) => s.enabled && s.currentVersionId);
  for (const s of sections) {
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

/**
 * The KDP pack needs a cover: with no eBook cover and no paperback wrap the pack is blocked (item cover.files) while
 * the single manuscript files still export (live run 3 built a pack with no cover folder). Added unless the
 * exporter's own report already has the item. Returns the same report.
 */
export function withPackCovers(report: PreflightReport, covers: { ebook: boolean; wrap: boolean }): PreflightReport {
  if (covers.ebook || covers.wrap || report.items.some((i) => i.id === 'cover.files')) return report;
  report.items.push({
    id: 'cover.files',
    area: 'cover',
    severity: 'block',
    message: 'KDP pack covers: No eBook cover or paperback wrap yet. Build the covers in the cover studio. Single files still export.',
    fix: { route: 'cover', label: 'Open the cover studio' },
  });
  report.blocks += 1;
  report.ok = false;
  return report;
}
