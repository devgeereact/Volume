import { Link } from "react-router";
import { Pause } from "lucide-react";
import { Cover, LiveDot } from "../../components/ui";
import { libraryColumns, stageLabels } from "../../demo/books";
import { getPenName } from "../../demo/penNames";
import type { Book, PenName } from "../../demo/types";
import { cn } from "../../lib/cn";
import { columnFor, splitLeadingFigure } from "./bookStatus";
import { libraryCover } from "./draftCover";

interface PipelineViewProps {
  books: Book[];
  /** The book with a live job. Its card shows a live dot only; the panel above carries the progress. */
  live: { bookId: string; running: boolean } | null;
  /** Pen name lookup for the current data source (server profiles or the demo list). */
  penName?: (id: string) => PenName | undefined;
}

/** Published books shown in the column before the link to the Published shelf. */
const PUBLISHED_SHOWN = 2;

function BookCard({ book, live, penName }: { book: Book; live: "running" | "paused" | null; penName: (id: string) => PenName | undefined }) {
  const pen = penName(book.penNameId);
  const status = splitLeadingFigure(book.statusLine);
  const { design, draft } = libraryCover(book);
  return (
    <li>
      <Link
        to={`/books/${book.id}`}
        className="group grid grid-cols-[64px_minmax(0,1fr)] items-start gap-x-3.5 rounded-sm outline-offset-4 sm:block"
        title={draft ? "Draft cover from the book's cover style. Make the real one in the Cover studio." : undefined}
      >
        <Cover title={book.title} subtitle={book.subtitle} author={pen?.name ?? ""} design={design} lift hideSubtitle={draft} className="w-full" decorative />
        <span className="block min-w-0">
          <h3 className="text-[14px] leading-[18px] font-semibold text-ink sm:mt-3">{book.title}</h3>
          <span className="mt-0.5 block text-[13px] leading-[18px] text-ink-secondary">{pen?.name}</span>
          {live ? (
            <span className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-[18px] font-semibold text-accent-text">
              {live === "running" ? <LiveDot /> : <Pause size={12} strokeWidth={2.25} aria-hidden />}
              {live === "running" ? "Writing now" : "Paused"}
            </span>
          ) : (
            <span className="block text-[13px] leading-[18px] text-ink-secondary">
              {status.figure ? (
                <>
                  <b className="num font-semibold text-ink">{status.figure}</b>
                  {status.rest}
                </>
              ) : (
                book.statusLine
              )}
            </span>
          )}
          {draft && <span className="mt-0.5 block text-[12.5px] leading-4 text-ink-tertiary">Draft cover</span>}
        </span>
      </Link>
    </li>
  );
}

/**
 * Cover view: books along the pipeline in eight columns (Idea to Published), each headed by the stage
 * and its count, so the columns are the stage filter. The column with live work gets a gilt underline.
 * Published keeps its two newest books here and links to the Published shelf for the rest, so no
 * column runs far below the others. Under 1280 px each stage becomes a section with a wrapping grid.
 */
export function PipelineView({ books, live, penName = getPenName }: PipelineViewProps) {
  return (
    <div className="grid grid-cols-1 gap-8 xl:grid-cols-8 xl:gap-4">
      {libraryColumns.map((stage) => {
        let inColumn = books.filter((b) => columnFor(b) === stage);
        const total = inColumn.length;
        if (stage === "published")
          inColumn = [...inColumn].sort((a, b) => (b.published?.publishedOn ?? b.updatedAt).localeCompare(a.published?.publishedOn ?? a.updatedAt));
        const hidden = stage === "published" ? Math.max(0, total - PUBLISHED_SHOWN) : 0;
        const visible = hidden > 0 ? inColumn.slice(0, PUBLISHED_SHOWN) : inColumn;
        const hasLive = Boolean(live?.running && inColumn.some((b) => b.id === live.bookId));
        const headingId = `pipe-${stage}`;
        return (
          <section key={stage} aria-labelledby={headingId} className={cn(total === 0 && "hidden xl:block")}>
            <h2
              id={headingId}
              className={cn(
                "mb-3.5 flex items-center justify-between border-b text-[13.5px] leading-none font-semibold",
                hasLive ? "border-b-2 border-accent pb-[9px] text-ink" : "border-border-strong pb-2.5 text-ink-secondary",
              )}
            >
              {stageLabels[stage]}
              <em className="num font-medium text-ink-tertiary not-italic">
                {total}
                <span className="sr-only"> {total === 1 ? "book" : "books"}</span>
              </em>
            </h2>
            {total === 0 ? (
              <p className="text-small text-ink-tertiary">None here</p>
            ) : (
              <ul className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] sm:gap-y-6 xl:grid-cols-1">
                {visible.map((b) => (
                  <BookCard key={b.id} book={b} penName={penName} live={live && live.bookId === b.id ? (live.running ? "running" : "paused") : null} />
                ))}
              </ul>
            )}
            {hidden > 0 && (
              <Link to="/published" className="hit-44 relative mt-4 inline-block rounded-xs text-small font-semibold text-select underline underline-offset-2">
                {hidden} more on the Published shelf
              </Link>
            )}
          </section>
        );
      })}
    </div>
  );
}
