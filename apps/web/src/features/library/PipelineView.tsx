import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, Pause } from "lucide-react";
import { Cover, LiveDot } from "../../components/ui";
import { libraryColumns, stageLabels } from "../../demo/books";
import { getPenName } from "../../demo/penNames";
import type { Book, PenName } from "../../demo/types";
import { cn } from "../../lib/cn";
import { columnFor, splitLeadingFigure } from "./bookStatus";
import { libraryCover } from "./draftCover";
import { BookStatusActions } from "../published/BookStatusActions";
import { canMarkPublished } from "../published/publishDate";

interface PipelineViewProps {
  books: Book[];
  /** The book with a live job. Its card shows a live dot only; the panel above carries the progress. */
  live: { bookId: string; running: boolean } | null;
  /** Pen name lookup for the current data source (server profiles or the demo list). */
  penName?: (id: string) => PenName | undefined;
  /** Show Mark as published and Archive under each card (server books the owner can change). */
  statusActions?: boolean | undefined;
}

/** Published books shown in the column before the link to the Published shelf. */
const PUBLISHED_SHOWN = 2;
/** Books a stage shows on phones and in the wide columns until the owner asks for the rest (owner, 21 October 2026). */
const STAGE_SHOWN = 3;

function BookCard({
  book,
  live,
  penName,
  statusActions,
  folded = false,
}: {
  book: Book;
  live: "running" | "paused" | null;
  penName: (id: string) => PenName | undefined;
  statusActions: boolean;
  /** Past the first few of a folded stage: hidden on phones and in the wide columns, kept in the scrolling row. */
  folded?: boolean;
}) {
  const pen = penName(book.penNameId);
  const status = splitLeadingFigure(book.statusLine);
  const { design, draft, image } = libraryCover(book);
  return (
    <li className={cn("sm:w-33 sm:shrink-0 sm:snap-start xl:w-auto", folded && "hidden sm:block xl:hidden")}>
      <Link
        to={`/books/${book.id}`}
        className="group grid grid-cols-[64px_minmax(0,1fr)] items-start gap-x-3.5 rounded-sm outline-offset-4 sm:block"
        title={draft ? "Draft cover from the book's cover style. Make the real one in the Cover studio." : undefined}
      >
        <Cover
          title={book.title}
          subtitle={book.subtitle}
          author={pen?.name ?? ""}
          design={design}
          image={image}
          lift
          hideSubtitle={draft}
          className="w-full"
          decorative
        />
        <span className="block min-w-0">
          <h3 className="text-[14px] leading-4.5 font-semibold text-ink sm:mt-3">{book.title}</h3>
          <span className="mt-0.5 block text-[13px] leading-4.5 text-ink-secondary">{pen?.name}</span>
          {live ? (
            <span className="mt-0.5 flex items-center gap-1.5 text-[13px] leading-4.5 font-semibold text-accent-text">
              {live === "running" ? <LiveDot /> : <Pause size={12} strokeWidth={2.25} aria-hidden />}
              {live === "running" ? "Writing now" : "Paused"}
            </span>
          ) : (
            <span className="block text-[13px] leading-4.5 text-ink-secondary">
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
          {(draft || book.coverImage?.final === false) && (
            <span className="mt-0.5 block text-[12.5px] leading-4 text-ink-tertiary">{draft ? "Draft cover" : "Cover concept, not built yet"}</span>
          )}
        </span>
      </Link>
      {statusActions && (
        <BookStatusActions look="links" className="mt-1 pl-19.5 sm:mt-2 sm:pl-0" bookId={book.id} title={book.title} showPublish={canMarkPublished(book)} />
      )}
    </li>
  );
}

/**
 * One stage's books. Under 1280 px it is a sideways row of fixed-width covers that never grows the page:
 * it scrolls only sideways (overflow-y hidden, so the mouse wheel still scrolls the page), fades at an edge
 * with more books past it, and shows previous and next buttons when the books do not all fit. From 1280 px
 * it is a plain column.
 */
function Shelf({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ before: false, after: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const before = el.scrollLeft > 2;
    const after = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((was) => (was.before === before && was.after === after ? was : { before, after }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);
  const move = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  const fade =
    edges.before && edges.after ? "sm:mask-x-from-92% sm:mask-x-to-100%" : edges.after ? "sm:mask-r-from-92%" : edges.before ? "sm:mask-l-from-92%" : "";
  return (
    <div className="relative">
      <ul
        ref={ref}
        onScroll={measure}
        className={cn(
          "grid grid-cols-1 gap-4 sm:-mx-1 sm:flex sm:snap-x sm:gap-4 sm:overflow-x-auto sm:overflow-y-hidden sm:overscroll-x-contain sm:px-1 sm:pt-1 sm:pb-3 xl:mx-0 xl:grid xl:grid-cols-1 xl:gap-y-6 xl:overflow-visible xl:px-0 xl:pt-0 xl:pb-0 xl:mask-none",
          fade,
        )}
      >
        {children}
      </ul>
      {(edges.before || edges.after) && (
        <div className="pointer-events-none absolute inset-x-0 top-25 hidden justify-between sm:flex xl:hidden">
          <ShelfButton label={`Earlier books in ${label}`} hidden={!edges.before} onClick={() => move(-1)}>
            <ChevronLeft size={18} strokeWidth={2} aria-hidden />
          </ShelfButton>
          <ShelfButton label={`More books in ${label}`} hidden={!edges.after} onClick={() => move(1)}>
            <ChevronRight size={18} strokeWidth={2} aria-hidden />
          </ShelfButton>
        </div>
      )}
    </div>
  );
}

function ShelfButton({ label, hidden, onClick, children }: { label: string; hidden: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "pointer-events-auto grid size-10 -translate-y-1/2 place-items-center rounded-full border border-border-strong bg-sheet text-ink shadow-sheet hover:bg-canvas",
        hidden && "invisible",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Cover view: books along the pipeline in eight columns (Idea to Published), each headed by the stage
 * and its count, so the columns are the stage filter. The column with live work gets a gilt underline.
 * Published keeps its two newest books here and links to the Published shelf for the rest, so no
 * column runs far below the others. Under 1280 px each stage is one row of covers that scrolls sideways, so the page
 * does not grow with every new book; on phones and in the wide columns a stage shows its first three books and a
 * Show all button.
 */
export function PipelineView({ books, live, penName = getPenName, statusActions = false }: PipelineViewProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (stage: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
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
        const foldable = stage !== "published" && total > STAGE_SHOWN;
        const unfolded = open.has(stage);
        return (
          <section key={stage} aria-labelledby={headingId} className={cn(total === 0 && "hidden xl:block")}>
            <h2
              id={headingId}
              className={cn(
                "mb-3.5 flex items-center justify-between border-b text-[13.5px] leading-none font-semibold",
                hasLive ? "border-b-2 border-accent pb-2.25 text-ink" : "border-border-strong pb-2.5 text-ink-secondary",
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
              <Shelf label={stageLabels[stage]}>
                {visible.map((b, i) => (
                  <BookCard
                    key={b.id}
                    book={b}
                    penName={penName}
                    statusActions={statusActions}
                    folded={foldable && !unfolded && i >= STAGE_SHOWN}
                    live={live && live.bookId === b.id ? (live.running ? "running" : "paused") : null}
                  />
                ))}
              </Shelf>
            )}
            {foldable && (
              <button
                type="button"
                aria-expanded={unfolded}
                onClick={() => toggle(stage)}
                className="hit-44 relative mt-4 inline-block rounded-xs text-small font-semibold text-select underline underline-offset-2 sm:hidden xl:inline-block"
              >
                {unfolded ? "Show fewer" : `Show all ${total}`}
              </button>
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
