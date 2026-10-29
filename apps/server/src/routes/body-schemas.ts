import { z } from 'zod';
import { COVER_BLENDS, COVER_LAYER_LIMITS, COVER_SHAPE_KINDS, COVER_TEXTURES } from '@volume/core';
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

const Align = z.enum(['left', 'center', 'centre', 'right']);

/* Cover layers (packages/core cover-layers.ts). Kinds, blends, textures and limits come from core, so the studio,
   this check and the build agree. A picture is named by asset id; the route checks it belongs to the book. */
const L = COVER_LAYER_LIMITS;
const Pct = z.number().finite().min(0).max(100);
const Unit = z.number().finite().min(0).max(1);
const BoxX = z.number().finite().min(L.xMin).max(L.xMax);
const BoxY = z.number().finite().min(L.yMin).max(L.yMax);
const BoxSize = z.number().finite().min(L.sizeMin).max(L.sizeMax);
const Turn = z.number().finite().min(-180).max(180);
const AssetRef = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/)
  .nullable();
export const CoverBackgroundSchema = z
  .object({
    mode: z.enum(['solid', 'gradient', 'image']),
    span: z.enum(['wrap', 'front']).optional(),
    gradient: z
      .object({
        type: z.enum(['linear', 'radial']),
        from: Hex,
        to: Hex,
        angle: z.number().finite().min(0).max(360).optional(),
        centreX: Pct.optional(),
        centreY: Pct.optional(),
      })
      .strict()
      .optional(),
    image: z
      .object({
        // A project move sets an id it could not carry over to null; the cover then uses its colour.
        assetId: AssetRef.optional(),
        texture: z.enum(COVER_TEXTURES).optional(),
        opacity: Unit.optional(),
        blend: z.enum(COVER_BLENDS).optional(),
        scale: z.number().finite().min(L.scaleMin).max(L.scaleMax).optional(),
        focusX: Pct.optional(),
        focusY: Pct.optional(),
        blur: z.number().finite().min(0).max(L.blurMax).optional(),
        greyscale: z.boolean().optional(),
        tint: z
          .object({ colour: Hex, strength: z.number().finite().min(0).max(L.tintMax) })
          .strict()
          .optional(),
      })
      .strict()
      .refine((i) => !(i.assetId && i.texture), { message: 'Use a picture or a texture, not both.' })
      .optional(),
  })
  .strict();
export const CoverShapeSchema = z
  .object({
    id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,32}$/)
      .optional(),
    kind: z.enum(COVER_SHAPE_KINDS),
    surface: z.enum(['front', 'back']).optional(),
    x: BoxX,
    y: BoxY,
    w: BoxSize,
    h: BoxSize,
    rotation: Turn.optional(),
    colour: Hex,
    opacity: Unit.optional(),
    layer: z.enum(['behind', 'over']).optional(),
  })
  .strict();
export const CoverArtworkSchema = z
  .object({
    opacity: Unit.optional(),
    rotation: Turn.optional(),
    box: z.object({ x: BoxX, y: BoxY, w: BoxSize, h: BoxSize }).strict().nullable().optional(),
  })
  .strict();
export const CoverSpineSchema = z.object({ colour: Hex.optional(), textColour: Hex.optional(), showBackground: z.boolean().optional() }).strict();

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
    align: Align.optional(),
    titleAlign: Align.optional(),
    subtitleAlign: Align.optional(),
    authorAlign: Align.optional(),
    authorTopPct: z.number().finite().min(0).max(150).optional(),
    subtitleSize: z.number().finite().min(0.6).max(1.6).optional(),
    authorSize: z.number().finite().min(0.6).max(1.6).optional(),
    colours: Colours.optional(),
    palette: Colours.optional(),
    fonts: z
      .object({ title: text(100).optional(), subtitle: text(100).optional(), author: text(100).optional() })
      .strict()
      .optional(),
    titleUppercase: z.boolean().optional(),
    authorUppercase: z.boolean().optional(),
    background: CoverBackgroundSchema.optional(),
    artwork: CoverArtworkSchema.optional(),
    shapes: z.array(CoverShapeSchema).max(COVER_LAYER_LIMITS.shapes).optional(),
    spine: CoverSpineSchema.optional(),
    showBarcodeBox: z.boolean().optional(),
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
