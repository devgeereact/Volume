import { coverFromStyle } from "./covers";
import type { ActivityEvent, Book, BookStepId, StageId, StepState } from "./types";

/* Thirteen demo books across the five profiles (config/profiles). The first eight ids are the design
   board's books; Sourdough and Windowsill Herbs are the demo books that ship with Volume (marked isDemo).
   "Today" in the demo is Sunday 4 October 2026. Every book has its own interior theme
   (config/interior-themes.json) and cover style (config/cover-styles.json), so no two look alike. Covers
   are typographic, built by coverFromStyle; their colours are book content, not interface tokens. */

export const DEMO_NOW = "2026-10-04T14:40:00+01:00";

export const stageOrder: StageId[] = ["idea", "research", "title", "blueprint", "writing", "editing", "cover", "export", "published"];

export const stageLabels: Record<StageId, string> = {
  idea: "Idea",
  research: "Research",
  title: "Title",
  blueprint: "Blueprint",
  writing: "Writing",
  editing: "Editing",
  cover: "Cover",
  export: "Export",
  published: "Published",
};

/** The eight Library pipeline columns (Idea to Published; titles sit inside Research on the board). */
export const libraryColumns: StageId[] = ["idea", "research", "blueprint", "writing", "editing", "cover", "export", "published"];

export const bookSteps: { id: BookStepId; label: string }[] = [
  { id: "research", label: "Research" },
  { id: "titles", label: "Titles" },
  { id: "blueprint", label: "Blueprint" },
  { id: "writing", label: "Writing" },
  { id: "editor", label: "Editor" },
  { id: "cover", label: "Cover" },
  { id: "export", label: "Export" },
  { id: "marketing", label: "Marketing" },
];

export const books: Book[] = [
  {
    id: "milo-and-the-moon-kite",
    title: "Milo and the Moon Kite",
    subtitle: "",
    penNameId: "tobi-rhymes",
    template: "picture-book",
    bookTypeId: "picture-book",
    interiorThemeId: "childrens-large-type",
    coverStyleId: "picture-bright",
    stage: "idea",
    statusLine: "Idea saved 2 October",
    words: { written: 0, target: 600 },
    cost: { spent: 0, budget: 5 },
    trim: "8.5 x 8.5 in",
    createdAt: "2026-10-02T19:12:00+01:00",
    updatedAt: "2026-10-02T19:12:00+01:00",
    cover: null,
    attentionSteps: [],
    isDemo: false,
    archived: false,
    series: null,
    published: null,
  },
  {
    id: "night-shift-survival",
    title: "Night Shift Survival",
    subtitle: "Sleep, Food and Recovery for Healthcare Workers",
    penNameId: "harni-muharami",
    template: "nonfiction",
    bookTypeId: "healthcare-professional",
    interiorThemeId: "wellbeing-gentle",
    coverStyleId: "journal-minimal",
    stage: "research",
    statusLine: "18 sources so far",
    words: { written: 0, target: 40000 },
    cost: { spent: 0.62, budget: 15 },
    trim: "6 x 9 in",
    createdAt: "2026-10-03T08:30:00+01:00",
    updatedAt: "2026-10-04T13:50:00+01:00",
    cover: null,
    attentionSteps: ["research"],
    isDemo: false,
    archived: false,
    series: null,
    published: null,
  },
  {
    id: "the-calm-ward",
    title: "The Calm Ward",
    subtitle: "De-escalation and Compassion in NHS Practice",
    penNameId: "harni-muharami",
    template: "nonfiction",
    bookTypeId: "healthcare-professional",
    interiorThemeId: "calm-reflective",
    coverStyleId: "serene-serif",
    stage: "blueprint",
    statusLine: "Ready to approve",
    words: { written: 0, target: 42000 },
    cost: { spent: 0.46, budget: 12 },
    trim: "6 x 9 in",
    createdAt: "2026-09-29T11:02:00+01:00",
    updatedAt: "2026-10-04T14:12:00+01:00",
    cover: coverFromStyle("serene-serif", "teal-cream", ["The Calm", "Ward"]),
    attentionSteps: ["blueprint"],
    isDemo: false,
    archived: false,
    series: null,
    published: null,
  },
  {
    id: "handover",
    title: "Handover",
    subtitle: "Clear Communication for Busy Wards",
    penNameId: "harni-muharami",
    template: "nonfiction",
    bookTypeId: "healthcare-professional",
    interiorThemeId: "healthcare-practical",
    coverStyleId: "bold-condensed",
    stage: "writing",
    statusLine: "Chapter 6 of 10",
    words: { written: 21340, target: 38000 },
    cost: { spent: 1.92, budget: 15 },
    trim: "6 x 9 in",
    createdAt: "2026-09-24T09:00:00+01:00",
    updatedAt: "2026-10-04T14:31:00+01:00",
    cover: coverFromStyle("bold-condensed", "paper-red", ["Hand", "Over"]),
    attentionSteps: ["writing"],
    isDemo: false,
    archived: false,
    series: null,
    published: null,
  },
  {
    id: "the-new-charge-nurse",
    title: "The New Charge Nurse",
    subtitle: "Your First Year Leading a Shift",
    penNameId: "harni-muharami",
    template: "nonfiction",
    bookTypeId: "healthcare-professional",
    interiorThemeId: "modern-nonfiction",
    coverStyleId: "modern-grotesk",
    stage: "editing",
    statusLine: "Line edit, 6 of 10",
    words: { written: 44120, target: 42000 },
    cost: { spent: 3.1, budget: 15 },
    trim: "6 x 9 in",
    createdAt: "2026-09-10T10:20:00+01:00",
    updatedAt: "2026-10-03T17:45:00+01:00",
    cover: coverFromStyle("modern-grotesk", "amber-navy", ["The New", "Charge", "Nurse"]),
    attentionSteps: ["editor"],
    isDemo: false,
    archived: false,
    series: null,
    published: null,
  },
  {
    id: "speaking-up-safely",
    title: "Speaking Up Safely",
    subtitle: "A Nurse’s Guide to Raising Concerns",
    penNameId: "harni-muharami",
    template: "nonfiction",
    bookTypeId: "healthcare-professional",
    interiorThemeId: "memoir-warm",
    coverStyleId: "quiet-italic",
    stage: "cover",
    statusLine: "3 concepts to compare",
    words: { written: 36800, target: 38000 },
    cost: { spent: 2.74, budget: 15 },
    trim: "6 x 9 in",
    createdAt: "2026-09-05T14:00:00+01:00",
    updatedAt: "2026-10-01T16:20:00+01:00",
    cover: coverFromStyle("quiet-italic", "plum-rose", ["Speaking", "Up Safely"], {
      motif: "speech",
      motifBox: { top: 54, left: 10, width: 44, height: 40 },
    }),
    attentionSteps: [],
    isDemo: false,
    archived: false,
    series: null,
    published: null,
  },
  {
    id: "ai-for-absolute-beginners",
    title: "AI for Absolute Beginners",
    subtitle: "Plain-English Steps to Using AI Tools at Home and Work",
    penNameId: "gideon-akinlotan",
    template: "nonfiction",
    bookTypeId: "ai-tech-howto",
    interiorThemeId: "tech-guide",
    coverStyleId: "tech-grid",
    stage: "cover",
    statusLine: "Cover concept chosen",
    words: { written: 29700, target: 30000 },
    cost: { spent: 2.05, budget: 15 },
    trim: "6 x 9 in",
    createdAt: "2026-09-12T18:40:00+01:00",
    updatedAt: "2026-10-03T21:10:00+01:00",
    cover: coverFromStyle("tech-grid", "midnight-cyan", ["AI for", "Absolute", "Beginners"]),
    attentionSteps: [],
    isDemo: false,
    archived: false,
    series: null,
    published: null,
  },
  {
    id: "the-ninth-lock",
    title: "The Ninth Lock",
    subtitle: "",
    penNameId: "jr-kade",
    template: "fiction",
    bookTypeId: "thriller",
    interiorThemeId: "thriller-sharp",
    coverStyleId: "noir-spaced",
    stage: "editing",
    statusLine: "Clue ledger, 2 to check",
    words: { written: 81450, target: 80000 },
    cost: { spent: 4.36, budget: 20 },
    trim: "5.5 x 8.5 in",
    createdAt: "2026-08-30T20:00:00+01:00",
    updatedAt: "2026-10-04T11:25:00+01:00",
    cover: coverFromStyle("noir-spaced", "petrol-red", ["The", "Ninth Lock"], { titleSize: 9 }),
    attentionSteps: [],
    isDemo: false,
    archived: false,
    series: null,
    published: null,
  },
  {
    id: "the-steady-shift-workbook",
    title: "The Steady Shift Workbook",
    subtitle: "Exercises for Calmer Night Shifts",
    penNameId: "harni-muharami",
    template: "workbook",
    bookTypeId: "workbook",
    interiorThemeId: "workbook",
    coverStyleId: "workbook-blocks",
    stage: "editing",
    statusLine: "Exercises, 3 to check",
    words: { written: 18640, target: 20000 },
    cost: { spent: 1.42, budget: 12 },
    trim: "8.5 x 11 in",
    createdAt: "2026-10-01T09:00:00+01:00",
    updatedAt: "2026-10-05T16:10:00+01:00",
    cover: coverFromStyle("workbook-blocks", "sunflower", ["The Steady", "Shift", "Workbook"]),
    attentionSteps: ["editor"],
    isDemo: true,
    archived: false,
    series: null,
    published: null,
  },
  {
    id: "sourdough-on-a-weeknight",
    title: "Sourdough on a Weeknight",
    subtitle: "Slow Bread for Busy People",
    penNameId: "gideon-akinlotan",
    template: "cookbook",
    bookTypeId: "cookbook",
    interiorThemeId: "cookbook",
    coverStyleId: "slab-kitchen",
    stage: "export",
    statusLine: "2 preflight warnings",
    words: { written: 29450, target: 30000 },
    cost: { spent: 2.18, budget: 15 },
    trim: "6 x 9 in",
    createdAt: "2026-08-25T12:00:00+01:00",
    updatedAt: "2026-09-28T09:05:00+01:00",
    cover: coverFromStyle("slab-kitchen", "crust-dark", ["Sourdough on", "a Weeknight"]),
    attentionSteps: ["export"],
    isDemo: true,
    archived: false,
    series: null,
    published: null,
  },
  {
    id: "summer-at-gull-cottage",
    title: "Summer at Gull Cottage",
    subtitle: "A Penhallow Harbour Romance",
    penNameId: "elena-marsh",
    template: "fiction",
    bookTypeId: "contemporary-romance",
    interiorThemeId: "romance-elegant",
    coverStyleId: "romance-script",
    stage: "published",
    statusLine: "Published 26 September",
    words: { written: 66200, target: 65000 },
    cost: { spent: 5.12, budget: 20 },
    trim: "5 x 8 in",
    createdAt: "2026-08-04T19:30:00+01:00",
    updatedAt: "2026-09-26T08:00:00+01:00",
    cover: coverFromStyle("romance-script", "seaside-dawn", ["Summer at", "Gull Cottage"], { titleSize: 12.5, subtitleTop: 44 }),
    attentionSteps: [],
    isDemo: false,
    archived: false,
    series: { name: "Penhallow Harbour", number: 1 },
    published: {
      publishedOn: "2026-09-26T08:00:00+01:00",
      marketplace: "amazon.co.uk",
      formats: [
        { format: "Kindle eBook", listPriceGbp: 2.99, liveOn: "2026-09-26T08:00:00+01:00", pages: null },
        { format: "Paperback", listPriceGbp: 8.99, liveOn: "2026-09-28T10:00:00+01:00", pages: 298 },
      ],
      aiDisclosure: "AI-generated text",
      packVersion: 2,
    },
  },
  {
    id: "pip-and-the-sleepy-stars",
    title: "Pip and the Sleepy Stars",
    subtitle: "",
    penNameId: "tobi-rhymes",
    template: "picture-book",
    bookTypeId: "bedtime-story",
    interiorThemeId: "bedtime-soft",
    coverStyleId: "storybook-round",
    stage: "published",
    statusLine: "Published 30 September",
    words: { written: 640, target: 650 },
    cost: { spent: 1.38, budget: 6 },
    trim: "8.5 x 8.5 in",
    createdAt: "2026-09-21T19:00:00+01:00",
    updatedAt: "2026-09-30T09:00:00+01:00",
    cover: coverFromStyle("storybook-round", "night-sky", ["Pip and the", "Sleepy Stars"], { titleSize: 11.5, titleTop: 86 }),
    attentionSteps: [],
    isDemo: false,
    archived: false,
    series: null,
    published: {
      publishedOn: "2026-09-30T09:00:00+01:00",
      marketplace: "amazon.co.uk",
      formats: [{ format: "Paperback", listPriceGbp: 7.99, liveOn: "2026-09-30T09:00:00+01:00", pages: 32 }],
      aiDisclosure: "AI-generated text and images",
      packVersion: 1,
    },
  },
  {
    id: "the-honest-side-hustle",
    title: "The Honest Side Hustle",
    subtitle: "Start Small With AI Tools, No Hype and No Promises",
    penNameId: "gideon-akinlotan",
    template: "nonfiction",
    bookTypeId: "business-money",
    interiorThemeId: "business-bold",
    coverStyleId: "headline-stack",
    stage: "published",
    statusLine: "Published 20 September",
    words: { written: 31800, target: 32000 },
    cost: { spent: 2.41, budget: 15 },
    trim: "6 x 9 in",
    createdAt: "2026-08-18T07:45:00+01:00",
    updatedAt: "2026-09-20T12:00:00+01:00",
    cover: coverFromStyle("headline-stack", "cobalt-gold", ["The", "Honest", "Side", "Hustle"]),
    attentionSteps: [],
    isDemo: false,
    archived: false,
    series: null,
    published: {
      publishedOn: "2026-09-20T12:00:00+01:00",
      marketplace: "amazon.co.uk",
      formats: [
        { format: "Kindle eBook", listPriceGbp: 3.99, liveOn: "2026-09-20T12:00:00+01:00", pages: null },
        { format: "Paperback", listPriceGbp: 9.99, liveOn: "2026-09-22T09:30:00+01:00", pages: 164 },
      ],
      aiDisclosure: "AI-generated text",
      packVersion: 3,
    },
  },
  {
    id: "windowsill-herbs",
    title: "Windowsill Herbs",
    subtitle: "Grow Fresh Herbs in a Small UK Home",
    penNameId: "gideon-akinlotan",
    template: "nonfiction",
    bookTypeId: "home-garden-hobbies",
    interiorThemeId: "practical-guide",
    coverStyleId: "botanical-didone",
    stage: "published",
    statusLine: "Published 12 September",
    words: { written: 24600, target: 24000 },
    cost: { spent: 1.64, budget: 15 },
    trim: "5.5 x 8.5 in",
    createdAt: "2026-09-01T08:00:00+01:00",
    updatedAt: "2026-09-12T10:00:00+01:00",
    cover: coverFromStyle("botanical-didone", "herb-green", ["Windowsill", "Herbs"]),
    attentionSteps: [],
    isDemo: true,
    archived: false,
    series: null,
    published: {
      publishedOn: "2026-09-12T10:00:00+01:00",
      marketplace: "amazon.co.uk",
      formats: [
        { format: "Kindle eBook", listPriceGbp: 2.49, liveOn: "2026-09-12T10:00:00+01:00", pages: null },
        { format: "Paperback", listPriceGbp: 6.99, liveOn: "2026-09-14T11:00:00+01:00", pages: 132 },
      ],
      aiDisclosure: "AI-generated text",
      packVersion: 1,
    },
  },
];

export function getBook(id: string | undefined): Book | undefined {
  if (!id) return undefined;
  return books.find((b) => b.id === id);
}

/** Books that are live on Amazon, newest first (the Published shelf). */
export function publishedBooks(): Book[] {
  return books
    .filter((b) => !b.archived && b.published !== null)
    .sort((a, b) => (b.published?.publishedOn ?? "").localeCompare(a.published?.publishedOn ?? ""));
}

export function booksForPenName(penNameId: string | null): Book[] {
  const active = books.filter((b) => !b.archived);
  return penNameId ? active.filter((b) => b.penNameId === penNameId) : active;
}

/** Index of each book step in the pipeline, used to derive step states from the book's stage. */
const stepStage: Record<BookStepId, StageId> = {
  research: "research",
  titles: "title",
  blueprint: "blueprint",
  writing: "writing",
  editor: "editing",
  cover: "cover",
  export: "export",
  marketing: "published",
};

/**
 * State dot for a book step in the nav. Steps before the book's stage are done, the stage itself is
 * in progress (or running when a job runs), later steps are not started. Attention overrides.
 * Marketing can run any time after the blueprint, so it is in progress from writing onwards.
 */
export function stepState(book: Book, step: BookStepId, runningBookId: string | null): StepState {
  if (book.attentionSteps.includes(step)) return "attention";
  const bookIdx = stageOrder.indexOf(book.stage);
  if (step === "marketing") {
    if (book.stage === "published") return "done";
    return bookIdx >= stageOrder.indexOf("writing") ? "in-progress" : "not-started";
  }
  const stepIdx = stageOrder.indexOf(stepStage[step]);
  if (book.stage === "published" || stepIdx < bookIdx) return "done";
  if (stepIdx === bookIdx) return runningBookId === book.id && step === "writing" ? "running" : "in-progress";
  return "not-started";
}

/** The step to open when a book is opened from the Library. */
export function currentStep(book: Book): BookStepId {
  switch (book.stage) {
    case "idea":
    case "research":
      return "research";
    case "title":
      return "titles";
    case "blueprint":
      return "blueprint";
    case "writing":
      return "writing";
    case "editing":
      return "editor";
    case "cover":
      return "cover";
    case "export":
    case "published":
      return "export";
  }
}

/** The "Today" strip on the Library, newest first. */
export const activity: ActivityEvent[] = [
  {
    id: "act-1",
    at: "2026-10-04T14:31:00+01:00",
    bookId: "handover",
    title: "Handover, chapter 5 passed checks",
    detail: "No em dashes, British spelling, 1 claim sent to verify.",
    live: true,
  },
  {
    id: "act-2",
    at: "2026-10-04T14:12:00+01:00",
    bookId: "the-calm-ward",
    title: "The Calm Ward, blueprint version 3",
    detail: "Chapter 4 regenerated with a stronger opening scene.",
    live: false,
  },
  {
    id: "act-3",
    at: "2026-10-04T13:50:00+01:00",
    bookId: "night-shift-survival",
    title: "Night Shift Survival, research",
    detail: "18 cited sources found. 6 still to read.",
    live: false,
  },
  {
    id: "act-ninth",
    at: "2026-10-04T11:25:00+01:00",
    bookId: "the-ninth-lock",
    title: "The Ninth Lock, clue ledger check",
    detail: "31 clues placed. 2 need an earlier mention to keep the reveal fair.",
    live: false,
  },
  {
    id: "act-4",
    at: "2026-10-04T09:05:00+01:00",
    bookId: "sourdough-on-a-weeknight",
    title: "Sourdough on a Weeknight, preflight",
    detail: "2 warnings: spine text and one low-resolution image.",
    live: false,
  },
  {
    id: "act-5",
    at: "2026-10-03T17:45:00+01:00",
    bookId: "the-new-charge-nurse",
    title: "The New Charge Nurse, line edit",
    detail: "Chapters 1 to 6 edited. 23 suggestions accepted, 4 rejected.",
    live: false,
  },
];
