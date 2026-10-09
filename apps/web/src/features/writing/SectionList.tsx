import { Check, Clock, Flag, PauseCircle } from "lucide-react";
import { ChapterBars, Loader, ProgressBar, type ChapterSegment } from "../../components/ui";
import type { Book, WritingSection } from "../../demo";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";

export type RowStatus = "done" | "attention" | "writing" | "paused" | "stopped" | "rewriting" | "checking" | "queued";

export interface SectionRow {
  section: WritingSection;
  status: RowStatus;
  words: number;
  claims: number;
}

interface SectionListProps {
  book: Book;
  rows: SectionRow[];
  doneCount: number;
  segments: ChapterSegment[];
  chapterProgress: number;
  viewing: string;
  onView: (sectionId: string) => void;
  summary: string;
}

/** Section list (340 px on wide screens): number, title, status with an icon and words. */
export function SectionList({ book, rows, doneCount, segments, chapterProgress, viewing, onView, summary }: SectionListProps) {
  return (
    <nav aria-label="Sections" className="flex min-h-0 flex-col xl:h-full border-border bg-canvas xl:border-r">
      <div className="px-5 pt-5 pb-4 sm:px-6">
        <h2 className="text-subhead text-ink">Sections</h2>
        <p className="mt-0.5 text-small text-ink-secondary">{summary}</p>
        <ChapterBars className="mt-3" segments={segments} label={`${book.title}, chapters written`} />
        <p className="num mt-1.5 text-caption text-ink-tertiary">
          {doneCount} of {rows.length} sections done
        </p>
      </div>
      <ol className="relative min-h-0 flex-1 overflow-y-auto border-t border-border px-3 py-3">
        {rows.map((row) => (
          <li key={row.section.id}>
            <SectionButton row={row} selected={viewing === row.section.id} chapterProgress={chapterProgress} onView={onView} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SectionButton({
  row,
  selected,
  chapterProgress,
  onView,
}: {
  row: SectionRow;
  selected: boolean;
  chapterProgress: number;
  onView: (id: string) => void;
}) {
  const { section, status } = row;
  const live = status === "writing" || status === "paused" || status === "stopped";
  return (
    <button
      type="button"
      onClick={() => onView(section.id)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group relative grid min-h-11 w-full grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-x-2 rounded-sm px-2 py-2.5 text-left",
        live ? "bg-accent-wash" : selected ? "bg-select-wash" : "hover:bg-sunken",
        selected && !live && "vol-pencil-edge",
      )}
    >
      <span className="num pt-px text-right text-small text-ink-tertiary">{section.number ?? ""}</span>
      <span
        title={section.title}
        className={cn("text-[14px] leading-5 break-words", selected ? "font-semibold text-ink" : status === "queued" ? "text-ink-secondary" : "text-ink")}
      >
        {section.title}
      </span>
      <StatusWord row={row} />
      {live && (
        <ProgressBar
          className="col-start-2 col-end-4 mt-2"
          size="thin"
          value={Math.min(100, chapterProgress * 100)}
          max={100}
          live={status === "writing"}
          label={`${section.title} progress`}
          valueText={`${formatNumber(row.words)} of about ${formatNumber(section.wordTarget)} words`}
        />
      )}
    </button>
  );
}

function StatusWord({ row }: { row: SectionRow }) {
  const base = "num inline-flex items-center gap-1 text-small whitespace-nowrap";
  switch (row.status) {
    case "done":
      return (
        <span className={cn(base, "text-success")}>
          <Check size={14} strokeWidth={2} aria-hidden />
          {row.section.number === null ? "Done" : formatNumber(row.words)}
          <span className="sr-only">words, checks passed</span>
        </span>
      );
    case "attention":
      return (
        <span className={cn(base, "text-claim")}>
          <Flag size={14} strokeWidth={2} aria-hidden />
          {row.claims} claim
          <span className="sr-only">to verify, needs attention</span>
        </span>
      );
    case "writing":
      return <span className={cn(base, "font-semibold text-accent-text")}>Writing</span>;
    case "paused":
      return (
        <span className={cn(base, "font-semibold text-accent-text")}>
          <PauseCircle size={14} strokeWidth={2} aria-hidden />
          Paused
        </span>
      );
    case "stopped":
      return <span className={cn(base, "font-semibold text-accent-text")}>Stopped</span>;
    case "rewriting":
      return (
        <span className={cn(base, "text-accent-text")}>
          <Loader />
          Rewriting
        </span>
      );
    case "checking":
      return (
        <span className={cn(base, "text-accent-text")}>
          <Loader />
          Checking
        </span>
      );
    case "queued":
      return (
        <span className={cn(base, "text-ink-tertiary")}>
          <Clock size={14} strokeWidth={2} aria-hidden className="hidden sm:inline" />
          Queued
        </span>
      );
  }
}
