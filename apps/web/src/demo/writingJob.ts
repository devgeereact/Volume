import type { WritingJob } from "./types";

/* The live writing job for Handover (board: Library live panel, Writing frame, job bar).
   Words: front matter 760 + chapters 1 to 5 (18,740) + chapter 6 so far (1,840) = 21,340. */

export const handoverJob: WritingJob = {
  id: "job-handover-write",
  bookId: "handover",
  label: "Writing Handover",
  startedAt: "2026-10-04T13:19:00+01:00",
  runningMinutes: 72,
  minutesLeft: 40,
  model: "~anthropic/claude-sonnet-latest",
  fallback: "~anthropic/claude-opus-latest",
  words: { written: 21340, target: 38000 },
  cost: { spent: 1.92, budget: 15 },
  sections: [
    { id: "front", number: null, title: "Front matter", status: "done", words: 760, wordTarget: 800, claims: 0 },
    { id: "ch-1", number: 1, title: "Why Handover Goes Wrong", status: "done", words: 3940, wordTarget: 3800, claims: 0 },
    { id: "ch-2", number: 2, title: "The Shape of a Good Handover", status: "done", words: 3610, wordTarget: 3600, claims: 0 },
    { id: "ch-3", number: 3, title: "SBAR Without the Script", status: "attention", words: 3690, wordTarget: 3700, claims: 1 },
    { id: "ch-4", number: 4, title: "Handing Over at the Bedside", status: "done", words: 3780, wordTarget: 3800, claims: 0 },
    { id: "ch-5", number: 5, title: "When the Patient Is Deteriorating", status: "done", words: 3720, wordTarget: 3700, claims: 0 },
    { id: "ch-6", number: 6, title: "The Night-to-Day Handover", status: "writing", words: 1840, wordTarget: 3800, claims: 0 },
    { id: "ch-7", number: 7, title: "Handover Across Teams", status: "queued", words: 0, wordTarget: 3600, claims: 0 },
    { id: "ch-8", number: 8, title: "Writing It Down", status: "queued", words: 0, wordTarget: 3500, claims: 0 },
    { id: "ch-9", number: 9, title: "Difficult Handovers", status: "queued", words: 0, wordTarget: 3700, claims: 0 },
    { id: "ch-10", number: 10, title: "Building a Handover Culture", status: "queued", words: 0, wordTarget: 3600, claims: 0 },
    { id: "back", number: null, title: "Back matter", status: "queued", words: 0, wordTarget: 1700, claims: 0 },
  ],
  current: {
    sectionId: "ch-6",
    chapterNumber: 6,
    chapterTitle: "The Night-to-Day Handover",
    wordsSoFar: 1840,
    wordTarget: 3800,
    blocks: [
      {
        kind: "p",
        text: "The last hour of a night shift has its own weather. The ward is quiet in a way that is not quite rest, the drug round is done, and everyone is already half way through the conversation they will have at eight o'clock.",
      },
      { kind: "h", text: "Arriving before the shift starts" },
      {
        kind: "p",
        text: "So the handover begins not with the patient list but with a breath. I learnt that on a respiratory ward at seven in the morning, when the night team had nothing left to give and the day team had not yet arrived in their heads.",
      },
    ],
    streamingChunks: [
      "Five minutes early ",
      "is not about looking keen. ",
      "It is the time it takes ",
      "to read the room: ",
      "who looks tired, ",
      "which curtains are drawn, ",
      "whose call bell has been going ",
      "since six.",
    ],
  },
  lastChecks: {
    chapter: 5,
    items: [
      { label: "No em dashes", passed: true, attention: false },
      { label: "British spelling", passed: true, attention: false },
      { label: "No banned phrases", passed: true, attention: false },
      { label: "3,720 words, inside the range", passed: true, attention: false },
      { label: "1 claim sent to verify", passed: false, attention: true },
    ],
  },
  needsAttention: [{ sectionId: "ch-3", text: "Chapter 3 has a claim to verify about SBAR training." }],
};
