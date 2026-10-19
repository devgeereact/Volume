// Input schemas for the stage runners. Inputs are nested objects; the context packer turns them into the
// prompt variables ({{profile.penName}}, {{chapter.title}} ...). Fields are optional in the type because
// prompts differ in what they need: the prompt renderer fails with MissingVariableError naming every
// variable a prompt needs and did not get. Pass null or '' for a value that is genuinely empty.

import { z } from 'zod';
import { ExercisePlan } from './outputs.ts';

const str = z.string();
const strs = z.array(z.string());
const opt = <T extends z.ZodType>(t: T) => t.nullable().optional();
const json = z.unknown();

/** Voice DNA: structured voice notes from the profile. A plain string is accepted too. */
export const VoiceDna = z.object({
  notes: opt(str),
  characteristics: opt(strs),
  /** Up to two "sounds like" samples are sent; trimming may drop to one. */
  soundsLike: opt(strs),
  /** One "does not sound like" sample. */
  notLike: opt(str),
  /** Active profile memory items. */
  memory: opt(strs),
});
export type VoiceDna = z.infer<typeof VoiceDna>;

export const ProfileInput = z.object({
  penName: opt(str),
  perspective: opt(str),
  credentials: opt(str),
  voice: opt(z.union([str, VoiceDna])),
  voiceSample: opt(str),
  isRealPerson: opt(z.boolean()),
  bio: opt(str),
  shortBio: opt(str),
  links: opt(z.union([str, strs])),
  brand: opt(z.union([str, z.record(z.string(), z.unknown())])),
  dedicationNames: opt(z.union([str, strs])),
  acknowledgementNames: opt(z.union([str, strs])),
  acceptedEdits: opt(z.union([str, strs])),
  /** Extra banned phrases from the profile, added to the house style list. */
  bannedPhrases: opt(strs),
  /** Where the author lives or works, as the profile states it. */
  location: opt(str),
  /**
   * True when the book's copyright page carries the "stories are illustrative" note. The writer then adds no
   * illustrative disclaimers of its own beyond one short label per composite story.
   */
  illustrativeLine: opt(z.boolean()),
  /** Sections where the body already restates the author's background from the bio ("Introduction"), or empty. */
  factsUsedIn: opt(str),
});
export type ProfileInput = z.infer<typeof ProfileInput>;

export const OwnerQuote = z.object({ text: str, attribution: str });

export const BookInput = z.object({
  idea: opt(str),
  /**
   * The author's brief for the book (the wizard's notes), word for word, sent as {{book.authorBrief}}. Titles and
   * blueprint prompts must follow it. A prompt that does not read it gets it folded into {{book.idea}} by the server.
   */
  authorBrief: opt(str),
  type: opt(str),
  variant: opt(str),
  genre: opt(str),
  title: opt(str),
  subtitle: opt(str),
  audience: opt(str),
  tone: opt(str),
  toneNotes: opt(str),
  wordTarget: opt(z.number()),
  wordCount: opt(z.number()),
  chapterCount: opt(z.number()),
  hookStyle: opt(str),
  takeaways: opt(z.boolean()),
  illustrativeStories: opt(z.boolean()),
  quotes: opt(z.union([str, z.array(OwnerQuote)])),
  format: opt(z.enum(['ebook', 'print'])),
  /** ISBNs the owner entered. Any other ISBN in an answer is blocked. */
  isbns: opt(strs),
  /** "yes" when the book type asks for every price to carry the month it was checked (tech how-to, travel). */
  datedPrices: opt(str),
  /** The month and year prices are checked in, from the book's write date, for example "October 2026". */
  checkedMonth: opt(str),
  /** The app's dated-prices check over the written chapters: a line starting "passed", "failed" or "not run". */
  pricesCheck: opt(str),
  /** Book template id (nonfiction, fiction, workbook, picture-book). Prompts that differ by template read it. */
  template: opt(str),
  /** Fiction: point of view for the book (first person or close third, with the main viewpoint character). */
  pov: opt(str),
  /** Fiction: tense of the narration (past by default). */
  tense: opt(str),
});
export type BookInput = z.infer<typeof BookInput>;

/** A research source the text may cite. Ids S1, S2... are assigned in order when missing. */
export const SourceInput = z.object({
  id: opt(str),
  title: str,
  url: str,
  snippet: opt(str),
});
export type SourceInput = z.infer<typeof SourceInput>;

export const ChapterSummaryInput = z.object({ number: z.number(), title: str, summary: str });
export const LedgerEntryInput = z.object({ kind: str, key: str, detail: opt(str) });

const ChapterInput = z.object({
  /** Section kind (chapter, introduction, glossary, review_request ...), so a check judges it on its own plan. */
  kind: opt(str),
  number: opt(z.number()),
  title: opt(str),
  partTitle: opt(str),
  subheadings: opt(strs),
  summary: opt(str),
  wordTarget: opt(z.number()),
  isLast: opt(z.boolean()),
  /** Fiction: the chapter's viewpoint character, setting and scene beats (blueprint.blueprint-fiction). */
  povCharacter: opt(str),
  setting: opt(str),
  scenes: opt(strs),
  /** Workbook: the planned exercises (blueprint.blueprint-workbook), sent as {{chapter.exercises}}. */
  exercises: opt(z.array(ExercisePlan)),
});

/** Fields shared by every stage input. */
const Base = z.object({
  profile: opt(ProfileInput),
  book: opt(BookInput),
  /** Approved blueprint JSON. */
  blueprint: opt(json),
  /** Book template rules (object or compact JSON string). */
  template: opt(json),
  /**
   * Fiction story bible (D-043). Read from blueprint.storyBible when left out, and sent as {{storyBible}}.
   */
  storyBible: opt(json),
  /** Output of research.title-research. */
  research: opt(json),
  /** Ticked research sources, sent as {{research.sources}}. */
  sources: opt(z.array(SourceInput)),
  previousSummaries: opt(z.array(ChapterSummaryInput)),
  ledger: opt(z.array(LedgerEntryInput)),
  cta: opt(str),
  /**
   * Words this call is expected to write (a front or back matter page, a summary). Used only for the cost
   * estimate when there is no chapter word target; never sent to the model.
   */
  expectedWords: opt(z.number()),
});

export const ResearchInput = Base;
export const TopicDirectionsInput = Base;
export const TitleOptionsInput = Base.extend({ direction: json });
export const BlueprintInput = Base.extend({ direction: opt(json) });
export const RegeneratePartInput = Base.extend({
  regenerate: z.object({ target: str, instruction: opt(str) }),
});
export const ChapterWriteInput = Base.extend({
  chapter: ChapterInput,
  nextChapter: opt(z.object({ title: opt(str), summary: opt(str) })),
});
/** The introduction and conclusion take their plan and word target as a chapter entry (v3 prompts). */
export const IntroductionInput = Base.extend({ chapter: opt(ChapterInput) });
export const ConclusionInput = Base.extend({ chapter: opt(ChapterInput) });
/** One "extend" pass on a section that came back under 85% of its word target. */
export const ExtendSectionInput = Base.extend({ text: str, chapter: ChapterInput, currentWords: z.number() });
export const FrontMatterInput = Base.extend({ sections: z.union([str, strs]) });
export const BackMatterInput = Base.extend({ sections: z.union([str, strs]), glossaryTerms: opt(z.union([str, strs])) });
export const RewriteSelectionInput = Base.extend({
  selection: z.object({ text: str, before: opt(str), after: opt(str) }),
  rewrite: z.object({
    mode: z.enum(['expand', 'shorten', 'rephrase', 'tone', 'custom']),
    instruction: opt(str),
    tone: opt(str),
    targetWords: opt(z.number()),
  }),
});
/** One sentence from the claims-to-verify report, with the text around it, for editing.claim-fix. */
export const ClaimFixInput = Base.extend({
  claim: z.object({
    sentence: str,
    category: str,
    checkNeeded: opt(str),
    before: opt(str),
    after: opt(str),
    /** The whole paragraph holding the sentence, and the sentences either side of it. */
    paragraph: opt(str),
    previousSentence: opt(str),
    nextSentence: opt(str),
    /** The chapter or section title, so the fix keeps its subject. */
    sectionTitle: opt(str),
  }),
  fix: z.object({ instruction: opt(str) }),
});
export const WeaveNoteInput = Base.extend({
  note: z.object({ text: str, intent: opt(str) }),
  weave: z.object({ before: opt(str), after: opt(str) }),
  chapter: opt(ChapterInput),
});
export const ClaimsInput = Base.extend({
  text: str,
  section: z.object({ id: str, title: str }),
  /** Code checker hits; computed from the house style guardrail patterns when left out. */
  patternHits: opt(str),
  mode: opt(z.enum(['standard', 'children'])),
});
export const ConsistencyInput = Base.extend({ text: str, chapter: ChapterInput });
export const SummariseInput = Base.extend({ text: str, chapter: ChapterInput });
export const StructuralInput = Base.extend({ text: str, scope: z.enum(['chapter', 'book']) });
export const LineEditInput = Base.extend({ text: str, keepLines: opt(z.union([str, strs])) });
export const VoiceInput = Base.extend({ text: str });
export const AmazonDescriptionInput = Base;
export const KeywordsCategoriesInput = Base.extend({ categoriesSeen: opt(z.union([str, strs])) });
export const BackCoverInput = Base.extend({ pageCount: opt(z.number()) });
export const CoverBriefInput = Base.extend({
  pageCount: opt(z.number()),
  cover: opt(
    z.object({
      ownerIdeas: opt(str),
      shelfNotes: opt(str),
      formats: opt(z.union([str, strs])),
      /** How many concepts to write (1 to 4, default 3). Each concept becomes one paid image. */
      conceptCount: opt(z.number().int().min(1).max(4)),
    }),
  ),
});
export const CoverImageInput = Base.extend({
  brief: json,
  concept: json,
  cover: z.object({ target: str, aspectRatio: str }),
});
/**
 * Marketing variety (marketing v6 prompts): the owner's instruction when one item is regenerated, and the openings of
 * items the book already has, sent as {{variety.instruction}} and {{variety.avoid}} so a new item does not repeat them.
 */
export const MarketingVariety = z.object({ instruction: opt(str), avoid: opt(strs) });
export const TiktokInput = Base.extend({ count: z.number(), lengthSeconds: z.number(), variety: opt(MarketingVariety) });
export const InstagramInput = Base.extend({ count: z.number(), variety: opt(MarketingVariety) });
export const LaunchEmailInput = Base.extend({
  description: str,
  launchDate: str,
  bookLink: str,
  kdpSelect: z.union([z.boolean(), str]),
  /** Built from KDP rule publish.goLiveTiming when left out. */
  goLiveNote: opt(str),
});
export const StorySettings = z.object({
  topic: opt(str),
  newWord: opt(str),
  ageRange: opt(str),
  characterCount: opt(z.number()),
  characterIdeas: opt(str),
  theme: opt(str),
  /** The gentle problem in the story (template storyRules.conflict): small, not scary, solved kindly. Sent as {{story.conflict}}. */
  conflict: opt(z.string().max(500)),
  wordLimit: opt(z.number()),
  spreadCount: opt(z.number()),
  goodnightMessage: opt(str),
  rhyme: opt(z.boolean()),
  artStyle: opt(str),
  includeSounds: opt(z.boolean()),
});
export const PictureBookStoryInput = Base.extend({ story: StorySettings });
export const ScenePromptsInput = Base.extend({
  story: StorySettings,
  /** The finished story JSON from children.picture-book-story, sent as {{story}}. */
  storyResult: json,
});
export const CharacterReferenceInput = Base.extend({
  story: StorySettings,
  /** The finished story JSON from children.picture-book-story, sent as {{story}}. */
  storyResult: json,
  /** The children.scene-prompts answer (character sheets and style line), sent as {{scenePrompts}}. */
  scenePrompts: json,
});
