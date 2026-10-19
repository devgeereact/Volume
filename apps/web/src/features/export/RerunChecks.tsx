import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Button, ProgressBar } from "../../components/ui";
import { isApiError } from "../../api/client";
import { useRecheckPreview, useRerunChecks } from "../../api/hooks";
import { errorText, jobStatusText, useJobWatch } from "../../api/wire-c";
import { estimateLabel } from "../editor/claimOptions";
import { runningJob } from "../../api/jobErrors";

/**
 * "Run checks again" for one preflight item. The cost of the missing steps is read first (no charge) and
 * named on the button; nothing runs until it is clicked. A run already going on the section is followed
 * instead of starting another. When it ends, preflight runs again.
 */
export function RerunChecks({ bookId, sectionId, onDone }: { bookId: string; sectionId: string; onDone: () => void }) {
  const preview = useRecheckPreview(sectionId);
  const start = useRerunChecks();
  const [jobId, setJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const following = jobId ?? preview.data?.runningJobId ?? null;
  const watch = useJobWatch(bookId, following, (w) => {
    setJobId(null);
    setMessage(w.ok ? "Checks finished." : `The checks did not finish. ${w.error ?? "Try again."}`);
    void preview.refetch();
    onDone();
  });
  const cost = preview.data ? estimateLabel(preview.data.estimate) : null;

  async function run() {
    setMessage(null);
    try {
      const r = await start.mutateAsync({ bookId, sectionId });
      setJobId(r.jobId);
    } catch (e) {
      const running = isApiError(e) && e.isConflict ? runningJob(e.details) : null;
      if (running) {
        setJobId(running);
        setMessage("Checks are already running. Following that run.");
      } else setMessage(errorText(e));
    }
  }

  let body;
  if (watch.running)
    body = (
      <ProgressBar
        className="w-[180px]"
        value={Math.round(watch.progress * 100)}
        max={100}
        live
        label="Checks progress"
        valueText={watch.message ?? jobStatusText(watch.status)}
      />
    );
  else if (preview.isError)
    body = (
      <Button size="sm" variant="ghost" icon={RotateCw} onClick={() => void preview.refetch()}>
        Work out the cost again
      </Button>
    );
  else if (preview.data && (!preview.data.hasText || preview.data.steps.length === 0)) body = null;
  else
    body = (
      <Button
        size="sm"
        icon={RotateCw}
        loading={start.isPending}
        loadingLabel="Starting"
        disabledReason={cost ? undefined : "Working out the cost first."}
        onClick={() => void run()}
      >
        {cost ? `Run checks again (${cost})` : "Run checks again"}
      </Button>
    );

  const status = watch.running
    ? `${message ?? watch.message ?? jobStatusText(watch.status)}${cost && !message ? `, ${cost}` : ""}`
    : preview.isError
      ? `Could not work out the cost. ${errorText(preview.error)} Nothing runs until it shows.`
      : preview.data && !preview.data.hasText
        ? "This section has no text to check yet."
        : preview.data && preview.data.steps.length === 0
          ? (message ?? "Nothing is missing now. Run preflight again.")
          : message;

  return (
    <div className="col-start-2 grid gap-1.5 self-start justify-self-start sm:col-start-3 sm:justify-self-end">
      {body}
      {status && (
        <p className="max-w-[240px] text-caption text-ink-secondary" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
