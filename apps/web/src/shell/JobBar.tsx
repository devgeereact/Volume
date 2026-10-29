import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { CircleAlert, Pause, Play } from "lucide-react";
import { Button } from "../components/ui/Button";
import { LiveDot } from "../components/ui/LiveDot";
import { ProgressBar } from "../components/ui/ProgressBar";
import { formatNumber, formatUsd } from "../lib/format";
import { useWritingJob } from "../lib/job";
import { cn } from "../lib/cn";
import { bookStepPath } from "../screens";
import { useJob, useJobControl } from "../api/hooks";
import { isSummaryOnlyJob } from "../api/wire-b";
import { apiErrorText, dismissFailure, JOB_LABELS, stepForJob, type RunningJob } from "../api/wire-a";

/**
 * "Writing now" bar, 56 px, glass, fixed to the bottom of the main column while a job runs elsewhere.
 * Content above gets matching bottom padding (--shell-jobbar), so it never covers an action.
 * It announces pause and resume politely; word counts are not announced on every chunk.
 */
export function JobBar() {
  const { job, paused, pause, resume, wordsWritten, costSpent, progress } = useWritingJob();
  const [announce, setAnnounce] = useState("");
  const first = useRef(true);
  const chapter = job.current.chapterNumber;
  const chapters = job.sections.filter((s) => s.number !== null).length;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setAnnounce(paused ? `${job.label} paused.` : `${job.label} resumed.`);
  }, [paused, job.label]);

  return (
    <div
      role="region"
      aria-label="Running job"
      className="vol-glass-bar sticky bottom-0 z-30 flex h-(--vol-jobbar) items-center gap-3 border-t border-glass-line px-4 text-[13.5px] sm:gap-4 sm:px-6"
    >
      {paused ? <span aria-hidden className="size-2 shrink-0 rounded-full border-[1.5px] border-accent-text" /> : <LiveDot />}
      <p className="min-w-0 truncate">
        <b className="font-semibold">{paused ? `${job.label}, paused` : job.label}</b>
        <span className="hidden sm:inline">
          , chapter {chapter} of {chapters}
        </span>
      </p>
      <ProgressBar
        className="hidden w-[200px] shrink-0 md:block"
        size="thin"
        value={progress}
        max={1}
        live={!paused}
        label={`${job.label} progress`}
        valueText={`${formatNumber(wordsWritten)} of ${formatNumber(job.words.target)} words`}
      />
      <span className={cn("num hidden text-ink-secondary lg:inline")}>
        {formatNumber(wordsWritten)} of {formatNumber(job.words.target)} words, {formatUsd(costSpent)} so far
      </span>
      <span className="ml-auto flex shrink-0 gap-2">
        <Link
          to={bookStepPath(job.bookId, "writing")}
          className="inline-flex h-10 items-center rounded-sm px-3 text-label font-semibold text-ink-secondary hover:bg-sunken hover:text-ink sm:px-4"
        >
          Open
        </Link>
        <Button variant="secondary" icon={paused ? Play : Pause} onClick={paused ? resume : pause}>
          {paused ? "Resume" : "Pause"}
        </Button>
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}

/**
 * The same bar for a server job (API mode): the first running top-level job in the workspace, from the
 * books list, the book's job list and the live state the event streams keep in the cache. Open goes to
 * the book's step for that job; Pause and Resume call the job controls.
 */
export function ApiJobBar({ job, more }: { job: RunningJob; more: number }) {
  const control = useJobControl();
  const failed = job.status === "failed";
  const paused = job.status === "paused" || job.status === "paused_budget";
  // A write_section job may only run a section's summary again; the running-job list has no payload, so read it.
  const record = useJob(job.kind === "write_section" && !failed ? job.jobId : undefined);
  const summaryOnly = record.data ? isSummaryOnlyJob(record.data) : false;
  const kindLabel = summaryOnly ? "Summarising a section" : (JOB_LABELS[job.kind] ?? "Job");
  const label = failed ? `A job failed on ${job.bookTitle}` : `${kindLabel}, ${job.bookTitle}`;
  const [announce, setAnnounce] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setAnnounce(paused ? `${label} paused.` : `${label} running.`);
  }, [paused, label]);
  const detail = failed
    ? job.error
    : job.stalledMinutes !== null
      ? `no progress for ${job.stalledMinutes} minutes`
      : job.status === "paused_budget"
        ? "AI credits have run out, top up and continue"
        : job.done !== null && job.total !== null
          ? `${job.done} of ${job.total} parts`
          : ((summaryOnly ? null : job.message) ??
            // A parent job waits while its sections are written, so say how far on it is, not that it has not started.
            (job.status === "waiting" && job.progress > 0
              ? `${Math.round(job.progress * 100)}% done`
              : job.status === "queued" || job.status === "waiting"
                ? "waiting to start"
                : null));

  return (
    <div
      role="region"
      aria-label="Running job"
      className="vol-glass-bar sticky bottom-0 z-30 flex h-(--vol-jobbar) items-center gap-3 border-t border-glass-line px-4 text-[13.5px] sm:gap-4 sm:px-6"
    >
      {failed || job.stalledMinutes !== null ? (
        <CircleAlert size={16} strokeWidth={2} aria-hidden className="shrink-0 text-claim" />
      ) : paused ? (
        <span aria-hidden className="size-2 shrink-0 rounded-full border-[1.5px] border-accent-text" />
      ) : (
        <LiveDot />
      )}
      <p className="min-w-0 truncate" title={detail ?? undefined}>
        <b className="font-semibold">{paused ? `${label}, paused` : label}</b>
        {detail && <span className="hidden sm:inline">, {detail}</span>}
        {more > 0 && <span className="hidden text-ink-secondary md:inline"> (and {more} more)</span>}
      </p>
      {!failed && (
        <ProgressBar
          className="hidden w-[200px] shrink-0 md:block"
          size="thin"
          value={job.progress}
          max={1}
          live={!paused}
          label={`${label} progress`}
          valueText={`${Math.round(job.progress * 100)}%`}
        />
      )}
      {!failed && <span className="num hidden text-ink-secondary lg:inline">{Math.round(job.progress * 100)}%</span>}
      <span className="ml-auto flex shrink-0 gap-2">
        <Link
          to={failed ? `/books/${job.bookId}` : bookStepPath(job.bookId, stepForJob(job.kind))}
          className="inline-flex h-10 items-center rounded-sm px-3 text-label font-semibold text-ink-secondary hover:bg-sunken hover:text-ink sm:px-4"
        >
          Open<span className="sr-only"> {job.bookTitle}</span>
        </Link>
        {failed && (
          <Button variant="secondary" onClick={() => dismissFailure(job.jobId)}>
            Dismiss
          </Button>
        )}
        {!failed && job.status !== "paused_budget" && (
          <Button
            variant="secondary"
            icon={paused ? Play : Pause}
            loading={control.isPending}
            loadingLabel={paused ? "Resuming" : "Pausing"}
            onClick={() =>
              control.mutate({
                jobId: job.jobId,
                action: paused ? "resume" : "pause",
              })
            }
          >
            {paused ? "Resume" : "Pause"}
          </Button>
        )}
      </span>
      <span className="sr-only" role="status" aria-live="polite">
        {control.isError ? `Could not ${paused ? "resume" : "pause"}. ${apiErrorText(control.error)}` : announce}
      </span>
    </div>
  );
}
