import { chargeNurseMarketing, type Book, type LaunchEmail, type SocialCaption, type TikTokScript } from "../../demo";

/* Screen-only marketing data: subject line options, alternates the mock "Regenerate" draws from, and an
   archive of past scripts. The launch pack belongs to The New Charge Nurse, the demo book that is
   written. Same guardrails as the book: no invented reviews, rankings, awards or numbers, and review
   requests ask for an honest review and offer nothing. Demo text only. */

export type ItemKind = "tiktok" | "instagram" | "email";
export type ItemStatus = "draft" | "used";

export type MarketingItem =
  | { kind: "tiktok"; status: ItemStatus; data: TikTokScript }
  | { kind: "instagram"; status: ItemStatus; data: SocialCaption }
  | { kind: "email"; status: ItemStatus; data: LaunchEmail & { subjects: string[] } };

export interface ArchivedItem {
  item: MarketingItem;
  archivedAt: string;
  reason: string;
}

const pack = chargeNurseMarketing;
const chargeNurseSubjects = ["My book for your first year in charge", "The New Charge Nurse is out", "For the day they hand you the keys"];
const usedIds = new Set(["cn-tt-2"]);

export function initialItems(book: Book): MarketingItem[] {
  if (book.id !== pack.bookId) return [];
  return [
    ...pack.tiktok.map((data): MarketingItem => ({ kind: "tiktok", status: usedIds.has(data.id) ? "used" : "draft", data })),
    ...pack.instagram.map((data): MarketingItem => ({ kind: "instagram", status: "draft", data })),
    ...pack.email.map((data): MarketingItem => ({ kind: "email", status: "draft", data: { ...data, subjects: chargeNurseSubjects } })),
  ];
}

export function initialArchive(book: Book): ArchivedItem[] {
  if (book.id !== pack.bookId) return [];
  return [
    {
      archivedAt: "2026-10-02T18:10:00+01:00",
      reason: "Replaced by a newer version",
      item: {
        kind: "tiktok",
        status: "draft",
        data: {
          id: "cn-tt-old-1",
          hook: "Your first shift in charge, in thirty seconds.",
          beats: ["Say what the handover covered: the patients.", "Say what it did not: the team.", "Close: chapter 1 covers both."],
          onScreenText: ["First shift", "The team"],
          caption: "The keys come with a team. The New Charge Nurse, coming soon.",
          hashtags: ["#nursing", "#NHS"],
          lengthSeconds: 25,
        },
      },
    },
    {
      archivedAt: "2026-10-02T18:12:00+01:00",
      reason: "Archived by you",
      item: {
        kind: "instagram",
        status: "draft",
        data: {
          id: "cn-ig-old-1",
          caption: "What do you check first when you take the keys: the board, the sickest patient or the newest member of staff?",
          hashtags: ["#nursing", "#chargenurse"],
          imageIdea: "A plain card in the cover's amber and navy.",
        },
      },
    },
  ];
}

let seq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

const tiktokPool: Omit<TikTokScript, "id">[] = [
  {
    hook: "Escalate without saying sorry.",
    beats: [
      "Show the call you have been putting off.",
      "Say the patient, the worry and what you need, in that order.",
      "Close: the escalation chapter has the words to use.",
    ],
    onScreenText: ["Patient", "Worry", "What you need"],
    caption: "Escalating is part of the job, not a favour. From The New Charge Nurse.",
    hashtags: ["#nursetips", "#NHS", "#chargenurse"],
    lengthSeconds: 30,
  },
  {
    hook: "Never settle a row at the nurses' station.",
    beats: ["Show the station: busy, public, everyone listening.", "Move to a side room and keep it about the work.", "Ask: what can we fix on this shift?"],
    onScreenText: ["Not here", "Side room", "This shift"],
    caption: "Conflict on the floor is quieter in the right room. Chapter 6 of The New Charge Nurse.",
    hashtags: ["#nursing", "#leadership", "#nursetok"],
    lengthSeconds: 35,
  },
];

const instagramPool: Omit<SocialCaption, "id">[] = [
  {
    caption: "Walk the floor at the start of the shift and again an hour in. Who has gone quiet?",
    hashtags: ["#chargenurse", "#nursing", "#NHS"],
    imageIdea: "An empty ward corridor in early light, no people, cover in the corner.",
  },
  {
    caption: "Fair allocation means saying why, out loud, before anyone has to ask.",
    hashtags: ["#nursingleadership", "#NHS"],
    imageIdea: "Two short lines in the cover's typeface on cream.",
  },
];

const emailPool: (Omit<LaunchEmail, "id"> & { subjects: string[] })[] = [
  {
    subject: "For your first year in charge",
    subjects: ["For your first year in charge", "The New Charge Nurse: a practical book for leading a shift", "The day they hand you the keys"],
    preview: "Practical steps for leading a shift, from the first handover to the end of the day.",
    body: [
      "Hello,",
      "The New Charge Nurse: Your First Year Leading a Shift is now available.",
      "I wrote it for nurses who have just taken the keys and want to lead the shift calmly and fairly.",
      "If it is useful to you, an honest review on Amazon helps other nurses find it.",
      "Harni",
    ],
  },
];

function generic(book: Book, kind: ItemKind, n: number): MarketingItem {
  const subject = book.subtitle || book.title;
  if (kind === "tiktok")
    return {
      kind,
      status: "draft",
      data: {
        id: nid("tt"),
        hook: n % 2 === 0 ? `${book.title}, in under a minute.` : `If ${subject.toLowerCase()} sounds like you, keep watching.`,
        beats: ["Name the problem the book solves, in one line.", "Show one practical step from chapter 1.", `Close: ${book.title} is out soon.`],
        onScreenText: [book.title, "One step to try today"],
        caption: `${subject}. ${book.title}, out soon.`,
        hashtags: ["#booktok", "#newbook"],
        lengthSeconds: 30,
      },
    };
  if (kind === "instagram")
    return {
      kind,
      status: "draft",
      data: {
        id: nid("ig"),
        caption: `${book.title}: ${subject.toLowerCase()}. Out soon.`,
        hashtags: ["#newbook", "#bookstagram"],
        imageIdea: "The cover on a plain surface in daylight.",
      },
    };
  return {
    kind,
    status: "draft",
    data: {
      id: nid("em"),
      subject: `${book.title} is out soon`,
      subjects: [`${book.title} is out soon`, `A new book: ${book.title}`, subject],
      preview: `${subject}, in a short practical book.`,
      body: ["Hello,", `My new book, ${book.title}, is out soon.`, "If it helps you, an honest review helps other readers find it.", "Thank you"],
    },
  };
}

/** The next demo item for a regenerate or generate. The New Charge Nurse draws from the pools; other books get a plain draft. */
export function nextItem(book: Book, kind: ItemKind, n: number): MarketingItem {
  if (book.id === pack.bookId) {
    if (kind === "tiktok") {
      const d = tiktokPool[n % tiktokPool.length]!;
      return { kind, status: "draft", data: { ...d, id: nid("tt") } };
    }
    if (kind === "instagram") {
      const d = instagramPool[n % instagramPool.length]!;
      return { kind, status: "draft", data: { ...d, id: nid("ig") } };
    }
    const d = emailPool[n % emailPool.length]!;
    return { kind, status: "draft", data: { ...d, id: nid("em") } };
  }
  return generic(book, kind, n);
}

export function itemText(item: MarketingItem, subjectIndex = 0): string {
  switch (item.kind) {
    case "tiktok": {
      const d = item.data;
      return [
        `Hook: ${d.hook}`,
        "",
        ...d.beats.map((b, i) => `${i + 1}. ${b}`),
        "",
        `On screen: ${d.onScreenText.join(" / ")}`,
        `Caption: ${d.caption}`,
        d.hashtags.join(" "),
        `Length: about ${d.lengthSeconds} seconds`,
      ].join("\n");
    }
    case "instagram":
      return `${item.data.caption}\n\n${item.data.hashtags.join(" ")}`;
    case "email": {
      const d = item.data;
      return [`Subject: ${d.subjects[subjectIndex] ?? d.subject}`, `Preview: ${d.preview}`, "", ...d.body].join("\n");
    }
  }
}

/** Spoken length of a line at about 3 words a second. */
export function spokenSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 3));
}
