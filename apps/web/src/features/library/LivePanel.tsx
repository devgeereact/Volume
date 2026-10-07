import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Pause, Play } from "lucide-react";
import { Button, ChapterBars, Cover, Figure, KeyValueList, LiveDot, StreamText, type ChapterSegment } from "../../components/ui";
import { getBook } from "../../demo/books";
import { getPenName } from "../../demo/penNames";
import { formatNumber, formatTime, formatUsd } from "../../lib/format";
import { useWritingJob } from "../../lib/job";
import { bookStepPath } from "../../screens";

const ANNOUNCE_MS = 15_000;

/**
 * The one live panel at the top of the Library while a job runs (board: "Writing now"). Cover, the
 * chapter being written, the last lines of streamed text with the gilt caret, chapter segments,
 * figures, Pause and Open live view. The stream is aria-live="off"; a polite line announces progress
 * at most every 15 seconds, because the job bar (which normally does that) is hidden on the Library.
 */
export function LivePanel() {
  const navigate = useNavigate();
  const { job, paused, chunksShown, wordsWritten, costSpent, chapterProgress, pause, resume } = useWritingJob();
  const book = getBook(job.bookId);
  const pen = book ? getPenName(book.penNameId) : undefined;

  const latest = useRef(wordsWritten);
  useEffect(() => {
    latest.current = wordsWritten;
  }, [wordsWritten]);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (paused) return;
    const t = window.setInterval(() => setAnnouncement(`${formatNumber(latest.current)} words written of ${formatNumber(job.words.target)}.`), ANNOUNCE_MS);
    return () => window.clearInterval(t);
  }, [paused, job.words.target]);

  if (!book) return null;

  const chapters = job.sections.filter((s) => s.number !== null);
  const segments: ChapterSegment[] = chapters.map((s) =>
    s.status === "writing" ? { state: "current", progress: chapterProgress } : s.status === "queued" ? { state: "queued" } : { state: "done" },
  );
  const doneCount = chapters.filter((s) => s.status === "done" || s.status === "attention").length;
  const chunks = job.current.streamingChunks.slice(0, chunksShown);
  const lastBlock = [...job.current.blocks].reverse().find((b) => b.kind === "p");

  return (
    <article
      aria-label={`${paused ? "Paused" : "Writing now"}: ${book.title}`}
      className="relative grid grid-cols-[72px_minmax(0,1fr)] gap-x-5 gap-y-5 overflow-hidden rounded-lg border border-border bg-sheet py-5 pr-5 pl-[22px] shadow-sheet sm:grid-cols-[112px_minmax(0,1fr)] sm:gap-x-7 sm:py-[22px] sm:pr-6 xl:grid-cols-[112px_minmax(0,1fr)_300px]"
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
      <Cover title={book.title} subtitle={book.subtitle} author={pen?.name ?? ""} design={book.cover} className="w-full self-start" decorative />

      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] leading-4 font-semibold text-accent-text">
          {paused ? <Pause size={14} strokeWidth={2} aria-hidden /> : <LiveDot />}
          {paused ? "Paused" : "Writing now"}
          <span className="font-medium text-ink-tertiary">
            {pen?.name}, started {formatTime(job.startedAt)}
          </span>
        </p>
        <h2 className="mt-2.5 mb-0.5 font-book text-heading text-ink">
          {book.title}{" "}
          <small className="ml-1 block font-book text-[18px] leading-6 font-normal text-ink-secondary italic sm:inline">
            Chapter {job.current.chapterNumber}, {job.current.chapterTitle}
          </small>
        </h2>
        <div className="mt-3 mb-4 flex h-[52px] max-w-[66ch] flex-col justify-end overflow-hidden max-sm:hidden">
          {lastBlock && <p className="font-book text-prose-sm text-ink">{lastBlock.text}</p>}
          <StreamText chunks={chunks} live={!paused} size="prose-sm" />
        </div>
        <ChapterBars segments={segments} className="mt-3 sm:mt-0" />
        <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 text-small text-ink-secondary">
          <span>{doneCount} chapters written and checked</span>
          <span>
            Chapter {job.current.chapterNumber} of {chapters.length}
          </span>
        </div>
      </div>

      <div className="col-span-2 flex flex-col border-t border-border pt-5 xl:col-span-1 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6">
        <Figure value={formatNumber(wordsWritten)} unit={`of ${formatNumber(job.words.target)} words`} />
        <KeyValueList
          className="mt-3"
          items={[
            { label: "Time left", value: paused ? "Paused" : `About ${job.minutesLeft} minutes` },
            { label: "Model", value: job.model, mono: true },
            { label: "Cost so far", value: `${formatUsd(costSpent)} of ${formatUsd(job.cost.budget)}` },
          ]}
        />
        <div className="mt-auto flex flex-wrap gap-2 pt-3.5">
          {paused ? (
            <Button icon={Play} onClick={resume}>
              Resume
            </Button>
          ) : (
            <Button icon={Pause} onClick={pause}>
              Pause
            </Button>
          )}
          <Button variant="ghost" onClick={() => void navigate(bookStepPath(book.id, "writing"))}>
            Open live view
          </Button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </article>
  );
}
