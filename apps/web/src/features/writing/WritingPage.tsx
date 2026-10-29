import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, PageHeader, Skeleton } from "../../components/ui";
import { cn } from "../../lib/cn";
import { NotFound } from "../../shell/NotFound";
import { useBook } from "../../lib/useBook";
import { useWritingJob } from "../../lib/job";
import { useStepAction } from "../../lib/stepAction";
import { formatDuration, formatNumber, formatUsd } from "../../lib/format";
import { DEMO_NOW } from "../../demo";
import { JobControls, LiveCanvas, type JobState } from "./LiveCanvas";
import { LiveCounts } from "./LiveCounts";
import { glassCard, stepBody, studioGrid, studioSide } from "./studio";
import { RetryDialog } from "./RetryDialog";
import { SectionList, type RowStatus, type SectionRow } from "./SectionList";
import { WritingApi } from "./WritingApi";
import { WritingIdle } from "./WritingIdle";
import { WritingInspector } from "./WritingInspector";
import { ErrorPanel, useScreenState } from "./screenState";
import { attentionDetail, checksFor, logFor } from "./writingData";
import { useKeyChanged } from "../../lib/useKeyChanged";

/* Writing (docs/03-design/UX-SPEC.md, M7). Handover is the demo's one live job: it reads useWritingJob, so
   pausing here pauses the job bar and the Library too. Other books show the idle, ready or finished state. */

// Picture books have their own Writing step (story, character sheet, spreads board), in its own chunk with the KDP maths.
const PictureBookPage = lazy(() => import("../spreads/PictureBookPage"));

type RetryPhase = "rewriting" | "checking" | "done";
const RETRY_WRITE_MS = 2600;
const RETRY_CHECK_MS = 1400;

export default function WritingPage() {
  const { book, apiBook } = useBook();
  const { state, retry } = useScreenState();
  const jobCtx = useWritingJob();
  if (!book) return <NotFound what="book" />;
  if (book.template === "picture-book")
    return (
      <Suspense fallback={<WritingSkeleton />}>
        <PictureBookPage book={book} apiBook={apiBook} />
      </Suspense>
    );
  if (apiBook) return <WritingApi key={book.id} book={book} apiBook={apiBook} />;
  if (state === "loading") return <WritingSkeleton />;
  if (state === "error")
    return (
      <div className={cn(stepBody, "grid gap-4")}>
        <PageHeader title="Writing" />
        <ErrorPanel
          className="max-w-[720px]"
          title="Could not reach the writing job"
          body="The server did not answer. Your book is safe: every finished section was saved. Retry to reconnect to the live view."
          onRetry={retry}
        />
      </div>
    );
  if (state === "empty" || book.id !== jobCtx.job.bookId) return <WritingIdle book={book} forcedEmpty={state === "empty"} />;
  return <LiveWriting />;
}

function LiveWriting() {
  const { book } = useBook();
  const { job, running, paused, chunksShown, chapterWords, wordsWritten, costSpent, pause, resume, cancel } = useWritingJob();
  const [follow, setFollow] = useState(true);
  const [viewing, setViewing] = useState(job.current.sectionId);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [retryFor, setRetryFor] = useState<string | null>(null);
  const [retries, setRetries] = useState<Record<string, { phase: RetryPhase; finishedAt: string | null }>>({});
  const [announce, setAnnounce] = useState("");
  const [extraMinutes, setExtraMinutes] = useState(0);
  const timers = useRef<number[]>([]);

  const jobState: JobState = !running ? "stopped" : paused ? "paused" : "running";

  // Time running ticks once a minute while the job runs.
  useEffect(() => {
    if (jobState !== "running") return;
    const t = window.setInterval(() => setExtraMinutes((m) => m + 1), 60_000);
    return () => window.clearInterval(t);
  }, [jobState]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const currentSectionId = job.current.sectionId;
  // While following, the view moves to each new section as the job reaches it.
  if (useKeyChanged(follow ? currentSectionId : null) && follow) setViewing(currentSectionId);

  const sections = job.sections;
  const rows: SectionRow[] = useMemo(
    () =>
      sections.map((section) => {
        const r = retries[section.id];
        let status: RowStatus = section.status === "checking" ? "checking" : section.status;
        let words = section.words;
        let claims = section.claims;
        if (section.id === currentSectionId) {
          status = jobState === "running" ? "writing" : jobState;
          words = chapterWords;
        }
        if (r) {
          status = r.phase === "done" ? "done" : r.phase;
          if (r.phase === "done") claims = 0;
        }
        return { section, status, words, claims };
      }),
    [sections, currentSectionId, retries, jobState, chapterWords],
  );

  const doneCount = rows.filter((r) => r.status === "done" || r.status === "attention").length;
  const chapterRows = rows.filter((r) => r.section.number !== null);
  const attention = rows
    .filter((r) => r.status === "attention")
    .map((r) => ({
      sectionId: r.section.id,
      title: r.section.number === null ? r.section.title : `Chapter ${r.section.number}`,
      text: job.needsAttention.find((n) => n.sectionId === r.section.id)?.text ?? `${r.section.title} needs a look.`,
    }));

  // Checks on the last finished chapter (chapter 5 in the demo).
  const lastDone = [...rows].reverse().find((r) => r.section.number !== null && logFor(r.section.id) && (r.status === "done" || r.status === "attention"));
  const lastChecks = lastDone
    ? { title: `chapter ${lastDone.section.number}`, items: checksFor(lastDone.section, logFor(lastDone.section.id), lastDone.claims) }
    : null;

  const remainingWords = Math.max(0, job.words.target - wordsWritten);
  const remainingEstimate = remainingWords * (costSpent / Math.max(1, wordsWritten));
  const minutesLeft = Math.max(1, Math.round(job.minutesLeft * (remainingWords / Math.max(1, job.words.target - job.words.written))));

  const onPause = useCallback(() => {
    pause();
    setAnnounce("Writing paused.");
  }, [pause]);
  const onResume = useCallback(() => {
    resume();
    setFollow(true);
    setAnnounce("Writing resumed.");
  }, [resume]);

  function onView(id: string) {
    setViewing(id);
    setFollow(id === job.current.sectionId);
  }

  function startRetry(sectionId: string) {
    setRetryFor(null);
    setRetries((r) => ({ ...r, [sectionId]: { phase: "rewriting", finishedAt: null } }));
    const title = job.sections.find((s) => s.id === sectionId)?.title ?? "Section";
    setAnnounce(`Retrying ${title}.`);
    timers.current.push(
      window.setTimeout(() => setRetries((r) => ({ ...r, [sectionId]: { phase: "checking", finishedAt: null } })), RETRY_WRITE_MS),
      window.setTimeout(() => {
        setRetries((r) => ({ ...r, [sectionId]: { phase: "done", finishedAt: DEMO_NOW } }));
        setAnnounce(`${title} rewritten. Checks passed.`);
      }, RETRY_WRITE_MS + RETRY_CHECK_MS),
    );
  }

  const retrySection = retryFor ? job.sections.find((s) => s.id === retryFor) : undefined;
  const retryWhat = retrySection ? (retrySection.number === null ? retrySection.title.toLowerCase() : `chapter ${retrySection.number}`) : "";
  const retryHint = retryFor && attentionDetail[retryFor] ? "Soften the claim about SBAR training, or present it as the author's experience." : undefined;

  // The footer's main action: Resume writing once stopped. While the writer runs, Next stays a plain link.
  useStepAction(jobState === "stopped" ? { label: "Resume writing", estimate: `about ${formatUsd(remainingEstimate)}`, onClick: onResume } : null);

  if (!book) return null;

  return (
    <div className={cn(stepBody, "grid gap-4")}>
      <PageHeader
        title="Writing"
        summary="Volume writes each section in order and checks it against the house style before the next one starts."
        actions={
          <JobControls
            jobState={jobState}
            onPause={onPause}
            onResume={onResume}
            onCancel={() => setConfirmCancel(true)}
            chapterNumber={job.current.chapterNumber}
          />
        }
      />
      <LiveCounts
        items={[
          { label: `of ${formatNumber(job.words.target)} words`, value: formatNumber(wordsWritten) },
          { label: "Sections written", value: `${doneCount} of ${rows.length}` },
          { label: "Time running", value: formatDuration(job.runningMinutes + extraMinutes) },
          {
            label: "Time left",
            value: jobState === "running" ? `About ${formatDuration(minutesLeft)}` : jobState === "paused" ? "Paused" : "Stopped",
          },
          { label: "Spent so far", value: formatUsd(costSpent) },
        ]}
      />
      <div className={studioGrid}>
        <SectionList
          rows={rows}
          doneCount={doneCount}
          viewing={viewing}
          onView={onView}
          summary={`${jobState === "running" ? "Writing" : jobState === "paused" ? "Paused at" : "Stopped at"} chapter ${job.current.chapterNumber} of ${chapterRows.length}`}
        />
        <LiveCanvas
          job={job}
          jobState={jobState}
          chunksShown={chunksShown}
          chapterWords={chapterWords}
          follow={follow}
          onFollow={setFollow}
          viewing={viewing}
          rows={rows}
          retried={Object.fromEntries(Object.entries(retries).map(([k, v]) => [k, { finishedAt: v.finishedAt }]))}
          onRetry={setRetryFor}
        />
        <WritingInspector
          className={studioSide}
          job={job}
          wordsWritten={wordsWritten}
          costSpent={costSpent}
          lastChecks={lastChecks}
          attention={attention}
          onRetry={setRetryFor}
        />
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        closeOnScrim={false}
        size="sm"
        title="Stop writing Handover?"
        description={`The front matter and chapters 1 to 5 are saved. Chapter ${job.current.chapterNumber} keeps its ${formatNumber(chapterWords)} words as a draft. You can resume later from there.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Keep writing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                cancel();
                setConfirmCancel(false);
                setAnnounce("Writing stopped. Everything so far is saved.");
              }}
            >
              Stop writing
            </Button>
          </>
        }
      >
        <p className="num text-small text-ink-secondary">Spent so far: {formatUsd(costSpent)}. Nothing more is charged once it stops.</p>
      </Modal>

      <RetryDialog
        open={retryFor !== null}
        onClose={() => setRetryFor(null)}
        onConfirm={() => retryFor && startRetry(retryFor)}
        what={retryWhat}
        model={job.model}
        estimateUsd={retryFor ? (logFor(retryFor)?.costUsd ?? 0.3) : 0.3}
        hint={retryHint}
      />

      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}

function WritingSkeleton() {
  return (
    <div role="status" aria-label="Loading the writing job" className={cn(stepBody, "grid gap-4")}>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[62px] rounded-[16px]" />
        ))}
      </div>
      <div className={studioGrid}>
        <div className={cn(glassCard, "hidden gap-3 p-4 min-[861px]:grid")}>
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
        <div className={cn(glassCard, "grid content-start gap-4 px-7 py-8")}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-3/5" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className={i === 5 ? "h-4 w-2/5" : "h-4 w-full"} />
          ))}
        </div>
        <div className={cn(glassCard, studioSide, "hidden gap-3 p-[18px] min-[861px]:grid")}>
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    </div>
  );
}
