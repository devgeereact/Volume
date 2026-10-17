import type { ApiLedgerItem, StoryBible } from "../api/types";

/* Demo fiction data (phase 6): the story bible and the character and setting ledger for The Ninth Lock,
   so the Blueprint screen shows both in demo mode. Invented for the demo; it is a thriller plot, not a
   claim about real people or places. */

export const ninthLockBible: StoryBible = {
  logline:
    "A locksmith who opens safes for the police finds her own initials scratched inside a vault she has never seen, and has nine days to learn who wants her blamed for a theft that has not happened yet.",
  themes: ["Trust is earned in small, checkable steps", "The past keeps its own keys"],
  characters: [
    {
      name: "Mara Quill",
      role: "Lead, police locksmith",
      want: "To clear her name before the ninth lock opens",
      need: "To let someone help her",
      flaw: "Trusts mechanisms more than people",
      voiceNotes: "Short, exact sentences. Counts things when she is nervous.",
      appearance: "Late thirties, cropped grey-streaked hair, a burn scar across her left palm",
    },
    {
      name: "DI Sam Okafor",
      role: "Ally, then suspect",
      want: "A clean case and a quiet promotion",
      need: "To admit what he buried ten years ago",
      flaw: "Protects his team at any cost",
      voiceNotes: "Dry humour, never swears, calls Mara by her surname",
      appearance: "Tall, careful suits, reading glasses he hates",
    },
    {
      name: "Ivo Brandt",
      role: "Antagonist, vault designer",
      want: "To prove no lock he built can be beaten",
      need: "",
      flaw: "Pride",
      voiceNotes: "Polite, formal, speaks in finished paragraphs",
      appearance: "Seventies, immaculate, a silver cane",
    },
  ],
  settings: [
    { name: "Quill and Daughter", description: "Mara's workshop under a railway arch in Bermondsey, loud every eleven minutes." },
    { name: "The Harcourt vault", description: "A private vault beneath a closed bank on Threadneedle Street, nine doors deep." },
    { name: "Okafor's flat", description: "A tidy flat in Deptford with one locked drawer." },
  ],
  timeline: [
    "Day 1: Mara is called to open a vault and finds her initials inside",
    "Day 3: the first of nine locks is found opened with her tools",
    "Day 6: Okafor's old case file goes missing",
    "Day 9: the ninth lock, and the truth about Brandt",
  ],
  worldRules: ["Every lock in the book works the way real locks work; no gadgets that cannot exist", "The police procedure stays plausible and unglamorous"],
  povPlan: "Close third person on Mara throughout, with one chapter from Okafor at the midpoint.",
  ending: "Mara opens the ninth lock in front of witnesses and proves Brandt built the trap; Okafor confesses his part and resigns.",
};

/** Chapter names for the demo ledger (section id to label). */
export const ninthLockSections: Record<string, string> = {
  "nl-ch-1": "Chapter 1",
  "nl-ch-2": "Chapter 2",
  "nl-ch-3": "Chapter 3",
  "nl-ch-4": "Chapter 4",
};

export const ninthLockLedger: ApiLedgerItem[] = [
  { kind: "character", key: "Mara Quill", detail: "Burn scar on her left palm; counts tumblers aloud under stress.", sectionId: "nl-ch-1" },
  { kind: "setting", key: "Quill and Daughter", detail: "Trains pass overhead every eleven minutes; the bench faces the door.", sectionId: "nl-ch-1" },
  { kind: "setting", key: "The Harcourt vault", detail: "Nine doors; the third has a time lock set to 02:10.", sectionId: "nl-ch-1" },
  { kind: "character", key: "DI Sam Okafor", detail: "Calls her Quill; wears reading glasses only when nobody is looking.", sectionId: "nl-ch-2" },
  { kind: "character", key: "Mara Quill", detail: "Has not spoken to her father since the workshop fire.", sectionId: "nl-ch-2" },
  { kind: "character", key: "Ivo Brandt", detail: "Silver cane; refers to his vaults as 'she'.", sectionId: "nl-ch-3" },
  { kind: "character", key: "Petra Lind", detail: "Bank night guard; saw a woman with cropped hair leave at 02:30.", sectionId: "nl-ch-4" },
  { kind: "setting", key: "Okafor's flat", detail: "One locked drawer in the hall table.", sectionId: "nl-ch-4" },
];
