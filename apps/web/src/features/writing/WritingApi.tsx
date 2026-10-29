import { useEffect, useMemo, useRef, useState } from "react";
import { useCanWrite } from "../../lib/access";
import { CircleAlert, CircleStop, Flag, Pause, Play, RotateCcw } from "lucide-react";
import { Banner, Button, EmptyState, LiveDot, Loader, Modal, ModelName, PageHeader, Skeleton, Switch, Textarea } from "../../components/ui";
import { flattenSections } from "../../api/adapters";
import { useBookLive } from "../../api/events";
import { useClaims, useEstimate, useJob, useJobControl, useSection, useSectionTree, useWriteBook, useWriteSection } from "../../api/hooks";
import { isTerminalJob, type ApiBookDetail, type ApiSection } from "../../api/types";
import {
  estimateWords,
  countWords,
  etaWords,
  guardrailsOf,
  type GuardrailItem,
  isSummaryOnlyJob,
  markdownBlocks,
  plainError,
  useBookJobsLive,
  writeStatusOf,
  writeStatusWords,
  type StageJob,
  type TextBlock,
  type WriteRowStatus,
} from "../../api/wire-b";
import { BudgetPausedBanner } from "../books/BudgetPausedBanner";
import type { Book } from "../../demo";
import { cn } from "../../lib/cn";
import { formatNumber, formatUsd } from "../../lib/format";
import { useStepAction } from "../../lib/stepAction";
import { bookStepPath } from "../../screens";
import { useKeyChanged } from "../../lib/useKeyChanged";
import { AcknowledgementsNotice } from "./AcknowledgementsNotice";
import { JobStateChip, LiveCounts, type LiveCount } from "./LiveCounts";
import { SummaryMissingNotice } from "./SummaryMissingNotice";
import { TemplateRulesNotice } from "./TemplateRulesNotice";
import { cardTitle, Count, glassCard, pageColumn, pageKicker, RowDot, RowNumber, rowClasses, stepBody, studioGrid, studioSide } from "./studio";

/* Writing for a book on the server (API mode). Write book starts one job per section in order; the
   text streams in over the event stream and is saved section by section. Pause, resume and stop act on
   the whole job; a failed section can be retried on its own. When every section is written, Open
   editor is the next step. */

interface Row {
  section: ApiSection;
  status: WriteRowStatus;
  words: number;
  job: StageJob | undefined;
  /** What the guardrails flagged in the section's latest AI-written version. */
  flags: GuardrailItem[];
}

type JobState = "idle" | "running" | "pausing" | "paused" | "failed" | "stopped" | "finished";

function sectionName(s: ApiSection): string {
  if (s.kind === "chapter" && s.number !== null) return `Chapter ${s.number}`;
  return s.title ?? s.kind.replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function WritingApi({ book, apiBook }: { book: Book; apiBook: ApiBookDetail }) {
  const canWrite = useCanWrite();
  const bookId = apiBook.id;
  const tree = useSectionTree(bookId);
  const live = useBookLive(bookId);
  const { jobs, loading: jobsLoading } = useBookJobsLive(bookId);
  const claims = useClaims(bookId, { status: "open" });
  const writeBook = useWriteBook();
  const writeSection = useWriteSection();
  const control = useJobControl();
  // A whole-book rebuild is the parent of its section jobs too, so its progress shows here the same way.
  const parent = jobs.find((j) => j.kind === "write_book" || j.kind === "rebuild_book") ?? null;
  const parentDetail = useJob(parent && !isTerminalJob(parent.status) ? parent.id : undefined, { pollMs: 5000 });

  const [viewing, setViewing] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [confirmSpend, setConfirmSpend] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [retryFor, setRetryFor] = useState<ApiSection | null>(null);
  const [pauseAsked, setPauseAsked] = useState(false);
  const [announce, setAnnounce] = useState("");

  const sections = useMemo(() => (tree.data ? flattenSections(tree.data).filter((s) => s.enabled && s.kind !== "part") : []), [tree.data]);
  // A summary rerun (write_section with summaryOnly) never rewrites the text, so it does not count as the
  // section's writing job: it shows as Summarising and keeps the saved text on screen.
  const { jobBySection, summarising } = useMemo(() => {
    const m = new Map<string, StageJob>();
    const sum = new Set<string>();
    for (const j of jobs) {
      if (j.kind !== "write_section") continue;
      const id = j.payload["sectionId"];
      if (typeof id !== "string") continue;
      if (isSummaryOnlyJob(j)) {
        if (!isTerminalJob(j.status)) sum.add(id);
      } else if (!m.has(id)) m.set(id, j);
    }
    return { jobBySection: m, summarising: sum };
  }, [jobs]);

  const rows: Row[] = sections.map((s) => {
    const delta = live.data.deltas[s.id] ?? "";
    const job = jobBySection.get(s.id);
    const base = writeStatusOf(s, job, delta.length > 0 && job?.status === "running");
    const status: WriteRowStatus = summarising.has(s.id) && base !== "writing" && base !== "checking" && base !== "queued" ? "summarising" : base;
    const draft = delta.length > 0 && (status === "writing" || status === "checking" || status === "paused" || status === "stopped");
    return {
      section: s,
      status,
      words: draft ? countWords(delta) : s.generated ? (s.generated.countsInTotal ? s.generated.words : 0) : s.wordCount,
      job,
      flags: guardrailsOf(s)?.needsAttention ?? [],
    };
  });

  const children = parentDetail.data?.children ?? [];
  const childRunning = children.some((c) => c.status === "running") || rows.some((r) => r.status === "writing" || r.status === "checking");
  // A parent that stopped before it made any section jobs (a rebuild at the budget) is paused too.
  const parentPaused = parent !== null && (parent.status === "paused" || parent.status === "paused_budget");
  const childPaused = parentPaused || children.some((c) => c.status === "paused" || c.status === "paused_budget") || rows.some((r) => r.status === "paused");
  const parentActive = parent !== null && !isTerminalJob(parent.status);
  // When a section fails the server cancels the sections after it and ends the job as failed
  // (errorCode child_failed) with a plain summary, so the job never waits for ever.
  const jobState: JobState = !parent
    ? "idle"
    : parentActive
      ? childPaused && !childRunning
        ? "paused"
        : pauseAsked
          ? "pausing"
          : "running"
      : parent.status === "cancelled"
        ? "stopped"
        : parent.status === "failed"
          ? "failed"
          : "finished";

  // A pause request ends once the job is no longer running.
  if (pauseAsked && jobState !== "running" && jobState !== "pausing") setPauseAsked(false);

  const current = rows.find((r) => r.status === "writing" || r.status === "checking") ?? (parentActive ? rows.find((r) => r.status === "queued") : undefined);
  // When the job stops at a failure, show the section that failed.
  const firstFailedId = rows.find((r) => r.status === "failed")?.section.id ?? null;
  const failedId = jobState === "failed" ? firstFailedId : null;
  if (useKeyChanged(failedId) && failedId) setViewing(failedId);
  const followId = follow && current ? current.section.id : null;
  if (useKeyChanged(followId) && followId) setViewing(followId);

  const shown =
    rows.find((r) => r.section.id === viewing) ??
    current ??
    rows.find((r) => r.status === "failed") ??
    rows.find((r) => r.status !== "built" && r.status !== "done" && r.status !== "attention" && r.status !== "summarising") ??
    rows.find((r) => r.status !== "built") ??
    rows[0];
  const written = rows.filter((r) => r.status !== "built");
  // A section being summarised again already has its text, so it counts as written.
  const isWritten = (st: WriteRowStatus) => st === "done" || st === "attention" || st === "summarising";
  const doneCount = written.filter((r) => isWritten(r.status)).length;
  const notDone = written.filter((r) => !isWritten(r.status));
  const failedRows = rows.filter((r) => r.status === "failed");
  // Acknowledgements thank only people the owner names. Without names the writer saves a placeholder, which shows as
  // "Needs a look" with no house-style flag, and Marketing stays locked until it is written (D-049).
  const ackNeedsNames = rows.some((r) => r.section.kind === "acknowledgements" && r.status === "attention" && r.flags.length === 0);
  const wordsWritten = written.reduce((n, r) => n + r.words, 0);
  const wordTarget = written.reduce((n, r) => n + (r.section.wordTarget ?? 0), 0);

  function startWriting() {
    if (!writeEstimate.data) return;
    // D-057: the book's budget figure is a guide, not a cap. A large estimate against it asks once before writing.
    const remaining = Math.max(0, apiBook.budgetUsd - apiBook.costToDateUsd);
    if (writeEstimate.data && writeEstimate.data.highUsd > remaining / 2) {
      setConfirmSpend(true);
      return;
    }
    sendWriting();
  }
  function sendWriting() {
    setConfirmSpend(false);
    setFollow(true);
    // Writing the book again queues only the sections that are not done.
    writeBook.mutate({ bookId, onlyEmpty: true }, { onSuccess: () => setAnnounce("Writing started.") });
  }
  function pause() {
    if (!parent) return;
    setPauseAsked(true);
    control.mutate(
      { jobId: parent.id, action: "pause" },
      { onSuccess: () => setAnnounce("Pausing after the current step."), onError: () => setPauseAsked(false) },
    );
  }
  function resume() {
    if (!parent) return;
    setFollow(true);
    control.mutate({ jobId: parent.id, action: "resume" }, { onSuccess: () => setAnnounce("Writing resumed.") });
  }
  function stop() {
    if (!parent) return;
    setConfirmStop(false);
    control.mutate({ jobId: parent.id, action: "cancel" }, { onSuccess: () => setAnnounce("Writing stopped. Every finished section is saved.") });
  }
  function retry(section: ApiSection, instruction: string) {
    setRetryFor(null);
    setViewing(section.id);
    setFollow(false);
    writeSection.mutate(instruction ? { bookId, sectionId: section.id, instruction } : { bookId, sectionId: section.id }, {
      onSuccess: () => setAnnounce(`Retrying ${sectionName(section)}.`),
    });
  }

  // What writing the sections not done yet would cost, for Write book, Write the rest and Resume.
  const writeEstimate = useEstimate(bookId, "writing", {
    sectionIds: notDone.map((r) => r.section.id),
    enabled: tree.isSuccess && notDone.length > 0 && jobState !== "running" && jobState !== "pausing",
  });
  const editorPath = bookStepPath(book.id, "editor");
  const noSections = tree.isSuccess && sections.length === 0;
  useStepAction(
    tree.isPending || jobsLoading
      ? { label: "Write book", disabledReason: "Loading the sections." }
      : tree.isError
        ? { label: "Write book", disabledReason: "The sections could not be loaded." }
        : noSections
          ? { label: "Write book", disabledReason: apiBook.approvedBlueprintId ? "This blueprint has no sections to write." : "Approve the blueprint first." }
          : jobState === "running" || jobState === "pausing"
            ? null
            : jobState === "paused"
              ? {
                  label: control.isPending ? "Resuming" : "Resume writing",
                  onClick: resume,
                  estimate: estimateWords(writeEstimate.data),
                  disabledReason: control.isPending ? "Resuming." : undefined,
                }
              : notDone.length === 0
                ? { label: "Open editor", to: editorPath }
                : {
                    label: writeBook.isPending
                      ? "Starting"
                      : doneCount === 0 && jobState === "idle"
                        ? "Write book"
                        : jobState === "stopped"
                          ? "Resume writing"
                          : "Write the rest",
                    onClick: startWriting,
                    estimate: estimateWords(writeEstimate.data),
                    disabledReason: writeBook.isPending
                      ? "Starting the writer."
                      : writeEstimate.isPending
                        ? "Estimating the cost."
                        : writeEstimate.isError
                          ? "The writing cost could not be estimated."
                          : undefined,
                  },
  );

  const error = writeBook.error ?? writeSection.error ?? control.error;
  const writerModel = current?.job?.model ?? parent?.model ?? null;
  const flagged = rows.filter((r) => r.flags.length > 0);
  // The live event is lost on a reload, so a job saved as paused_budget shows the same banner.
  const budgetJob = parent?.status === "paused_budget" ? parent : (children.find((c) => c.status === "paused_budget") ?? null);
  const budget = live.data.budgetPaused ?? (budgetJob ? { jobId: budgetJob.id, message: budgetJob.error ?? "" } : null);

  // Live figures: words and sections come from the section list and the event stream, time left from the
  // server's estimate (left out until it knows), spend from the book.
  const liveCounts: LiveCount[] =
    written.length === 0
      ? []
      : [
          { label: wordTarget > 0 ? `of ${formatNumber(wordTarget)} words written` : "Words written", value: formatNumber(wordsWritten) },
          { label: "Sections written", value: `${doneCount} of ${written.length}` },
          ...((jobState === "running" || jobState === "pausing") && parent?.etaMs
            ? [{ label: "Time left", value: etaWords(parent.etaMs).replace(/^about/, "About") }]
            : []),
          { label: "Spent on this book", value: formatUsd(apiBook.costToDateUsd) },
        ];

  if (tree.isPending) return <WritingSkeleton />;

  const statusLine =
    jobState === "running"
      ? `Writing ${current ? sectionName(current.section).toLowerCase() : "the book"}`
      : jobState === "pausing"
        ? "Pausing after the current step"
        : jobState === "paused"
          ? "Paused. Resume to carry on from the next section."
          : jobState === "stopped"
            ? "Stopped. Every finished section is saved."
            : jobState === "failed"
              ? "The writer stopped at a section that failed. Retry it, then write the rest."
              : jobState === "finished"
                ? notDone.length === 0
                  ? ackNeedsNames
                    ? "Every section is written except Acknowledgements, which needs names before Marketing opens."
                    : "Every section is written."
                  : `${notDone.length} ${notDone.length === 1 ? "section is" : "sections are"} not written yet.`
                : rows.length > 0
                  ? "Not started. Write book writes every section in order."
                  : "";

  return (
    <div className={cn(stepBody, "grid gap-4")}>
      <PageHeader
        title="Writing"
        summary="Volume writes each section in order and checks it against the house style before the next one starts."
        actions={
          rows.length > 0 || (canWrite && (jobState === "running" || jobState === "pausing" || jobState === "paused")) ? (
            <>
              {rows.length > 0 && <JobStateChip tone={jobState} />}
              {canWrite && (jobState === "running" || jobState === "pausing") && (
                <Button size="sm" icon={Pause} onClick={pause} disabledReason={jobState === "pausing" ? "Pausing after the current step." : undefined}>
                  Pause
                </Button>
              )}
              {canWrite && (jobState === "running" || jobState === "pausing" || jobState === "paused") && (
                <Button size="sm" variant="ghost" icon={CircleStop} onClick={() => setConfirmStop(true)}>
                  Stop
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {liveCounts.length > 0 && <LiveCounts items={liveCounts} />}

      {error && (
        <Banner tone="error" title="That did not work">
          {plainError(error)}
        </Banner>
      )}
      {budget && <BudgetPausedBanner jobId={budget.jobId} message={budget.message} />}
      {tree.isError && (
        <Banner
          tone="error"
          title="The sections could not be loaded"
          action={
            <Button size="sm" icon={RotateCcw} onClick={() => void tree.refetch()}>
              Retry
            </Button>
          }
        >
          {plainError(tree.error)}
        </Banner>
      )}
      {(failedRows.length > 0 || jobState === "failed") && (
        <Banner
          tone="error"
          title={
            jobState === "failed" && parent?.error
              ? parent.error
              : `${failedRows.length === 1 ? "One section" : `${failedRows.length} sections`} did not finish`
          }
          action={
            failedRows[0] && canWrite ? (
              <Button size="sm" icon={RotateCcw} onClick={() => failedRows[0] && setRetryFor(failedRows[0].section)}>
                Retry {sectionName(failedRows[0].section).toLowerCase()}
              </Button>
            ) : undefined
          }
        >
          {failedRows[0]?.job?.error ?? "The writer stopped."} Every finished section is kept; Write the rest carries on with the sections not done.
        </Banner>
      )}

      {noSections ? (
        <EmptyState
          drawing="pen"
          title={apiBook.approvedBlueprintId ? "Nothing to write" : "Approve the blueprint first"}
          body={
            apiBook.approvedBlueprintId
              ? "The approved blueprint has no sections. Check it on the Blueprint step."
              : "Writing follows the approved blueprint. Approve it on the Blueprint step and the sections appear here."
          }
        />
      ) : (
        <div className={studioGrid}>
          {/* Section list */}
          <nav aria-label="Sections" className={cn(glassCard, "grid content-start gap-0.5 p-2.5")}>
            <h2 className={cn(cardTitle, "mx-2 mt-1.5 mb-0.5")}>
              Sections
              {written.length > 0 && (
                <Count>
                  {doneCount} of {written.length}
                  <span className="sr-only"> written</span>
                </Count>
              )}
            </h2>
            {statusLine && (
              <p className="mx-2 mb-2 flex items-center gap-1.5 text-[12px] leading-4 text-ink-3">
                {jobState === "running" && <LiveDot />}
                {jobState === "pausing" && <Loader />}
                {statusLine}
              </p>
            )}
            {rows.length === 0 ? (
              <p className="mx-2 mb-2 text-[13px] text-ink-3">No sections yet. Approving the blueprint creates them.</p>
            ) : (
              <ol className="grid gap-0.5">
                {rows.map((r) => {
                  const on = shown?.section.id === r.section.id || r.status === "writing" || r.status === "checking";
                  return (
                    <li key={r.section.id} className="flex min-w-0 items-center gap-1">
                      <button
                        type="button"
                        aria-current={shown?.section.id === r.section.id ? "true" : undefined}
                        onClick={() => {
                          setViewing(r.section.id);
                          setFollow(current?.section.id === r.section.id);
                        }}
                        className={rowClasses(on)}
                      >
                        <RowNumber n={r.section.kind === "chapter" ? r.section.number : null} />
                        <span className="min-w-0 flex-1 truncate" title={rowTitle(r.section)}>
                          {rowTitle(r.section)}
                        </span>
                        <RowStatus row={r} />
                      </button>
                      {r.status === "failed" && canWrite && (
                        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setRetryFor(r.section)}>
                          Retry
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </nav>

          {/* The page */}
          {shown ? (
            <SectionCanvas
              key={shown.section.id}
              bookId={bookId}
              bookSettings={apiBook.settings}
              row={shown}
              delta={live.data.deltas[shown.section.id] ?? ""}
              following={follow && current?.section.id === shown.section.id}
              onFollow={() => setFollow(true)}
              canFollow={!!current && current.section.id !== shown.section.id}
              onRetry={canWrite ? () => setRetryFor(shown.section) : undefined}
            />
          ) : (
            <div className={cn(glassCard, "px-7 py-8 text-[13.5px] text-ink-2")}>Pick a section to read it.</div>
          )}

          {/* Side card */}
          <aside aria-label="Writing details" className={cn(glassCard, studioSide, "grid content-start gap-4 p-[18px] max-[560px]:p-[15px]")}>
            <section aria-labelledby="writing-job">
              <h3 id="writing-job" className={cardTitle}>
                This job
              </h3>
              <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[13px] leading-[18px]">
                {[
                  {
                    label: "State",
                    value: {
                      idle: "Not started",
                      running: "Writing",
                      pausing: "Pausing",
                      paused: "Paused",
                      failed: "Stopped at a failure",
                      stopped: "Stopped",
                      finished: "Finished",
                    }[jobState],
                  },
                  { label: "Sections", value: `${doneCount} of ${written.length}` },
                  { label: "Words", value: wordTarget > 0 ? `${formatNumber(wordsWritten)} of ${formatNumber(wordTarget)}` : formatNumber(wordsWritten) },
                  { label: "Writer", value: writerModel ? <ModelName slug={writerModel} /> : "Not known yet" },
                  {
                    label: "Time left",
                    value:
                      jobState === "running" || jobState === "pausing"
                        ? parent?.etaMs
                          ? etaWords(parent.etaMs)
                          : "Worked out after the first section"
                        : "None running",
                  },
                  {
                    label: "Next run",
                    value:
                      jobState === "running" || jobState === "pausing" ? (
                        "Shown when writing is not running"
                      ) : writeEstimate.data ? (
                        <span>
                          {estimateWords(writeEstimate.data)}
                          {writeEstimate.data.model && (
                            <>
                              {" with "}
                              <ModelName slug={writeEstimate.data.model} />
                            </>
                          )}
                        </span>
                      ) : notDone.length === 0 ? (
                        "Nothing left to write"
                      ) : writeEstimate.isError ? (
                        "Estimate not available"
                      ) : (
                        "Worked out when writing is not running"
                      ),
                  },
                  { label: "Spent on this book", value: formatUsd(apiBook.costToDateUsd) },
                ].map((item) => (
                  <div key={item.label} className="contents">
                    <dt className="text-ink-3">{item.label}</dt>
                    <dd className="text-right font-medium text-ink [overflow-wrap:anywhere]">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section aria-labelledby="writing-look" className={cn("rounded-lg px-3.5 py-3", flagged.length > 0 ? "bg-amber-wash" : "bg-soft")}>
              <h3
                id="writing-look"
                className={cn("flex items-center gap-1.5 text-[13px] leading-5 font-semibold", flagged.length > 0 ? "text-amber" : "text-ink")}
              >
                {flagged.length > 0 && <Flag size={14} strokeWidth={2} aria-hidden />}
                Needs a look{flagged.length > 0 ? `, ${flagged.length}` : ""}
              </h3>
              {flagged.length === 0 ? (
                <p className="mt-1 text-[12.5px] leading-[18px] text-ink-2">Nothing so far. The house-style guardrails check each section as it is saved.</p>
              ) : (
                <ul className="mt-1.5 grid gap-1.5">
                  {flagged.map((r) => (
                    <li key={r.section.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setViewing(r.section.id);
                          setFollow(false);
                        }}
                        className="hit-44 text-left text-[13px] text-ink underline decoration-line-2 underline-offset-2 hover:decoration-ink"
                      >
                        {sectionName(r.section)}: {r.flags.length} {r.flags.length === 1 ? "item" : "items"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              aria-labelledby="writing-claims"
              className={cn("rounded-lg px-3.5 py-3", claims.data && claims.data.length > 0 ? "bg-red-wash" : "bg-soft")}
            >
              <h3 id="writing-claims" className={cn("text-[13px] leading-5 font-semibold", claims.data && claims.data.length > 0 ? "text-red" : "text-ink")}>
                Claims to verify
              </h3>
              {claims.isPending ? (
                <Skeleton className="mt-1 w-3/4" />
              ) : !claims.data || claims.data.length === 0 ? (
                <p className="mt-1 text-[12.5px] leading-[18px] text-ink-2">None yet. Claims the checker finds appear here and in the Editor.</p>
              ) : (
                <p className="mt-1 text-[12.5px] leading-[18px] text-ink">
                  {claims.data.length} open {claims.data.length === 1 ? "claim" : "claims"} to check in the Editor before export.
                </p>
              )}
            </section>

            <p className="text-[12px] leading-4 text-ink-3">
              Sections are written in order, each one checked as soon as it is saved. Pause stops after the current step; Stop keeps every finished section.
            </p>
          </aside>
        </div>
      )}

      <Modal
        open={confirmSpend}
        onClose={() => setConfirmSpend(false)}
        size="sm"
        title="Confirm writing cost"
        description={`The high estimate for writing the rest of this book is $${writeEstimate.data?.highUsd.toFixed(2) ?? "0.00"}. There is no spending cap, so writing carries on until it is done. It pauses only if the AI provider runs out of credit.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmSpend(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={sendWriting}>
              Start writing
            </Button>
          </>
        }
      />
      <Modal
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        closeOnScrim={false}
        size="sm"
        title={`Stop writing ${book.title}?`}
        description={`${doneCount} of ${written.length} sections are saved. The section being written now is not kept. You can carry on later.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmStop(false)}>
              Keep writing
            </Button>
            <Button variant="danger" onClick={stop}>
              Stop writing
            </Button>
          </>
        }
      />

      <RetryModal bookId={bookId} section={retryFor} onClose={() => setRetryFor(null)} onConfirm={retry} />

      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}

/** A row's title: the chapter title, or the section's name for front and back matter. */
function rowTitle(s: ApiSection): string {
  return s.kind === "chapter" && s.title ? s.title : sectionName(s);
}

const shortWords: Partial<Record<WriteRowStatus, string>> = { built: "Built", "not-written": "Not written" };

/** The row's status (.sl): a dot when done or flagged, else a short word. The full words are for screen readers. */
function RowStatus({ row }: { row: Row }) {
  const extra = `${row.words > 0 ? `, ${formatNumber(row.words)} words` : ""}${row.flags.length > 0 ? `, ${row.flags.length} to look at` : ""}`;
  const detail = writeStatusWords[row.status] + extra;
  if (row.status === "done") return <RowDot tone="ok" label={detail} />;
  if (row.status === "attention") return <RowDot tone="warn" label={detail} />;
  const word = shortWords[row.status] ?? writeStatusWords[row.status];
  const live = row.status === "writing" || row.status === "checking" || row.status === "summarising";
  return (
    <span
      className={cn(
        "num inline-flex shrink-0 items-center gap-1 text-[11.5px] leading-4 whitespace-nowrap",
        row.status === "failed" ? "font-semibold text-red" : live || row.status === "paused" ? "font-semibold" : "text-ink-3",
      )}
    >
      {row.status === "paused" && <Pause size={11} strokeWidth={2.5} aria-hidden />}
      {row.status === "failed" && <CircleAlert size={12} strokeWidth={2} aria-hidden />}
      {word}
      {extra && <span className="sr-only">{extra}</span>}
    </span>
  );
}

function Blocks({ blocks, live }: { blocks: TextBlock[]; live: boolean }) {
  return (
    <div className="grid gap-3.5 font-book text-prose-sm text-ink">
      {blocks.map((b, i) => {
        const last = live && i === blocks.length - 1;
        const caret = last ? <span aria-hidden className="vol-caret" /> : null;
        if (b.kind === "h1")
          return (
            <h2 key={i} className="text-[22px] leading-[1.3] font-semibold">
              {b.text}
              {caret}
            </h2>
          );
        if (b.kind === "h2" || b.kind === "h3")
          return (
            <h3 key={i} className="mt-2 text-[18px] leading-[1.35] font-semibold">
              {b.text}
              {caret}
            </h3>
          );
        if (b.kind === "scene")
          return (
            <p key={i} role="separator" aria-label="Scene break" className="text-center tracking-[0.6em] text-ink-secondary">
              {b.text}
              {caret}
            </p>
          );
        if (b.kind === "note")
          return (
            <p key={i} className="font-ui text-small text-ink-tertiary">
              {b.text}
              {caret}
            </p>
          );
        if (b.kind === "li")
          return (
            <p key={i} className="border-l-2 border-border-strong pl-3">
              {b.text}
              {caret}
            </p>
          );
        return (
          <p key={i}>
            {b.text}
            {caret}
          </p>
        );
      })}
    </div>
  );
}

function SectionCanvas({
  bookId,
  bookSettings,
  row,
  delta,
  following,
  canFollow,
  onFollow,
  onRetry,
}: {
  bookId: string;
  bookSettings: Record<string, unknown>;
  row: Row;
  delta: string;
  following: boolean;
  canFollow: boolean;
  onFollow: () => void;
  onRetry: (() => void) | undefined;
}) {
  const s = row.section;
  const streaming = delta.length > 0 && (row.status === "writing" || row.status === "checking" || row.status === "paused" || row.status === "stopped");
  const detail = useSection(!streaming && s.currentVersionId ? s.id : undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (streaming && following) bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [delta.length, streaming, following]);

  const liveNow = streaming && row.status === "writing";
  const text = streaming ? delta : (detail.data?.current?.bodyMd ?? "");
  const blocks = markdownBlocks(text);

  return (
    <article aria-label={sectionName(s)} className={cn(glassCard, "overflow-clip")}>
      <div className={cn(pageColumn, "px-[clamp(16px,4vw,56px)] pt-[22px] pb-7")}>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
          <div className="grid min-w-0 gap-1">
            <p className={cn(pageKicker, "flex items-center gap-2")}>
              {liveNow && <LiveDot />}
              {liveNow ? `${sectionName(s)}, writing now` : `${sectionName(s)}: ${writeStatusWords[row.status].toLowerCase()}`}
            </p>
            {row.status !== "built" && (row.words > 0 || s.wordTarget) ? (
              <p className="num text-[13px] leading-5 text-ink-2">
                {formatNumber(row.words)}
                {s.wordTarget ? ` of about ${formatNumber(s.wordTarget)}` : ""} words{liveNow ? ". Checks run when it is saved." : "."}
              </p>
            ) : null}
          </div>
          {canFollow && (
            <Button size="sm" variant="ghost" onClick={onFollow}>
              Follow the writer
            </Button>
          )}
        </div>
        {!streaming && row.status !== "writing" && row.status !== "checking" && (
          <>
            <SummaryMissingNotice bookId={bookId} sectionId={s.id} checks={detail.data?.checks} className="mb-5" />
            <TemplateRulesNotice checks={detail.data?.checks} className="mb-5" />
            {s.kind === "acknowledgements" && (
              <AcknowledgementsNotice bookId={bookId} sectionId={s.id} settings={bookSettings} versionSource={detail.data?.current?.source} className="mb-5" />
            )}
          </>
        )}
        {row.flags.length > 0 && row.status !== "writing" && (
          <div className="mb-5 grid gap-1 rounded-lg bg-amber-wash px-4 py-3 text-[13px] leading-[18px] text-ink">
            <p className="font-semibold text-amber">Needs a look before export</p>
            <ul className="grid gap-0.5">
              {row.flags.slice(0, 6).map((f, i) => (
                <li key={`${i}-${f.rule}`}>
                  {f.message}
                  {f.match ? `: "${f.match}"` : ""}
                </li>
              ))}
            </ul>
            {row.flags.length > 6 && <p>And {row.flags.length - 6} more in the Editor.</p>}
          </div>
        )}
        {row.status === "failed" ? (
          <div className="grid gap-3">
            <p className="text-body text-ink">{row.job?.error ?? "The writer stopped on this section."}</p>
            {onRetry && (
              <div>
                <Button icon={RotateCcw} onClick={onRetry}>
                  Retry {sectionName(s).toLowerCase()}
                </Button>
              </div>
            )}
          </div>
        ) : blocks.length > 0 ? (
          <Blocks blocks={blocks} live={streaming && row.status === "writing"} />
        ) : detail.isFetching ? (
          <div role="status" aria-label="Loading the text" className="grid gap-2">
            <Skeleton className="h-7 w-2/5" />
            <Skeleton className="w-full" />
            <Skeleton className="w-11/12" />
          </div>
        ) : row.status === "writing" ? (
          <p className="flex items-center gap-2 text-body text-ink-secondary">
            <Loader /> The writer is starting this section.
          </p>
        ) : (
          <p className="text-body text-ink-secondary">
            {row.status === "built"
              ? "The app makes this page from the book details and the profile (About the author is the profile bio, word for word). The writer does not write it."
              : row.status === "queued"
                ? "Queued. It is written after the sections before it."
                : "Not written yet."}
          </p>
        )}
        <div ref={bottomRef} />
      </div>
    </article>
  );
}

function RetryModal({
  bookId,
  section,
  onClose,
  onConfirm,
}: {
  bookId: string;
  section: ApiSection | null;
  onClose: () => void;
  onConfirm: (s: ApiSection, instruction: string) => void;
}) {
  const estimate = useEstimate(bookId, "writing", { sectionIds: section ? [section.id] : [], enabled: section !== null });
  const [instruction, setInstruction] = useState("");
  const [keep, setKeep] = useState(true);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Start empty each time the dialog opens for a section.
  if (useKeyChanged(section ? section.id : null) && section) {
    setInstruction("");
    setKeep(true);
  }
  const what = section ? sectionName(section).toLowerCase() : "";
  return (
    <Modal
      open={section !== null}
      onClose={onClose}
      title={`Retry ${what}`}
      description="The writer starts this section again. Any version already saved stays in Versions."
      initialFocus={fieldRef}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            icon={Play}
            estimate={estimateWords(estimate.data)}
            onClick={() => {
              if (!section) return;
              const parts = [instruction.trim(), keep ? "Keep the blueprint's subheadings in order." : ""].filter(Boolean);
              onConfirm(section, parts.join(" "));
            }}
          >
            Retry {what}
          </Button>
        </>
      }
    >
      <Textarea
        ref={fieldRef}
        label="Instruction for the writer (optional)"
        hint="For example: keep the ward example, soften anything that sounds like a clinical fact."
        rows={3}
        maxLength={1900}
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />
      <Switch label="Keep subheadings" description="The writer keeps the blueprint's subheadings in order." checked={keep} onChange={setKeep} />
      {estimate.data?.model && (
        <p className="text-small text-ink-secondary">
          Written by <ModelName slug={estimate.data.model} className="text-ink" />
        </p>
      )}
    </Modal>
  );
}

function WritingSkeleton() {
  return (
    <div role="status" aria-label="Loading the sections" className={cn(stepBody, "grid gap-4")}>
      <div className={studioGrid}>
        <div className={cn(glassCard, "hidden content-start gap-3 p-4 min-[861px]:grid")}>
          <Skeleton className="h-5 w-1/2" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
        <div className={cn(glassCard, "grid content-start gap-4 px-7 py-8")}>
          <Skeleton className="h-8 w-3/5" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
