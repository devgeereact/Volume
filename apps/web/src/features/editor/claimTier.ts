/* Claim tiers (21 October 2026): every risky statement stays in the claims report, but the owner only has to act
   on the ones that could do harm ("Needs your check"); the rest are "For the record". The same rule as
   claimNeedsCheck in packages/core/src/claims.ts (kept here so the editor bundle does not load @volume/core);
   keep the two in step. The server sends needsCheck on the claims overview; this reads it when present. */

/** Categories that block or warn in preflight on their own, so they always need the owner's check. */
const ALWAYS_CHECK: ReadonlySet<string> = new Set(["regulatory", "personal"]);

/** True when the owner must check the claim: high risk, harmful if wrong, regulatory or personal, or no risk recorded. */
export function claimNeedsCheck(claim: { category?: string; location?: Readonly<Record<string, unknown>> | null; needsCheck?: boolean }): boolean {
  if (typeof claim.needsCheck === "boolean") return claim.needsCheck;
  if (claim.category && ALWAYS_CHECK.has(claim.category)) return true;
  const risk = claim.location?.["risk"];
  if (risk !== "low" && risk !== "medium") return true;
  return claim.location?.["harmIfWrong"] === true;
}

/** Open claims that need the owner's check: what "Fix the whole book" and the editor's Next line act on. */
export function claimsToCheck<T extends { status: string; category?: string; location?: Readonly<Record<string, unknown>> | null; needsCheck?: boolean }>(
  claims: readonly T[],
): T[] {
  return claims.filter((c) => c.status === "open" && claimNeedsCheck(c));
}
