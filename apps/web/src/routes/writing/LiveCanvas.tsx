import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useReducedMotion } from "motion/react";
import { ChevronDown, CircleStop, FileText, Pause, Play, RotateCw, Square } from "lucide-react";
import { Button, LiveDot, StatusChip, StreamText, Switch } from "../../components/ui";
import { getBook, type WritingJob } from "../../data";
import { interiorLook } from "../../lib/interiorLook";
import { cn } from "../../lib/cn";
import { formatNumber, formatTime, formatUsd } from "../../lib/format";
import type { SectionRow } from "./SectionList";
import { CheckIcon } from "./WritingInspector";
import { checksFor, logFor, type ChapterCheck } from "./writingData";

export type JobState = "running" | "paused" | "stopped";

interface LiveCanvasProps {
  job: WritingJob;
  jobState: JobState;
  chunksShown: number;
  chapterWords: number;
  follow: boolean;
  onFollow: (on: boolean) => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  viewing: string;
  rows: SectionRow[];
  retried: Record<string, { finishedAt: string | null }>;
  onRetry: (sectionId: string) => void;
}

/** The live page: header controls, the chapter being written with the gilt caret, and the log of finished sections. */
export function LiveCanvas(props: LiveCanvasProps) {
  const { job, jobState, follow, onFollow, onPause, onResume, onCancel, viewing, rows } = props;
  const viewingRow = rows.find((r) => r.section.id === viewing);
  const isLive = viewing === job.current.sectionId;

  return (
    <div className="flex min-h-0 flex-col xl:h-full">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-8 xl:min-h-[76px]">
        <h1 className="text-[18px] leading-6 font-semibold text-ink">Writing</h1>
        <StateChip jobState={jobState} />
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          <Switch nowrap label="Follow the writer" checked={follow} onChange={onFollow} disabled={jobState === "stopped"} />
          {jobState === "running" && (
            <Button icon={Pause} onClick={onPause}>
              Pause
            </Button>
          )}
          {jobState === "paused" && (
            <Button icon={Play} onClick={onResume}>
              Resume
            </Button>
          )}
          {jobState !== "stopped" && (
            <Button variant="ghost" icon={CircleStop} onClick={onCancel}>
              Stop writing
            </Button>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 pt-7 pb-12 sm:px-8 xl:px-10">
        {jobState === "stopped" && (
          <div role="status" className="mx-auto mb-7 flex max-w-[640px] flex-wrap items-center gap-3 rounded-md bg-accent-wash px-4 py-3">
            <p className="min-w-0 flex-1 text-[14px] leading-5 text-ink">
              <b className="block font-semibold text-accent-text">Writing stopped at chapter {job.current.chapterNumber}</b>
              Everything written so far is saved. Resume writing, at the foot of the page, picks up where the writer stopped.
            </p>
          </div>
        )}

        {isLive ? (
          <LivePage {...props} />
        ) : viewingRow ? (
          <SectionView
            row={viewingRow}
            job={job}
            onBack={() => onFollow(true)}
            onRetry={props.onRetry}
            retriedAt={props.retried[viewing]?.finishedAt ?? null}
          />
        ) : null}

        <FinishedLog job={job} rows={rows} retried={props.retried} onRetry={props.onRetry} />
      </div>
    </div>
  );
}

function StateChip({ jobState }: { jobState: JobState }) {
  if (jobState === "running")
    return (
      <span className="inline-flex h-7 items-center gap-2 rounded-pill bg-accent-wash px-3 text-small font-semibold text-accent-text">
        <LiveDot />
        Running
      </span>
    );
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-pill bg-sunken px-3 text-small font-semibold text-ink-secondary">
      {jobState === "paused" ? <Pause size={14} strokeWidth={2} aria-hidden /> : <Square size={12} strokeWidth={2} aria-hidden />}
      {jobState === "paused" ? "Paused" : "Stopped"}
    </span>
  );
}

function LivePage({ job, jobState, chunksShown, chapterWords, follow }: LiveCanvasProps) {
  const endRef = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const first = useRef(true);
  const cur = job.current;

  // Follow the writer: keep the live edge in view, but only when the reader is already near it.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = endRef.current;
    if (!follow || !el) return;
    // On phones the document scrolls: only follow once the reader has scrolled down to read.
    const pane = el.closest(".overflow-y-auto");
    const paneScrolls = pane !== null && pane.scrollHeight > pane.clientHeight;
    if (!paneScrolls && window.scrollY < 40) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight + 160) el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  }, [chunksShown, follow, reduce]);

  const live = jobState === "running";
  const book = getBook(job.bookId);
  const look = book ? interiorLook(book) : null;
  return (
    <article aria-labelledby="live-title" className="mx-auto max-w-[680px]">
      <p className={cn("flex items-center gap-2 text-label font-semibold", live ? "text-accent-text" : "text-ink-secondary")}>
        {live ? <LiveDot /> : <Pause size={14} strokeWidth={2} aria-hidden />}
        Chapter {cur.chapterNumber}, {live ? "writing now" : jobState === "paused" ? "paused" : "stopped"}
      </p>
      <h2 id="live-title" className="opsz-title mt-2 font-book text-title text-ink" style={look?.heading}>
        {cur.chapterTitle}
      </h2>
      <p className="num mt-1 text-small text-ink-secondary">
        {formatNumber(chapterWords)} of about {formatNumber(cur.wordTarget)} words. Checks run when the chapter ends.
      </p>
      <div className="print-indent mt-6 font-book text-prose text-ink" style={look?.body} title={look ? `Set in the ${look.name} interior theme` : undefined}>
        {cur.blocks.map((b, i) =>
          b.kind === "h" ? (
            <h3 key={i} className="mt-6 mb-2 font-ui text-subhead text-ink" style={look?.heading}>
              {b.text}
            </h3>
          ) : (
            <p key={i}>{b.text}</p>
          ),
        )}
        {/* Earlier chunks sit as plain text so the line wraps naturally; only the newest chunk inks in. */}
        <StreamText
          lead={cur.streamingChunks.slice(0, Math.max(0, chunksShown - 1)).join("")}
          chunks={cur.streamingChunks.slice(Math.max(0, chunksShown - 1), chunksShown)}
          live={live}
        />
        <span ref={endRef} aria-hidden className="block h-px" />
      </div>
    </article>
  );
}

function SectionView({
  row,
  job,
  onBack,
  onRetry,
  retriedAt,
}: {
  row: SectionRow;
  job: WritingJob;
  onBack: () => void;
  onRetry: (id: string) => void;
  retriedAt: string | null;
}) {
  const { section, status } = row;
  const log = logFor(section.id);
  const label = section.number === null ? section.title : `Chapter ${section.number}`;
  const checks = log ? checksFor(section, log, row.claims) : null;
  const working = status === "rewriting" || status === "checking";

  return (
    <article aria-labelledby="section-title" className="mx-auto max-w-[640px]">
      <button type="button" onClick={onBack} className="inline-flex h-8 items-center gap-2 rounded-sm text-label font-semibold text-select hit-44">
        <LiveDot />
        Back to the writer
      </button>
      <p className="mt-4 text-label text-ink-secondary">{label}</p>
      <h2 id="section-title" className="opsz-title mt-1 font-book text-title text-ink">
        {section.title}
      </h2>

      {status === "queued" ? (
        <p className="mt-3 text-body text-ink-secondary">
          Queued. The writer starts this after chapter {job.current.chapterNumber}, aiming for about {formatNumber(section.wordTarget)} words.
        </p>
      ) : (
        <>
          <p className="num mt-1 text-small text-ink-secondary">
            {working
              ? status === "rewriting"
                ? "The writer is rewriting this section."
                : "Running checks on the new version."
              : `${formatNumber(row.words)} of about ${formatNumber(section.wordTarget)} words. Finished at ${formatTime(retriedAt ?? log?.finishedAt ?? job.startedAt)}${log ? `, ${log.minutes} min, ${formatUsd(log.costUsd)}` : ""}.`}
          </p>
          {log && <p className="mt-6 font-book text-prose text-ink">{log.opening}</p>}
          {checks && <ChecksList checks={checks} className="mt-6" />}
          {retriedAt && (
            <p role="status" className="mt-4 text-small text-success">
              Retried and saved as version 2. Version 1 stays in Versions.
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to={`/books/${job.bookId}/editor/${section.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-sm border border-border-strong bg-sheet px-4 text-label font-semibold text-ink hover:bg-sunken"
            >
              <FileText size={16} aria-hidden />
              Open in editor
            </Link>
            <Button
              variant="ghost"
              icon={RotateCw}
              onClick={() => onRetry(section.id)}
              disabledReason={working ? "A retry is already running for this section." : undefined}
            >
              Retry {section.number === null ? "section" : "chapter"}
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

function ChecksList({ checks, className }: { checks: ChapterCheck[]; className?: string }) {
  return (
    <ul className={cn("grid gap-2 rounded-md border border-border bg-sheet p-4", className)}>
      {checks.map((c) => (
        <li key={c.id} className="grid grid-cols-[18px_minmax(0,1fr)] gap-x-2 text-[14px] leading-5">
          <CheckIcon result={c.result} />
          <span>
            <span className="text-ink">{c.label}</span>
            <span className="block text-small text-ink-secondary">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Log of finished sections, newest first, with needs attention and retry. */
function FinishedLog({
  job,
  rows,
  retried,
  onRetry,
}: {
  job: WritingJob;
  rows: SectionRow[];
  retried: Record<string, { finishedAt: string | null }>;
  onRetry: (id: string) => void;
}) {
  const finished = rows.filter((r) => logFor(r.section.id)).reverse();
  return (
    <section aria-labelledby="log-title" className="mx-auto mt-12 max-w-[640px] border-t border-border pt-6">
      <h2 id="log-title" className="text-subhead text-ink">
        Finished sections
      </h2>
      <p className="mt-0.5 text-small text-ink-secondary">Newest first. Each one was checked and saved as a version.</p>
      <ol className="mt-3 grid gap-2">
        {finished.map((row) => (
          <LogRow key={row.section.id} row={row} job={job} retriedAt={retried[row.section.id]?.finishedAt ?? null} onRetry={onRetry} />
        ))}
      </ol>
    </section>
  );
}

function LogRow({ row, job, retriedAt, onRetry }: { row: SectionRow; job: WritingJob; retriedAt: string | null; onRetry: (id: string) => void }) {
  const [open, setOpen] = useState(row.status === "attention");
  const log = logFor(row.section.id);
  if (!log) return null;
  const checks = checksFor(row.section, log, row.claims);
  const fixed = checks.filter((c) => c.result === "fixed").length;
  const working = row.status === "rewriting" || row.status === "checking";
  const attention = row.status === "attention";
  const panelId = `log-${row.section.id}`;

  return (
    <li className={cn("rounded-md border px-3 py-2.5 sm:px-4", attention ? "border-transparent bg-accent-wash" : "border-border bg-sheet")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="num hidden w-11 shrink-0 text-small text-ink-tertiary sm:inline">{formatTime(retriedAt ?? log.finishedAt)}</span>
        <span className="min-w-0 flex-1 text-[14px] leading-5">
          <b className="font-semibold text-ink">{row.section.number === null ? row.section.title : `${row.section.number}. ${row.section.title}`}</b>
          <span className="num block text-small text-ink-secondary">
            {formatNumber(row.words)} of {formatNumber(row.section.wordTarget)} words
            {fixed > 0 ? `, ${fixed} automatic ${fixed === 1 ? "fix" : "fixes"}` : ""}
            <span className="sm:hidden">, finished {formatTime(retriedAt ?? log.finishedAt)}</span>
          </span>
          <span className="mt-1.5 flex sm:hidden">
            <RowChip working={working} rewriting={row.status === "rewriting"} attention={attention} />
          </span>
        </span>
        <span className="hidden sm:flex">
          <RowChip working={working} rewriting={row.status === "rewriting"} attention={attention} />
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex size-8 items-center justify-center rounded-sm text-ink-secondary hover:bg-sunken hover:text-ink hit-44"
        >
          <ChevronDown size={16} aria-hidden className={cn("transition-transform duration-(--vol-dur-fast)", open && "rotate-180")} />
          <span className="sr-only">
            {open ? "Hide" : "Show"} checks for {row.section.title}
          </span>
        </button>
      </div>
      {open && (
        <div id={panelId} className="mt-2 grid gap-3 sm:pl-14">
          <ChecksList checks={checks} />
          {retriedAt && <p className="text-small text-success">Retried. Checks passed on version 2.</p>}
          {attention && (
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/books/${job.bookId}/editor/${row.section.id}`}
                className="inline-flex h-10 items-center gap-2 rounded-sm border border-border-strong bg-sheet px-4 text-label font-semibold text-ink hover:bg-sunken"
              >
                <FileText size={16} aria-hidden />
                Open in editor
              </Link>
              <Button variant="ghost" icon={RotateCw} onClick={() => onRetry(row.section.id)}>
                Retry chapter
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function RowChip({ working, rewriting, attention }: { working: boolean; rewriting: boolean; attention: boolean }) {
  if (working) return <StatusChip status="writing">{rewriting ? "Rewriting" : "Checking"}</StatusChip>;
  if (attention) return <StatusChip status="attention" />;
  return <StatusChip status="passed" />;
}
