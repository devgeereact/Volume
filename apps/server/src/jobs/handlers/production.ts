import type { ExportFile, ExportKind, PreflightReport } from '../../ports/export.js';
import { EXPORT_KINDS } from '../../ports/export.js';
import type { MarketingExtras } from '../../repos/production.js';
import {
  bookMarketingCounts,
  buildExportBook,
  houseStyle,
  ownerListingFields,
  packHashOf,
  profileSummary,
  withOwnerPlaceholders,
  withPackCovers,
} from '../book-data.js';
import { fixHouseStyleDeep } from '../house-style-fix.js';
import { writtenSections, writtenSummaries } from '../book-checks.js';
import { listingVariables } from '../listing-input.js';
import { JobFailed } from '../errors.js';
import { dedupeKey } from '../../lib/util.js';
import { isPictureBook, pageCount as picturePageCount, PICTURE_INK, pictureStructure, SPREAD_KIND } from '../picture-book.js';
import type { JobHandler } from '../runner.js';

/** True for undefined, null, blank strings, empty arrays and empty objects. */
function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

/** The owner's values, with empty fields filled from `generated`. Concepts are never taken from the owner copy. */
export function fillEmpty(owner: Record<string, unknown>, generated: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(owner)) if (k !== 'concepts') out[k] = v;
  for (const [k, v] of Object.entries(generated)) if (isEmptyValue(out[k])) out[k] = v;
  return out;
}

/** Cover concepts for a book: settings.coverConcepts, 1 to 4, default 3 (each concept is one paid image). */
export function conceptCount(settings: Record<string, unknown>): number {
  const n = settings['coverConcepts'];
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(4, Math.max(1, Math.round(n))) : 3;
}

export const coverConceptsHandler: JobHandler = async (jc) => {
  const { repos, blobs } = jc.services;
  const projectId = jc.job.projectId;
  if (!projectId) throw new JobFailed('Cover job is missing its book.');
  const book = await repos.books.require(jc.ctx, projectId);
  const cover = await repos.production.getCover(jc.ctx, projectId);
  let concepts: { name: string; image_prompt: string; why: string }[];
  const storedBrief = cover?.brief ?? {};
  const storedConcepts = Array.isArray(storedBrief['concepts'])
    ? (storedBrief['concepts'] as { name: string; image_prompt: string; why: string }[]).slice(0, conceptCount(book.settings))
    : [];
  const count = conceptCount(book.settings);
  if (jc.payload['regenerateBrief'] === true || storedConcepts.length === 0) {
    await jc.progress(0.1, 'Writing the cover brief');
    const res = await jc.runAi('cover_brief', {
      promptId: 'cover.brief',
      variables: {
        title: book.title,
        subtitle: book.subtitle,
        coverStyleId: book.coverStyleId,
        conceptCount: count,
        brief: storedBrief,
        profile: await profileSummary(repos, jc.ctx, book.profileId, book),
      },
    });
    // Each concept is one paid image: never more than the book asked for, whatever the model returned.
    concepts = res.output.concepts.slice(0, count);
    // The owner's saved brief wins: the AI brief only fills fields the owner left empty.
    await repos.production.upsertCover(jc.ctx, projectId, { brief: { ...fillEmpty(storedBrief, res.output.brief), concepts }, status: 'brief' });
  } else {
    concepts = storedConcepts;
  }
  const made: { assetId: string; name: string; prompt: string; why: string; mock: boolean }[] = [];
  for (const [i, c] of concepts.entries()) {
    await jc.progress(0.2 + (0.7 * i) / concepts.length, `Making concept ${i + 1} of ${concepts.length}`);
    // 2:3 is the closest ratio OpenRouter's images endpoint accepts; the export fits it to 1600 x 2560.
    const img = await jc.runImage(c.image_prompt, { aspectRatio: '2:3' });
    const asset = await blobs.put(
      jc.ctx,
      {
        kind: 'cover_concept',
        filename: `concept-${i + 1}.${img.mime === 'image/png' ? 'png' : 'jpg'}`,
        mime: img.mime,
        projectId,
        aiGenerated: true,
        promptRunId: img.promptRunId,
        width: img.width,
        height: img.height,
      },
      img.data,
    );
    made.push({ assetId: asset.id, name: c.name, prompt: c.image_prompt, why: c.why, mock: img.mock });
  }
  await repos.production.upsertCover(jc.ctx, projectId, { concepts: made, status: 'concepts' });
  await repos.books.advanceStage(jc.ctx, projectId, 'cover');
  await jc.emit('cover.updated', { projectId, status: 'concepts', concepts: made.map((m) => m.assetId) });
  return { result: { concepts: made.length } };
};

export const coverBuildHandler: JobHandler = async (jc) => {
  const { repos, blobs, exporter } = jc.services;
  const projectId = jc.job.projectId;
  if (!projectId) throw new JobFailed('Cover job is missing its book.');
  const cover = await repos.production.getCover(jc.ctx, projectId);
  if (!cover?.chosenAssetId) throw new JobFailed('Choose a cover concept first.', 'invalid_state');
  // The owner's own covers ("use my own cover") stay: a build makes only the slots that are not the owner's.
  const keepEbook = cover.wrapSpec['ownEbook'] === true && !!cover.ebookAssetId;
  const keepWrap = cover.wrapSpec['ownWrap'] === true && !!cover.wrapAssetId;
  if (keepEbook && keepWrap) return { result: { skipped: 'own covers in use', ebookAssetId: cover.ebookAssetId, wrapAssetId: cover.wrapAssetId } };
  const book = await buildExportBook(repos, jc.ctx, projectId, jc.services.configDir, jc.services.blobs);
  const art = await blobs.read(jc.ctx, cover.chosenAssetId);
  // The same blurb as the pack: the matter stage's, else the blueprint's (D-049).
  const backBlurb = book.listing?.backBlurb ?? '';

  // The wrap needs the real interior page count: use the latest print PDF, or build one now.
  const exports = await repos.production.listExports(jc.ctx, projectId);
  let pageCount: number | null = keepWrap
    ? 0
    : (exports.find((e) => e.kind === 'pdf_print' && e.status === 'done' && e.manuscriptHash === book.manuscriptHash)?.pageCount ?? null);
  // A picture book prints in premium colour, so its spine uses the colour rule (paperback.spine.widthPerPage.colour).
  const picture = isPictureBook(await pictureStructure(jc.services.configDir, await repos.books.require(jc.ctx, projectId)));
  if (pageCount === null) {
    // A picture book's interior is the full-bleed spread PDF: count its pages from the sections, never from an
    // ordinary print PDF of the same text (that gave the wrap a far thinner spine).
    const all = await repos.manuscript.listSections(jc.ctx, projectId);
    if (picture) {
      const on = all.filter((s) => s.enabled);
      pageCount = picturePageCount(
        on.filter((s) => s.area === 'front').length,
        on.filter((s) => s.kind === SPREAD_KIND).length,
        on.filter((s) => s.area === 'back').length,
      );
    } else pageCount = (await exporter.buildPdf(book, { signal: jc.signal })).pageCount ?? 24;
  }

  const input = { book, artwork: { mime: art.meta.mime, data: art.data }, typography: cover.typography, coverStyleId: book.coverStyleId };
  let ebookAssetId = cover.ebookAssetId;
  let wrapAssetId = cover.wrapAssetId;
  let mock = false;
  if (!keepEbook) {
    await jc.progress(0.3, 'Building the eBook cover');
    const ebook = await exporter.buildEbookCover(input, { signal: jc.signal });
    mock ||= ebook.mock;
    ebookAssetId = (
      await blobs.put(jc.ctx, { kind: 'cover_ebook', filename: ebook.filename, mime: ebook.mime, projectId, aiGenerated: art.meta.aiGenerated }, ebook.data)
    ).id;
    await jc.checkpoint();
  }
  if (!keepWrap) {
    await jc.progress(0.6, 'Building the paperback wrap');
    const wrap = await exporter.buildWrapCover({ ...input, pageCount, backBlurb, ...(picture ? { ink: PICTURE_INK } : {}) }, { signal: jc.signal });
    mock ||= wrap.mock;
    wrapAssetId = (
      await blobs.put(jc.ctx, { kind: 'cover_wrap', filename: wrap.filename, mime: wrap.mime, projectId, aiGenerated: art.meta.aiGenerated }, wrap.data)
    ).id;
  }
  await repos.production.upsertCover(jc.ctx, projectId, {
    ebookAssetId,
    wrapAssetId,
    wrapSpec: {
      ...(keepWrap ? {} : { trim: book.trim, paper: book.paper, pages: pageCount, ...(picture ? { ink: PICTURE_INK } : {}) }),
      ...(keepEbook ? { ownEbook: true } : {}),
      ...(keepWrap ? { ownWrap: true } : {}),
      // What these covers were built from, so the studio can say when the title, style or art has changed since.
      builtWith: { typography: cover.typography, coverStyleId: book.coverStyleId, title: book.title, subtitle: book.subtitle, chosen: cover.chosenAssetId },
      mock,
    },
    status: 'final',
  });
  if (art.meta.aiGenerated) await repos.books.setAiDisclosure(jc.ctx, projectId, 'images', 'ai_generated');
  await jc.emit('cover.updated', { projectId, status: 'final', ebookAssetId, wrapAssetId });
  return { result: { ebookAssetId, wrapAssetId, kept: { ebook: keepEbook, wrap: keepWrap } } };
};

/**
 * A TikTok script body with no line starting in stray punctuation (", : words"), which an empty beat time or a dash
 * the house style fix removed can leave behind (live acceptance run, 19 October 2026). Empty lines are dropped.
 */
export function tidyBeatLines(body: string): string {
  return body
    .split('\n')
    .map((l) => l.replace(/^[\s,;:]+/, '').trimEnd())
    .filter((l) => l.length > 0)
    .join('\n');
}

/** The line an item is known by: a script's hook, else the first line of its body. */
function openingLine(m: { hook: string | null; body: string }): string {
  return (m.hook?.trim() || m.body.split('\n').find((l) => l.trim().length > 0) || '').trim();
}

/** Marketing items with any repeat of an earlier item of the same kind (same text once folded) left out. */
export function distinctMarketing<T extends { kind: string; hook: string | null; body: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    const key = `${i.kind}:${dedupeKey(i.hook)}:${dedupeKey(i.body)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Marketing fields the house style fix leaves alone (hashtags are search terms, kind is a code). */
const MARKETING_KEEP: ReadonlySet<string> = new Set(['kind', 'hashtags']);

export const marketingHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const projectId = jc.job.projectId;
  if (!projectId) throw new JobFailed('Marketing job is missing its book.');
  const book = await repos.books.require(jc.ctx, projectId);
  // itemId: regenerate that one item in place (POST /marketing/:id/regenerate).
  const itemId = typeof jc.payload['itemId'] === 'string' ? jc.payload['itemId'] : null;
  const target = itemId ? await repos.production.requireMarketing(jc.ctx, itemId) : null;
  const kinds = target
    ? [target.kind]
    : Array.isArray(jc.payload['kinds'])
      ? (jc.payload['kinds'] as string[])
      : ['tiktok_script', 'instagram_caption', 'launch_email'];
  const blueprint = book.approvedBlueprintId
    ? await repos.planning.blueprintById(jc.ctx, book.approvedBlueprintId)
    : await repos.planning.latestBlueprint(jc.ctx, projectId);
  // Marketing describes only what the written book teaches: each written section's summary and key takeaways
  // (live run 3: two TikTok scripts described methods the book never covered).
  const counts = await bookMarketingCounts(jc.services.configDir, book);
  const taught = writtenSummaries(await writtenSections(repos, jc.ctx, projectId));
  // Regenerating one item: the openings of the book's other items of that kind, so the new one differs from them.
  const siblings = target ? (await repos.production.listMarketing(jc.ctx, projectId, { kind: target.kind })).filter((m) => m.id !== target.id) : [];
  const avoid = siblings.map(openingLine).filter((x) => x.length > 0);
  const res = await jc.runAi('marketing', {
    promptId: 'marketing.launch-pack',
    variables: {
      title: book.title,
      subtitle: book.subtitle,
      bookTypeId: book.bookTypeId,
      summary: blueprint?.data['summary'] ?? null,
      blueprint: blueprint?.data ?? null,
      previousSummaries: taught,
      kinds,
      // Counts from the book's template (D-049, 5 and 5 unless it says otherwise); one item when regenerating one.
      ...(target ? { count: 1, instruction: jc.payload['instruction'] ?? null, avoid } : { tiktokCount: counts.tiktok, instagramCount: counts.instagram }),
      profile: await profileSummary(repos, jc.ctx, book.profileId, book),
    },
  });
  const items: {
    kind: string;
    title: string | null;
    hook: string | null;
    body: string;
    cta: string | null;
    hashtags: string[];
    durationS: number | null;
    extras?: MarketingExtras;
  }[] = [];
  if (kinds.includes('tiktok_script')) {
    for (const t of res.output.tiktok) {
      items.push({
        kind: 'tiktok_script',
        title: null,
        hook: t.hook,
        body: [...t.beats, ...t.on_screen.map((s) => `On screen: ${s}`)].join('\n'),
        cta: t.cta,
        hashtags: t.hashtags.slice(0, 10),
        durationS: t.seconds,
      });
    }
  }
  if (kinds.includes('instagram_caption')) {
    for (const i of res.output.instagram) {
      items.push({
        kind: 'instagram_caption',
        title: null,
        hook: null,
        body: i.caption,
        cta: i.cta,
        hashtags: i.hashtags.slice(0, 10),
        durationS: null,
        extras: { imageIdea: i.image_idea || null },
      });
    }
  }
  if (kinds.includes('launch_email') && res.output.email) {
    const e = res.output.email;
    items.push({
      kind: 'launch_email',
      title: e.subjects[0] ?? null,
      hook: e.preview,
      body: e.body,
      cta: null,
      hashtags: [],
      durationS: null,
      extras: { subjectLines: e.subjects },
    });
  }
  // House style auto-fix on the AI's posts and email (live acceptance run: 42 en dashes in one book's posts).
  const fixed = fixHouseStyleDeep(items, houseStyle(jc.services.configDir), MARKETING_KEEP).value.map((i) =>
    i.kind === 'tiktok_script' ? { ...i, body: tidyBeatLines(i.body) } : i,
  );
  // Dedupe on save: the same post twice in one answer is kept once (live acceptance run, 19 October 2026).
  items.splice(0, items.length, ...distinctMarketing(fixed));
  if (target) {
    const next = items.find((i) => i.kind === target.kind);
    if (!next) throw new JobFailed('The model returned nothing for this item. Try again.', 'invalid_output');
    const { kind: _kind, ...fields } = next;
    await repos.production.replaceMarketing(jc.ctx, target.id, fields, jc.job.id, res.promptRunId);
    await jc.emit('book.updated', { projectId, part: 'marketing', itemId: target.id, regenerated: true });
    return { result: { itemId: target.id } };
  }
  await repos.production.addMarketingItems(jc.ctx, projectId, book.profileId, items, jc.job.id, res.promptRunId);
  await jc.emit('book.updated', { projectId, part: 'marketing', count: items.length });
  return { result: { items: items.length } };
};

/** One plain sentence or two for the owner when the final preflight stops the pack. */
export function packBlockedReason(report: PreflightReport): string {
  const blocks = report.items.filter((i) => i.severity === 'block');
  const page = blocks.find((i) => i.id === 'interior.pages');
  const first = page
    ? `The interior page count is outside KDP's limits for this trim: ${page.message.replace(/^[^:]*:\s*/, '').replace(/\.\s*$/, '')}`
    : (blocks[0]?.message ?? 'The final check found a problem');
  const more = blocks.length > 1 ? ` ${blocks.length - 1} more ${blocks.length === 2 ? 'problem' : 'problems'} in the preflight report.` : '';
  return `The upload pack was not built. ${first.replace(/\.$/, '')}.${more} The other files are built and ready to download.`;
}

/** Listing fields the house style fix leaves alone: search terms. */
const LISTING_KEEP: ReadonlySet<string> = new Set(['keywords', 'categories']);

/**
 * The matter stage (docs/02-architecture/AI-PIPELINE.md stage 7): matter.amazon-description, matter.keywords-categories
 * and matter.back-cover write the listing from the written chapters, and it is saved for the pack, which prefers it to
 * the blueprint's planning drafts (D-049). Runs as the last child of write_book and from POST /books/:id/listing.
 * Before the second live acceptance run (19 October 2026) no job called this stage, so the selling blurb prompts were
 * never used.
 */
export const listingHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const projectId = jc.job.projectId;
  if (!projectId) throw new JobFailed('Listing job is missing its book.');
  const book = await repos.books.require(jc.ctx, projectId);
  const blueprint = book.approvedBlueprintId
    ? await repos.planning.blueprintById(jc.ctx, book.approvedBlueprintId)
    : await repos.planning.latestBlueprint(jc.ctx, projectId);
  // The same variables the writing estimate prices (one shared helper).
  const res = await jc.runAi('matter_metadata', { variables: await listingVariables(repos, jc.services.configDir, jc.ctx, book) });
  const out = fixHouseStyleDeep(res.output, houseStyle(jc.services.configDir), LISTING_KEEP).value;
  // Fields the owner edited in the blueprint are never overwritten: the saved listing keeps what it had for them, and
  // the pack uses the owner's text.
  const owner = await ownerListingFields(repos, jc.ctx, blueprint);
  const before = await repos.production.getListing(jc.ctx, projectId);
  const listing = await repos.production.saveListing(jc.ctx, projectId, {
    descriptionHtml: owner.has('description_draft') ? (before?.descriptionHtml ?? null) : out.description_html.trim() || null,
    backBlurb: owner.has('back_blurb') ? (before?.backBlurb ?? null) : out.back_blurb.trim() || null,
    shortBio: typeof out['short_bio'] === 'string' && out['short_bio'].trim() ? out['short_bio'].trim() : null,
    categories: owner.has('categories') ? (before?.categories ?? []) : out.categories,
    keywords: owner.has('keywords') ? (before?.keywords ?? []) : out.keywords,
    source: 'ai:matter',
  });
  await jc.emit('book.updated', { projectId, part: 'listing' });
  return {
    result: {
      listing: { description: listing.descriptionHtml !== null, backBlurb: listing.backBlurb !== null, keywords: listing.keywords.length },
      ownerKept: [...owner],
    },
  };
};

const BUILDERS: Record<ExportKind, 'buildPdf' | 'buildDocx' | 'buildEpub' | 'buildTxt' | 'buildMd'> = {
  pdf_print: 'buildPdf',
  docx: 'buildDocx',
  epub: 'buildEpub',
  txt: 'buildTxt',
  md: 'buildMd',
};

export const exportPackHandler: JobHandler = async (jc) => {
  const { repos, blobs, exporter } = jc.services;
  const projectId = jc.job.projectId;
  if (!projectId) throw new JobFailed('Export job is missing its book.');
  const book = await buildExportBook(repos, jc.ctx, projectId, jc.services.configDir, jc.services.blobs);
  await jc.progress(0.05, 'Preflight');
  const preflight = await withOwnerPlaceholders(repos, jc.ctx, projectId, await exporter.preflight(book, { signal: jc.signal }));
  if (preflight.blocks > 0) {
    // Build pack stays disabled while blocks remain (docs/09, Export).
    return { status: 'needs_attention', result: { preflight } };
  }
  const requested = Array.isArray(jc.payload['kinds']) ? (jc.payload['kinds'] as string[]) : [...EXPORT_KINDS];
  const kinds = EXPORT_KINDS.filter((k) => requested.includes(k));
  const files: ExportFile[] = [];
  const records: string[] = [];
  // The eBook cover from the cover studio becomes the EPUB's cover image (and goes into the pack's cover/ folder).
  const cover = await repos.production.getCover(jc.ctx, projectId);
  const ebookCover = cover?.ebookAssetId ? await blobs.read(jc.ctx, cover.ebookAssetId) : null;
  const coverJpeg = ebookCover && ebookCover.meta.mime === 'image/jpeg' ? new Uint8Array(ebookCover.data) : null;
  for (const [i, kind] of kinds.entries()) {
    await jc.checkpoint();
    await jc.progress(0.1 + (0.8 * i) / Math.max(1, kinds.length), `Building ${kind}`);
    const f =
      kind === 'epub' && coverJpeg
        ? await exporter.buildEpub(book, { signal: jc.signal, coverJpeg })
        : await exporter[BUILDERS[kind]](book, { signal: jc.signal });
    files.push(f);
    const asset = await blobs.put(jc.ctx, { kind: 'export', filename: f.filename, mime: f.mime, projectId }, f.data);
    const rec = await repos.production.addExport(jc.ctx, projectId, {
      kind,
      trim: book.trim,
      paper: book.paper,
      status: 'done',
      assetId: asset.id,
      bytes: asset.bytes,
      pageCount: f.pageCount,
      sha256: asset.sha256,
      manuscriptHash: book.manuscriptHash,
      preflight,
      jobId: jc.job.id,
      mock: f.mock,
    });
    records.push(rec.id);
    await jc.emit('export.ready', { exportId: rec.id, kind, assetId: asset.id, mock: f.mock });
  }
  if (jc.payload['pack'] !== false && files.length > 0) {
    await jc.checkpoint();
    await jc.progress(0.92, 'Building the upload pack');
    // The covers from the cover studio go into the pack's cover/ folder when they are built.
    const packFiles = [...files];
    const coverFiles: [string | null | undefined, 'ebook_cover' | 'wrap_pdf'][] = [
      [cover?.ebookAssetId, 'ebook_cover'],
      [cover?.wrapAssetId, 'wrap_pdf'],
    ];
    for (const [assetId, role] of coverFiles) {
      if (!assetId) continue;
      const a = role === 'ebook_cover' && ebookCover ? ebookCover : await blobs.read(jc.ctx, assetId);
      packFiles.push({
        filename: a.meta.filename,
        mime: a.meta.mime,
        data: new Uint8Array(a.data),
        pageCount: null,
        mock: cover?.wrapSpec['mock'] === true,
        role,
      });
    }
    // Gate on the final preflight (real page count, fonts, margins, covers). While it blocks, no pack is
    // built: the job fails with a plain reason and the files built above stay ready to download.
    if (exporter.finalPreflight) {
      await jc.progress(0.9, 'Checking the built files');
      const final = withPackCovers(
        await withOwnerPlaceholders(repos, jc.ctx, projectId, await exporter.finalPreflight(book, packFiles, { signal: jc.signal })),
        {
          ebook: packFiles.some((f) => f.role === 'ebook_cover'),
          wrap: packFiles.some((f) => f.role === 'wrap_pdf'),
        },
      );
      if (final.blocks > 0) {
        const reason = packBlockedReason(final);
        const rec = await repos.production.addExport(jc.ctx, projectId, {
          kind: 'pack',
          trim: book.trim,
          paper: book.paper,
          status: 'failed',
          assetId: null,
          bytes: null,
          pageCount: null,
          sha256: null,
          manuscriptHash: book.manuscriptHash,
          preflight: final,
          jobId: jc.job.id,
          mock: final.mock,
          error: reason,
        });
        await repos.books.advanceStage(jc.ctx, projectId, 'export');
        throw new JobFailed(reason, 'preflight_blocked', { exports: records, packExportId: rec.id, preflight: final });
      }
    }
    const pack = await exporter.buildPack(book, packFiles, { signal: jc.signal });
    const asset = await blobs.put(jc.ctx, { kind: 'export', filename: pack.filename, mime: pack.mime, projectId }, pack.data);
    const rec = await repos.production.addExport(jc.ctx, projectId, {
      kind: 'pack',
      trim: book.trim,
      paper: book.paper,
      status: 'done',
      assetId: asset.id,
      bytes: asset.bytes,
      pageCount: null,
      sha256: asset.sha256,
      // A pack stores the fingerprint of everything it carries, so any later change to the book marks it out of date.
      manuscriptHash: packHashOf(book, cover),
      preflight,
      jobId: jc.job.id,
      mock: pack.mock,
    });
    records.push(rec.id);
    await jc.emit('export.ready', { exportId: rec.id, kind: 'pack', assetId: asset.id, mock: pack.mock });
  }
  await repos.books.advanceStage(jc.ctx, projectId, 'export');
  return { result: { exports: records, preflight: { ok: preflight.ok, warnings: preflight.warnings } } };
};
