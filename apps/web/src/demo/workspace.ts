import type { ArchivedItem, WorkspaceStatus } from "./types";

/* Workspace status for the spine footer and Settings. Demo values: the prototype never reads a key
   and never calls OpenRouter. Backups sit in data/backups under the repository's data folder
   (docs/02-architecture/ARCHITECTURE.md, storage layout). */

export const workspace: WorkspaceStatus = {
  openRouter: { connected: true, keyPresent: true, creditUsd: 35.18, checkedAt: "2026-10-04T14:30:00+01:00" },
  spend: { monthLabel: "October", spentUsd: 4.82, budgetUsd: 40 },
  backups: { lastAt: "2026-10-04T02:00:00+01:00", location: "~/Projects/volume/data/backups", keep: 14 },
  houseStyle: { version: 1, bannedPhrases: 102, spellingPairs: 193 },
  kdpRules: { version: "2026-10-03", rules: 38, recheckDue: "2027-01-01" },
};

export const archivedItems: ArchivedItem[] = [
  {
    id: "arc-1",
    kind: "book",
    title: "Ward Rounds for Beginners",
    detail: "Harni Muharami. Stopped at blueprint, version 2.",
    archivedAt: "2026-09-18T15:20:00+01:00",
  },
  {
    id: "arc-2",
    kind: "book",
    title: "Letters from the Lighthouse",
    detail: "Elena Marsh. Idea only.",
    archivedAt: "2026-09-02T09:10:00+01:00",
  },
  {
    id: "arc-3",
    kind: "pen-name",
    title: "H. M. Ward",
    detail: "Trial pen name. No books.",
    archivedAt: "2026-08-30T12:00:00+01:00",
  },
  {
    id: "arc-4",
    kind: "marketing",
    title: "Windowsill Herbs, spring email",
    detail: "Launch email draft, replaced by version 2.",
    archivedAt: "2026-09-10T18:30:00+01:00",
  },
];
