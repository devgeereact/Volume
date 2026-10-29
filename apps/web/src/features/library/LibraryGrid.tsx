import { useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronUp, Flag, Pause } from "lucide-react";
import { Cover, LiveDot, Segbar, Skeleton } from "../../components/ui";
import { getPenName } from "../../demo/penNames";
import type { Book, PenName } from "../../demo/types";
import { cn } from "../../lib/cn";
import { bookGroups, groupOf, stepLine, stepSegments, type BookGroup } from "./bookStatus";
import { libraryCover } from "./draftCover";
import { useLibraryMotion } from "./libraryMotion";
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

/* The stage tag on each cover (.bc-tag): the group's word in its own colour. */
const tagTone: Record<BookGroup, string> = { progress: "text-blue", ready: "text-amber", published: "text-mint-ink" };

interface LibraryGridProps {
  /** The books after the profile, search and stage filters. */
  books: Book[];
  /** The stage filter from the tiles, or null for every book. */
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
  const group = groupOf(book);
  const { design, draft, image } = libraryCover(book);
  const needsYou = book.attentionSteps.length > 0;
  const coverNote = draft ? "Draft cover" : book.coverImage?.final === false ? "Cover concept, not built yet" : null;
  return (
    <li
      data-lib-card
      data-grid-card
      className="flex min-w-0 flex-col rounded-[18px] border border-edge bg-soft p-3 pb-3.5 transition-[background-color,box-shadow] duration-(--vol-dur-fast) hover:bg-panel-2 hover:shadow-glass max-[860px]:p-2 max-[860px]:pb-2.5 max-[560px]:rounded-lg"
    >
      <Link
        to={`/books/${book.id}`}
        className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-md outline-offset-2 max-[860px]:gap-[7px]"
        title={draft ? "Draft cover from the book's cover style. Make the real one in the Cover studio." : undefined}
      >
        <span className="relative grid aspect-5/6 place-items-center overflow-hidden rounded-[14px] bg-[linear-gradient(160deg,var(--vol-mint-wash),color-mix(in_srgb,var(--vol-mint-wash)_35%,transparent))] max-[560px]:rounded-[10px]">
          <span className="block w-[62%]">
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
          <span
            className={cn(
              "absolute top-2 left-2 rounded-pill border border-line bg-panel-2 px-2 py-[3px] text-[10.5px] leading-none font-bold tracking-[0.02em] max-[860px]:top-[5px] max-[860px]:left-[5px] max-[860px]:px-1.5 max-[860px]:text-[9px] max-[560px]:hidden",
              tagTone[group],
            )}
          >
            {bookGroups.find((g) => g.id === group)?.title}
          </span>
        </span>
        <span className="grid min-w-0 content-start gap-[3px] px-0.5">
          <h3 className="line-clamp-2 min-h-[2.5em] font-book text-[15px] leading-[1.25] font-semibold text-ink max-[860px]:text-[13px] max-[560px]:text-[12px]">
            {book.title}
          </h3>
          <span className="truncate text-caption text-ink-2 max-[560px]:hidden">{pen?.name}</span>
          {live ? (
            <span className="flex items-center gap-1.5 text-caption font-semibold text-blue max-[560px]:hidden">
              {live === "running" ? <LiveDot /> : <Pause size={12} strokeWidth={2.25} aria-hidden />}
              {live === "running" ? "Writing now" : "Paused"}
            </span>
          ) : (
            <span className={cn("truncate text-caption max-[560px]:hidden", needsYou ? "font-medium text-amber" : "text-ink-2")}>
              {needsYou && <Flag size={13} strokeWidth={1.8} aria-hidden className="mr-[3px] inline align-[-2px]" />}
              {needsYou && <span className="sr-only">Needs you: </span>}
              {book.statusLine}
            </span>
          )}
          {coverNote && <span className="truncate text-caption text-ink-3 max-[560px]:hidden">{coverNote}</span>}
        </span>
        <span className="mt-auto grid gap-1.5 border-t border-line px-0.5 pt-2 max-[560px]:border-t-0 max-[560px]:pt-0.5">
          <Segbar segments={stepSegments(book)} className="min-w-0" />
          <span className="truncate text-caption text-ink-2 max-[560px]:sr-only">{stepLine(book)}</span>
        </span>
      </Link>
      {statusActions && <BookStatusActions look="links" className="mt-2 px-0.5" bookId={book.id} title={book.title} showPublish={canMarkPublished(book)} />}
    </li>
  );
}

/**
 * Covers view: every book on one flat grid of equal cards, three to a row (the approved design's .books.b3). It shows
 * the first nine and a Show all button, so the page does not grow with every new book. Each card has the same height:
 * the cover sits in a fixed 5 by 6 frame with its stage tag, the title holds two lines and the rest one line each, and
 * every row takes the height of the tallest card. On phones the cards keep the cover, title and step bar only.
 */
export function LibraryGrid({ books, group, live, penName = getPenName, statusActions = false }: LibraryGridProps) {
  const [all, setAll] = useState(false);
  const sorted = sortForGrid(books);
  const total = sorted.length;
  const visible = all ? sorted : sorted.slice(0, GRID_SHOWN);
  const heading = group ? (bookGroups.find((g) => g.id === group)?.title ?? "Books") : "All books";
  const hint = group ? bookGroups.find((g) => g.id === group)?.hint : "Books that need you come first, then the newest.";
  const root = useRef<HTMLElement>(null);
  useLibraryMotion(root, `${visible.map((b) => b.id).join(",")}`);
  return (
    <section ref={root} aria-labelledby="grid-heading" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-2.5 gap-y-1 border-b-2 border-mint-wash pb-2">
        <h2 id="grid-heading" className="flex items-baseline gap-1 text-[15px] font-semibold text-ink">
          {heading}
          <span className="num ml-1 rounded-pill bg-soft px-2 py-px text-caption font-semibold text-ink-2">
            {visible.length} of {total}
            <span className="sr-only"> {total === 1 ? "book" : "books"}</span>
          </span>
        </h2>
        {hint && <p className="text-caption text-ink-2">{hint}</p>}
      </div>
      <ul className="grid auto-rows-fr grid-cols-3 gap-4 max-[860px]:gap-2.5">
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
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll((was) => !was)}
            className="inline-flex h-[42px] items-center gap-2 rounded-pill border border-edge bg-panel-2 px-5 text-[13.5px] font-semibold text-ink shadow-control transition-transform duration-(--vol-dur-fast) hover:-translate-y-px motion-reduce:hover:translate-y-0"
          >
            {all ? (
              <>
                Show fewer
                <ChevronUp size={16} strokeWidth={1.8} aria-hidden />
              </>
            ) : (
              <>
                Show all {total} books
                <small className="text-caption font-medium text-ink-3">{total - GRID_SHOWN} more</small>
                <ChevronDown size={16} strokeWidth={1.8} aria-hidden />
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}

/** Loading shape of the Covers view: nine card outlines. */
export function LibraryGridSkeletonCards({ className }: { className?: string | undefined }) {
  return (
    <div className={cn("grid grid-cols-3 gap-4 max-[860px]:gap-2.5", className)}>
      {Array.from({ length: GRID_SHOWN }, (_, i) => (
        <div key={i} className="grid gap-2.5 rounded-[18px] border border-edge bg-soft p-3">
          <Skeleton variant="block" className="aspect-5/6 rounded-[14px]" />
          <Skeleton className="w-4/5" />
          <Skeleton className="w-3/5" />
        </div>
      ))}
    </div>
  );
}
