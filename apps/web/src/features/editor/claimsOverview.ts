/* The book's Claims screen without React: status filters with their counts, claims grouped by section
   in reading order, and the editor's claim shape for the shared actions. */

import type { ClaimOverviewFilter, ClaimOverviewItem, ClaimsOverview } from "../../api/types";
import type { MsClaim } from "./manuscript";
import { claimNeedsCheck } from "./claimTier";

/** Which claims the screen lists: the ones that need the owner's check, or the ones listed for the record. */
export type ClaimTierView = "check" | "record";

/** The listed claims split by tier (claimTier.ts), keeping the server's reading order in each. */
export function splitByTier(items: readonly ClaimOverviewItem[]): Record<ClaimTierView, ClaimOverviewItem[]> {
  const out: Record<ClaimTierView, ClaimOverviewItem[]> = { check: [], record: [] };
  for (const c of items) out[claimNeedsCheck(c) ? "check" : "record"].push(c);
  return out;
}

export const FILTERS: { id: ClaimOverviewFilter; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "verified", label: "Verified" },
  { id: "softened", label: "Softened" },
  { id: "removed", label: "Removed" },
  { id: "author_experience", label: "Your experience" },
  { id: "all", label: "All" },
];

export function filterCount(counts: ClaimsOverview["counts"] | undefined, id: ClaimOverviewFilter): number | undefined {
  if (!counts) return undefined;
  if (id === "all") return counts.open + counts.verified + counts.softened + counts.removed + counts.author_experience;
  return counts[id];
}

const KIND_TITLES: Record<string, string> = { introduction: "Introduction", conclusion: "Conclusion", about_author: "About the author" };

export function sectionName(s: ClaimOverviewItem["section"]): string {
  if (!s) return "Not in a section";
  if (s.kind === "chapter" && s.number !== null) return s.title ? `Chapter ${s.number}: ${s.title}` : `Chapter ${s.number}`;
  return s.title ?? KIND_TITLES[s.kind] ?? s.kind.replace(/_/g, " ");
}

export interface ClaimGroup {
  key: string;
  sectionId: string | null;
  name: string;
  items: ClaimOverviewItem[];
}

/** Groups in the order the server listed the claims (reading order); a section shows once. */
export function groupBySection(items: ClaimOverviewItem[]): ClaimGroup[] {
  const groups = new Map<string, ClaimGroup>();
  for (const c of items) {
    const key = c.section?.id ?? "none";
    let g = groups.get(key);
    if (!g) {
      g = { key, sectionId: c.section?.id ?? null, name: sectionName(c.section), items: [] };
      groups.set(key, g);
    }
    g.items.push(c);
  }
  return [...groups.values()];
}

/** The editor's claim shape, so the screen shares the editor's replacement options. */
export function toMsClaim(c: ClaimOverviewItem, category: string): MsClaim {
  return {
    id: c.id,
    sectionId: c.sectionId ?? "",
    blockId: "",
    sentence: c.sentence,
    category,
    check: c.checkNeeded ?? "Check this statement before you publish.",
    softened: c.suggestedSoftening?.trim() ? c.suggestedSoftening : "",
    status:
      c.status === "verified" || c.status === "author_experience"
        ? "verified"
        : c.status === "softened"
          ? "softened"
          : c.status === "removed"
            ? "removed"
            : "open",
    note: c.ownerNote ?? c.sourceUrl ?? undefined,
    needsCheck: claimNeedsCheck(c),
  };
}

/** The server's claim category in words. */
export function categoryLabel(c: string): string {
  const map: Record<string, string> = {
    medical: "Medical",
    clinical: "Clinical",
    legal: "Legal",
    safety: "Safety",
    statistical: "Statistical",
    financial: "Financial",
    personal: "Personal",
    regulatory: "Named firm",
    other_fact: "Fact",
  };
  return map[c] ?? c;
}
