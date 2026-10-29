import { PauseCircle } from "lucide-react";
import { Loader } from "../../components/ui";
import type { WritingSection } from "../../demo";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import { cardTitle, Count, glassCard, RowDot, RowNumber, rowClasses } from "./studio";

export type RowStatus = "done" | "attention" | "writing" | "paused" | "stopped" | "rewriting" | "checking" | "queued";

export interface SectionRow {
  section: WritingSection;
  status: RowStatus;
  words: number;
  claims: number;
}

interface SectionListProps {
  rows: SectionRow[];
  doneCount: number;
  viewing: string;
  onView: (sectionId: string) => void;
  summary: string;
}

/** Section list card (.sec-list): number, title and a status dot or word. "N of M" beside the heading. */
export function SectionList({ rows, doneCount, viewing, onView, summary }: SectionListProps) {
  return (
    <nav aria-label="Sections" className={cn(glassCard, "grid content-start gap-0.5 p-2.5")}>
      <h2 className={cn(cardTitle, "mx-2 mt-1.5 mb-0.5")}>
        Sections
        <Count>
          {doneCount} of {rows.length}
          <span className="sr-only"> done</span>
        </Count>
      </h2>
      <p className="mx-2 mb-2 text-[12px] leading-4 text-ink-3">{summary}</p>
      <ol className="grid gap-0.5">
        {rows.map((row) => (
          <li key={row.section.id} className="min-w-0">
            <SectionButton row={row} selected={viewing === row.section.id} onView={onView} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SectionButton({ row, selected, onView }: { row: SectionRow; selected: boolean; onView: (id: string) => void }) {
  const { section, status } = row;
  const live = status === "writing" || status === "paused" || status === "stopped";
  return (
    <button type="button" onClick={() => onView(section.id)} aria-current={selected ? "true" : undefined} className={rowClasses(live || selected)}>
      <RowNumber n={section.number} />
      <span title={section.title} className="min-w-0 flex-1 truncate">
        {section.title}
      </span>
      <StatusWord row={row} />
    </button>
  );
}

function StatusWord({ row }: { row: SectionRow }) {
  const word = "num inline-flex shrink-0 items-center gap-1 text-[11.5px] leading-4 whitespace-nowrap";
  switch (row.status) {
    case "done":
      return <RowDot tone="ok" label={row.section.number === null ? "Done, checks passed" : `${formatNumber(row.words)} words, checks passed`} />;
    case "attention":
      return <RowDot tone="warn" label={`${row.claims} ${row.claims === 1 ? "claim" : "claims"} to verify, needs attention`} />;
    case "writing":
      return <span className={cn(word, "font-semibold")}>Writing</span>;
    case "paused":
      return (
        <span className={cn(word, "font-semibold")}>
          <PauseCircle size={13} strokeWidth={2} aria-hidden />
          Paused
        </span>
      );
    case "stopped":
      return <span className={cn(word, "font-semibold")}>Stopped</span>;
    case "rewriting":
      return (
        <span className={word}>
          <Loader />
          Rewriting
        </span>
      );
    case "checking":
      return (
        <span className={word}>
          <Loader />
          Checking
        </span>
      );
    case "queued":
      return <span className={cn(word, "font-normal text-ink-3")}>Queued</span>;
  }
}
