import { getBookType, stageDefaults, type AuthorProfile, type BookType } from "../../demo";
import { kdpTrims } from "../../lib/kdpTrims";

/* Screen-local data and rules for the New book wizard. Book types, their categories, word ranges and
   defaults come from config/book-types.json; profile defaults from config/profiles/*.json (both
   through data/config.ts). Nothing here repeats those facts; it only decides which fields each kind of
   book asks for. */

/** Volume's own notes beside the trims (not KDP facts); other trims say whether KDP prices them as large. */
const WIZARD_TRIM_HINTS: Record<string, string> = {
  "5 x 8 in": "Pocket",
  "5.25 x 8 in": "Compact",
  "5.5 x 8.5 in": "Digest",
  "6 x 9 in": "Most common",
  "7 x 10 in": "Cookbooks and guides",
  "8.25 x 6 in": "Landscape",
  "8.5 x 8.5 in": "Square, picture books",
  "8.5 x 11 in": "Workbooks",
};

/** KDP paperback trim sizes from the newest config/kdp-rules file (rule paperback.trimSizes.list), in its order. */
export const trimSizes: { value: string; hint: string }[] = kdpTrims.map((t) => ({
  value: t.value,
  hint: WIZARD_TRIM_HINTS[t.value] ?? (t.large ? "Large trim" : "Regular trim"),
}));

export const exampleIdea =
  "A practical guide for night-shift nurses on sleeping, eating and recovering well, written from my own years of nights on an acute ward. Working title: Night Shift Survival.";

/** Example costs for the rest of the pipeline, used for the review estimate. Example prices only. */
export const pipelineExamples = {
  researchUsd: 0.31,
  titlesUsd: 0.04,
  blueprintUsd: 0.11,
  /** Matter, listing, checks and marketing on the default models. */
  restUsd: 0.6,
};

export const defaultModel = (stage: string, fallback: string) => stageDefaults.find((s) => s.stage === stage)?.defaultModel ?? fallback;
export const RESEARCH_DEFAULT = defaultModel("research", "~google/gemini-pro-latest");
export const WRITING_DEFAULT = defaultModel("writing", "~anthropic/claude-sonnet-latest");

/* ---------- Which fields a book type asks for ---------- */

export type FieldGroup = "story" | "young" | "exercises" | "pages" | "poems" | "takeaways";

const mysteryTypes = new Set(["thriller", "mystery-crime", "cosy-mystery"]);
const romanceTypes = new Set(["contemporary-romance", "historical-romance", "romantasy"]);

/** Story fields (POV, heat level, series) for adult and teen fiction; children's books get their own. */
export function fieldGroups(t: BookType): FieldGroup[] {
  const out: FieldGroup[] = [];
  if (t.category === "fiction") out.push("story");
  if (t.category === "childrens") out.push("young");
  if (t.templateFile === "workbook.json") out.push("exercises");
  if (t.templateFile === "journal.json") out.push("pages");
  if (t.templateFile === "poetry.json") out.push("poems");
  if (t.templateFile === "nonfiction.json" || t.templateFile === "reference.json") out.push("takeaways");
  return out;
}

export function usesClues(t: BookType): boolean {
  return mysteryTypes.has(t.id);
}

export function usesNewWord(t: BookType): boolean {
  return t.templateFile === "picture-book.json";
}

/** Picture books skip research, titles and the blueprint: the story stage writes the title, story and scenes. */
export function isPictureBook(t: BookType | undefined): boolean {
  return t?.templateFile === "picture-book.json";
}

/** When automatic writing reaches each template (docs/01-product/PRODUCT-SPEC.md phases). Null means it works now. */
export function writingArrives(t: BookType): string | null {
  if (t.templateFile === "nonfiction.json" || t.templateFile === "fiction.json" || t.templateFile === "workbook.json" || t.templateFile === "reference.json")
    return null;
  // Picture books (phase 7): the Writing step writes the story and paints every spread.
  if (t.templateFile === "picture-book.json") return null;
  return "a later phase";
}

/** Body unit with a capital, for labels ("Chapters", "Spreads", "Recipes"). */
export function unitLabel(t: BookType | undefined): string {
  const u = t?.structure.bodyUnit ?? "chapters";
  return u.charAt(0).toUpperCase() + u.slice(1);
}

/** Fiction narration tense (book settings `tense` on the server). */
export type Tense = "past" | "present";
export const tenseOptions: { value: Tense; label: string }[] = [
  { value: "past", label: "Past tense" },
  { value: "present", label: "Present tense" },
];

/** "Close third person, past tense" as a point of view and a tense. The tense defaults to past (fiction.json). */
export function splitPov(text: string): { pov: string; tense: Tense } {
  const tense: Tense = /\bpresent\b/i.test(text) ? "present" : "past";
  const pov = text.replace(/[,;]?\s*(in\s+)?(the\s+)?(past|present)\s+tense\.?/i, "").trim();
  return { pov, tense };
}

export const heatLabels: Record<string, string> = {
  none: "No romance",
  sweet: "Sweet",
  clean: "Clean",
  "warm, door closed": "Warm, door closed",
};

export const ageRanges = ["2 to 5", "3 to 7", "5 to 7", "6 to 9", "8 to 12", "13 to 18"];
export const exerciseStyles = ["Reflection", "Checklist", "Fill-in", "Tracker", "Scenario"];
export const pageTypes = ["Prompts", "Trackers", "Lined pages", "Checklists"];
export const poemForms = [
  { value: "free", label: "Free verse" },
  { value: "rhyming", label: "Rhyming" },
  { value: "mixed", label: "A mix" },
];

/* ---------- The draft ---------- */

export interface Draft {
  profileId: string | null;
  bookTypeId: string | null;
  idea: string;
  notes: string;
  audience: string;
  words: string;
  chapters: string;
  trim: string;
  paper: "white" | "cream";
  interiorTheme: string;
  coverStyle: string;
  takeaways: boolean;
  pov: string;
  tense: Tense;
  heat: string;
  inSeries: boolean;
  seriesName: string;
  seriesNumber: string;
  twistPlan: boolean;
  clueLedger: boolean;
  ageRange: string;
  newWord: boolean;
  newWordText: string;
  /** Picture books: the gentle problem in the story (template storyRules.conflict) and its one message. */
  problem: string;
  message: string;
  exercises: string[];
  pages: string[];
  poemForm: string;
  researchModel: string;
  writingModel: string;
}

export const emptyDraft: Draft = {
  profileId: null,
  bookTypeId: null,
  idea: "",
  notes: "",
  audience: "",
  words: "",
  chapters: "",
  trim: "6 x 9 in",
  paper: "cream",
  interiorTheme: "",
  coverStyle: "",
  takeaways: true,
  pov: "",
  tense: "past",
  heat: "none",
  inSeries: false,
  seriesName: "",
  seriesNumber: "1",
  twistPlan: false,
  clueLedger: false,
  ageRange: "3 to 7",
  newWord: false,
  newWordText: "",
  problem: "",
  message: "kindness",
  exercises: ["Reflection", "Checklist", "Fill-in", "Tracker"],
  pages: ["Prompts", "Lined pages"],
  poemForm: "free",
  researchModel: RESEARCH_DEFAULT,
  writingModel: WRITING_DEFAULT,
};

/** Fills every type-dependent field: the profile's own defaults when this is its default type, else the type's. */
export function applyType(d: Draft, t: BookType, p: AuthorProfile | undefined): Draft {
  const own = p?.publishing.defaultBookType === t.id ? p.publishing : null;
  const voice = p?.voice;
  const fiction = t.category === "fiction";
  return {
    ...d,
    bookTypeId: t.id,
    words: String(own?.defaultWordTarget ?? t.wordRange.default),
    chapters: String(t.chapterRange.default),
    trim: own?.defaultTrim ?? t.defaultTrim,
    paper: t.interior === "colour" ? "white" : "cream",
    interiorTheme: own?.defaultInteriorTheme ?? t.defaultInteriorTheme,
    coverStyle: own?.defaultCoverStyle ?? t.defaultCoverStyle,
    takeaways: t.templateFile === "nonfiction.json" || t.templateFile === "reference.json",
    ...splitPov(fiction && voice && p?.bookTypes.some((id) => getBookType(id)?.category === "fiction") ? voice.pov : fiction ? "Close third person" : ""),
    heat: voice?.heatLevel ?? (romanceTypes.has(t.id) ? "sweet" : "none"),
    inSeries: false,
    twistPlan: usesClues(t) ? (voice?.planning?.twistPlan ?? true) : false,
    clueLedger: usesClues(t) ? (voice?.planning?.clueLedger ?? true) : false,
    ageRange: voice?.audience ? `${voice.audience.ageMin} to ${voice.audience.ageMax}` : (t.genreRules.readerAge ?? "3 to 7"),
    newWord: usesNewWord(t) ? (voice?.newWordPerBook ?? true) : false,
  };
}

/** Choosing a profile fills its default book type and that type's settings, plus the profile's models. */
export function applyProfile(d: Draft, p: AuthorProfile): Draft {
  const base: Draft = {
    ...d,
    profileId: p.id,
    researchModel: p.models.research ?? RESEARCH_DEFAULT,
    writingModel: p.models.writing ?? WRITING_DEFAULT,
  };
  const t = getBookType(p.publishing.defaultBookType);
  return t ? applyType(base, t, p) : base;
}

export function parseNum(s: string): number {
  return Number(s.replace(/[^\d.]/g, ""));
}

/** "Working title: Night Shift Survival" in the idea, if the author gave one. */
export function workingTitle(idea: string): string | null {
  const m = /working title:\s*([^.\n]+)/i.exec(idea);
  return m?.[1]?.trim() || null;
}
