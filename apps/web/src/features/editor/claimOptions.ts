/* Claim replacements: reading the suggest job's options, turning the owner's choice into the apply
   request, and finding the paragraph the new text landed in. No React here, so the tests can call it. */

import type { ClaimApplyInput, ClaimApproach, ClaimOption } from "../../api/types";

export const APPROACH_LABEL: Record<ClaimApproach, string> = {
  soften: "Soften",
  generalise: "Generalise",
  attribute: "Attribute to a source",
  reframe: "Reframe",
  remove: "Remove the sentence",
};

export function approachLabel(a: string): string {
  return (APPROACH_LABEL as Record<string, string>)[a] ?? a.charAt(0).toUpperCase() + a.slice(1);
}

const APPROACHES = new Set<string>(Object.keys(APPROACH_LABEL));

/** The options in a finished suggest job's result, checked field by field. At most three. */
export function readOptions(result: unknown): ClaimOption[] {
  const list = result && typeof result === "object" ? (result as { options?: unknown }).options : undefined;
  if (!Array.isArray(list)) return [];
  const out: ClaimOption[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const approach = typeof o.approach === "string" && APPROACHES.has(o.approach) ? o.approach : null;
    if (!approach || typeof o.text !== "string") continue;
    if (approach !== "remove" && o.text.trim() === "") continue;
    out.push({ text: o.text, approach, rationale: typeof o.rationale === "string" ? o.rationale : "", needsSource: o.needsSource === true });
  }
  return out.slice(0, 3);
}

/** What the owner picked: an option as it is, an option they edited, or their own sentence. */
export type ClaimChoice = { kind: "option"; option: ClaimOption } | { kind: "edited"; option: ClaimOption; text: string } | { kind: "own"; text: string };

/** The apply request for a choice, or the reason it cannot go yet. */
export function applyInput(choice: ClaimChoice, sentence: string): { input: ClaimApplyInput } | { error: string } {
  if (choice.kind === "option") return { input: { text: choice.option.approach === "remove" ? "" : choice.option.text, approach: choice.option.approach } };
  const text = choice.text.trim();
  const approach = choice.kind === "edited" ? choice.option.approach : "own";
  if (!text) return { error: "Write the new sentence first." };
  if (text === sentence.trim()) return { error: "Change the wording first." };
  return { input: { text, approach } };
}

/** The paragraph of the saved text that holds the new sentence, and the same paragraph before the change. */
export function inContext(bodyMd: string, sentence: string, text: string): { before: string; after: string } | null {
  const paragraphs = bodyMd.split(/\n{2,}/).map((p) => p.trim());
  const t = text.trim();
  if (!t) return null;
  const after = paragraphs.find((p) => p.includes(t));
  if (!after) return null;
  return { before: after.replace(t, sentence.trim()), after };
}

/** "about $0.01 to $0.02", the way spending buttons name their cost. */
export function estimateLabel(e: { lowUsd: number; highUsd: number }): string {
  if (e.highUsd < 0.01) return "under $0.01";
  const lo = e.lowUsd.toFixed(2);
  const hi = e.highUsd.toFixed(2);
  return lo === hi ? `about $${lo}` : `about $${lo} to $${hi}`;
}
