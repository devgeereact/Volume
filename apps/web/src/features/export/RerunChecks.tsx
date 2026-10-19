import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Button, ProgressBar } from "../../components/ui";
import { isApiError } from "../../api/client";
import { useRerunChecks } from "../../api/hooks";
import { errorText, jobStatusText, useJobWatch } from "../../api/wire-c";
import { estimateLabel } from "../editor/claimOptions";
import { runningJob } from "./preflightFix";

/**
 * "Run checks again" for one preflight item: reruns only the missing steps, shows their cost and progress,
 * then a fresh preflight. A run already going on the section is followed instead of starting another.
 */
export function RerunChecks({ bookId, sectionId, onDone }: { bookId: string; sectionId: string; onDone: () => void }) {
  const start = useRerunChecks();
  const [jobId, setJobId] = useState<string | null>(null);
  const [cost, setCost] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const watch = useJobWatch(bookId, jobId, (w) => {
    setJobId(null);
    setMessage(w.ok ? "Checks finished." : `The checks did not finish. ${w.error ?? "Try again."}`);
    onDone();
  });

  async function run() {
    setMessage(null);
    try {
      const r = await start.mutateAsync({ bookId, sectionId });
      setCost(r.estimate ? estimateLabel(r.estimate) : null);
      setJobId(r.jobId);
    } catch (e) {
      const running = isApiError(e) && e.isConflict ? runningJob(e.details) : null;
      if (running) {
        setCost(null);
        setJobId(running);
        setMessage("Checks are already running. Following that run.");
      } else setMessage(errorText(e));
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
          Run checks again
        </Button>
      )}
      {(watch.running || message) && (
        <p className="text-caption text-ink-secondary" role="status">
          {watch.running ? `${message ?? watch.message ?? jobStatusText(watch.status)}${cost ? `, ${cost}` : ""}` : message}
        </p>
      )}
    </div>
  );
}
