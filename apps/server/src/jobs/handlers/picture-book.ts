import { seedFromKey } from '@volume/ai';
import { promptTemplate } from '../../config/book-structure.js';
import type { ExportFile, PictureSpreadInput } from '../../ports/export.js';
import type { NewSectionInput, Section } from '../../repos/manuscript.js';
import { buildExportBook, profileSummary, withOwnerPlaceholders } from '../book-data.js';
import { datedPricesVars, plannedBodyCount, writtenSections } from '../book-checks.js';
import { JobFailed } from '../errors.js';
import {
  isLayout,
  matterStartsOn,
  PICTURE_INK,
  PICTURE_TRIM,
  pictureSettings,
  picturePlan,
  requirePictureBook,
  SPREAD_KIND,
  spreadSections,
  storyInput,
  type PictureSettings,
} from '../picture-book.js';
import type { EnqueueInput } from '../queue.js';
import { TERMINAL } from '../queue.js';
import type { JobContext, JobHandler } from '../runner.js';
import { mergeBlueprintPart } from './planning.js';
import { packBlockedReason } from './production.js';

/**
 * Picture-book jobs (P7-5, D-044, D-045). The parent picture_book runs these one after another; each step saves
 * what it made before the next starts, so a retry or a restart carries on where it stopped:
 * 1. picture_story: the story (children.picture-book-story), then the scene prompts (children.scene-prompts) with
 *    the character sheets. A failed safety check stops here at needs_attention.
 * 2. picture_characters: one reference prompt per main character (children.character-reference) and one reference
 *    picture each, stored as assets.
 * 3. spread_image, one per spread: the scene prompt with the character references and the book's fixed seed.
 * picture_export (started on its own) builds the full-bleed print PDF, the preflight and the pack.
 * AI text sets the KDP disclosure for text to AI-generated; every AI picture sets it for images.
 */

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'character';

function projectOf(jc: JobContext): string {
  const id = jc.job.projectId;
  if (!id) throw new JobFailed('This picture-book job is missing its book.', 'invalid_state');
  return id;
}

/**
 * Starts the next step as a sibling under the same parent, so the parent waits for it too. Skipped when the same
 * step (same kind and, for spreads, the same section) is already queued, running or done under that parent: a step
 * that is retried after a crash never starts the next one twice.
 */
async function enqueueNext(jc: JobContext, input: EnqueueInput): Promise<void> {
  const parentId = jc.job.parentId;
  if (parentId) {
    const siblings = await jc.services.queue.list(jc.ctx, { parentId, limit: 1000 });
    const sectionId = input.payload?.['sectionId'];
    const same = siblings.some((j) => j.kind === input.kind && j.payload['sectionId'] === sectionId && (!TERMINAL.has(j.status) || j.status === 'succeeded'));
    if (same) return;
  }
  await jc.services.queue.enqueue(jc.ctx, { ...input, parentId });
}

/** Character names in more than one scene are the main characters (D-045: they get a reference picture). */
function mainCharacters(scenes: { characters: string[] }[]): Set<string> {
  const counts = new Map<string, number>();
  for (const s of scenes) for (const n of new Set(s.characters)) counts.set(n, (counts.get(n) ?? 0) + 1);
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name));
}

/**
 * Creates the matter pages from the book type when the book has no sections yet: AI and code pages on, owner pages
 * off, "Also by" and the goodnight page only when the owner asked for them (each adds a printed page).
 */
async function ensureMatter(jc: JobContext, projectId: string, settings: PictureSettings): Promise<{ front: number; back: number }> {
  const { repos, configDir } = jc.services;
  const existing = await repos.manuscript.listSections(jc.ctx, projectId);
  if (existing.length === 0) {
    const { structure } = await requirePictureBook(repos, jc.ctx, configDir, projectId);
    const item = (x: (typeof structure.front)[number]): NewSectionInput => {
      const plan: Rec = { writer: x.writer, templateId: x.id, source: x.source };
      if (x.content) plan['rule'] = x.content;
      return { kind: x.kind, area: x.area, title: x.title, enabled: matterStartsOn(x, settings), plan };
    };
    await repos.manuscript.addSections(jc.ctx, projectId, structure.front.map(item), 1000);
    // Spreads go between: front at 1000, 2000, ...; back from 1,000,000 on.
    await repos.manuscript.addSections(jc.ctx, projectId, structure.back.map(item), 1_000_000);
  }
  const on = (await repos.manuscript.listSections(jc.ctx, projectId)).filter((s) => s.enabled && s.kind !== SPREAD_KIND);
  return { front: on.filter((s) => s.area === 'front').length, back: on.filter((s) => s.area === 'back').length };
}

/** Matches the spread sections to the story: updates spreads 1 to N, adds missing ones and switches off any beyond N. */
async function syncSpreads(jc: JobContext, projectId: string, spreads: { n: number; sceneSummary: string }[]): Promise<Section[]> {
  const { repos } = jc.services;
  const all = await repos.manuscript.listSections(jc.ctx, projectId);
  const existing = all.filter((s) => s.kind === SPREAD_KIND);
  const lastFront = Math.max(0, ...all.filter((s) => s.area === 'front').map((s) => s.position));
  for (const sp of spreads) {
    const match = existing.find((s) => s.number === sp.n);
    if (match) {
      await repos.manuscript.updateSectionPlan(jc.ctx, match.id, { plan: { ...match.plan, sceneSummary: sp.sceneSummary }, enabled: true });
    } else {
      await repos.manuscript.addSections(
        jc.ctx,
        projectId,
        [
          {
            kind: SPREAD_KIND,
            area: 'body',
            title: `Spread ${sp.n}`,
            number: sp.n,
            layout: 'text-left',
            plan: { writer: 'ai', templateId: 'spreads', source: 'ai', sceneSummary: sp.sceneSummary },
          },
        ],
        lastFront + sp.n * 10,
      );
    }
  }
  for (const s of existing) if ((s.number ?? 0) > spreads.length && s.enabled) await repos.manuscript.updateSectionPlan(jc.ctx, s.id, { enabled: false });
  return spreadSections(repos, jc.ctx, projectId);
}

/**
 * The listing (description, keywords, categories, back blurb) through the same stage every other template uses:
 * blueprint_part with part `listing` (blueprint.regenerate-part). A picture book has no blueprint, so the first run
 * saves a small one from the story (title, summary from the scene summaries, no chapters) to hold the listing.
 * Skipped on a resume when the latest blueprint already has keywords and the story did not change.
 */
async function ensureListing(
  jc: JobContext,
  projectId: string,
  storyRan: boolean,
  template: Rec | null,
  profile: unknown,
  storyResult: Rec | null | undefined,
): Promise<boolean> {
  const { repos, configDir } = jc.services;
  let latest = await repos.planning.latestBlueprint(jc.ctx, projectId);
  const hasListing = Array.isArray(latest?.data['keywords']) && (latest.data['keywords'] as unknown[]).length > 0;
  if (hasListing && !storyRan) return false;
  const book = await repos.books.require(jc.ctx, projectId);
  const story = rec(storyResult);
  const summary = (Array.isArray(story['spreads']) ? story['spreads'] : [])
    .map((s) => str(rec(s)['sceneSummary']))
    .filter(Boolean)
    .join(' ');
  if (!latest) {
    latest = await repos.planning.addBlueprintVersion(
      jc.ctx,
      projectId,
      { title: book.title ?? str(story['title']), summary, chapters: [] },
      { source: 'code:picture_book', note: 'Picture-book blueprint from the story' },
    );
  }
  await jc.progress(0.85, 'Writing the listing');
  const res = await jc.runAi('blueprint_part', {
    promptId: 'blueprint.regenerate-part',
    variables: {
      part: 'listing',
      instruction: null,
      blueprint: latest.data,
      wordTarget: book.wordTarget,
      template,
      bookTypeId: book.bookTypeId,
      profile,
      ...(await datedPricesVars(configDir, book, await writtenSections(repos, jc.ctx, projectId), await plannedBodyCount(repos, jc.ctx, projectId))),
    },
  });
  const bp = await repos.planning.addBlueprintVersion(jc.ctx, projectId, mergeBlueprintPart(latest.data, 'listing', res.output.data), {
    source: 'ai:blueprint_part',
    note: 'Picture-book listing',
    parentVersionId: latest.id,
    promptRunId: res.promptRunId,
  });
  await jc.emit('book.updated', { projectId, part: 'blueprint', blueprintId: bp.id, version: bp.version });
  return true;
}

export const pictureBookHandler: JobHandler = async (jc) => {
  const projectId = projectOf(jc);
  await requirePictureBook(jc.services.repos, jc.ctx, jc.services.configDir, projectId);
  // A restart after the first step was queued must not queue it again.
  const children = await jc.services.queue.list(jc.ctx, { parentId: jc.job.id, limit: 1000 });
  if (!children.some((c) => c.kind === 'picture_story')) {
    const payload: Rec = { regenerateStory: jc.payload['regenerateStory'] === true };
    if (typeof jc.payload['spreads'] === 'number') payload['spreads'] = jc.payload['spreads'];
    await jc.enqueueChild({ kind: 'picture_story', projectId, payload });
  }
  return { waitForChildren: true };
};

export const pictureStoryHandler: JobHandler = async (jc) => {
  const { repos, configDir } = jc.services;
  const projectId = projectOf(jc);
  const { book, structure } = await requirePictureBook(repos, jc.ctx, configDir, projectId);
  let settings = pictureSettings(book.settings);
  const template = promptTemplate(structure);
  const profile = await profileSummary(repos, jc.ctx, book.profileId, book);
  const matter = await ensureMatter(jc, projectId, settings);
  const regenerate = jc.payload['regenerateStory'] === true;

  let spreads = await spreadSections(repos, jc.ctx, projectId);
  let storyRan = false;
  const passed = rec(settings.storyResult?.['safetyCheck'])['passed'] === true;
  if (regenerate || !passed || spreads.length === 0 || spreads.some((s) => !s.currentVersionId)) {
    const { plan } = await picturePlan(configDir, matter.front, matter.back);
    const count = typeof jc.payload['spreads'] === 'number' ? jc.payload['spreads'] : plan.spreads;
    await jc.progress(0.1, 'Writing the story');
    const res = await jc.runAi('picture_story', {
      promptId: 'children.picture-book-story',
      variables: {
        title: book.title,
        idea: book.idea,
        story: storyInput(settings, structure.template, book.idea, count),
        cta: settings.story?.cta ?? null,
        template,
        profile,
      },
    });
    const story = res.output;
    settings = { ...settings, storyResult: story };
    await repos.books.setSetting(jc.ctx, projectId, 'pictureBook', settings);
    if (!story.safetyCheck.passed) {
      // Nothing is saved to the pages: the owner reads the notes and starts again with other choices.
      return { status: 'needs_attention', result: { step: 'story', safetyCheck: story.safetyCheck } };
    }
    spreads = await syncSpreads(
      jc,
      projectId,
      story.spreads.map((s) => ({ n: s.n, sceneSummary: s.sceneSummary })),
    );
    for (const s of spreads) {
      const sp = story.spreads.find((x) => x.n === s.number);
      if (!sp) continue;
      await repos.manuscript.saveVersion(jc.ctx, s.id, { bodyMd: sp.text, source: 'ai', promptRunId: res.promptRunId });
    }
    // Today's new word and the goodnight message come from the same answer.
    const all = await repos.manuscript.listSections(jc.ctx, projectId);
    const word = all.find((s) => s.kind === 'word_of_the_day');
    const newWord = str(story['newWord']);
    if (word && newWord) {
      const meaning = str(story['newWordMeaning']);
      await repos.manuscript.saveVersion(jc.ctx, word.id, {
        bodyMd: meaning ? `**${newWord}**\n\n${meaning}` : `**${newWord}**`,
        source: 'ai',
        promptRunId: res.promptRunId,
      });
    }
    const goodnight = all.find((s) => s.kind === 'goodnight_message');
    const goodnightText = str(story['goodnightMessage']);
    if (goodnight && goodnight.enabled && goodnightText)
      await repos.manuscript.saveVersion(jc.ctx, goodnight.id, { bodyMd: goodnightText, source: 'ai', promptRunId: res.promptRunId });
    if (!book.title && str(story.title)) await repos.books.update(jc.ctx, projectId, { title: str(story.title) });
    await repos.books.setAiDisclosure(jc.ctx, projectId, 'text', 'ai_generated');
    await repos.books.advanceStage(jc.ctx, projectId, 'writing');
    await jc.emit('book.updated', { projectId, part: 'spreads', step: 'story' });
    storyRan = true;
  }
  await jc.checkpoint();

  spreads = await spreadSections(repos, jc.ctx, projectId);
  const prompted = spreads.every((s) => typeof s.plan['imagePrompt'] === 'string' && isLayout(s.layout));
  if (storyRan || !prompted) {
    await jc.progress(0.55, 'Writing the scene prompts');
    const res = await jc.runAi('scene_prompts', {
      promptId: 'children.scene-prompts',
      variables: {
        story: storyInput(settings, structure.template, book.idea, spreads.length),
        storyResult: settings.storyResult,
        template,
        profile,
      },
    });
    for (const s of spreads) {
      const scene = res.output.scenes.find((x) => x.spread === s.number);
      if (!scene) throw new JobFailed(`The scene prompts missed spread ${s.number ?? '?'}. Try again.`, 'invalid_output');
      const extra: Rec = {};
      for (const k of ['textArea', 'cameraAngle', 'lighting', 'characterPositions'] as const) if (typeof scene[k] === 'string') extra[k] = scene[k];
      await repos.manuscript.updateSectionPlan(jc.ctx, s.id, { plan: { ...s.plan, ...extra, imagePrompt: scene.imagePrompt, characters: scene.characters } });
      await repos.manuscript.setSpread(jc.ctx, s.id, { layout: scene.layout });
    }
    const main = mainCharacters(res.output.scenes);
    await repos.picture.replaceCharacters(
      jc.ctx,
      projectId,
      res.output.characterSheets.map((c) => ({ name: c.name, sheet: c.prompt, main: main.has(c.name) })),
    );
    settings = { ...settings, styleLine: res.output.styleLine || null };
    await repos.books.setSetting(jc.ctx, projectId, 'pictureBook', settings);
    await jc.emit('book.updated', { projectId, part: 'spreads', step: 'scene_prompts' });
  }
  const listed = await ensureListing(jc, projectId, storyRan, template, profile, settings.storyResult);
  await jc.checkpoint();
  await enqueueNext(jc, { kind: 'picture_characters', projectId, payload: {} });
  return { result: { spreads: spreads.length, storyRan, listed } };
};

export const pictureCharactersHandler: JobHandler = async (jc) => {
  const { repos, configDir, blobs } = jc.services;
  const projectId = projectOf(jc);
  const { book, structure } = await requirePictureBook(repos, jc.ctx, configDir, projectId);
  const settings = pictureSettings(book.settings);
  const spreads = await spreadSections(repos, jc.ctx, projectId);
  let characters = await repos.picture.listCharacters(jc.ctx, projectId);
  const notes: string[] = [];

  const needPrompt = characters.filter((c) => c.main && !c.referencePrompt);
  if (needPrompt.length > 0) {
    await jc.progress(0.1, 'Writing the character references');
    const res = await jc.runAi('character_reference', {
      promptId: 'children.character-reference',
      variables: {
        story: storyInput(settings, structure.template, book.idea, spreads.length),
        storyResult: settings.storyResult,
        scenePrompts: {
          characterSheets: characters.map((c) => ({ name: c.name, prompt: c.sheet })),
          styleLine: settings.styleLine ?? '',
          scenes: spreads.map((s) => ({ spread: s.number, characters: s.plan['characters'] ?? [] })),
        },
        template: promptTemplate(structure),
        profile: await profileSummary(repos, jc.ctx, book.profileId, book),
      },
    });
    for (const c of needPrompt) {
      const ref = res.output.references.find((r) => r.name === c.name);
      // No reference prompt for a character: its spreads still carry the sheet word for word (D-045).
      if (!ref) notes.push(`No reference picture prompt came back for ${c.name}.`);
      else await repos.picture.setReference(jc.ctx, c.id, { referencePrompt: ref.imagePrompt });
    }
    characters = await repos.picture.listCharacters(jc.ctx, projectId);
  }

  const toPaint = characters.filter((c) => c.main && c.referencePrompt && !c.referenceAssetId);
  for (const [i, c] of toPaint.entries()) {
    await jc.progress(0.3 + (0.6 * i) / toPaint.length, `Painting ${c.name}`);
    const img = await jc.runImage(c.referencePrompt ?? '', { purpose: 'character-reference', seed: seedFromKey(projectId) });
    const asset = await blobs.put(
      jc.ctx,
      {
        kind: 'character_reference',
        filename: `character-${slug(c.name)}.${img.mime === 'image/png' ? 'png' : 'jpg'}`,
        mime: img.mime,
        projectId,
        aiGenerated: true,
        promptRunId: img.promptRunId,
        width: img.width,
        height: img.height,
      },
      img.data,
    );
    await repos.picture.setReference(jc.ctx, c.id, { referenceAssetId: asset.id });
    await repos.books.setAiDisclosure(jc.ctx, projectId, 'images', 'ai_generated');
    if (img.notes?.length) notes.push(...img.notes);
  }
  if (toPaint.length > 0) await jc.emit('book.updated', { projectId, part: 'characters' });

  for (const s of spreads) {
    if (s.imageAssetId) continue;
    await enqueueNext(jc, { kind: 'spread_image', projectId, payload: { sectionId: s.id } });
  }
  return { result: { references: toPaint.length, notes } };
};

export const spreadImageHandler: JobHandler = async (jc) => {
  const { repos, blobs } = jc.services;
  const projectId = projectOf(jc);
  const sectionId = typeof jc.payload['sectionId'] === 'string' ? jc.payload['sectionId'] : '';
  const section = await repos.manuscript.requireSection(jc.ctx, sectionId);
  if (section.projectId !== projectId || section.kind !== SPREAD_KIND) throw new JobFailed('That spread does not belong to this book.', 'invalid_state');
  // Resume: a spread that already has its picture is done, unless the owner asked for a new one.
  if (section.imageAssetId && jc.payload['regenerate'] !== true) return { result: { sectionId, imageAssetId: section.imageAssetId, skipped: true } };
  const prompt = typeof section.plan['imagePrompt'] === 'string' ? section.plan['imagePrompt'] : '';
  if (!prompt) throw new JobFailed('This spread has no scene prompt yet. Run the picture book first.', 'invalid_state');

  // D-045: the reference picture of every main character in the scene, and the book's fixed seed.
  const names = new Set(Array.isArray(section.plan['characters']) ? section.plan['characters'].filter((x): x is string => typeof x === 'string') : []);
  const refs: { data: Uint8Array; mediaType: string }[] = [];
  for (const c of await repos.picture.listCharacters(jc.ctx, projectId)) {
    if (!names.has(c.name) || !c.referenceAssetId) continue;
    const a = await blobs.read(jc.ctx, c.referenceAssetId);
    refs.push({ data: new Uint8Array(a.data), mediaType: a.meta.mime });
  }
  await jc.progress(0.2, `Painting spread ${section.number ?? ''}`.trim());
  const img = await jc.runImage(prompt, { purpose: 'spread', inputReferences: refs, seed: seedFromKey(projectId) });
  const asset = await blobs.put(
    jc.ctx,
    {
      kind: 'spread_image',
      filename: `spread-${section.number ?? 0}.${img.mime === 'image/png' ? 'png' : 'jpg'}`,
      mime: img.mime,
      projectId,
      aiGenerated: true,
      promptRunId: img.promptRunId,
      width: img.width,
      height: img.height,
    },
    img.data,
  );
  await repos.manuscript.setSpread(jc.ctx, section.id, { imageAssetId: asset.id });
  await repos.books.setAiDisclosure(jc.ctx, projectId, 'images', 'ai_generated');
  await jc.emit('book.updated', { projectId, part: 'spreads', sectionId: section.id, imageAssetId: asset.id });
  return { result: { sectionId: section.id, imageAssetId: asset.id, references: refs.length, notes: img.notes ?? [] } };
};

export const pictureExportHandler: JobHandler = async (jc) => {
  const { repos, blobs, exporter, configDir } = jc.services;
  const projectId = projectOf(jc);
  await requirePictureBook(repos, jc.ctx, configDir, projectId);
  if (!exporter.buildPictureBook) throw new JobFailed('This exporter cannot build picture books.', 'not_implemented');
  const book = await buildExportBook(repos, jc.ctx, projectId, configDir, blobs);
  const spreads: PictureSpreadInput[] = [];
  const images: Record<string, Uint8Array> = {};
  for (const s of await spreadSections(repos, jc.ctx, projectId)) {
    const text = book.sections.find((x) => x.id === s.id)?.bodyMd ?? '';
    let imageKey: string | null = null;
    if (s.imageAssetId) {
      imageKey = `spread-${s.number ?? 0}`;
      images[imageKey] = new Uint8Array((await blobs.read(jc.ctx, s.imageAssetId)).data);
    }
    spreads.push({
      n: s.number ?? 0,
      text,
      layout: isLayout(s.layout) ? s.layout : 'text-left',
      sceneSummary: typeof s.plan['sceneSummary'] === 'string' ? s.plan['sceneSummary'] : '',
      imageKey,
    });
  }
  // The covers from the cover studio go into the pack's cover folder when they are built.
  const cover = await repos.production.getCover(jc.ctx, projectId);
  const covers: ExportFile[] = [];
  for (const [assetId, role] of [
    [cover?.ebookAssetId, 'ebook_cover'],
    [cover?.wrapAssetId, 'wrap_pdf'],
  ] as const) {
    if (!assetId) continue;
    const a = await blobs.read(jc.ctx, assetId);
    covers.push({ filename: a.meta.filename, mime: a.meta.mime, data: new Uint8Array(a.data), pageCount: null, mock: cover?.wrapSpec['mock'] === true, role });
  }

  await jc.progress(0.1, 'Building the picture-book PDF');
  const built = await exporter.buildPictureBook({ book, spreads, images, ink: PICTURE_INK, covers }, { signal: jc.signal });
  const preflight = await withOwnerPlaceholders(repos, jc.ctx, projectId, built.preflight);
  await jc.checkpoint();
  const records: string[] = [];
  const pdfAsset = await blobs.put(jc.ctx, { kind: 'export', filename: built.interior.filename, mime: built.interior.mime, projectId }, built.interior.data);
  const pdf = await repos.production.addExport(jc.ctx, projectId, {
    kind: 'pdf_print',
    trim: PICTURE_TRIM,
    paper: book.paper,
    status: 'done',
    assetId: pdfAsset.id,
    bytes: pdfAsset.bytes,
    pageCount: built.interior.pageCount,
    sha256: pdfAsset.sha256,
    manuscriptHash: book.manuscriptHash,
    preflight,
    jobId: jc.job.id,
    mock: built.interior.mock,
  });
  records.push(pdf.id);
  await jc.emit('export.ready', { exportId: pdf.id, kind: 'pdf_print', assetId: pdfAsset.id, mock: built.interior.mock });
  const summary = {
    pageCount: built.interior.pageCount,
    pageSizeIn: built.pageSizeIn,
    safeAreaFindings: built.safeAreaFindings,
    missingImages: built.missingImages,
    ruleIds: built.ruleIds,
    warnings: built.warnings,
  };

  if (!built.pack || preflight.blocks > 0) {
    const reason = packBlockedReason(preflight);
    const rec = await repos.production.addExport(jc.ctx, projectId, {
      kind: 'pack',
      trim: PICTURE_TRIM,
      paper: book.paper,
      status: 'failed',
      assetId: null,
      bytes: null,
      pageCount: null,
      sha256: null,
      manuscriptHash: book.manuscriptHash,
      preflight,
      jobId: jc.job.id,
      mock: preflight.mock,
      error: reason,
    });
    await repos.books.advanceStage(jc.ctx, projectId, 'export');
    throw new JobFailed(reason, 'preflight_blocked', { exports: records, packExportId: rec.id, preflight, ...summary });
  }
  const packAsset = await blobs.put(jc.ctx, { kind: 'export', filename: built.pack.filename, mime: built.pack.mime, projectId }, built.pack.data);
  const pack = await repos.production.addExport(jc.ctx, projectId, {
    kind: 'pack',
    trim: PICTURE_TRIM,
    paper: book.paper,
    status: 'done',
    assetId: packAsset.id,
    bytes: packAsset.bytes,
    pageCount: null,
    sha256: packAsset.sha256,
    manuscriptHash: book.manuscriptHash,
    preflight,
    jobId: jc.job.id,
    mock: built.pack.mock,
  });
  records.push(pack.id);
  await jc.emit('export.ready', { exportId: pack.id, kind: 'pack', assetId: packAsset.id, mock: built.pack.mock });
  await repos.books.advanceStage(jc.ctx, projectId, 'export');
  return { result: { exports: records, preflight: { ok: preflight.ok, blocks: preflight.blocks, warnings: preflight.warnings }, ...summary } };
};
