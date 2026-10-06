import { useSyncExternalStore } from "react";
import { books } from "../../data/books";
import type { ProfileBioStatus } from "../../data/config";
import { penNames } from "../../data/penNames";
import type { PenName } from "../../data/types";

/* Screen-local store for the Profiles screens. It starts from each pen name's full record
   (penName.profile, read from config/profiles/*.json) and keeps edits and new profiles for this visit
   only (nothing is saved to disk in the prototype). Voice samples beyond the profile's own sample
   paragraph, and the memory of accepted and rejected edits, are screen data for the demo. */

export interface VoiceSample {
  id: string;
  kind: "sounds-like" | "not-like";
  text: string;
}

export interface MemoryItem {
  id: string;
  verdict: "accepted" | "rejected";
  before: string;
  after: string;
  reason: string;
  source: string;
  on: boolean;
}

export interface ProfileDraft {
  photoAssetId?: string | null;
  id: string;
  name: string;
  initials: string;
  /** Private. Never printed or exported. */
  legalName: string;
  location: string;
  realPerson: boolean;
  bio: string;
  shortBio: string;
  bioStatus: ProfileBioStatus | "new";
  /** The profile's status note (for real people, what the owner still has to confirm). */
  bioNote: string;
  credentials: string[];
  links: { label: string; value: string }[];
  genres: string[];
  /** Book type ids from config/book-types.json that this profile writes. */
  bookTypes: string[];
  voice: {
    tone: string[];
    pov: string;
    rhythm: string;
    vocabulary: string;
    readingLevel: string;
    dialogueStyle: string;
    locale: "en-GB";
    bannedPhrases: string[];
    sampleParagraph: string;
    samples: VoiceSample[];
  };
  /** Genre settings from the profile (heat level, reader ages, twist plan). Read only here. */
  genreSettings: { label: string; value: string }[];
  publishing: {
    imprint: string;
    copyright: string;
    /** Fills {name} in the copyright line. */
    copyrightName: string;
    disclaimer: string;
    illustrative: boolean;
    illustrativeLine: string;
    defaultBookType: string;
    defaultWordTarget: number;
    trim: string;
    defaultInteriorTheme: string;
    defaultCoverStyle: string;
  };
  /** Stage key to model slug. Missing stages use the workspace default. */
  models: Record<string, string>;
  modelNotes: string;
  memory: MemoryItem[];
  archived: boolean;
}

export const DEFAULT_COPYRIGHT = "Copyright © {year} {name}. All rights reserved.";

export const DEFAULT_DISCLAIMER = "This book is for general information. It does not replace advice from a qualified professional who knows your situation.";

export const DEFAULT_ILLUSTRATIVE =
  "The stories in this book are illustrative. Names, places and details have been changed, and some accounts combine several experiences.";

const seedSamples: Record<string, VoiceSample[]> = {
  "harni-muharami": [
    {
      id: "s-1",
      kind: "sounds-like",
      text: "The first thing I check at the start of a shift is not the board. It is the faces. Who looks tired, who has just come back from leave, who is new and trying not to show it. A ward runs on people before it runs on lists. On my first charge shift I started with the tasks, and by ten o'clock I had a tidy plan and a team that felt unseen. Now I start with a sentence for each person, and the plan follows.",
    },
    {
      id: "s-2",
      kind: "not-like",
      text: "Nurses everywhere face pressure every single day. This book will change the way you think about leadership forever, and by the final page you will be ready for anything.",
    },
  ],
};

const seedMemory: Record<string, MemoryItem[]> = {
  "harni-muharami": [
    {
      id: "m-1",
      verdict: "accepted",
      before: "It is worth saying at the outset that handover is a skill.",
      after: "Handover is a skill.",
      reason: "Cut the throat-clearing opener.",
      source: "The New Charge Nurse, chapter 2, line edit",
      on: true,
    },
    {
      id: "m-2",
      verdict: "accepted",
      before: "She was admitted to the hospital on a Tuesday.",
      after: "She was admitted to hospital on a Tuesday.",
      reason: "British phrasing.",
      source: "The New Charge Nurse, chapter 4, line edit",
      on: true,
    },
    {
      id: "m-3",
      verdict: "rejected",
      before: "I felt my stomach drop.",
      after: "My heart sank like a stone into the cold sea.",
      reason: "Kept the plainer line. Harni avoids big metaphors at tense moments.",
      source: "Speaking Up Safely, chapter 3, voice pass",
      on: true,
    },
    {
      id: "m-4",
      verdict: "accepted",
      before: "Patients and their families",
      after: "The people in our care and the people who love them",
      reason: "Warmer, and how Harni speaks about patients.",
      source: "Speaking Up Safely, chapter 1, voice pass",
      on: false,
    },
    {
      id: "m-5",
      verdict: "rejected",
      before: "Ask for help early.",
      after: "It is essential that you always ask for help as early as you possibly can.",
      reason: "Longer and weaker. Keep short instructions short.",
      source: "The New Charge Nurse, chapter 6, line edit",
      on: true,
    },
  ],
  "gideon-akinlotan": [
    {
      id: "m-6",
      verdict: "accepted",
      before: "Bake for approximately 40 to 45 minutes.",
      after: "Bake for 40 to 45 minutes.",
      reason: "No hedging on times.",
      source: "Sourdough on a Weeknight, chapter 5, line edit",
      on: true,
    },
    {
      id: "m-7",
      verdict: "rejected",
      before: "Leave the dough overnight in the fridge.",
      after: "Let the dough rest overnight in the refrigerator.",
      reason: "Gideon says fridge, the word his readers use.",
      source: "Sourdough on a Weeknight, chapter 3, voice pass",
      on: true,
    },
  ],
};

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function genreSettings(p: PenName): ProfileDraft["genreSettings"] {
  const v = p.profile.voice;
  const out: ProfileDraft["genreSettings"] = [];
  if (v.heatLevel) out.push({ label: "Heat level", value: sentence(v.heatLevel) });
  if (v.audience) out.push({ label: "Reader age", value: `${v.audience.ageMin} to ${v.audience.ageMax}` });
  if (v.newWordPerBook) out.push({ label: "New words", value: "One new word in each book" });
  if (v.series?.ready) out.push({ label: "Series", value: v.series.note });
  if (v.planning) {
    const parts = [v.planning.twistPlan && "twist plan", v.planning.clueLedger && "clue ledger"].filter(Boolean).join(" and ");
    if (parts) out.push({ label: "Planning", value: `${sentence(parts)}. ${v.planning.note}` });
  }
  return out;
}

/** A pen name as an editable draft. Samples and memory default to the demo's own for that pen name. */
export function fromPenName(p: PenName, samples: VoiceSample[] = seedSamples[p.id] ?? [], memory: MemoryItem[] = seedMemory[p.id] ?? []): ProfileDraft {
  const pr = p.profile;
  const models: Record<string, string> = {};
  for (const [stage, slug] of Object.entries(pr.models)) if (slug) models[stage] = slug;
  return {
    id: p.id,
    name: p.name,
    initials: p.initials,
    legalName: pr.legalName ?? "",
    location: pr.location ?? "",
    realPerson: pr.realPerson,
    bio: pr.bio,
    shortBio: pr.shortBio,
    bioStatus: pr.status.bio,
    bioNote: pr.status.note,
    credentials: [...pr.credentials],
    links: pr.links.map((l) => ({ ...l })),
    genres: [...pr.genres],
    bookTypes: [...pr.bookTypes],
    voice: {
      tone: [...pr.voice.tone],
      pov: pr.voice.pov,
      rhythm: pr.voice.rhythm,
      vocabulary: pr.voice.vocabulary,
      readingLevel: pr.voice.readingLevel,
      dialogueStyle: pr.voice.dialogueStyle,
      locale: "en-GB",
      bannedPhrases: [...pr.voice.bannedPhrases],
      sampleParagraph: pr.voice.sampleParagraph,
      samples: samples.map((s) => ({ ...s })),
    },
    genreSettings: genreSettings(p),
    publishing: {
      imprint: pr.imprint ?? "",
      copyright: pr.publishing.copyrightTemplate,
      copyrightName: pr.publishing.copyrightName,
      disclaimer: pr.publishing.disclaimer,
      illustrative: pr.publishing.illustrativeLine !== null,
      illustrativeLine: pr.publishing.illustrativeLine ?? DEFAULT_ILLUSTRATIVE,
      defaultBookType: pr.publishing.defaultBookType,
      defaultWordTarget: pr.publishing.defaultWordTarget,
      trim: pr.publishing.defaultTrim,
      defaultInteriorTheme: pr.publishing.defaultInteriorTheme,
      defaultCoverStyle: pr.publishing.defaultCoverStyle,
    },
    models,
    modelNotes: pr.modelNotes,
    memory: memory.map((m) => ({ ...m })),
    archived: false,
  };
}

export function blankProfile(): ProfileDraft {
  return {
    id: "new",
    name: "",
    initials: "",
    legalName: "",
    location: "",
    realPerson: false,
    bio: "",
    shortBio: "",
    bioStatus: "new",
    bioNote: "",
    credentials: [],
    links: [],
    genres: [],
    bookTypes: [],
    voice: {
      tone: [],
      pov: "",
      rhythm: "",
      vocabulary: "",
      readingLevel: "",
      dialogueStyle: "",
      locale: "en-GB",
      bannedPhrases: [],
      sampleParagraph: "",
      samples: [],
    },
    genreSettings: [],
    publishing: {
      imprint: "",
      copyright: DEFAULT_COPYRIGHT,
      copyrightName: "",
      disclaimer: DEFAULT_DISCLAIMER,
      illustrative: false,
      illustrativeLine: DEFAULT_ILLUSTRATIVE,
      defaultBookType: "",
      defaultWordTarget: 30000,
      trim: "6 x 9 in",
      defaultInteriorTheme: "modern-nonfiction",
      defaultCoverStyle: "serene-serif",
    },
    models: {},
    modelNotes: "",
    memory: [],
    archived: false,
  };
}

let profiles: ProfileDraft[] = penNames.map((p) => fromPenName(p));
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function useProfiles(): ProfileDraft[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => profiles,
  );
}

export function getProfile(id: string): ProfileDraft | undefined {
  return profiles.find((p) => p.id === id);
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  let slug = base || "pen-name";
  let n = 2;
  while (profiles.some((p) => p.id === slug)) slug = `${base}-${n++}`;
  return slug;
}

/** Saves a profile for this visit. A new profile gets an id from its name. Returns the saved id. */
export function saveProfile(draft: ProfileDraft): string {
  const initials = initialsFor(draft.name) || draft.initials;
  if (draft.id === "new") {
    const id = slugify(draft.name);
    profiles = [...profiles, { ...draft, id, initials }];
    emit();
    return id;
  }
  profiles = profiles.map((p) => (p.id === draft.id ? { ...draft, initials } : p));
  emit();
  return draft.id;
}

/** Books under a pen name that are not archived. */
export function bookCount(profileId: string): number {
  return books.filter((b) => b.penNameId === profileId && !b.archived).length;
}

/** The first book title under a pen name, for template previews. */
export function sampleTitle(profileId: string): string {
  return books.find((b) => b.penNameId === profileId)?.title ?? "Your Book Title";
}
