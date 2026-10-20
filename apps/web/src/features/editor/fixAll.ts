/* "Fix every claim" on the Claims page: works through the open claims one at a time, the cleanest way each
   allows. A claim with softer wording on file takes it (no AI). Otherwise the claim-fix model suggests three
   replacements and the first safe one is applied: soften, generalise or reframe, or an attribution that needs
   no new source. A claim whose sentence is no longer in the text is closed as removed. No React here, so the
   tests can call it. */

import type { ClaimApplyInput, ClaimOption, ClaimOverviewItem } from "../../api/types";
import { readBaseVersion, readOptions } from "./claimOptions";

const ORDER = ["soften", "generalise", "reframe", "attribute"];

/** The option to apply without asking: the first safe one by approach, never one that needs a new source. Null when none. */
export function pickAutoOption(options: readonly ClaimOption[]): ClaimOption | null {
  for (const approach of ORDER) {
    const hit = options.find((o) => o.approach === approach && !o.needsSource && o.text.trim() !== "");
    if (hit) return hit;
  }
  return options.find((o) => o.approach === "remove") ?? null;
}

export interface FixAllApi {
  soften: (claimId: string) => Promise<unknown>;
  remove: (claimId: string, note: string) => Promise<unknown>;
  /** Starts a suggest job and resolves with its result once it ends (throws when it failed). */
  suggest: (claimId: string) => Promise<{ jobId: string; result: unknown }>;
  apply: (claimId: string, input: ClaimApplyInput) => Promise<unknown>;
}

export type FixOutcome = "softened" | "fixed" | "gone" | "skipped" | "failed";

export interface FixReport {
  done: number;
  outcomes: Record<FixOutcome, number>;
  /** The first errors, for the summary. */
  errors: string[];
}

export async function fixAllClaims(
  claims: readonly ClaimOverviewItem[],
  api: FixAllApi,
  opts: { onProgress?: (done: number, total: number, claim: ClaimOverviewItem) => void; cancelled?: () => boolean } = {},
): Promise<FixReport> {
  const open = claims.filter((c) => c.status === "open");
  const report: FixReport = { done: 0, outcomes: { softened: 0, fixed: 0, gone: 0, skipped: 0, failed: 0 }, errors: [] };
  for (const c of open) {
    if (opts.cancelled?.()) break;
    opts.onProgress?.(report.done, open.length, c);
    try {
      if (!c.inCurrentText) {
        await api.remove(c.id, "The sentence is no longer in the text.");
        report.outcomes.gone++;
      } else if (c.suggestedSoftening) {
        await api.soften(c.id);
        report.outcomes.softened++;
      } else {
        const job = await api.suggest(c.id);
        const option = pickAutoOption(readOptions(job.result));
        if (!option) {
          report.outcomes.skipped++;
        } else {
          const base = readBaseVersion(job.result);
          await api.apply(c.id, {
            text: option.approach === "remove" ? "" : option.text,
            approach: option.approach,
            jobId: job.jobId,
            ...(base ? { baseVersionId: base } : {}),
          });
          report.outcomes.fixed++;
        }
      }
    } catch (e) {
      report.outcomes.failed++;
      if (report.errors.length < 3) report.errors.push(e instanceof Error ? e.message : String(e));
    }
    report.done++;
  }
  return report;
}
