// Claim tiers (21 October 2026). Every medical, clinical, legal and safety statement still goes to the claims report,
// but the owner only has to act on the ones that could do harm. The claims checker rates each claim's risk and whether
// it would do harm if wrong; the server keeps both in the claim's location JSON (location.risk, location.harmIfWrong).
// apps/web/src/features/editor/claimTier.ts holds the same rule for the browser; keep the two in step.

export type ClaimRisk = 'low' | 'medium' | 'high';

/** Categories that block or warn in preflight on their own, so they always need the owner's check. */
const ALWAYS_CHECK: ReadonlySet<string> = new Set(['regulatory', 'personal']);

/** The claim's recorded risk, or null when none was recorded (claims filed before the tiers). */
export function claimRisk(location: Readonly<Record<string, unknown>> | null | undefined): ClaimRisk | null {
  const r = location?.['risk'];
  return r === 'low' || r === 'medium' || r === 'high' ? r : null;
}

/**
 * True when the owner must check the claim ("Needs your check"); false when it is listed for the record only.
 * Needs a check: high risk, harmful if wrong, a regulatory or personal claim, or no risk recorded (older claims).
 */
export function claimNeedsCheck(claim: { category: string; location?: Readonly<Record<string, unknown>> | null }): boolean {
  if (ALWAYS_CHECK.has(claim.category)) return true;
  const risk = claimRisk(claim.location);
  if (risk === null || risk === 'high') return true;
  return claim.location?.['harmIfWrong'] === true;
}
