import { useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronUp, Pause } from "lucide-react";
import { Button, Cover, LiveDot, Skeleton } from "../../components/ui";
import { getPenName } from "../../demo/penNames";
import type { Book, PenName } from "../../demo/types";
import { cn } from "../../lib/cn";
import { bookGroups, groupOf, splitLeadingFigure, type BookGroup } from "./bookStatus";
import { libraryCover } from "./draftCover";
import { useLibraryMotion } from "./libraryMotion";
import { StageMeter } from "./PipelineView";
import { BookStatusActions } from "../published/BookStatusActions";
import { canMarkPublished } from "../published/publishDate";

/** Books the grid shows before Show all: three rows of three (studio redesign stage 3). */
export const GRID_SHOWN = 9;

const GROUP_ORDER: Record<BookGroup, number> = { progress: 0, ready: 1, published: 2 };

/** In progress first, then ready to publish, then published. Books that need the owner come first in each, then the newest. */
export function sortForGrid(books: readonly Book[]): Book[] {
  return [...books].sort(
    (a, b) => GROUP_ORDER[groupOf(a)] - GROUP_ORDER[groupOf(b)] || b.attentionSteps.length - a.attentionSteps.length || b.updatedAt.localeCompare(a.updatedAt),
  );
}

interface LibraryGridProps {
  /** The books after the profile, search and stage filters. */
  books: Book[];
  /** The stage filter from the side column, or null for every book. */
  group: BookGroup | null;
  live: { bookId: string; running: boolean } | null;
  penName?: ((id: string) => PenName | undefined) | undefined;
  /** Show Mark as published and Archive on each card (server books the owner can change). */
  statusActions?: boolean | undefined;
}

function GridCard({
  book,
  live,
  penName,
  statusActions,
}: {
  book: Book;
  live: "running" | "paused" | null;
  penName: (id: string) => PenName | undefined;
  statusActions: boolean;
}) {
  const pen = penName(book.penNameId);
  const status = splitLeadingFigure(book.statusLine);
  const { design, draft, image } = libraryCover(book);
  const coverNote = draft ? "Draft cover" : book.coverImage?.final === false ? "Cover concept, not built yet" : null;
  return (
    <li data-lib-card data-grid-card className="vol-glass flex min-w-0 flex-col rounded-card p-2.5 sm:p-3">
      <Link
        to={`/books/${book.id}`}
        className="group flex min-w-0 flex-1 flex-col gap-2.5 rounded-control outline-offset-2"
        title={draft ? "Draft cover from the book's cover style. Make the real one in the Cover studio." : undefined}
      >
        <span className="grid aspect-5/6 place-items-center overflow-hidden rounded-control bg-sunken">
          <span className="block w-[58%]">
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
          </span>
        </span>
        <span className="grid min-w-0 content-start gap-0.5 px-0.5">
          <h3 className="line-clamp-2 min-h-10 text-[14px] leading-5 font-semibold text-ink">{book.title}</h3>
          <span className="truncate text-small text-ink-secondary">{pen?.name}</span>
          {live ? (
            <span className="flex items-center gap-1.5 text-small font-semibold text-accent-text">
              {live === "running" ? <LiveDot /> : <Pause size={12} strokeWidth={2.25} aria-hidden />}
              {live === "running" ? "Writing now" : "Paused"}
            </span>
          ) : (
            <span className="truncate text-small text-ink-secondary">
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
          {coverNote && <span className="truncate text-[12.5px] leading-4 text-ink-tertiary">{coverNote}</span>}
        </span>
        <StageMeter book={book} live={live === "running"} className="mt-auto border-t border-line px-0.5 pt-2" />
      </Link>
      {statusActions && <BookStatusActions look="links" className="mt-2 px-0.5" bookId={book.id} title={book.title} showPublish={canMarkPublished(book)} />}
    </li>
  );
}

/**
 * Grid view: every book on one flat grid of equal cards, three to a row from 640 px (two on phones). It shows the first
 * nine and a Show all button, so the page does not grow with every new book. Each card has the same height: the cover
 * sits in a fixed 5 by 6 frame, the title holds two lines and the rest one line each, and every row takes the height
 * of the tallest card.
 */
export function LibraryGrid({ books, group, live, penName = getPenName, statusActions = false }: LibraryGridProps) {
  const [all, setAll] = useState(false);
  const sorted = sortForGrid(books);
  const total = sorted.length;
  const visible = all ? sorted : sorted.slice(0, GRID_SHOWN);
  const heading = group ? (bookGroups.find((g) => g.id === group)?.title ?? "Books") : "All books";
  const hint = group ? bookGroups.find((g) => g.id === group)?.hint : "In progress first, then ready to publish, then published. Newest first in each.";
  const root = useRef<HTMLElement>(null);
  useLibraryMotion(root, `${visible.map((b) => b.id).join(",")}`);
  return (
    <section ref={root} aria-labelledby="grid-heading" className="min-w-0">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border-strong pb-2.5">
        <h2 id="grid-heading" className="flex items-baseline gap-2.5 text-[15px] leading-none font-semibold text-ink">
          {heading}
          <em className="num rounded-full bg-sunken px-2 py-0.5 text-[12.5px] font-medium text-ink-secondary not-italic">
            {visible.length} of {total}
            <span className="sr-only"> {total === 1 ? "book" : "books"}</span>
          </em>
        </h2>
        {hint && <p className="text-small text-ink-tertiary">{hint}</p>}
      </div>
      <ul className="grid auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {visible.map((b) => (
          <GridCard
            key={b.id}
            book={b}
            penName={penName}
            statusActions={statusActions}
            live={live && live.bookId === b.id ? (live.running ? "running" : "paused") : null}
          />
        ))}
      </ul>
      {total > GRID_SHOWN && (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" icon={all ? ChevronUp : ChevronDown} aria-expanded={all} onClick={() => setAll((was) => !was)}>
            {all ? "Show fewer" : `Show all ${total} books, ${total - GRID_SHOWN} more`}
          </Button>
        </div>
      )}
    </section>
  );
}

/** Loading shape of the Grid view: nine card outlines beside the side column. */
export function LibraryGridSkeletonCards({ className }: { className?: string | undefined }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4", className)}>
      {Array.from({ length: GRID_SHOWN }, (_, i) => (
        <div key={i} className="vol-glass grid gap-2.5 rounded-card p-3">
          <Skeleton variant="block" className="aspect-5/6 rounded-control" />
          <Skeleton className="w-4/5" />
          <Skeleton className="w-3/5" />
        </div>
      ))}
    </div>
  );
}
