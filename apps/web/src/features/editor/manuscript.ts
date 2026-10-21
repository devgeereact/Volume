import { getPenName, handoverJob } from "../../demo";

/* Screen-only manuscript data for the Editor. Two books carry text in the demo: The New Charge Nurse
   (in editing) and Handover (being written). Each chapter shows its opening pages only; the word
   counts are the full chapter's. Claims are sentences the checker sent to the claims to verify report.
   Everything here is demo text written for the prototype: no real studies, statistics or quotes. */

export interface MsBlock {
  id: string;
  /** Paragraph, subheading, scene break, or workbook block (exercise, lines, fill-in, checklist) holding its Markdown. */
  kind: "p" | "h" | "scene" | "workbook";
  text: string;
  /** Bumped when the app changes the text, so the editable element remounts with it. */
  rev: number;
  /** Heading marks from the server's markdown ("## "), kept so a save keeps the level. */
  prefix?: string | undefined;
}

export type MsGroup = "front" | "body" | "back";

export interface MsSection {
  id: string;
  group: MsGroup;
  number: number | null;
  title: string;
  /** Words in the full section; the demo shows the opening pages. */
  baseWords: number;
  wordTarget: number | null;
  blocks: MsBlock[];
  /** Where the text comes from, for app and profile sections. */
  source: "writer" | "app" | "profile";
  enabled: boolean;
  offReason?: string;
  /** Shown text is only the opening pages. */
  excerpt: boolean;
}

export type VersionOrigin = "AI write" | "Checker fix" | "AI edit" | "AI rewrite" | "Owner" | "Restore";

export interface MsVersion {
  number: number;
  at: string;
  origin: VersionOrigin;
  note: string;
  blocks: MsBlock[];
}

export type ClaimStatus = "open" | "verified" | "softened" | "removed";

export interface MsClaim {
  id: string;
  sectionId: string;
  blockId: string;
  sentence: string;
  /** "Clinical", "Statistical", "Legal" or "Safety" in the demo; the server's category in API mode. */
  category: string;
  check: string;
  softened: string;
  status: ClaimStatus;
  note?: string | undefined;
  /** Claim tiers (claimTier.ts): false when the claim is listed for the record only; missing means it needs a check. */
  needsCheck?: boolean | undefined;
}

export type SuggestionPass = "structure" | "line" | "voice";

export interface MsSuggestion {
  id: string;
  pass: SuggestionPass;
  sectionId: string;
  blockId: string;
  original: string;
  proposed: string;
  reason: string;
}

/**
 * An author note: the author's rough words or intent at a spot in the text. The editor can weave it in
 * as polished prose in the author's voice, or expand it into a new subsection. Nothing changes in the
 * text until the author accepts the result.
 */
export type NoteStatus = "draft" | "working" | "ready" | "woven" | "expanded";
export type NoteMode = "weave" | "expand";

export interface MsNote {
  id: string;
  sectionId: string;
  /** The block the note sits after. */
  afterBlockId: string;
  text: string;
  status: NoteStatus;
  mode: NoteMode | null;
  /** The editor's result while it waits for Accept or Reject. */
  proposed: MsBlock[];
  /** Hand-written results for the demo's seeded note; other notes use the generic writer in textTools. */
  prepared?: { weave: string; expand: { heading: string; paragraphs: string[] } } | undefined;
}

export interface Manuscript {
  bookId: string;
  sections: MsSection[];
  versions: Record<string, MsVersion[]>;
  claims: MsClaim[];
  suggestions: MsSuggestion[];
  /** Passes already run per section. */
  passesRun: Record<string, SuggestionPass[]>;
  notes: MsNote[];
}

let seq = 0;
const p = (text: string, id?: string): MsBlock => ({ id: id ?? `b${++seq}`, kind: "p", text, rev: 0 });
const h = (text: string, id?: string): MsBlock => ({ id: id ?? `b${++seq}`, kind: "h", text, rev: 0 });

function edit(blocks: MsBlock[], changes: Record<string, [string, string][]>): MsBlock[] {
  return blocks.map((b) => {
    const c = changes[b.id];
    if (!c) return b;
    let text = b.text;
    for (const [from, to] of c) text = text.replace(from, to);
    return { ...b, text };
  });
}

/* ---------- The New Charge Nurse ---------- */

function chargeNurse(): Manuscript {
  const bio = getPenName("harni-muharami")?.bio ?? "";
  const ch6: MsBlock[] = [
    p(
      "Conflict on a ward rarely starts as a row. It starts as a sigh at the allocation board, a door closed a little too hard, a comment made just loud enough to be heard. By the time it reaches you as the nurse in charge, it has usually been building for hours.",
      "cn6-1",
    ),
    h("Notice it early", "cn6-h1"),
    p(
      "The first skill is noticing. Walk the floor at the start of the shift and again an hour in. Who has gone quiet? Who is doing two people's jobs without saying so? You cannot fix what you have not seen, and most people will not tell you until they are already upset.",
      "cn6-2",
    ),
    p(
      "When you spot it, name it gently and in private. A quick word in the corridor, asking whether everything is all right after a tense handover, is often enough to let the pressure out before it turns into something bigger.",
      "cn6-3",
    ),
    h("Have the conversation in the right place", "cn6-h2"),
    p(
      "Never settle a disagreement at the nurses' station. Find a side room, the clean utility or even the corridor by the lifts. Keep it short, keep it about the work, and try to prioritize what can be fixed on this shift over what needs a longer conversation later.",
      "cn6-4",
    ),
    p(
      "It is worth the effort. Research shows that teams who resolve conflict quickly have half as many medication errors. Even on a short-staffed night, ten minutes spent clearing the air pays for itself.",
      "cn6-5",
    ),
    h("When it involves a senior colleague", "cn6-h3"),
    p(
      "Conflict with a consultant or a matron feels different, but the steps are the same. Stick to what you saw, what it means for the patient and what you need. If you feel out of your depth, it is fine to say you will come back to them after speaking to the site manager.",
      "cn6-6",
    ),
    p(
      "Afterwards, write a short note for yourself. Not a formal record, just what happened and what you would do differently. Over a year those notes become your own handbook for the job.",
      "cn6-7",
    ),
  ];

  const chapters: [string, number, number, string[]][] = [
    [
      "The First Shift in Charge",
      4210,
      4200,
      [
        "Nobody feels ready for their first shift in charge. You will have watched others do it for months, and still the keys feel heavier than you expected when they are handed to you at half past seven.",
        "This chapter walks through that first shift hour by hour: what to look at first, who to speak to, and what can safely wait until the ward has settled.",
      ],
    ],
    [
      "Reading the Board",
      4380,
      4200,
      [
        "The ward board tells you more than any single handover can. Bed numbers, names, arrows, coloured magnets and scribbled notes together make a map of the shift ahead.",
        "Learn to read it in the same order every time. Start with who is unwell, then who is going home, then who is waiting for something that only you can chase.",
      ],
    ],
    [
      "Allocating Staff Fairly",
      4290,
      4200,
      [
        "Allocation is the first decision everyone sees you make, so it is the first one they judge. A fair allocation is not an equal one. It matches patients to skills and spreads the heavy work across the shift.",
        "Say out loud why you have made each choice. People accept a hard allocation far more readily when they can hear the reasoning behind it.",
      ],
    ],
    [
      "The Safety Huddle",
      4150,
      4200,
      [
        "A good safety huddle takes five minutes and changes the whole shift. It is where you name the patients who worry you, the staff who are stretched and the risks that are already on the floor.",
        "Keep it standing, keep it short and end it with one clear question: is there anything anyone needs from me before we start?",
      ],
    ],
    [
      "Escalating Without Apology",
      4460,
      4200,
      [
        "New charge nurses often apologise when they escalate, as if asking for help were a failure. It is the opposite. Escalating early is one of the most important things the nurse in charge does.",
        "You must escalate a NEWS2 score of 5 or more to a doctor within 30 minutes. Say what you see, what you think it means and what you want to happen next.",
      ],
    ],
    ["Handling Conflict on the Floor", 4320, 4200, []],
    [
      "Supporting Students and New Starters",
      4410,
      4200,
      [
        "Students and new starters remember the charge nurse who noticed them. A two minute check at the start of the shift, asking what they want to learn today, costs you very little.",
        "Pair them thoughtfully. The best mentor on a busy shift is not always the most senior nurse, but the one with the most patience left.",
      ],
    ],
    [
      "Documentation That Protects",
      4520,
      4200,
      [
        "Good notes protect patients first and staff second. They tell the next nurse what happened, what was done and what still needs doing, in words anyone on the ward can follow.",
        "Notes written after the shift ends are not legally valid. Write as close to the event as you can, and sign and time every entry.",
      ],
    ],
    [
      "When Things Go Wrong",
      4630,
      4200,
      [
        "Sooner or later something will go wrong on a shift you are running. A fall, a missed dose, a family who feels unheard. How you respond in the first hour shapes everything that follows.",
        "Look after the patient, then the staff involved, then the paperwork. In that order, every time.",
      ],
    ],
    [
      "Looking After Yourself",
      4380,
      4200,
      [
        "The nurse in charge is often the last to take a break and the first to stay late. Over a year that adds up, and it shows in your judgement long before it shows in your mood.",
        "Protect one break a shift as if it were a patient's medication. Hand over the keys, leave the ward and eat something that is not from a vending machine.",
      ],
    ],
  ];

  const sections: MsSection[] = [
    {
      id: "title-page",
      group: "front",
      number: null,
      title: "Title page",
      baseWords: 12,
      wordTarget: null,
      blocks: [p("The New Charge Nurse", "tp-1"), p("Your First Year Leading a Shift", "tp-2"), p("Harni Muharami", "tp-3")],
      source: "app",
      enabled: true,
      excerpt: false,
    },
    {
      id: "copyright",
      group: "front",
      number: null,
      title: "Copyright",
      baseWords: 64,
      wordTarget: null,
      blocks: [
        p("Copyright 2026 Harni Muharami. All rights reserved.", "cp-1"),
        p(
          "This book offers general guidance for nurses. It does not replace your trust's policies, your professional judgement or advice from your manager.",
          "cp-2",
        ),
      ],
      source: "profile",
      enabled: true,
      excerpt: false,
    },
    {
      id: "dedication",
      group: "front",
      number: null,
      title: "Dedication",
      baseWords: 0,
      wordTarget: 20,
      blocks: [],
      source: "writer",
      enabled: true,
      excerpt: false,
    },
    {
      id: "introduction",
      group: "front",
      number: null,
      title: "Introduction",
      baseWords: 1180,
      wordTarget: 1200,
      blocks: [
        p(
          "This is the book I wanted in my first year as a charge nurse. Not a management textbook, but the things I learnt on the floor, written down so you do not have to learn them the hard way.",
          "in-1",
        ),
        p("Each chapter follows one part of the job, from the first shift with the keys to looking after yourself when the year has been long.", "in-2"),
      ],
      source: "writer",
      enabled: true,
      excerpt: true,
    },
    ...chapters.map(([title, words, target, paras], i): MsSection => ({
      id: `ch-${i + 1}`,
      group: "body",
      number: i + 1,
      title,
      baseWords: words,
      wordTarget: target,
      blocks: i === 5 ? ch6 : paras.map((t, j) => p(t, `cn${i + 1}-${j + 1}`)),
      source: "writer",
      enabled: true,
      excerpt: true,
    })),
    {
      id: "about",
      group: "back",
      number: null,
      title: "About the author",
      baseWords: 90,
      wordTarget: null,
      blocks: [p(bio, "ab-1")],
      source: "profile",
      enabled: true,
      excerpt: false,
    },
    {
      id: "also-by",
      group: "back",
      number: null,
      title: "Also by",
      baseWords: 0,
      wordTarget: null,
      blocks: [],
      source: "app",
      enabled: false,
      offReason: "No published books under this pen name yet, so this page is off.",
      excerpt: false,
    },
    {
      id: "review",
      group: "back",
      number: null,
      title: "A small request",
      baseWords: 48,
      wordTarget: 60,
      blocks: [
        p(
          "If this book helped you, an honest review on Amazon helps other nurses find it. Thank you for reading, and for the work you do on every shift.",
          "rv-1",
        ),
      ],
      source: "writer",
      enabled: true,
      excerpt: false,
    },
  ];

  const v4 = ch6;
  const v3 = edit(v4, { "cn6-6": [["Stick to what you saw", "Keep to the facts you saw"]], "cn6-7": [[" for the job", ""]] });
  const v2 = edit(v3, {
    "cn6-1": [["a door closed a little too hard", "a door that gets closed a little bit too hard"]],
    "cn6-3": [["name it gently and in private", "try to name it gently and also in private"]],
  });
  const v1 = edit(v2, {
    "cn6-2": [
      ["Walk the floor at the start of the shift and again an hour in.", "Walk the floor at the start of the shift, and then walk it again about an hour in."],
    ],
  });

  return {
    bookId: "the-new-charge-nurse",
    sections,
    versions: {
      "ch-6": [
        { number: 1, at: "2026-09-14T10:42:00+01:00", origin: "AI write", note: "First draft from the writer", blocks: v1 },
        { number: 2, at: "2026-09-14T10:43:00+01:00", origin: "Checker fix", note: "2 em dashes replaced with commas", blocks: v2 },
        { number: 3, at: "2026-10-02T15:10:00+01:00", origin: "AI edit", note: "Line edit, 4 of 6 suggestions accepted", blocks: v3 },
        { number: 4, at: "2026-10-03T17:45:00+01:00", origin: "Owner", note: "Your edits", blocks: v4 },
      ],
    },
    claims: [
      {
        id: "cl-1",
        sectionId: "ch-6",
        blockId: "cn6-5",
        sentence: "Research shows that teams who resolve conflict quickly have half as many medication errors.",
        category: "Statistical",
        check: "Find the study and cite it, or present it as the author's experience.",
        softened: "In my experience, teams that clear the air quickly make fewer mistakes under pressure.",
        status: "open",
      },
      {
        id: "cl-2",
        sectionId: "ch-5",
        blockId: "cn5-2",
        sentence: "You must escalate a NEWS2 score of 5 or more to a doctor within 30 minutes.",
        category: "Clinical",
        check: "Check against current NEWS2 guidance and your trust's escalation policy.",
        softened: "Follow your trust's escalation policy for NEWS2 scores, which sets out when to call a doctor and how quickly.",
        status: "open",
      },
      {
        id: "cl-3",
        sectionId: "ch-8",
        blockId: "cn8-2",
        sentence: "Notes written after the shift ends are not legally valid.",
        category: "Legal",
        check: "Check the NMC Code and your trust's policy on late entries.",
        softened: "Late entries are allowed, but they must be marked as late, so follow your trust's policy.",
        status: "open",
      },
    ],
    suggestions: [
      {
        id: "sg-1",
        pass: "line",
        sectionId: "ch-6",
        blockId: "cn6-1",
        original: "a comment made just loud enough to be heard",
        proposed: "a comment just loud enough to be heard",
        reason: 'Shorter. "Made" adds nothing to the picture.',
      },
      {
        id: "sg-2",
        pass: "line",
        sectionId: "ch-6",
        blockId: "cn6-4",
        original: "try to prioritize what can be fixed",
        proposed: "put first what can be fixed",
        reason: 'British spelling would be "prioritise"; plainer wording reads better here.',
      },
      {
        id: "sg-3",
        pass: "line",
        sectionId: "ch-6",
        blockId: "cn6-6",
        original: "it is fine to say you will come back to them",
        proposed: "say you will come back to them",
        reason: "Cuts a hedge. The advice sounds more sure of itself.",
      },
    ],
    passesRun: { "ch-6": ["line"] },
    notes: [
      {
        id: "note-1",
        sectionId: "ch-6",
        afterBlockId: "cn6-3",
        text: "the agency nurse in my second week who went quiet after allocation. a cup of tea in the staff room fixed more than changing the rota would have",
        status: "draft",
        mode: null,
        proposed: [],
        prepared: {
          weave:
            "I learnt this in my second week in charge. An agency nurse went quiet straight after allocation, and I nearly let it go. Five minutes over a cup of tea in the staff room did more than any change to the rota would have done: she had been given the bays furthest from the station on her first shift with us, and she felt it.",
          expand: {
            heading: "Five minutes and a cup of tea",
            paragraphs: [
              "I learnt this in my second week in charge. An agency nurse went quiet straight after allocation, and I nearly let it go. Five minutes over a cup of tea in the staff room did more than any change to the rota would have done: she had been given the bays furthest from the station on her first shift with us, and she felt it.",
              "The lesson was not about tea. It was about noticing that a new face had gone quiet, and asking before the shift decided for her. In my experience, agency and bank staff often carry the hardest allocations with the least support, and they rarely complain to a charge nurse they have only just met.",
              "Make it a habit. Within the first hour, find anyone new to the ward and ask one plain question: how is your allocation looking? Then listen to the answer, and change what you can.",
            ],
          },
        },
      },
    ],
  };
}

/* ---------- Handover (being written) ---------- */

function handover(): Manuscript {
  const opening: Record<string, string[]> = {
    "ch-1": [
      "Most handovers do not fail because someone forgot a fact. They fail because the story of the shift never made it across the desk.",
      "In this chapter I look at the small ways a handover goes wrong: the rushed list, the missing worry, the question nobody had time to ask.",
    ],
    "ch-2": [
      "A good handover has a shape you can feel even when nobody names it: who the patient is, what changed, and what happens next.",
      "Once you can hear that shape, you can tell within a minute whether a handover has given you what you need.",
    ],
    "ch-3": [
      "SBAR is taught as four boxes on a card. On a busy ward it works best as four questions you carry in your head.",
      "Wards that train every nurse in SBAR see fewer missed deteriorations. The structure matters less than the habit of using it every time.",
    ],
    "ch-4": [
      "Handing over at the bedside means the patient hears their own story, and sometimes corrects it.",
      "It takes a little longer and it feels exposed at first. Most nurses who try it for a month do not go back.",
    ],
    "ch-5": [
      "When a patient is getting worse, the handover changes speed. The facts come first and the reassurance comes later.",
      "Say the observations, say what you have done and say what you are worried about, in that order.",
    ],
  };
  const sections: MsSection[] = handoverJob.sections.map((s): MsSection => {
    if (s.id === "front")
      return {
        id: "front",
        group: "front",
        number: null,
        title: "Front matter",
        baseWords: s.words,
        wordTarget: s.wordTarget,
        blocks: [p("Title page, copyright, dedication, contents and a short note on how to use this book.", "hf-1")],
        source: "writer",
        enabled: true,
        excerpt: true,
      };
    if (s.id === "back")
      return {
        id: "back",
        group: "back",
        number: null,
        title: "Back matter",
        baseWords: 0,
        wordTarget: s.wordTarget,
        blocks: [],
        source: "writer",
        enabled: true,
        excerpt: false,
      };
    const cur = s.id === handoverJob.current.sectionId;
    const blocks = cur
      ? [
          ...handoverJob.current.blocks.map((b, i) => (b.kind === "h" ? h(b.text, `h6-${i}`) : p(b.text, `h6-${i}`))),
          p(handoverJob.current.streamingChunks.join(""), "h6-live"),
        ]
      : (opening[s.id] ?? []).map((t, j) => p(t, `h${s.number}-${j + 1}`));
    return {
      id: s.id,
      group: "body",
      number: s.number,
      title: s.title,
      baseWords: s.words,
      wordTarget: s.wordTarget,
      blocks,
      source: "writer",
      enabled: true,
      excerpt: blocks.length > 0,
    };
  });
  return {
    bookId: "handover",
    sections,
    versions: {},
    claims: [
      {
        id: "hc-1",
        sectionId: "ch-3",
        blockId: "h3-2",
        sentence: "Wards that train every nurse in SBAR see fewer missed deteriorations.",
        category: "Clinical",
        check: "A clinical outcome stated as fact. Find a source or present it as the author's experience.",
        softened: "On the wards I have worked on, SBAR helped us spot deterioration sooner.",
        status: "open",
      },
    ],
    suggestions: [],
    passesRun: {},
    notes: [],
  };
}

/* ---------- The Ninth Lock (fiction: scene breaks) ---------- */

const scene = (id: string): MsBlock => ({ id, kind: "scene", text: "***", rev: 0 });
const wb = (text: string, id: string): MsBlock => ({ id, kind: "workbook", text, rev: 0 });

function chapterSection(id: string, number: number, title: string, words: number, target: number, blocks: MsBlock[], excerpt = true): MsSection {
  return { id, group: "body", number, title, baseWords: words, wordTarget: target, blocks, source: "writer", enabled: true, excerpt };
}

function ninthLock(): Manuscript {
  const ch1 = [
    p("The vault door was older than the bank above it, and it had been built by someone who did not want it opened.", "nl1-1"),
    p(
      "Mara Quill knelt on the cold tiles and counted. Forty clicks to the first gate. Eleven back. She heard the train pass over the arch two miles away in her head, the way she always did when she was nervous, and kept counting.",
      "nl1-2",
    ),
    p("DI Okafor stood behind her with his hands in his coat pockets. He did not ask how long it would take. He had learned not to.", "nl1-3"),
    scene("nl1-s1"),
    p(
      "Inside, the vault was empty except for a single steel shelf. Someone had scratched two letters into the paint at eye height, neat and deliberate.",
      "nl1-4",
    ),
    p("M.Q.", "nl1-5"),
    p("Mara looked at them for a long time. Then she looked at Okafor, and saw that he had already seen them.", "nl1-6"),
  ];
  const ch2 = [
    p("The workshop smelled of oil and brass, and of the fire nobody talked about.", "nl2-1"),
    p("She did not sleep. She took the Harcourt lock apart on paper instead, gate by gate, until the drawing covered the bench.", "nl2-2"),
    scene("nl2-s1"),
    p("At six the phone rang. A second lock had been opened in the night, and whoever did it had used her tools.", "nl2-3"),
  ];
  return {
    bookId: "the-ninth-lock",
    sections: [chapterSection("nl-ch-1", 1, "The First Gate", 4120, 4000, ch1), chapterSection("nl-ch-2", 2, "Brass and Smoke", 3980, 4000, ch2)],
    versions: {},
    claims: [],
    suggestions: [],
    passesRun: {},
    notes: [],
  };
}

/* ---------- The Steady Shift Workbook (workbook: exercises, ruled lines, fill-in, checklist) ---------- */

function steadyShift(): Manuscript {
  const ch1 = [
    p("Night shifts change how you sleep, eat and think. This chapter helps you notice what your own pattern looks like before you try to change it.", "ss1-1"),
    h("Notice your pattern", "ss1-h1"),
    p(
      "Most nurses can name the hour when a night shift turns heavy. For me it was four in the morning, when the ward was quiet and my body thought it should be asleep.",
      "ss1-2",
    ),
    wb(
      "::: exercise reflection Your Heaviest Hour\nWhich hour of a night shift feels hardest for you, and what is usually happening on the ward?\n\n::: lines 6\n:::\n:::",
      "ss1-w1",
    ),
    wb(
      "::: exercise checklist Before Your Next Night\n- [ ] Eat a proper meal before you leave home\n- [ ] Pack a snack for the heavy hour\n- [ ] Tell someone at home when you plan to sleep\n:::",
      "ss1-w2",
    ),
    h("Plan the morning after", "ss1-h2"),
    p("The shift does not end when you hand over. The drive home and the first hour after it decide how well you sleep.", "ss1-3"),
    wb(
      "::: exercise fill-in My Morning Plan\nFill in each line before your next run of nights.\n\n::: fill-in\nWhat I will eat when I get home:\nWhen I will go to sleep:\nWhat I will do if I cannot sleep:\n:::\n:::",
      "ss1-w3",
    ),
  ];
  return {
    bookId: "the-steady-shift-workbook",
    sections: [chapterSection("ss-ch-1", 1, "Know Your Nights", 2480, 2500, ch1, false)],
    versions: {},
    claims: [],
    suggestions: [],
    passesRun: {},
    notes: [],
  };
}

export function getManuscript(bookId: string): Manuscript | null {
  if (bookId === "the-new-charge-nurse") return chargeNurse();
  if (bookId === "handover") return handover();
  if (bookId === "the-ninth-lock") return ninthLock();
  if (bookId === "the-steady-shift-workbook") return steadyShift();
  return null;
}

export const groupLabels: Record<MsGroup, string> = { front: "Front matter", body: "Chapters", back: "Back matter" };
