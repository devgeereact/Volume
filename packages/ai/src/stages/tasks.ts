// The stage runner table: one entry per prompt id. The model stage comes from the prompt's front matter
// (for example checks.summarise-and-ledger runs on the `summarise` model).

import type { z } from 'zod';
import * as I from './inputs.ts';
import * as O from './outputs.ts';

/** How the guardrails run on the answer: full (patterns, links, markers, banned phrases), facts (no banned phrases), none. */
export type GuardrailMode = 'full' | 'facts' | 'none';

export interface TaskDef<In extends z.ZodType = z.ZodType, Out extends z.ZodType = z.ZodType> {
  promptId: string;
  /** Pipeline step the task belongs to, for the UI (the model stage comes from the prompt). */
  group: 'research' | 'titles' | 'blueprint' | 'writing' | 'checks' | 'editing' | 'matter' | 'cover' | 'marketing' | 'children';
  kind: 'json' | 'markdown';
  input: In;
  output: Out;
  guardrails: GuardrailMode;
  /**
   * Run the automatic style rewrite when banned phrases are found (default true for 'full' guardrails).
   * False for internal notes the reader never sees: banned phrases are then reported as warnings only.
   */
  styleRewrite?: boolean | undefined;
}

function def<In extends z.ZodType, Out extends z.ZodType>(d: TaskDef<In, Out>): TaskDef<In, Out> {
  return d;
}

export const TASKS = {
  'research.title-research': def({
    promptId: 'research.title-research',
    group: 'research',
    kind: 'json',
    input: I.ResearchInput,
    output: O.ResearchOutput,
    guardrails: 'full',
    styleRewrite: false,
  }),
  'titles.topic-directions': def({
    promptId: 'titles.topic-directions',
    group: 'titles',
    kind: 'json',
    input: I.TopicDirectionsInput,
    output: O.TopicDirectionsOutput,
    guardrails: 'full',
  }),
  'titles.title-options': def({
    promptId: 'titles.title-options',
    group: 'titles',
    kind: 'json',
    input: I.TitleOptionsInput,
    output: O.TitleOptionsOutput,
    guardrails: 'full',
  }),
  'blueprint.blueprint': def({
    promptId: 'blueprint.blueprint',
    group: 'blueprint',
    kind: 'json',
    input: I.BlueprintInput,
    output: O.BlueprintOutput,
    guardrails: 'full',
  }),
  'blueprint.regenerate-part': def({
    promptId: 'blueprint.regenerate-part',
    group: 'blueprint',
    kind: 'json',
    input: I.RegeneratePartInput,
    output: O.RegeneratePartOutput,
    guardrails: 'full',
  }),
  'writing.chapter': def({
    promptId: 'writing.chapter',
    group: 'writing',
    kind: 'markdown',
    input: I.ChapterWriteInput,
    output: O.MarkdownOutput,
    guardrails: 'full',
  }),
  'writing.introduction': def({
    promptId: 'writing.introduction',
    group: 'writing',
    kind: 'markdown',
    input: I.IntroductionInput,
    output: O.MarkdownOutput,
    guardrails: 'full',
  }),
  'writing.conclusion': def({
    promptId: 'writing.conclusion',
    group: 'writing',
    kind: 'markdown',
    input: I.ConclusionInput,
    output: O.MarkdownOutput,
    guardrails: 'full',
  }),
  'writing.extend-section': def({
    promptId: 'writing.extend-section',
    group: 'writing',
    kind: 'markdown',
    input: I.ExtendSectionInput,
    output: O.MarkdownOutput,
    guardrails: 'full',
  }),
  'writing.front-matter': def({
    promptId: 'writing.front-matter',
    group: 'writing',
    kind: 'json',
    input: I.FrontMatterInput,
    output: O.FrontMatterOutput,
    guardrails: 'full',
  }),
  'writing.back-matter': def({
    promptId: 'writing.back-matter',
    group: 'writing',
    kind: 'json',
    input: I.BackMatterInput,
    output: O.BackMatterOutput,
    guardrails: 'full',
  }),
  'writing.rewrite-selection': def({
    promptId: 'writing.rewrite-selection',
    group: 'writing',
    kind: 'json',
    input: I.RewriteSelectionInput,
    output: O.RewriteSelectionOutput,
    guardrails: 'full',
  }),
  'writing.weave-note': def({
    promptId: 'writing.weave-note',
    group: 'writing',
    kind: 'json',
    input: I.WeaveNoteInput,
    output: O.WeaveNoteOutput,
    guardrails: 'full',
  }),
  'writing.expand-note': def({
    promptId: 'writing.expand-note',
    group: 'writing',
    kind: 'json',
    input: I.WeaveNoteInput,
    output: O.ExpandNoteOutput,
    guardrails: 'full',
  }),
  'checks.claims': def({ promptId: 'checks.claims', group: 'checks', kind: 'json', input: I.ClaimsInput, output: O.ClaimsOutput, guardrails: 'none' }),
  'checks.consistency': def({
    promptId: 'checks.consistency',
    group: 'checks',
    kind: 'json',
    input: I.ConsistencyInput,
    output: O.ConsistencyOutput,
    guardrails: 'none',
  }),
  'checks.summarise-and-ledger': def({
    promptId: 'checks.summarise-and-ledger',
    group: 'checks',
    kind: 'json',
    input: I.SummariseInput,
    output: O.SummariseOutput,
    guardrails: 'none',
  }),
  'editing.structural': def({
    promptId: 'editing.structural',
    group: 'editing',
    kind: 'json',
    input: I.StructuralInput,
    output: O.StructuralOutput,
    guardrails: 'none',
  }),
  'editing.line-edit-uk': def({
    promptId: 'editing.line-edit-uk',
    group: 'editing',
    kind: 'json',
    input: I.LineEditInput,
    output: O.LineEditOutput,
    guardrails: 'full',
  }),
  'editing.voice': def({ promptId: 'editing.voice', group: 'editing', kind: 'json', input: I.VoiceInput, output: O.VoiceEditOutput, guardrails: 'full' }),
  'matter.amazon-description': def({
    promptId: 'matter.amazon-description',
    group: 'matter',
    kind: 'json',
    input: I.AmazonDescriptionInput,
    output: O.AmazonDescriptionOutput,
    guardrails: 'full',
  }),
  'matter.keywords-categories': def({
    promptId: 'matter.keywords-categories',
    group: 'matter',
    kind: 'json',
    input: I.KeywordsCategoriesInput,
    output: O.KeywordsCategoriesOutput,
    guardrails: 'full',
  }),
  'matter.back-cover': def({
    promptId: 'matter.back-cover',
    group: 'matter',
    kind: 'json',
    input: I.BackCoverInput,
    output: O.BackCoverOutput,
    guardrails: 'full',
  }),
  'cover.cover-brief': def({
    promptId: 'cover.cover-brief',
    group: 'cover',
    kind: 'json',
    input: I.CoverBriefInput,
    output: O.CoverBriefOutput,
    guardrails: 'facts',
  }),
  'cover.cover-image': def({
    promptId: 'cover.cover-image',
    group: 'cover',
    kind: 'json',
    input: I.CoverImageInput,
    output: O.CoverImageOutput,
    guardrails: 'facts',
  }),
  'marketing.tiktok-scripts': def({
    promptId: 'marketing.tiktok-scripts',
    group: 'marketing',
    kind: 'json',
    input: I.TiktokInput,
    output: O.TiktokOutput,
    guardrails: 'full',
  }),
  'marketing.instagram-captions': def({
    promptId: 'marketing.instagram-captions',
    group: 'marketing',
    kind: 'json',
    input: I.InstagramInput,
    output: O.InstagramOutput,
    guardrails: 'full',
  }),
  'marketing.launch-email': def({
    promptId: 'marketing.launch-email',
    group: 'marketing',
    kind: 'json',
    input: I.LaunchEmailInput,
    output: O.LaunchEmailOutput,
    guardrails: 'full',
  }),
  'children.picture-book-story': def({
    promptId: 'children.picture-book-story',
    group: 'children',
    kind: 'json',
    input: I.PictureBookStoryInput,
    output: O.PictureBookStoryOutput,
    guardrails: 'full',
  }),
  'children.scene-prompts': def({
    promptId: 'children.scene-prompts',
    group: 'children',
    kind: 'json',
    input: I.ScenePromptsInput,
    output: O.ScenePromptsOutput,
    guardrails: 'facts',
  }),
} as const;

export type TaskId = keyof typeof TASKS;
export type TaskInput<T extends TaskId> = z.input<(typeof TASKS)[T]['input']>;
export type TaskOutput<T extends TaskId> = z.output<(typeof TASKS)[T]['output']>;

export const TASK_IDS = Object.keys(TASKS) as TaskId[];

export function isTaskId(id: string): id is TaskId {
  return Object.prototype.hasOwnProperty.call(TASKS, id);
}
