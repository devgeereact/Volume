import { calmWardBlueprint, type ChapterPlan, type MatterPart } from "../../data";

/* Screen-local data for the Blueprint (The Calm Ward). The shared blueprint has the parts the board
   shows; the outline here lists every section of config/book-templates/nonfiction.json (front
   matter, optional parts, chapters, back matter, publishing package, marketing package) so each can
   be switched on or off and reordered. Alternate texts stand in for what "Regenerate part" returns. */

export type GroupId = "front" | "parts" | "chapters" | "back" | "publishing" | "marketing";
export type Source = MatterPart["source"];

export interface OutlinePart {
  id: string;
  group: GroupId;
  title: string;
  on: boolean;
  required: boolean;
  source: Source;
  wordTarget: number | null;
  /** The plan for this part: what the writer or the app will put there. */
  note: string;
  /** Chapters only. */
  chapter?: ChapterPlan | undefined;
}

export const groupLabels: Record<GroupId, string> = {
  front: "Front matter",
  parts: "Parts",
  chapters: "Chapters",
  back: "Back matter",
  publishing: "Publishing package",
  marketing: "Marketing package",
};

export const sourceLabels: Record<Source, string> = {
  app: "Built by the app",
  profile: "From the profile",
  writer: "Written by the writer",
  owner: "You add this",
};

const bp = calmWardBlueprint;
const fromFront = (id: string) => bp.frontMatter.find((m) => m.id === id);
const fromBack = (id: string) => bp.backMatter.find((m) => m.id === id);

function matter(
  group: GroupId,
  id: string,
  title: string,
  required: boolean,
  defaultOn: boolean,
  source: Source,
  note: string,
  wordTarget: number | null = null,
): OutlinePart {
  const known = group === "front" ? fromFront(id) : fromBack(id);
  return {
    id,
    group,
    title: known?.title ?? title,
    on: known ? true : defaultOn,
    required,
    source: known?.source ?? source,
    wordTarget: known?.wordTarget ?? wordTarget,
    note: known?.note ?? note,
  };
}

/** A 200 to 500 word summary kept with the blueprint (not printed). Demo text. */
export const bookSummary = [
  "The Calm Ward is a practical guide for nurses, nursing associates, healthcare assistants and ward leaders who meet tension and distress on busy adult wards and in emergency departments. It is written in the first person by a nurse and educator, in a warm and steady voice, and it treats calm as a skill that a whole team can learn and practise rather than a gift that some people have.",
  "The book opens at the nurses' station in the small hours and stays close to real ward moments throughout. Early chapters look at why tension rises: fear, pain, waiting, confusion and loss of control, and what happens in our own bodies when we feel under threat. The middle of the book slows the first minutes of a difficult moment right down. It covers what the body says before the words do, the talk down approach, knowing when stepping back is the safest choice, and working through language barriers with interpreters.",
  "Later chapters widen the view. They cover incivility between colleagues and how to name it early, the habits that make a team safe to speak up in, risk assessment as a living conversation, and what happens when talking is not enough. Clinical and legal points in those chapters are kept general and point readers to their local policy until the owner adds sources.",
  "The book closes with care for everyone after an incident, and with what charge nurses and ward managers can change over months. Each chapter opens with a scene, ends with Key Takeaways, and leads gently into the next.",
].join("\n\n");

export const backCoverBlurb =
  "Every shift on a busy ward holds moments that could tip into conflict. A relative who has waited too long for news. A patient in pain who cannot find the words. A colleague at the end of a long night. The Calm Ward is a practical, compassionate guide to meeting those moments well. Written by an NHS nurse and clinical educator, it slows down the minutes before a situation escalates and shows what you can say and do differently on your next shift. You will find the talk down approach step by step, small changes to the ward that cost nothing, honest advice on incivility between colleagues, and care for staff after a hard night. For nurses, nursing associates, healthcare assistants, students and ward leaders who want calmer shifts for patients and staff alike.";

/** The three optional parts, used when Parts is switched on. Chapter ranges are by position. */
export const partPlans: { id: string; title: string; note: string; chapters: [number, number] }[] = [
  {
    id: "part-1",
    title: "Part I: Understanding the Moment",
    note: "Why tension rises on a ward, and what it feels like from both sides of the bed.",
    chapters: [1, 3],
  },
  {
    id: "part-2",
    title: "Part II: Skills for the Shift",
    note: "What to say and do in the first minutes, and how a team stays safe together.",
    chapters: [4, 7],
  },
  {
    id: "part-3",
    title: "Part III: After the Incident and Beyond",
    note: "When talking is not enough, care afterwards, and building a calmer ward over time.",
    chapters: [8, 10],
  },
];

export function buildOutline(): OutlinePart[] {
  const front: OutlinePart[] = [
    matter("front", "half-title", "Half Title", false, false, "owner", "The book title on its own page before the title page."),
    matter("front", "title-page", "Title Page", true, true, "app", "Title, subtitle and pen name."),
    matter("front", "copyright", "Copyright", true, true, "profile", "From the profile template with {year}."),
    matter("front", "dedication", "Dedication", true, true, "writer", "Short, to the night teams."),
    matter("front", "epigraph", "Epigraph", false, false, "owner", "Only a quotation you supply with its attribution. The writer never chooses one."),
    matter("front", "contents", "Contents", true, true, "app", "Built from the chapter list."),
    matter("front", "foreword", "Foreword", false, false, "owner", "Only text by a real, named person you add, with their permission."),
    matter("front", "preface", "Preface", false, false, "writer", "Why the author wrote the book, in the first person.", 700),
    matter("front", "acknowledgements", "Acknowledgements", true, true, "writer", "Colleagues, family and readers. No named patients."),
    matter("front", "introduction", "Introduction", true, true, "writer", "Why this book, and how to use it on shift.", 2000),
  ];
  const parts: OutlinePart[] = partPlans.map((p) => ({
    id: p.id,
    group: "parts",
    title: p.title,
    on: false,
    required: false,
    source: "writer",
    wordTarget: null,
    note: `${p.note} Chapters ${p.chapters[0]} to ${p.chapters[1]}.`,
  }));
  const chapters: OutlinePart[] = bp.chapters.map((c) => ({
    id: `chapter-${c.number}`,
    group: "chapters",
    title: c.title,
    on: true,
    required: false,
    source: "writer",
    wordTarget: c.wordTarget,
    note: c.summary,
    chapter: c,
  }));
  const back: OutlinePart[] = [
    matter("back", "conclusion", "Conclusion", true, true, "writer", "Back to the nurses' station, and what changed.", 1350),
    matter("back", "appendix", "Appendix", false, false, "writer", "Extra material that would break a chapter's flow. No new claims."),
    matter("back", "resources", "Resources", false, false, "owner", "Only organisations and links from the research sources or added by you."),
    matter(
      "back",
      "glossary",
      "Glossary",
      false,
      false,
      "writer",
      "Plain-English meanings of terms used in the book. Clinical definitions go to the claims report.",
    ),
    matter("back", "references", "References", false, false, "owner", "Only real sources: research sources cited in the text, and references you enter."),
    matter("back", "about-the-author", "About the Author", true, true, "profile", "The profile bio, word for word."),
    matter("back", "also-by", "Also by Harni Muharami", false, true, "app", "Built from published books."),
    matter("back", "review-request", "A Small Request", false, true, "writer", "Asks for an honest review. No incentives."),
    matter("back", "newsletter-socials", "Stay in Touch", false, true, "profile", "Links from the profile."),
  ];
  const publishing: OutlinePart[] = [
    {
      id: "summary",
      group: "publishing",
      title: "Book Summary",
      on: true,
      required: true,
      source: "writer",
      wordTarget: null,
      note: "200 to 500 words, kept with the blueprint and not printed.",
    },
    {
      id: "back-cover-blurb",
      group: "publishing",
      title: "Back Cover Blurb",
      on: true,
      required: true,
      source: "writer",
      wordTarget: null,
      note: "120 to 200 words for the back of the paperback.",
    },
    {
      id: "short-bio",
      group: "publishing",
      title: "Short Author Bio",
      on: true,
      required: true,
      source: "profile",
      wordTarget: null,
      note: "The profile's short bio, word for word.",
    },
    {
      id: "amazon-description",
      group: "publishing",
      title: "Amazon Description",
      on: true,
      required: true,
      source: "writer",
      wordTarget: null,
      note: "Up to 4,000 characters including HTML.",
    },
    {
      id: "categories",
      group: "publishing",
      title: "Categories",
      on: true,
      required: true,
      source: "writer",
      wordTarget: null,
      note: "3 suggestions. You pick each one in KDP's own chooser.",
    },
    {
      id: "keywords",
      group: "publishing",
      title: "Keywords",
      on: true,
      required: true,
      source: "writer",
      wordTarget: null,
      note: "Exactly 7 keywords or short phrases.",
    },
    {
      id: "title-check",
      group: "publishing",
      title: "Title and Subtitle Check",
      on: true,
      required: true,
      source: "app",
      wordTarget: null,
      note: "Under 200 characters together, British spelling, no banned phrases.",
    },
    {
      id: "ai-disclosure-note",
      group: "publishing",
      title: "KDP AI Disclosure Note",
      on: true,
      required: true,
      source: "app",
      wordTarget: null,
      note: "Text: AI-generated, as the writer drafts it. Images: AI-generated when the cover art comes from the image model.",
    },
    {
      id: "claims-report",
      group: "publishing",
      title: "Claims to Verify",
      on: true,
      required: true,
      source: "writer",
      wordTarget: null,
      note: "Every clinical, legal and safety statement with its chapter and the check it needs.",
    },
  ];
  const marketing: OutlinePart[] = [
    {
      id: "tiktok-scripts",
      group: "marketing",
      title: "TikTok Scripts",
      on: true,
      required: false,
      source: "writer",
      wordTarget: null,
      note: "5 short scripts, each with a hook in the first two seconds.",
    },
    {
      id: "instagram-captions",
      group: "marketing",
      title: "Instagram Captions",
      on: true,
      required: false,
      source: "writer",
      wordTarget: null,
      note: "6 captions with an image idea for each.",
    },
    {
      id: "launch-email",
      group: "marketing",
      title: "Launch Email",
      on: true,
      required: false,
      source: "writer",
      wordTarget: null,
      note: "One email for launch week, with subject and preview line.",
    },
  ];
  return [...front, ...parts, ...chapters, ...back, ...publishing, ...marketing];
}

/** What "Regenerate part" returns for each part in the demo. Parts not listed come back unchanged. */
export const regenAlternates: Record<string, string> = {
  "chapter-1":
    "Sets the scene on a busy ward: why tension rises, how it feels from both sides of the bed, and why calm is a skill a whole team can practise together.",
  "chapter-2":
    "Looks underneath difficult behaviour at fear, pain, confusion and loss of control, then turns to what happens in our own bodies when we feel threatened at work.",
  "chapter-3": "How sightlines, noise, light and waiting areas shape a ward's mood, and the small changes a team can make this week without a budget.",
  "chapter-4":
    "Opens with a scene at the nurses' station at three in the morning. Many incidents I have seen began with an unmet need such as pain, fear or waiting. The chapter slows that moment down: what the body says before the words do, the talk down approach step by step, and when stepping back is the safest choice for everyone.",
  "chapter-5": "Incivility between colleagues, what it quietly costs a team, and how to name it early and kindly before it becomes serious.",
  "chapter-6": "What it takes for a nurse to say 'I am not sure' out loud, and the small daily habits that make a team safer to work in and to learn in.",
  "chapter-7":
    "Risk assessment as a living conversation rather than a form: noticing change early, adjusting the plan with the team, and writing down what was decided and why.",
  "chapter-8":
    "What happens when de-escalation is not enough: clear roles in the team, the legal frame for restraint as a last resort, and keeping dignity at the centre throughout.",
  "chapter-9":
    "Looking after everyone involved, patients and staff, in the first hour and the weeks after, and turning a hard night into shared learning instead of blame.",
  "chapter-10": "How charge nurses and ward managers can shape a calmer ward over months, and how to make a clear, calm case for change to the wider trust.",
  dedication: "Short, to the night teams and the healthcare assistants who are often first to the bedside.",
  acknowledgements: "Colleagues on the wards, family and early readers, thanked as groups. No named patients or invented mentors.",
  introduction: "Opens on a night shift, says who the book is for, and shows how to read it: one chapter on a break, the takeaways before the next shift.",
  conclusion:
    "Returns to the nurses' station from the first chapter and shows what a calmer night looks like, without promising that every shift will be easy.",
  "review-request": "Two short sentences asking readers who found the book useful to leave an honest review where they bought it. No incentives.",
  "back-cover-blurb": "Opens on a relative who has waited too long, names the reader, and promises practical steps for the next shift. 160 words.",
};

/** Simple word diff: which words of `next` are new compared with `prev` (longest common subsequence). */
export function insertedWords(prev: string, next: string): { word: string; added: boolean }[] {
  const a = prev.split(/\s+/).filter(Boolean);
  const b = next.split(/\s+/).filter(Boolean);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const row = dp[i] as number[];
      row[j] = a[i] === b[j] ? ((dp[i + 1] as number[])[j + 1] as number) + 1 : Math.max((dp[i + 1] as number[])[j] as number, row[j + 1] as number);
    }
  }
  const out: { word: string; added: boolean }[] = [];
  let i = 0;
  let j = 0;
  while (j < b.length) {
    if (i < a.length && a[i] === b[j]) {
      out.push({ word: b[j] as string, added: false });
      i++;
      j++;
    } else if (i < a.length && ((dp[i + 1] as number[])[j] as number) >= ((dp[i] as number[])[j + 1] as number)) {
      i++;
    } else {
      out.push({ word: b[j] as string, added: true });
      j++;
    }
  }
  return out;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
