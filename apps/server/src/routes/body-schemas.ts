import { z } from 'zod';
import { ExercisePlanSchema, StoryBibleSchema } from '../ports/ai.js';

/**
 * Typed request bodies for the cover brief, cover typography and blueprint edits (D-050), in place of loose
 * records. They match what the web app sends (apps/web/src/features/cover/ApiCover.tsx, features/blueprint).
 *
 * - Typography is `.strict()`: the web builds it fresh, so an unknown key is refused (400).
 * - The cover brief is typed field by field and unknown keys are dropped: the web echoes back what the server
 *   stored, and AI-written briefs may hold extra keys, so refusing them would block the owner's own saves.
 * - Blueprint parts and chapters type the known fields and keep any other key as bounded JSON, so an edit or a
 *   restore of a stored version never loses keys the planner wrote (promise, opening_hook, story_ideas,
 *   source_ids and any future ones). Limits are generous enough for any stored AI blueprint.
 */

const text = (max: number) => z.string().max(max);
const lines = (max: number, each = 500) => z.array(text(each)).max(max);

/** A bounded JSON value (front and back matter plans): depth 4, 200 items per list, 100 keys per object. */
const JsonLeaf = z.union([z.string().max(20000), z.number().finite(), z.boolean(), z.null()]);
function boundedJson(depth: number): z.ZodType<unknown> {
  if (depth === 0) return JsonLeaf;
  const inner = boundedJson(depth - 1);
  return z.union([
    JsonLeaf,
    z.array(inner).max(200),
    z.record(z.string().max(64), inner).refine((o) => Object.keys(o).length <= 100, { message: 'Too many keys.' }),
  ]);
}
const MatterSchema = z.record(z.string().max(64), boundedJson(4)).refine((o) => Object.keys(o).length <= 60, { message: 'Too many sections.' });

export const CoverConceptPlanSchema = z.object({ name: text(200), image_prompt: text(4000), why: text(2000).default('') });

/** PUT /books/:id/cover/brief { brief }. */
export const CoverBriefSchema = z.object({
  genre: z.union([text(200), lines(20, 200)]).optional(),
  mood: z.union([text(1000), lines(20, 200)]).optional(),
  audience: text(2000).optional(),
  palette: lines(20, 100).optional(),
  composition: text(2000).optional(),
  use: lines(30, 300).optional(),
  avoid: lines(30, 300).optional(),
  concepts: z.array(CoverConceptPlanSchema).max(8).optional(),
});

const Hex = z.string().regex(/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/);
const Colours = z.record(z.string().max(32), Hex).refine((o) => Object.keys(o).length <= 12, { message: 'Too many colours.' });

/** POST /books/:id/cover/choose { assetId, typography? }: the keys applyCoverTypography (packages/export) reads. */
export const CoverTypographySchema = z
  .object({
    styleId: text(64).nullable().optional(),
    paletteId: text(64).nullable().optional(),
    showSubtitle: z.boolean().optional(),
    titlePosition: z.enum(['top', 'middle', 'bottom']).optional(),
    titleTopPct: z.number().finite().min(0).max(150).optional(),
    subtitleTopPct: z.number().finite().min(0).max(150).optional(),
    titleSize: z.union([z.enum(['small', 'medium', 'large']), z.number().finite().min(0).max(1000)]).optional(),
    sizePct: z.number().finite().min(1).max(1000).optional(),
    align: z.enum(['left', 'center', 'centre']).optional(),
    colours: Colours.optional(),
    palette: Colours.optional(),
    fonts: z
      .object({ title: text(100).optional(), subtitle: text(100).optional(), author: text(100).optional() })
      .strict()
      .optional(),
    titleUppercase: z.boolean().optional(),
    authorUppercase: z.boolean().optional(),
  })
  .strict();

const ChapterPatchSchema = z
  .object({
    number: z.number().int().min(0).max(1000),
    title: text(500),
    part: z.number().int().min(0).max(1000).nullable().optional(),
    subheadings: lines(100, 500).optional(),
    summary: text(20000).optional(),
    word_target: z.number().int().positive().max(200000).optional(),
    key_points: lines(100, 2000).optional(),
    takeaways: z.boolean().optional(),
    bridge_note: text(5000).optional(),
    exercises: z.array(ExercisePlanSchema).max(20).optional(),
    povCharacter: text(500).optional(),
    setting: text(2000).optional(),
    scenes: lines(100, 4000).optional(),
    // Nonfiction plan fields from the planner (adapters/openrouter-ai.ts chapterOut).
    promise: text(5000).optional(),
    opening_hook: text(5000).optional(),
    story_ideas: lines(50, 2000).optional(),
    source_ids: lines(200, 64).optional(),
  })
  .catchall(boundedJson(3))
  .refine((o) => Object.keys(o).length <= 60, { message: 'Too many keys in a chapter.' });

/** PATCH /books/:id/blueprint { parts }: top-level blueprint keys to replace. The merged result is checked again. */
export const BlueprintPartsSchema = z
  .object({
    title: text(500).optional(),
    subtitle: text(500).optional(),
    summary: text(20000).optional(),
    audience: text(5000).optional(),
    usps: lines(50, 2000).optional(),
    tone_notes: text(5000).optional(),
    hook_style: text(100).optional(),
    parts: z
      .array(z.object({ number: z.number().int().min(0).max(1000), title: text(500) }))
      .max(50)
      .optional(),
    chapters: z.array(ChapterPatchSchema).max(300).optional(),
    front: MatterSchema.optional(),
    back: MatterSchema.optional(),
    back_blurb: text(5000).optional(),
    description_draft: text(10000).optional(),
    categories: lines(30, 500).optional(),
    keywords: lines(30, 500).optional(),
    storyBible: StoryBibleSchema.optional(),
  })
  .catchall(boundedJson(4))
  .refine((o) => Object.keys(o).length <= 60, { message: 'Too many blueprint parts.' });
