// Output schemas for every prompt, taken from each prompt file's `output` front matter.
// They check shape and types only. Business rules (exact counts, character limits, banned words) are
// checked by packages/core after the call, so a near miss does not cost a repair request.

import { z } from 'zod';

const str = z.string();
const strs = z.array(z.string());
const nul = <T extends z.ZodType>(t: T) => t.nullable().optional();

export const ResearchOutput = z.object({
  ideaSummary: str,
  audience: z.object({ who: str, situation: str, alreadyTried: strs, wordsTheyUse: strs }),
  pains: z.array(z.object({ pain: str, evidence: z.union([str, strs]) })),
  desiredOutcomes: strs,
  angles: z.array(z.object({ angle: str, whyThisAuthor: str, evidence: strs })),
  competitorThemes: z.array(z.object({ theme: str, gapOrComplaint: str, evidence: strs })),
  keywordIdeas: z.array(z.object({ phrase: str, basis: str })),
  cautions: strs,
  /** title and url (title-research v2) label a cited page whose url_citation carries only a domain. */
  sourceNotes: z.array(z.object({ id: str, whatItSupports: str, title: nul(str), url: nul(str) })),
});

export const TopicDirectionsOutput = z.object({
  ideaAnalysis: str,
  directions: z.array(
    z.object({
      workingTitle: str,
      focus: str,
      whyItWorks: str,
      targetReaders: str,
      authorFit: str,
      evidence: strs,
      risk: str,
    }),
  ),
});

export const TitleOptionsOutput = z.object({
  genre: str,
  options: z.array(
    z.object({
      title: str,
      subtitle: str,
      full: str,
      formula: z.enum(['promise', 'intrigue', 'direct-label', 'metaphor', 'how-to']),
      why: str,
      keywordsUsed: strs,
      charCount: z.number(),
    }),
  ),
  topThree: z.array(z.number()),
  fastestToUnderstand: z.number(),
});

export const BlueprintChapter = z.object({
  number: z.number(),
  title: str,
  partNumber: nul(z.number()),
  promise: str,
  subheadings: strs,
  summary: str,
  openingHookIdea: str,
  storyIdeas: strs,
  keyTakeaways: strs,
  bridgeToNext: str,
  wordTarget: z.number(),
  sourceIds: strs,
});

export const BlueprintOutput = z.object({
  title: str,
  subtitle: str,
  summary: str,
  bookInfo: z.object({ genre: str, tone: str, writingStyle: str, targetAudience: str, estimatedWords: z.number() }),
  targetAudience: str,
  uniqueSellingPoints: strs,
  toneNotes: str,
  hookStyle: z.enum(['scene', 'question', 'imagine', 'quote', 'did-you-know']),
  frontMatter: z.object({
    halfTitle: z.boolean(),
    dedicationIdea: str,
    epigraph: str,
    foreword: str,
    preface: z.object({ include: z.boolean(), idea: str }),
    acknowledgementsIdea: str,
    introduction: z.object({ hook: str, outline: str, wordTarget: z.number() }),
  }),
  parts: z.array(z.object({ number: z.number(), title: str, purpose: str, chapterNumbers: z.array(z.number()) })),
  chapters: z.array(BlueprintChapter),
  backMatter: z.object({
    conclusion: z.object({ outline: str, wordTarget: z.number() }),
    appendixIdea: nul(str),
    glossaryTerms: strs,
    resourcesFromSources: strs,
    reviewRequest: z.boolean(),
    alsoBy: str,
    aboutTheAuthor: str,
  }),
  backCoverBlurb: str,
  amazonDescriptionDraft: str,
  categories: strs,
  keywords: strs,
  illustrativeStoriesLine: z.boolean(),
  claimsToWatch: strs,
});

// ---------- fiction and workbook blueprints (phase 6, D-042, D-043) ----------

/**
 * Exercise kinds of the workbook template. Same list as EXERCISE_KINDS in packages/core and
 * config/book-templates/workbook.json chapterRules.exercises.types (a test keeps them in step).
 */
export const EXERCISE_KINDS = ['reflection', 'checklist', 'fill-in', 'tracker', 'scenario'] as const;
export const ExerciseKind = z.enum(EXERCISE_KINDS);
export type ExerciseKind = z.infer<typeof ExerciseKind>;

/** One planned exercise in a workbook chapter (blueprint.blueprint-workbook), sent to the writer as {{chapter.exercises}}. */
export const ExercisePlan = z.object({
  kind: ExerciseKind,
  title: str,
  /** What the reader does and why, in one or two sentences. */
  purpose: str,
  /** Ruled writing lines for reflection and scenario answers; null for other kinds. */
  lines: nul(z.number().int()),
});
export type ExercisePlan = z.infer<typeof ExercisePlan>;

/** The fiction story bible (D-043), carried in the blueprint data as `storyBible`. */
export const StoryBible = z.object({
  logline: str,
  themes: strs,
  characters: z.array(
    z.object({
      name: str,
      role: str,
      want: str,
      need: str,
      flaw: str,
      voiceNotes: str,
      appearance: str,
    }),
  ),
  settings: z.array(z.object({ name: str, description: str })),
  /** Story events in order, one line each. */
  timeline: strs,
  worldRules: strs,
  povPlan: str,
  ending: str,
});
export type StoryBible = z.infer<typeof StoryBible>;

/** Opening hook styles of the fiction template (config/book-templates/fiction.json chapterRules.openingHook). */
export const FICTION_HOOK_STYLES = ['in-scene', 'dialogue', 'image', 'question'] as const;

export const BlueprintFictionChapter = z.object({
  number: z.number(),
  title: str,
  partNumber: nul(z.number()),
  /** Whose point of view the chapter is told from (a name from storyBible.characters). */
  povCharacter: str,
  /** Main setting (a name from storyBible.settings). */
  setting: str,
  summary: str,
  /** Scene beats in order, one line each; each scene after the first starts after a scene break. */
  scenes: strs,
  openingHookIdea: str,
  bridgeToNext: str,
  wordTarget: z.number(),
});

/** blueprint.blueprint-fiction v1: the blueprint for the fiction template, with the story bible and no subheadings or takeaways. */
export const BlueprintFictionOutput = z.object({
  title: str,
  subtitle: str,
  /** Full synopsis including the ending (the template's Synopsis package item, never printed). */
  summary: str,
  bookInfo: z.object({ genre: str, tone: str, writingStyle: str, targetAudience: str, estimatedWords: z.number() }),
  targetAudience: str,
  uniqueSellingPoints: strs,
  toneNotes: str,
  hookStyle: z.enum(FICTION_HOOK_STYLES),
  storyBible: StoryBible,
  frontMatter: z.object({
    halfTitle: z.boolean(),
    dedicationIdea: str,
    epigraph: str,
    acknowledgementsIdea: str,
    prologue: z.object({ include: z.boolean(), idea: str, wordTarget: z.number() }),
  }),
  parts: z.array(z.object({ number: z.number(), title: str, purpose: str, chapterNumbers: z.array(z.number()) })),
  chapters: z.array(BlueprintFictionChapter),
  backMatter: z.object({
    epilogue: z.object({ include: z.boolean(), outline: str, wordTarget: z.number() }),
    glossaryTerms: strs,
    reviewRequest: z.boolean(),
    alsoBy: str,
    aboutTheAuthor: str,
  }),
  backCoverBlurb: str,
  amazonDescriptionDraft: str,
  categories: strs,
  keywords: strs,
  claimsToWatch: strs,
});

/** blueprint.blueprint-workbook v1: the non-fiction blueprint plus 2 to 4 planned exercises per chapter. */
export const BlueprintWorkbookOutput = BlueprintOutput.extend({
  chapters: z.array(BlueprintChapter.extend({ exercises: z.array(ExercisePlan) })),
});

export const RegeneratePartOutput = z.object({
  target: str,
  value: z.unknown(),
  changeNote: str,
  knockOnEffects: strs,
});

export const MarkdownOutput = z.string().min(1);

export const FrontMatterOutput = z.object({
  dedication: str.optional(),
  preface: str.optional(),
  acknowledgements: str.optional(),
  howToUse: str.optional(),
  namesUsed: strs,
  notesForOwner: strs,
});

export const BackMatterOutput = z.object({
  reviewRequest: str.optional(),
  appendix: str.optional(),
  glossary: z.array(z.object({ term: str, definition: str })).optional(),
  resources: z.array(z.object({ sourceId: str, name: str, description: str })).optional(),
  notesForOwner: strs,
});

export const RewriteSelectionOutput = z.object({ text: str, changeNote: str, newClaims: strs });

export const WeaveNoteOutput = z.object({
  text: str,
  keptPhrases: strs,
  changeNote: str,
  newClaims: strs,
  questionsForAuthor: strs,
});

export const ExpandNoteOutput = z.object({
  heading: str,
  text: str,
  keptPhrases: strs,
  changeNote: str,
  newClaims: strs,
  questionsForAuthor: strs,
});

export const ClaimsOutput = z.object({
  claims: z.array(
    z.object({
      quote: str,
      type: z.enum([
        'statistic',
        'study-or-research',
        'quote-attribution',
        'medical-clinical',
        'legal',
        'safety',
        'financial',
        'product-or-brand',
        'instruction',
        'real-person',
        'award-or-praise',
        'isbn',
        'children-safety',
        'personal',
        /** A named firm, product or person given a regulatory or safety status (claims v3): blocks until verified. */
        'named-entity-regulatory',
      ]),
      risk: z.enum(['high', 'medium', 'low']),
      harmIfWrong: z.boolean(),
      sourceMarker: nul(str),
      sourceSupports: z.enum(['yes', 'partly', 'no', 'no-marker']),
      check: str,
      suggestion: z.enum(['verify', 'soften', 'remove', 'add-source']),
      softerVersion: nul(str),
    }),
  ),
});

export const ConsistencyOutput = z.object({
  promiseKept: z.enum(['yes', 'partly', 'no']),
  promiseNote: str,
  subheadingsMatch: z.boolean(),
  subheadingIssues: strs,
  issues: z.array(
    z.object({
      type: str,
      quote: str,
      detail: str,
      severity: z.enum(['must-fix', 'should-fix', 'optional']),
      fix: str,
    }),
  ),
  rewriteNeeded: z.boolean(),
  /** References to scenes, conversations or details no earlier summary or ledger entry holds (consistency v2). */
  unknownReferences: z.array(z.object({ quote: str, reference: str, detail: str })).optional(),
});

export const SummariseOutput = z.object({
  summary: str,
  keyPoints: strs,
  closingLine: str,
  ledgerAdditions: z.object({
    stories: z.array(z.object({ label: str, oneLine: str, illustrative: z.boolean() })),
    examples: strs,
    metaphors: strs,
    quotes: strs,
    factsWithSources: z.array(z.object({ fact: str, sourceMarker: str })),
    names: z.array(z.object({ name: str, role: str })),
    terms: z.array(z.object({ term: str, explainedAs: str })),
    phrasesOverused: strs,
    /** Warnings, cautions and disclaimers already given to the reader (summarise-and-ledger v2). */
    warnings: strs.optional(),
    /** Fiction only (summarise-and-ledger v5): characters on the page, ledger kind `character` (D-043). */
    characters: z.array(z.object({ name: str, role: str, details: str })).optional(),
    /** Fiction only (summarise-and-ledger v5): settings on the page, ledger kind `setting` (D-043). */
    settings: z.array(z.object({ name: str, details: str })).optional(),
  }),
  storiesForOwnerReview: z.array(z.object({ quote: str, why: str })),
});

export const StructuralOutput = z.object({
  scope: z.enum(['chapter', 'book']),
  problems: z.array(
    z.object({
      kind: str,
      where: str,
      quote: nul(str),
      detail: str,
      priority: z.enum(['must-fix', 'should-fix', 'optional']),
      suggestedChange: str,
    }),
  ),
  summary: str,
});

export const LineEditOutput = z.object({
  edited: str,
  changes: z.array(z.object({ before: str, after: str, why: str, kind: str })),
  otherChangesByKind: z.record(z.string(), z.number()),
  unchangedOnPurpose: strs,
});

export const VoiceEditOutput = z.object({
  edited: str,
  oddSentences: z.array(z.object({ before: str, plainer: str })),
  voiceNotesLearned: strs,
});

export const AmazonDescriptionOutput = z.object({ html: str, plainText: str, charCount: z.number(), notes: strs });

export const KeywordsCategoriesOutput = z.object({
  candidates: z.array(z.object({ phrase: str, basis: str })),
  keywords: strs,
  keywordReasons: strs,
  categories: z.array(z.object({ path: str, why: str, fromOwnerList: z.boolean() })),
  reminders: strs,
});

export const BackCoverOutput = z.object({
  blurb: z.object({ headline: str, body: str }),
  shortBio: z.object({
    text: str,
    source: z.enum(['profile.shortBio', 'condensed-from-bio']),
    needsOwnerApproval: z.boolean(),
  }),
  spineText: z.object({ allowed: z.boolean(), title: nul(str), author: nul(str), reason: str }),
  notes: strs,
});

export const CoverBriefOutput = z.object({
  brief: z.object({
    categorySignal: str,
    mood: str,
    palette: z.array(z.object({ name: str, hex: str, role: str })),
    typography: z.object({ titleStyle: str, subtitleStyle: str, authorStyle: str, hierarchy: strs }),
    textSafeArea: str,
    avoid: strs,
    backCover: nul(z.object({ layout: str, barcodeAreaNote: str })),
    spineText: nul(z.object({ allowed: z.boolean(), reason: str })),
  }),
  concepts: z.array(z.object({ name: str, idea: str, composition: str, focalImage: str, symbolism: str, whyItFits: str })),
});

export const CoverImageOutput = z.object({ imagePrompt: str, negativeNotes: strs, aspectRatio: str });

export const TiktokOutput = z.object({
  scripts: z.array(
    z.object({
      title: str,
      angle: str,
      hooks: strs,
      onScreenTextHook: str,
      beats: z.array(z.object({ second: str, say: str, show: str })),
      cta: str,
      caption: str,
      hashtags: strs,
      needs: strs,
    }),
  ),
});

export const InstagramOutput = z.object({
  captions: z.array(
    z.object({
      postType: z.enum(['single-image', 'carousel', 'reel-caption']),
      angle: str,
      firstLine: str,
      body: str,
      cta: str,
      hashtags: strs,
      imageIdea: str,
      carouselSlides: nul(strs),
      needs: strs,
    }),
  ),
});

export const LaunchEmailOutput = z.object({
  subjectLines: strs,
  previewText: str,
  body: str,
  advanceReaderNote: str,
  needs: strs,
});

export const PictureBookStoryOutput = z.object({
  title: str,
  newWord: str,
  newWordMeaning: str,
  ageRange: str,
  emotions: strs,
  message: str,
  characters: z.array(z.object({ name: str, kind: str, look: str, personality: strs, voice: str })),
  setting: str,
  spreads: z.array(z.object({ n: z.number(), text: str, sceneSummary: str })),
  goodnightMessage: nul(str),
  cta: nul(str),
  wordCount: z.number(),
  safetyCheck: z.object({ passed: z.boolean(), notes: strs }),
});

/**
 * Where the text sits on a spread: the picture keeps that side calm and empty. Same values as `Spread.layout`
 * in packages/core (plan PHASES-6-8, P7-2).
 */
export const SPREAD_LAYOUTS = ['text-left', 'text-right', 'text-top', 'text-bottom'] as const;
export const SpreadLayout = z.enum(SPREAD_LAYOUTS);
export type SpreadLayout = z.infer<typeof SpreadLayout>;

/** children.scene-prompts v3: v2's fields plus layout, the empty text area and the characters in each scene. */
export const ScenePromptsOutput = z.object({
  characterSheets: z.array(z.object({ name: str, prompt: str })),
  styleLine: str,
  scenes: z.array(
    z.object({
      spread: z.number(),
      imagePrompt: str,
      /** Which side of the 2:1 picture stays calm for the text. */
      layout: SpreadLayout,
      /** The calm, empty area left for the text, in words (for example "soft sky across the left page"). */
      textArea: str,
      /** Names from characterSheets that appear, so the app sends only their reference images. */
      characters: strs,
      cameraAngle: str,
      lighting: str,
      characterPositions: str,
      backgroundSounds: nul(strs),
    }),
  ),
  cover: z.object({ imagePrompt: str, titleSpace: str }),
});

/** children.character-reference v1: one neutral full-body reference image prompt per main character (D-045). */
export const CharacterReferenceOutput = z.object({
  references: z.array(z.object({ name: str, imagePrompt: str })),
});
