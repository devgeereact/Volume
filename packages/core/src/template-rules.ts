// Template-specific checks (phase 6, D-042): code checks for the chapter rules in config/book-templates/*.json
// that were only asked of the model before. Fiction: no subheadings, no takeaways. Workbook: exercises per
// chapter and ruled-line counts. Any template: workbook blocks where the template has no exercises, and
// malformed workbook fences that fell back to callouts.

import { z } from 'zod';
import type { Block, BookDoc, ContentsEntries, Section } from './model.ts';
import { CONTENTS_ENTRIES, LINES_RANGE } from './model.ts';

const rangeSchema = z.object({
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(0).optional(),
});

/** The subset of a template's `chapterRules` the checks read. Unknown keys are dropped. */
export const templateRulesSchema = z.object({
  subheadings: rangeSchema.optional(),
  takeaways: z.object({ enabled: z.boolean() }).optional(),
  sceneBreaks: z.object({ enabled: z.boolean() }).optional(),
  exercises: z
    .object({
      perChapter: rangeSchema.optional(),
      types: z.array(z.string()).optional(),
    })
    .optional(),
});
export type TemplateRules = z.infer<typeof templateRulesSchema>;

export type TemplateFindingCode = 'fiction.subheading' | 'fiction.takeaways' | 'workbook.exercise-count' | 'workbook.lines-range' | 'template.unknown-block';

export interface TemplateFinding {
  code: TemplateFindingCode;
  severity: 'warn' | 'block';
  message: string;
  /** Index of the top-level block the finding points at, when there is one. */
  blockIndex?: number;
}

export interface BookTemplateFinding extends TemplateFinding {
  sectionId: string;
}

/** Parse `template.chapterRules` from a loaded template file. Throws a ZodError when a known field has the wrong type. */
export function templateRulesFromTemplate(template: unknown): TemplateRules {
  const chapterRules = typeof template === 'object' && template !== null ? (template as Record<string, unknown>)['chapterRules'] : undefined;
  return templateRulesSchema.parse(chapterRules ?? {});
}

/**
 * What a template's contents section lists (`entries` on the section with id `contents`): `chapters` (chapters and
 * parts only) or `all` (default, also when the template has no contents section).
 */
export function contentsEntriesFromTemplate(template: unknown): ContentsEntries {
  const sections = typeof template === 'object' && template !== null ? (template as Record<string, unknown>)['sections'] : undefined;
  const contents = Array.isArray(sections)
    ? sections.find((x): x is Record<string, unknown> => typeof x === 'object' && x !== null && (x as Record<string, unknown>)['id'] === 'contents')
    : undefined;
  const entries = contents?.['entries'];
  return (CONTENTS_ENTRIES as readonly unknown[]).includes(entries) ? (entries as ContentsEntries) : 'all';
}

/** Visit every block, nested exercise blocks included. `top` is the index of the enclosing top-level block. */
export function walkBlocks(blocks: Block[], visit: (b: Block, top: number) => void): void {
  blocks.forEach((b, top) => {
    const go = (x: Block) => {
      visit(x, top);
      if (x.type === 'exercise') x.blocks.forEach(go);
    };
    go(b);
  });
}

const WORKBOOK_BLOCKS = new Set<Block['type']>(['exercise', 'lines', 'checklist', 'fillIn']);
/** Callout names that look like a workbook fence the parser could not read (no kind, bad count). */
const MALFORMED_FENCE = /^(exercise|lines|fill-in|checklist)\b/i;
const TAKEAWAYS_HEADING = /^key takeaways$/i;

function label(s: Section): string {
  return s.kicker ? (s.title ? `${s.kicker} (${s.title})` : s.kicker) : s.title || s.id;
}

/**
 * Check one section against the template rules. Chapter rules (subheadings, takeaways, exercise count)
 * apply to chapters only; block checks apply to every section.
 */
export function checkTemplateRules(section: Section, rules: TemplateRules): TemplateFinding[] {
  const out: TemplateFinding[] = [];
  const name = label(section);
  const hasExercises = rules.exercises !== undefined;
  const types = rules.exercises?.types;

  walkBlocks(section.blocks, (b, top) => {
    if (!hasExercises && WORKBOOK_BLOCKS.has(b.type)) {
      out.push({
        code: 'template.unknown-block',
        severity: 'warn',
        message: `${name}: a ${b.type} block is not part of this template.`,
        blockIndex: top,
      });
    }
    if (b.type === 'callout' && MALFORMED_FENCE.test(b.variant.trim())) {
      out.push({
        code: 'template.unknown-block',
        severity: 'warn',
        message: `${name}: "::: ${b.variant}" is not a valid block. Use "::: exercise <kind> [title]", "::: lines N" or "::: fill-in".`,
        blockIndex: top,
      });
    }
    if (hasExercises && b.type === 'exercise' && types && !types.includes(b.kind)) {
      out.push({
        code: 'template.unknown-block',
        severity: 'warn',
        message: `${name}: exercise kind "${b.kind}" is not one of this template's types (${types.join(', ')}).`,
        blockIndex: top,
      });
    }
    if (b.type === 'lines' && (b.count < LINES_RANGE.min || b.count > LINES_RANGE.max)) {
      out.push({
        code: 'workbook.lines-range',
        severity: 'warn',
        message: `${name}: "::: lines ${b.count}" is outside ${LINES_RANGE.min} to ${LINES_RANGE.max}; exports clamp it.`,
        blockIndex: top,
      });
    }
  });

  if (section.kind !== 'chapter') return out;

  if (rules.subheadings?.max === 0) {
    const subs = section.blocks.flatMap((b, k) => ((b.type === 'heading2' || b.type === 'heading3') && !TAKEAWAYS_HEADING.test(b.text.trim()) ? [k] : []));
    if (subs.length)
      out.push({
        code: 'fiction.subheading',
        severity: 'block',
        message: `${name} has ${subs.length} subheading${subs.length === 1 ? '' : 's'}; this template allows none. Use a scene break instead.`,
        blockIndex: subs[0] ?? -1,
      });
  }

  if (rules.takeaways?.enabled === false) {
    const k = section.blocks.findIndex(
      (b) => b.type === 'takeaways' || ((b.type === 'heading2' || b.type === 'heading3') && TAKEAWAYS_HEADING.test(b.text.trim())),
    );
    if (k >= 0)
      out.push({
        code: 'fiction.takeaways',
        severity: 'block',
        message: `${name} has a Key Takeaways block; this template has takeaways switched off.`,
        blockIndex: k,
      });
  }

  const per = rules.exercises?.perChapter;
  if (per) {
    const n = section.blocks.filter((b) => b.type === 'exercise').length;
    const range = `${per.min ?? 0} to ${per.max ?? 'any'}`;
    if (n === 0 && (per.min ?? 0) > 0) {
      out.push({ code: 'workbook.exercise-count', severity: 'block', message: `${name} has no exercises; this template asks for ${range} per chapter.` });
    } else if ((per.min !== undefined && n < per.min) || (per.max !== undefined && n > per.max)) {
      out.push({ code: 'workbook.exercise-count', severity: 'warn', message: `${name} has ${n} exercises; this template asks for ${range} per chapter.` });
    }
  }
  return out;
}

/** checkTemplateRules for every enabled section of a book, with the section id on each finding. */
export function checkBookTemplateRules(book: BookDoc, rules: TemplateRules): BookTemplateFinding[] {
  return book.sections.filter((s) => s.enabled !== false).flatMap((s) => checkTemplateRules(s, rules).map((f) => ({ ...f, sectionId: s.id })));
}
