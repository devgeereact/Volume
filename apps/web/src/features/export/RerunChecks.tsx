import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Button, ProgressBar } from "../../components/ui";
import { isApiError } from "../../api/client";
import { useEstimate, useRerunChecks } from "../../api/hooks";
import { errorText, jobStatusText, useJobWatch } from "../../api/wire-c";
import { estimateLabel } from "../editor/claimOptions";

/** "Run checks again" for one preflight item: the estimate on the button, then progress, then a fresh preflight. */
export function RerunChecks({ bookId, sectionId, onDone }: { bookId: string; sectionId: string; onDone: () => void }) {
  const estimate = useEstimate(bookId, "checks", { sectionIds: [sectionId] });
  const start = useRerunChecks();
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const watch = useJobWatch(bookId, jobId, (w) => {
    setJobId(null);
    setMessage(w.ok ? "Checks finished." : `The checks did not finish. ${w.error ?? "Try again."}`);
    onDone();
  });
  const cost = estimate.data ? estimateLabel(estimate.data) : null;

  async function run() {
    setMessage(null);
    try {
      const r = await start.mutateAsync({ bookId, sectionId });
      setJobId(r.jobId);
    } catch (e) {
      setMessage(isApiError(e) && e.status === 409 ? "Checks are already running for this section." : errorText(e));
    }
  }

  return (
    <div className="col-start-2 grid gap-1.5 self-start justify-self-start sm:col-start-3 sm:justify-self-end">
      {watch.running ? (
        <ProgressBar
          className="w-[180px]"
          value={Math.round(watch.progress * 100)}
          max={100}
          live
          label="Checks progress"
          valueText={watch.message ?? jobStatusText(watch.status)}
        />
      ) : (
        <Button size="sm" icon={RotateCw} loading={start.isPending} loadingLabel="Starting" onClick={() => void run()}>
          {cost ? `Run checks again (${cost})` : "Run checks again"}
        </Button>
      )}
      {(watch.running || message) && (
        <p className="text-caption text-ink-secondary" role="status">
          {watch.running ? (watch.message ?? jobStatusText(watch.status)) : message}
        </p>
      )}
    </div>
  );
}
