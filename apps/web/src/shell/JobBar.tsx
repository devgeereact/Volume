import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Check, CircleAlert, Layers2, Pause, Play, X, Zap } from "lucide-react";
import { IconButton } from "../components/ui/IconButton";
import { buttonClasses } from "../components/ui/Button";
import { getBook } from "../demo/books";
import { workspace } from "../demo/workspace";
import { cn } from "../lib/cn";
import { formatUsd } from "../lib/format";
import { useWritingJob } from "../lib/job";
import { bookStepPath } from "../screens";
import { useJob, useJobControl } from "../api/hooks";
import { isSummaryOnlyJob } from "../api/wire-b";
import { apiErrorText, dismissFailure, JOB_LABELS, stepForJob, useApiSettings, useRunningJobs, useWireMode, type RunningJob } from "../api/wire-a";

/*
 * The status box at the foot of the side menu (approved design, "spine foot"). It replaces the bottom live
 * bar: what is running now and on which book (linked to its screen), with Pause and Resume, a failed job's
 * notice with Dismiss, the OpenRouter status, this month's AI spend, the credit left when OpenRouter
 * reports it, and Open Volume mode. Plain spend only, never a budget (D-057).
 */

const box = "grid gap-1.5 rounded-lg border border-edge bg-soft p-3.5 text-[12.5px] leading-[1.45] text-ink-2";
const row = "flex items-center justify-between gap-2";

/** The first line: an icon and what is happening, with an optional control on the right. */
function Head({ icon, children, control }: { icon: ReactNode; children: ReactNode; control?: ReactNode }) {
  return (
    <div className={cn(row, "min-h-6")}>
      <b className="flex min-w-0 items-center gap-1.5 text-[13px] font-bold text-ink">
        {icon}
        <span className="truncate">{children}</span>
      </b>
      {control}
    </div>
  );
}

const bolt = <Zap size={15} strokeWidth={1.8} aria-hidden className="shrink-0 text-good" />;

/** Demo mode: the demo writing job, with Pause and Resume as the live bar had them. */
function DemoJob({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const { job, running, paused, pause, resume } = useWritingJob();
  const [announce, setAnnounce] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setAnnounce(paused ? `${job.label} paused.` : `${job.label} resumed.`);
  }, [paused, job.label]);
  if (!running) return <NothingRunning />;
  const title = getBook(job.bookId)?.title ?? job.label;
  const to = bookStepPath(job.bookId, "writing");
  return (
    <>
      <Head
        icon={bolt}
        control={
          <IconButton
            icon={paused ? Play : Pause}
            size="sm"
            label={paused ? `Resume writing ${title}` : `Pause writing ${title}`}
            onClick={paused ? resume : pause}
          />
        }
      >
        {paused ? "Nothing running" : "Writing now"}
      </Head>
      <Link to={to} onClick={onNavigate} className="-my-0.5 truncate rounded-xs hover:text-ink hover:underline">
        {paused ? `${title} is paused` : `${title}, chapter ${job.current.chapterNumber}`}
      </Link>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}

function NothingRunning() {
  return <Head icon={bolt}>Nothing running</Head>;
}

/** API mode: the first running (or just failed) server job, with its controls. */
function ApiJob({ job, more, onNavigate }: { job: RunningJob; more: number; onNavigate?: (() => void) | undefined }) {
  const control = useJobControl();
  const failed = job.status === "failed";
  const paused = job.status === "paused" || job.status === "paused_budget";
  // A write_section job may only run a section's summary again; the running-job list has no payload, so read it.
  const record = useJob(job.kind === "write_section" && !failed ? job.jobId : undefined);
  const summaryOnly = record.data ? isSummaryOnlyJob(record.data) : false;
  const kindLabel = summaryOnly ? "Summarising a section" : (JOB_LABELS[job.kind] ?? "Job");
  const [announce, setAnnounce] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setAnnounce(paused ? `${kindLabel}, ${job.bookTitle} paused.` : `${kindLabel}, ${job.bookTitle} running.`);
  }, [paused, kindLabel, job.bookTitle]);
  const detail = failed
    ? job.error
    : job.stalledMinutes !== null
      ? `No progress for ${job.stalledMinutes} minutes`
      : job.status === "paused_budget"
        ? "AI credits have run out, top up and continue"
        : job.done !== null && job.total !== null
          ? `${job.done} of ${job.total} parts`
          : job.status === "queued" || job.status === "waiting"
            ? job.progress > 0
              ? `${Math.round(job.progress * 100)}% done`
              : "Waiting to start"
            : `${Math.round(job.progress * 100)}% done`;
  const to = failed ? `/books/${job.bookId}` : bookStepPath(job.bookId, stepForJob(job.kind));
  const head = failed ? "A job failed" : paused ? "Paused" : `${kindLabel} now`;
  const icon = failed || job.stalledMinutes !== null ? <CircleAlert size={15} strokeWidth={2} aria-hidden className="shrink-0 text-red" /> : bolt;
  const controlButton = failed ? (
    <IconButton icon={X} size="sm" label={`Dismiss the failed job on ${job.bookTitle}`} onClick={() => dismissFailure(job.jobId)} />
  ) : job.status === "paused_budget" ? null : (
    <IconButton
      icon={paused ? Play : Pause}
      size="sm"
      label={paused ? `Resume ${kindLabel.toLowerCase()}, ${job.bookTitle}` : `Pause ${kindLabel.toLowerCase()}, ${job.bookTitle}`}
      disabledReason={control.isPending ? (paused ? "Resuming" : "Pausing") : undefined}
      onClick={() => control.mutate({ jobId: job.jobId, action: paused ? "resume" : "pause" })}
    />
  );
  return (
    <>
      <Head icon={icon} control={controlButton}>
        {head}
      </Head>
      <Link to={to} onClick={onNavigate} className="-my-0.5 grid rounded-xs hover:text-ink" title={detail ?? undefined}>
        <span className="truncate font-medium text-ink hover:underline">{job.bookTitle}</span>
        {detail && <span className="line-clamp-2">{detail}</span>}
        {more > 0 && <span>and {more} more</span>}
      </Link>
      <span className="sr-only" role="status" aria-live="polite">
        {control.isError ? `Could not ${paused ? "resume" : "pause"}. ${apiErrorText(control.error)}` : announce}
      </span>
    </>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className={row}>
      <span>{label}</span>
      <b className="font-bold text-ink">{formatUsd(value)}</b>
    </div>
  );
}

function OpenVolume({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  return (
    <Link to="/volume" onClick={onNavigate} className={cn(buttonClasses("primary", "sm"), "mt-1 w-full")}>
      <Layers2 size={14} strokeWidth={1.8} aria-hidden />
      Open Volume mode
    </Link>
  );
}

const checkIcon = <Check size={13} strokeWidth={2} aria-hidden className="shrink-0 text-good" />;

/** The status box: demo values in demo mode, the server's settings and running jobs otherwise. */
export function SideStatus({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const mode = useWireMode();
  const api = mode === "api";
  const settings = useApiSettings(api);
  const jobs = useRunningJobs(api);

  if (mode === "mock") {
    const { openRouter, spend } = workspace;
    return (
      <div className={box}>
        <DemoJob onNavigate={onNavigate} />
        <div className={row}>
          <span className="inline-flex items-center gap-1.5">
            {checkIcon}
            {openRouter.connected ? "OpenRouter connected" : "OpenRouter not connected"}
          </span>
        </div>
        <Money label={`${spend.monthLabel} spend`} value={spend.spentUsd} />
        {openRouter.creditUsd !== null && <Money label="Credit left" value={openRouter.creditUsd} />}
        <OpenVolume onNavigate={onNavigate} />
      </div>
    );
  }

  const job = jobs.find((j) => j.status === "failed") ?? jobs[0];
  const jobPart = job ? <ApiJob job={job} more={jobs.length - 1} onNavigate={onNavigate} /> : <NothingRunning />;

  if (mode === "checking" || settings.isPending)
    return (
      <div className={box}>
        {jobPart}
        <p>Connecting to Volume</p>
        <OpenVolume onNavigate={onNavigate} />
      </div>
    );
  if (settings.isError)
    return (
      <div className={box}>
        {jobPart}
        <p className="flex items-center gap-1.5">
          <CircleAlert size={13} strokeWidth={2} aria-hidden className="shrink-0" />
          Settings did not load
        </p>
        <OpenVolume onNavigate={onNavigate} />
      </div>
    );
  const s = settings.data;
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date());
  const credit = s.openRouterCredit?.limitRemainingUsd ?? null;
  const keyLine = !s.openRouterKey.present ? "No OpenRouter key" : s.openRouterCredit ? "OpenRouter connected" : "OpenRouter key set";
  return (
    <div className={box}>
      {jobPart}
      <Link to="/settings" onClick={onNavigate} className={cn(row, "rounded-xs hover:text-ink")}>
        <span className="inline-flex items-center gap-1.5">
          {s.openRouterKey.present ? checkIcon : <CircleAlert size={13} strokeWidth={2} aria-hidden className="shrink-0" />}
          {keyLine}
        </span>
      </Link>
      <Money label={`${month} spend`} value={s.budgets.monthSpendUsd} />
      {credit !== null && <Money label="Credit left" value={credit} />}
      <OpenVolume onNavigate={onNavigate} />
    </div>
  );
}

/** True when a server job failed recently (the phone menu button shows a dot). */
export function useJobNeedsYou(): boolean {
  const mode = useWireMode();
  const jobs = useRunningJobs(mode === "api");
  return jobs.some((j) => j.status === "failed" || j.stalledMinutes !== null);
}
