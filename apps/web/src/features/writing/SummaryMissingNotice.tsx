import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Banner, Button } from "../../components/ui";
import { useRunSummary } from "../../api/hooks";
import { isTerminalJob, type ApiCheckResult } from "../../api/types";
import { isSummaryOnlyJob, openSummaryFlag, plainError, useBookJobsLive } from "../../api/wire-b";
import { useJobWatch } from "../../api/wire-c";

/* The open summary_missing flag on a section's current text (owner decision, 7 October 2026): the text is
   saved, but its summary failed, so later sections were written without it. Run the summary again starts a
   write_section job with summaryOnly; it never rewrites the text. Shown on Writing and in the Editor. */

const FALLBACK =
  "The text is saved, but its summary failed, so later sections were written without its summary and story ledger entries. Run the summary again.";

/** The flag's message without its "Summary missing: " lead, which is the banner title. */
function flagBody(message: string): string {
  const cut = message.indexOf(": ");
  const body = cut > 0 ? message.slice(cut + 2) : message;
  const text = body.trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : FALLBACK;
}

export function SummaryMissingNotice({
  bookId,
  sectionId,
  checks,
  className,
}: {
  bookId: string;
  sectionId: string;
  checks: readonly ApiCheckResult[] | undefined;
  className?: string;
}) {
  const flag = openSummaryFlag(checks);
  const { jobs } = useBookJobsLive(bookId);
  const run = useRunSummary();
  const [jobId, setJobId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ saved: boolean; text: string } | null>(null);
  const watch = useJobWatch(bookId, jobId, (w) => {
    setJobId(null);
    // The job can end needing attention for another open check even when the summary itself was saved.
    const saved = typeof w.result === "object" && w.result !== null && (w.result as { summaryMissing?: unknown }).summaryMissing === false;
    setOutcome({
      saved,
      text: saved
        ? "Summary saved. Later sections can use it now."
        : w.status === "cancelled"
          ? "The summary run was stopped. The text is still saved."
          : `The summary failed again. The text is still saved. ${w.error ?? "Try again."}`,
    });
  });
  // A rerun started here, or one already running (started earlier or in another tab).
  const active = jobs.some((j) => isSummaryOnlyJob(j) && j.sectionId === sectionId && !isTerminalJob(j.status));
  const running = run.isPending || watch.running || active;

  if (!flag && !running && !outcome?.saved) return null;

  function rerun() {
    setOutcome(null);
    run.mutate({ bookId, sectionId }, { onSuccess: (r) => setJobId(r.jobId) });
  }

  if (!flag && !running) {
    return (
      <div className={className}>
        <Banner tone="success" title="Summary saved">
          {outcome?.text}
        </Banner>
      </div>
    );
  }

  return (
    <div className={className}>
      <Banner
        tone="attention"
        title={running ? "Summarising this section" : "Summary missing"}
        action={
          <Button size="sm" icon={RotateCcw} onClick={rerun} loading={running} loadingLabel="Summarising">
            Run the summary again
          </Button>
        }
      >
        <p>{running ? "The text stays as it is. Only the summary and its story ledger entries are made again." : flag ? flagBody(flag.message) : FALLBACK}</p>
        {!running && outcome && !outcome.saved && <p className="mt-1">{outcome.text}</p>}
        {run.isError && <p className="mt-1 text-claim">{plainError(run.error)}</p>}
      </Banner>
    </div>
  );
}
