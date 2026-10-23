import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, Pause } from "lucide-react";
import { Cover, LiveDot } from "../../components/ui";
import { libraryColumns, stageLabels } from "../../demo/books";
import { getPenName } from "../../demo/penNames";
import type { Book, PenName } from "../../demo/types";
import { cn } from "../../lib/cn";
import { columnFor, columnIndex, splitLeadingFigure } from "./bookStatus";
import { libraryCover } from "./draftCover";
import { BookStatusActions } from "../published/BookStatusActions";
import { canMarkPublished } from "../published/publishDate";
import { useLibraryMotion } from "./libraryMotion";

interface PipelineViewProps {
  books: Book[];
  /** The book with a live job. Its card shows a live dot only; the panel above carries the progress. */
  live: { bookId: string; running: boolean } | null;
  /** Pen name lookup for the current data source (server profiles or the demo list). */
  penName?: (id: string) => PenName | undefined;
  /** Show Mark as published and Archive under each card (server books the owner can change). */
  statusActions?: boolean | undefined;
}

/** Published books shown in the lane before the link to the Published shelf. */
const PUBLISHED_SHOWN = 6;
/** Books a lane shows on phones and in the wide grid until the owner asks for the rest (owner, 21 October 2026). */
const LANE_SHOWN = 6;

/**
 * The board's three lanes (owner, 23 October 2026: with most books finished, eight stage columns piled everything at the
 * Export and Published end). A lane groups stages by what the owner has to do: keep making it, publish it, or nothing.
 */
const LANES = [
  {
    id: "making",
    title: "In progress",
    hint: "Still being researched, planned, written or finished.",
    empty: "Nothing is being made right now.",
    stages: ["idea", "research", "blueprint", "writing", "editing", "cover"],
  },
  {
    id: "ready",
    title: "Ready to publish",
    hint: "Written and covered. Build the pack, then mark it published.",
    empty: "No book is waiting to be published.",
    stages: ["export"],
  },
  { id: "published", title: "Published", hint: "Live on the shelf.", empty: "Nothing published yet.", stages: ["published"] },
] as const;

/** Eight small bars, one per stage; every stage up to the book's own is filled. */
function StageMeter({ book, live }: { book: Book; live: boolean }) {
  const at = columnIndex(book);
  const label = `Step ${at + 1} of ${libraryColumns.length}, ${stageLabels[columnFor(book)]}`;
  return (
    <span className="mt-2 block" role="img" aria-label={label}>
      <span aria-hidden className="flex gap-0.5">
        {libraryColumns.map((stage, i) => (
          <span key={stage} className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken">
            {i <= at && (
              <span
                data-step-fill
                className={cn("block h-full origin-left rounded-full", i === at && live ? "bg-accent" : i === at ? "bg-accent-text" : "bg-ink-secondary")}
              />
            )}
          </span>
        ))}
      </span>
      <span aria-hidden className="mt-1 block text-[12px] leading-4 text-ink-tertiary">
        Step <b className="num font-semibold text-ink-secondary">{at + 1}</b> of {libraryColumns.length}: {stageLabels[columnFor(book)]}
      </span>
    </span>
  );
}

function BookCard({
  book,
  live,
  penName,
  statusActions,
  folded = false,
  meter = false,
}: {
  book: Book;
  live: "running" | "paused" | null;
  penName: (id: string) => PenName | undefined;
  statusActions: boolean;
  /** Past the first few of a folded lane: hidden on phones and in the wide grid, kept in the scrolling row. */
  folded?: boolean;
  /** Show the eight-step meter under the status (books still being made or waiting to publish). */
  meter?: boolean;
}) {
  const pen = penName(book.penNameId);
  const status = splitLeadingFigure(book.statusLine);
  const { design, draft, image } = libraryCover(book);
  return (
    <li data-lib-card className={cn("sm:w-33 sm:shrink-0 sm:snap-start xl:w-auto", folded && "hidden sm:block xl:hidden")}>
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
          {meter && <StageMeter book={book} live={live === "running"} />}
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
          "grid grid-cols-1 gap-4 sm:-mx-1 sm:flex sm:snap-x sm:gap-4 sm:overflow-x-auto sm:overflow-y-hidden sm:overscroll-x-contain sm:px-1 sm:pt-1 sm:pb-3 xl:mx-0 xl:grid xl:grid-cols-6 xl:gap-x-5 xl:gap-y-8 xl:overflow-visible xl:px-0 xl:pt-0 xl:pb-0 xl:mask-none",
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
 * Cover view: three lanes, In progress, Ready to publish and Published, each headed by its count and what it means.
 * A book in progress shows an eight-step meter so the owner sees at a glance how far along it is and which step is
 * next; the furthest-along books come first. The lane with live work gets a gilt underline. Published keeps its newest
 * books here and links to the Published shelf for the rest. Under 1280 px each lane is one row of covers that scrolls
 * sideways, so the page does not grow with every new book; on phones and in the wide grid a lane shows its first six
 * books and a Show all button.
 */
export function PipelineView({ books, live, penName = getPenName, statusActions = false }: PipelineViewProps) {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (lane: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(lane)) next.delete(lane);
      else next.add(lane);
      return next;
    });
  const root = useRef<HTMLDivElement>(null);
  useLibraryMotion(root, books.map((b) => b.id).join(","));
  return (
    <div ref={root} className="grid grid-cols-1 gap-10">
      {LANES.map((lane) => {
        const stages: readonly string[] = lane.stages;
        let inLane = books.filter((b) => stages.includes(columnFor(b)));
        const total = inLane.length;
        if (lane.id === "published")
          inLane = [...inLane].sort((a, b) => (b.published?.publishedOn ?? b.updatedAt).localeCompare(a.published?.publishedOn ?? a.updatedAt));
        else inLane = [...inLane].sort((a, b) => columnIndex(b) - columnIndex(a) || b.updatedAt.localeCompare(a.updatedAt));
        const hidden = lane.id === "published" ? Math.max(0, total - PUBLISHED_SHOWN) : 0;
        const visible = hidden > 0 ? inLane.slice(0, PUBLISHED_SHOWN) : inLane;
        const hasLive = Boolean(live?.running && inLane.some((b) => b.id === live.bookId));
        const headingId = `lane-${lane.id}`;
        const foldable = lane.id !== "published" && total > LANE_SHOWN;
        const unfolded = open.has(lane.id);
        return (
          <section key={lane.id} aria-labelledby={headingId}>
            <div
              className={cn(
                "mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b",
                hasLive ? "border-b-2 border-accent pb-2.25" : "border-border-strong pb-2.5",
              )}
            >
              <h2 id={headingId} className="flex items-baseline gap-2.5 text-[15px] leading-none font-semibold text-ink">
                {lane.title}
                <em className="num rounded-full bg-sunken px-2 py-0.5 text-[12.5px] font-medium text-ink-secondary not-italic">
                  {total}
                  <span className="sr-only"> {total === 1 ? "book" : "books"}</span>
                </em>
              </h2>
              <p className="text-small text-ink-tertiary">{lane.hint}</p>
            </div>
            {total === 0 ? (
              <p className="text-small text-ink-tertiary">{lane.empty}</p>
            ) : (
              <Shelf label={lane.title}>
                {visible.map((b, i) => (
                  <BookCard
                    key={b.id}
                    book={b}
                    penName={penName}
                    statusActions={statusActions}
                    meter={lane.id !== "published"}
                    folded={foldable && !unfolded && i >= LANE_SHOWN}
                    live={live && live.bookId === b.id ? (live.running ? "running" : "paused") : null}
                  />
                ))}
              </Shelf>
            )}
            {foldable && (
              <button
                type="button"
                aria-expanded={unfolded}
                onClick={() => toggle(lane.id)}
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
