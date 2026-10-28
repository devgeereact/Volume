import type { ApiActivityItem } from "./types";

/* A failed-job notice should not outlive the problem. GET /activity has no stage field, but its detail line
   starts with the stage label: "Research failed: ..." and "Research finished". So a failure is out of date when
   the same book has a later "finished" line with the same label. "finished, needs attention" is not a success. */

function failedLabel(detail: string): string | null {
  const at = detail.indexOf(" failed");
  return at > 0 ? detail.slice(0, at) : null;
}

function finishedLabel(detail: string): string | null {
  const suffix = " finished";
  return detail.endsWith(suffix) && detail.length > suffix.length ? detail.slice(0, -suffix.length) : null;
}

/** Job ids of failures that a newer job of the same book and stage has since completed. */
export function supersededFailureIds(items: readonly ApiActivityItem[]): Set<string> {
  const out = new Set<string>();
  for (const f of items) {
    if (f.kind !== "job_failed" || !f.jobId || !f.projectId) continue;
    const label = failedLabel(f.detail);
    if (!label) continue;
    const later = items.some((s) => s.kind === "job_finished" && s.projectId === f.projectId && s.at > f.at && finishedLabel(s.detail) === label);
    if (later) out.add(f.jobId);
  }
  return out;
}
