import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, Pause, Play } from "lucide-react";
import { Button, chipClasses, ChipDot, Cover, ModelName, Segbar, type SegState } from "../../components/ui";
import { getBook } from "../../demo/books";
import { getPenName } from "../../demo/penNames";
import { formatNumber, formatTime, formatUsd } from "../../lib/format";
import { useWritingJob } from "../../lib/job";
import { bookStepPath } from "../../screens";

const ANNOUNCE_MS = 15_000;
/** How much of the newest text the card shows: about four lines. */
const TAIL_CHARS = 190;

/** The last `max` characters of the text, cut at a word, with an ellipsis in front when cut. */
function tail(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(-max);
  const space = cut.indexOf(" ");
  return `…${space > 0 && space < 20 ? cut.slice(space + 1) : cut}`;
}

/**
 * The one live card at the top of the Library while a job runs (the approved design's "Writing now" hero). Cover, the
 * chapter being written, the newest lines of text with the caret, one segment per chapter, then the words written,
 * time left, model and cost so far, with Pause and Open live view. There is no book budget (D-057), so the cost is
 * "so far" only. The text is aria-live="off"; a polite line announces progress at most every 15 seconds.
 */
export function LivePanel() {
  const { job, paused, chunksShown, wordsWritten, costSpent, pause, resume } = useWritingJob();
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
  const segments: SegState[] = chapters.map((s) => (s.status === "writing" ? "half" : s.status === "queued" ? "off" : "on"));
  const doneCount = chapters.filter((s) => s.status === "done" || s.status === "attention").length;
  const written = job.current.blocks
    .filter((b) => b.kind === "p")
    .map((b) => b.text)
    .join(" ");
  const text = tail(`${written} ${job.current.streamingChunks.slice(0, chunksShown).join("")}`, TAIL_CHARS);
  const livePath = bookStepPath(book.id, "writing");

  return (
    <article
      aria-label={`${paused ? "Paused" : "Writing now"}: ${book.title}`}
      className="vol-glass grid min-w-0 items-center gap-5 rounded-card border-l-4 border-l-btn p-4.5 max-[560px]:p-3.75 min-[561px]:grid-cols-[auto_minmax(0,1fr)] min-[1201px]:grid-cols-[auto_minmax(0,1fr)_250px]"
    >
      <span className="w-23 max-[560px]:hidden">
        <Cover
          title={book.title}
          subtitle={book.subtitle}
          author={pen?.name ?? ""}
          design={book.cover}
          image={book.coverImage?.src}
          className="w-full"
          decorative
        />
      </span>

      <div className="grid min-w-0 gap-2">
        <p className="flex flex-wrap items-center gap-2.5 text-[13px]">
          {paused ? (
            <span className={chipClasses("warn")}>
              <Pause size={12} strokeWidth={2.25} aria-hidden />
              Paused
            </span>
          ) : (
            <span className={chipClasses("run")}>
              <ChipDot pulse />
              Writing now
            </span>
          )}
          <span className="text-ink-2">
            {pen?.name}, started {formatTime(job.startedAt)}
          </span>
        </p>
        <h2 className="font-book text-[20px] leading-snug font-semibold text-ink">
          <Link to={livePath} className="rounded-xs hover:text-mint-ink hover:underline">
            {book.title}
          </Link>{" "}
          <em className="text-[16px] font-normal text-ink-2">
            Chapter {job.current.chapterNumber}, {job.current.chapterTitle}
          </em>
        </h2>
        <p aria-live="off" className="min-h-[3.2em] font-book text-[14.5px] leading-[1.6] text-ink-2">
          {text}
          {!paused && <span className="vol-caret" aria-hidden />}
        </p>
        <Segbar segments={segments} className="[&>i]:h-1.5" />
        <p className="flex flex-wrap justify-between gap-2.5 text-caption text-ink-2">
          <span>{doneCount} chapters written and checked</span>
          <span>
            Chapter {job.current.chapterNumber} of {chapters.length}
          </span>
        </p>
      </div>

      <div className="grid gap-2 border-line max-[1200px]:col-span-full max-[1200px]:border-t max-[1200px]:pt-3.5 min-[1201px]:border-l min-[1201px]:pl-5">
        <p className="mb-2 text-[28px] leading-[1.1] font-bold tracking-[-0.02em] text-ink">
          <span className="num">{formatNumber(wordsWritten)}</span>{" "}
          <small className="text-[13px] font-medium tracking-normal text-ink-2">of {formatNumber(job.words.target)} words</small>
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-2 text-[13px]">
          <dt className="text-ink-3">Time left</dt>
          <dd className="text-right font-medium text-ink">{paused ? "Paused" : `About ${job.minutesLeft} minutes`}</dd>
          <dt className="text-ink-3">Model</dt>
          <dd className="text-right font-medium text-ink">
            <ModelName slug={job.model} />
          </dd>
          <dt className="text-ink-3">Cost so far</dt>
          <dd className="num text-right font-medium text-ink">{formatUsd(costSpent)}</dd>
        </dl>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {paused ? (
            <Button variant="primary" icon={Play} onClick={resume}>
              Resume
            </Button>
          ) : (
            <Button icon={Pause} onClick={pause}>
              Pause
            </Button>
          )}
          <Link to={livePath} className="hit-44 inline-flex items-center gap-1 rounded-xs px-1.5 text-[13px] font-semibold text-mint-ink hover:underline">
            Open live view
            <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </article>
  );
}
