import type { WritingSection } from "../../data";

/* Screen-only mock data for the Writing screen: when each Handover section finished, what it cost,
   its opening line, and the checks that ran on it (docs/01-PRD.md M8: em dashes, British spelling,
   banned phrases, word count against target, claims found). Demo data only. */

export type CheckResult = "pass" | "fixed" | "attention";

export interface ChapterCheck {
  id: "em-dash" | "spelling" | "banned" | "words" | "claims";
  label: string;
  result: CheckResult;
  detail: string;
}

export interface ChapterLog {
  sectionId: string;
  finishedAt: string;
  minutes: number;
  costUsd: number;
  opening: string;
  /** Automatic fixes the checker made before saving (em dashes, spellings). */
  fixes: { emDashes: number; spellings: string[] };
}

export const chapterLogs: ChapterLog[] = [
  {
    sectionId: "front",
    finishedAt: "2026-10-04T13:23:00+01:00",
    minutes: 4,
    costUsd: 0.06,
    opening: "Title page, copyright, dedication, contents and a short note on how to use this book.",
    fixes: { emDashes: 0, spellings: [] },
  },
  {
    sectionId: "ch-1",
    finishedAt: "2026-10-04T13:35:00+01:00",
    minutes: 12,
    costUsd: 0.36,
    opening: "Most handovers do not fail because someone forgot a fact. They fail because the story of the shift never made it across the desk.",
    fixes: { emDashes: 2, spellings: [] },
  },
  {
    sectionId: "ch-2",
    finishedAt: "2026-10-04T13:46:00+01:00",
    minutes: 11,
    costUsd: 0.33,
    opening: "A good handover has a shape you can feel even when nobody names it: who the patient is, what changed, and what happens next.",
    fixes: { emDashes: 0, spellings: ["prioritize to prioritise"] },
  },
  {
    sectionId: "ch-3",
    finishedAt: "2026-10-04T13:58:00+01:00",
    minutes: 12,
    costUsd: 0.35,
    opening: "SBAR is taught as four boxes on a card. On a busy ward it works best as four questions you carry in your head.",
    fixes: { emDashes: 1, spellings: [] },
  },
  {
    sectionId: "ch-4",
    finishedAt: "2026-10-04T14:09:00+01:00",
    minutes: 11,
    costUsd: 0.34,
    opening: "Handing over at the bedside means the patient hears their own story, and sometimes corrects it.",
    fixes: { emDashes: 0, spellings: [] },
  },
  {
    sectionId: "ch-5",
    finishedAt: "2026-10-04T14:20:00+01:00",
    minutes: 11,
    costUsd: 0.34,
    opening: "When a patient is getting worse, the handover changes speed. The facts come first and the reassurance comes later.",
    fixes: { emDashes: 0, spellings: ["color to colour"] },
  },
];

export function logFor(sectionId: string): ChapterLog | undefined {
  return chapterLogs.find((l) => l.sectionId === sectionId);
}

/** Word count is fine within 15% of the target (AC7.9). */
export function wordsInRange(words: number, target: number): boolean {
  return Math.abs(words - target) <= target * 0.15;
}

/** The five checks shown for a finished section. `claims` can be overridden after a retry. */
export function checksFor(section: WritingSection, log: ChapterLog | undefined, claims: number = section.claims): ChapterCheck[] {
  const fmt = new Intl.NumberFormat("en-GB");
  const emDashes = log?.fixes.emDashes ?? 0;
  const spellings = log?.fixes.spellings ?? [];
  const inRange = wordsInRange(section.words, section.wordTarget);
  return [
    {
      id: "em-dash",
      label: "No em dashes",
      result: emDashes > 0 ? "fixed" : "pass",
      detail: emDashes > 0 ? `${emDashes} replaced with commas automatically` : "None found",
    },
    {
      id: "spelling",
      label: "British spelling",
      result: spellings.length > 0 ? "fixed" : "pass",
      detail: spellings.length > 0 ? `Fixed: ${spellings.join(", ")}` : "No US spellings",
    },
    { id: "banned", label: "No banned phrases", result: "pass", detail: "None of the house style list" },
    {
      id: "words",
      label: `${fmt.format(section.words)} words`,
      result: inRange ? "pass" : "attention",
      detail: inRange ? `Target ${fmt.format(section.wordTarget)}, inside the range` : `Target ${fmt.format(section.wordTarget)}, outside 15%`,
    },
    {
      id: "claims",
      label: claims === 0 ? "No claims found" : `${claims} claim sent to verify`,
      result: claims === 0 ? "pass" : "attention",
      detail: claims === 0 ? "Nothing medical, legal or statistical to check" : "Listed in the claims to verify report",
    },
  ];
}

/** Where the needs-attention claim sits, so the Editor opens on it. */
export const attentionDetail: Record<string, { sentence: string; reason: string }> = {
  "ch-3": {
    sentence: "Wards that train every nurse in SBAR see fewer missed deteriorations.",
    reason: "A clinical outcome stated as fact without a source.",
  },
};
