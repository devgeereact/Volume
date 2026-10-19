import { bleedPageSizeIn, defaultPictureBookPlan, parseTrimKey, SPREAD_LAYOUTS, type KdpRules, type PictureBookPlan, type SpreadLayout } from '@volume/core';
import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import { loadBookStructure, type BookStructure } from '../config/book-structure.js';
import { loadNewestKdpRules } from '../config/kdp-rules.js';
import { AppError } from '../http/errors.js';
import type { Book } from '../repos/books.js';
import type { Repos } from '../repos/index.js';
import type { Section } from '../repos/manuscript.js';
import type { PictureCharacter } from '../repos/picture.js';
import type { Job } from './queue.js';

/**
 * Picture books (phase 7, P7-5, D-044, D-045): what the jobs and the routes share. A picture book is a book whose
 * template is config/book-templates/picture-book.json. It prints on 8.5 x 8.5 in, premium colour, full bleed, and its
 * body is one section of kind `spread` per spread (text in the versions, layout and picture in their own columns,
 * the scene in the section plan).
 */

export const PICTURE_TEMPLATE_ID = 'picture-book';
export const PICTURE_TRIM = '8.5x8.5';
export const PICTURE_INK = 'premium' as const;
export const SPREAD_KIND = 'spread';

/** What the owner tells the story stage (all optional; template defaults fill the gaps). Sent as {{story}}. */
export const PictureStoryInputSchema = z
  .object({
    topic: z.string().trim().max(2000).optional(),
    newWord: z.string().trim().max(60).optional(),
    /** For example "3 to 7". */
    ageRange: z.string().trim().max(20).optional(),
    characterIdeas: z.string().trim().max(2000).optional(),
    characterCount: z.number().int().min(1).max(4).optional(),
    theme: z.string().trim().max(500).optional(),
    /** The gentle problem in the story (template storyRules.conflict): small, not scary, solved kindly. */
    conflict: z.string().trim().max(500).optional(),
    artStyle: z.string().trim().max(500).optional(),
    wordLimit: z.number().int().min(100).max(1000).optional(),
    rhyme: z.boolean().optional(),
    /** Ask for a goodnight message and print it on its own page at the back. */
    goodnightMessage: z.boolean().optional(),
    /** Print an "Also by" page at the back (off by default: it adds a page). */
    alsoBy: z.boolean().optional(),
    cta: z.string().trim().max(300).optional(),
  })
  .strict();
export type PictureStoryInput = z.infer<typeof PictureStoryInputSchema>;

/** book.settings.pictureBook: the owner's story inputs and the state the jobs keep between steps. */
const PictureSettingsSchema = z.looseObject({
  story: PictureStoryInputSchema.partial().catch({}).optional(),
  /** The story stage's answer (title, new word, characters, safety check) for the next steps and the screens. */
  storyResult: z.record(z.string(), z.unknown()).nullable().optional(),
  styleLine: z.string().nullable().optional(),
});
export type PictureSettings = z.infer<typeof PictureSettingsSchema>;

export function pictureSettings(settings: Record<string, unknown>): PictureSettings {
  const r = PictureSettingsSchema.safeParse(settings['pictureBook'] ?? {});
  return r.success ? r.data : {};
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});

/**
 * The {{story}} input: the owner's choices with the template's defaults (age range, art style, word limit). The gentle
 * problem goes as its own field, {{story.conflict}} (children.picture-book-story v3); left out when blank. The result
 * must pass the @volume/ai StorySettings schema (packages/ai/src/stages/inputs.ts).
 */
export function storyInput(settings: PictureSettings, template: Rec | null, bookIdea: string | null, spreadCount: number): Rec {
  const { conflict, ...own } = settings.story ?? {};
  const audience = rec(rec(template?.['audience'])['defaultAgeRange']);
  const spreads = rec(template?.['spreads']);
  const words = rec(rec(template?.['storyRules'])['wordLimit']);
  const age = typeof audience['min'] === 'number' && typeof audience['max'] === 'number' ? `${audience['min']} to ${audience['max']}` : undefined;
  const out: Rec = { ...own, spreadCount };
  if (!own.topic && bookIdea) out['topic'] = bookIdea;
  const problem = conflict?.trim().replace(/\.$/, '');
  if (problem) out['conflict'] = problem;
  if (!own.ageRange && age) out['ageRange'] = age;
  if (!own.artStyle && typeof spreads['artStyleDefault'] === 'string') out['artStyle'] = spreads['artStyleDefault'];
  if (!own.wordLimit && typeof words['default'] === 'number') out['wordLimit'] = words['default'];
  // The owner's switch is a boolean; the story stage takes text ({{story.goodnightMessage}}, "If on, add ..."), so it
  // goes as "on" or "off" (live acceptance run, 18 October 2026: a boolean failed every story call).
  out['goodnightMessage'] = own.goodnightMessage === true ? 'on' : 'off';
  return out;
}

/** Whether a matter page starts switched on: AI and code pages on, owner pages off, Also by and goodnight on request. */
export function matterStartsOn(x: BookStructure['front'][number], settings: PictureSettings): boolean {
  if (x.kind === 'also_by') return settings.story?.alsoBy === true;
  if (x.kind === 'goodnight_message') return settings.story?.goodnightMessage === true;
  return x.inType && x.writer !== 'owner';
}

export async function pictureStructure(configDir: string, book: Pick<Book, 'bookTypeId' | 'template'>): Promise<BookStructure> {
  return loadBookStructure(configDir, book.bookTypeId, book.template);
}

export function isPictureBook(structure: BookStructure): boolean {
  return structure.templateId === PICTURE_TEMPLATE_ID;
}

/** Refuses a book that is not a picture book (409). */
export async function requirePictureBook(repos: Repos, ctx: RequestCtx, configDir: string, bookId: string): Promise<{ book: Book; structure: BookStructure }> {
  const book = await repos.books.require(ctx, bookId);
  const structure = await pictureStructure(configDir, book);
  if (!isPictureBook(structure)) throw new AppError('invalid_state', 'This book is not a picture book. Pick a picture book type for it first.');
  return { book, structure };
}

/**
 * The spread count range from the picture-book template (spreads.count min and max in
 * config/book-templates/picture-book.json). A template without it falls back to a loose sanity range.
 */
export function spreadRange(template: Rec | null): { min: number; max: number } {
  const count = rec(rec(template?.['spreads'])['count']);
  const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);
  const min = int(count['min']) ?? 1;
  const max = int(count['max']) ?? 100;
  return { min, max: Math.max(min, max) };
}

/** Throws 400 validation_failed when `spreads` is outside the template's range. */
export function assertSpreadCount(template: Rec | null, spreads: number): void {
  const { min, max } = spreadRange(template);
  if (spreads < min || spreads > max) throw new AppError('validation_failed', `A picture book has ${min} to ${max} spreads.`, { min, max });
}

export function isLayout(v: unknown): v is SpreadLayout {
  return typeof v === 'string' && (SPREAD_LAYOUTS as readonly string[]).includes(v);
}

/** The book's spreads in order (switched-off spreads left out unless asked). */
export async function spreadSections(repos: Repos, ctx: RequestCtx, projectId: string, includeOff = false): Promise<Section[]> {
  const all = await repos.manuscript.listSections(ctx, projectId);
  return all.filter((s) => s.kind === SPREAD_KIND && (includeOff || s.enabled)).sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The page plan with the matter pages the book has switched on (rules paperback.trimAndPages.colour, print.bleed). */
export async function picturePlan(configDir: string, frontPages: number, backPages: number): Promise<{ rules: KdpRules; plan: PictureBookPlan }> {
  const rules = await loadNewestKdpRules(configDir);
  return { rules, plan: defaultPictureBookPlan(rules, parseTrimKey(PICTURE_TRIM), PICTURE_INK, { frontPages, backPages }) };
}

/** Printed pages: matter, a blank before spread 1 when needed, two pages per spread, a blank to make it even. */
export function pageCount(frontPages: number, spreads: number, backPages: number): number {
  const lead = spreads > 0 && frontPages % 2 === 0 ? frontPages + 1 : frontPages;
  const used = lead + spreads * 2 + backPages;
  return used % 2 === 1 ? used + 1 : used;
}

// ---------- views for the web builder ----------

export interface SpreadView {
  sectionId: string;
  n: number;
  text: string;
  /** Send back as baseVersionId when editing the text. */
  versionId: string | null;
  wordCount: number;
  layout: SpreadLayout;
  sceneSummary: string;
  imagePrompt: string | null;
  /** Character names shown in the picture. */
  characters: string[];
  imageAssetId: string | null;
  /** Same-origin download URL of the picture (inline), or null. */
  imageUrl: string | null;
  enabled: boolean;
  status: string;
  updatedAt: number;
}

export interface CharacterView {
  id: string;
  name: string;
  sheet: string;
  main: boolean;
  referencePrompt: string | null;
  referenceAssetId: string | null;
  referenceUrl: string | null;
}

export interface PictureJobView {
  id: string;
  kind: string;
  status: string;
  progress: number;
  error: string | null;
  errorCode: string | null;
}

export interface PictureBookView {
  bookId: string;
  trim: typeof PICTURE_TRIM;
  ink: typeof PICTURE_INK;
  /** Every PDF page: trim plus bleed (rule print.bleed). */
  pageSizeIn: { widthIn: number; heightIn: number };
  /** Printed pages with the matter switched on now and the spreads there are. */
  pageCount: number;
  plan: PictureBookPlan;
  story: Partial<PictureStoryInput>;
  title: string | null;
  newWord: string | null;
  styleLine: string | null;
  safety: { passed: boolean; notes: string[] } | null;
  spreads: SpreadView[];
  /** The latest picture_book run, or null. */
  job: PictureJobView | null;
}

export const assetUrl = (id: string | null): string | null => (id ? `/api/v1/assets/${id}/download?inline=1` : null);

export function spreadView(s: Section, bodyMd: string, versionId: string | null): SpreadView {
  return {
    sectionId: s.id,
    n: s.number ?? 0,
    text: bodyMd,
    versionId,
    wordCount: s.wordCount,
    layout: isLayout(s.layout) ? s.layout : 'text-left',
    sceneSummary: text(s.plan['sceneSummary']),
    imagePrompt: typeof s.plan['imagePrompt'] === 'string' ? s.plan['imagePrompt'] : null,
    characters: strings(s.plan['characters']),
    imageAssetId: s.imageAssetId,
    imageUrl: assetUrl(s.imageAssetId),
    enabled: s.enabled,
    status: s.status,
    updatedAt: s.updatedAt,
  };
}

export function characterView(c: PictureCharacter): CharacterView {
  return {
    id: c.id,
    name: c.name,
    sheet: c.sheet,
    main: c.main,
    referencePrompt: c.referencePrompt,
    referenceAssetId: c.referenceAssetId,
    referenceUrl: assetUrl(c.referenceAssetId),
  };
}

export async function loadSpreadView(repos: Repos, ctx: RequestCtx, s: Section): Promise<SpreadView> {
  const v = s.currentVersionId ? await repos.manuscript.getVersion(ctx, s.currentVersionId) : null;
  return spreadView(s, v?.bodyMd ?? '', v?.id ?? null);
}

export async function pictureBookView(repos: Repos, ctx: RequestCtx, configDir: string, book: Book, latestJob: Job | null): Promise<PictureBookView> {
  const all = await repos.manuscript.listSections(ctx, book.id);
  const on = all.filter((s) => s.enabled);
  const front = on.filter((s) => s.area === 'front').length;
  const back = on.filter((s) => s.area === 'back').length;
  const spreads = all.filter((s) => s.kind === SPREAD_KIND).sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  const { rules, plan } = await picturePlan(configDir, front, back);
  const settings = pictureSettings(book.settings);
  const result = settings.storyResult ?? {};
  const safety = z.object({ passed: z.boolean(), notes: z.array(z.string()).default([]) }).safeParse(result['safetyCheck']);
  const views: SpreadView[] = [];
  for (const s of spreads) views.push(await loadSpreadView(repos, ctx, s));
  return {
    bookId: book.id,
    trim: PICTURE_TRIM,
    ink: PICTURE_INK,
    pageSizeIn: bleedPageSizeIn(rules, parseTrimKey(PICTURE_TRIM)).value,
    pageCount: pageCount(front, spreads.filter((s) => s.enabled).length, back),
    plan,
    story: settings.story ?? {},
    title: book.title,
    newWord: typeof result['newWord'] === 'string' ? result['newWord'] : null,
    styleLine: settings.styleLine ?? null,
    safety: safety.success ? safety.data : null,
    spreads: views,
    job: latestJob
      ? {
          id: latestJob.id,
          kind: latestJob.kind,
          status: latestJob.status,
          progress: latestJob.progress,
          error: latestJob.error,
          errorCode: latestJob.errorCode,
        }
      : null,
  };
}
