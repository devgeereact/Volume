import { useEffect } from "react";
import { ReadOnlyBanner } from "../lib/access";
import { Outlet, useLocation, useParams } from "react-router";
import { useBookEvents, useBookLive } from "../api/events";
import { useExports, useMarketing } from "../api/hooks";
import { BookSteps } from "../components/ui/BookSteps";
import { Cover } from "../components/ui/Cover";
import { libraryCover } from "../features/library/draftCover";
import { Loader } from "../components/ui/Loader";
import { bookSteps } from "../demo/books";
import type { Book, BookStepId, PenName } from "../demo/types";
import { useWritingJob } from "../lib/job";
import { StepActionProvider } from "../lib/stepAction";
import { useBook } from "../lib/useBook";
import { NotFound } from "./NotFound";
import { StepFooter } from "./StepFooter";

/** The step the URL is on: /books/:bookId/<step>[/...]. */
function stepFromPath(pathname: string, bookId: string): BookStepId | null {
  const rest = pathname.slice(`/books/${bookId}/`.length);
  const id = rest.split("/")[0];
  return bookSteps.find((s) => s.id === id)?.id ?? null;
}

function BookBar({ book, penName, current, runningBookId }: { book: Book; penName: PenName | undefined; current: BookStepId; runningBookId: string | null }) {
  // Same cover as the Library card: the real one, or a draft from the cover style until the Cover studio makes it.
  const { design, image } = libraryCover(book);
  return (
    <div className="flex h-(--shell-bookbar) items-center gap-4 border-b border-border bg-canvas px-4 sm:px-6 lg:px-10">
      <div className="hidden shrink-0 items-center gap-2.5 sm:flex">
        <Cover
          title={book.title}
          author={penName?.name ?? ""}
          design={design}
          image={image}
          width={26}
          hideSubtitle
          decorative
          className="[--vol-shadow-cover:none]"
        />
        <span className="hidden max-w-[11rem] min-w-0 2xl:block">
          <span className="block truncate text-small font-semibold text-ink">{book.title}</span>
          <span className="block truncate text-caption text-ink-secondary">{penName?.name}</span>
        </span>
      </div>
      <BookSteps book={book} current={current} runningBookId={runningBookId} className="-mx-2 sm:mx-0" />
    </div>
  );
}

/** Demo books: the live dot on Writing follows the demo writing job. */
function DemoBookBar(props: { book: Book; penName: PenName | undefined; current: BookStepId }) {
  const { job, running } = useWritingJob();
  return <BookBar {...props} runningBookId={running ? job.bookId : null} />;
}

/** Server books: the live dot on Writing shows while a write job is running (from the event stream). */
function ApiBookBar(props: { book: Book; penName: PenName | undefined; current: BookStepId }) {
  const live = useBookLive(props.book.id);
  const writing = Object.values(live.data.jobs).some(
    (j) => (j.kind === "write_book" || j.kind === "rebuild_book" || j.kind === "write_section") && (j.status === "running" || j.status === "queued"),
  );
  // Export is done while the newest pack still matches the book; marketing is done once posts exist.
  const exports = useExports(props.book.id, { staleTimeMs: 30_000 });
  const marketing = useMarketing(props.book.id);
  const pack = (exports.data ?? []).filter((e) => e.kind === "pack" && e.status === "done").sort((a, b) => b.createdAt - a.createdAt)[0];
  const book = { ...props.book, exported: !!pack && !pack.stale, marketingMade: (marketing.data?.length ?? 0) > 0 };
  return <BookBar {...props} book={book} runningBookId={writing ? props.book.id : null} />;
}

function BookLoading() {
  return (
    <div className="grid min-h-[50vh] place-items-center px-4 py-10">
      <p className="flex items-center gap-2 text-small text-ink-secondary">
        <Loader /> Opening the book
        <span className="sr-only" role="status">
          Opening the book
        </span>
      </p>
    </div>
  );
}

/**
 * Layout for every /books/:bookId/<step> route: the one step bar at the top, the screen, and Back and
 * Next at the foot (D-016). It sets data-book on <html> so h-screen-fill subtracts the bar and footer.
 * The index redirect and unknown books render the screen alone.
 *
 * Demo books come from src/data. Any other id is loaded from the server when it answers (lib/useBook).
 * For a server book this layout also opens the book's event stream (useBookEvents) once, so screens
 * read live progress with useBookLive and must not open a second stream.
 */
export function BookLayout() {
  const { bookId = "" } = useParams();
  const { pathname } = useLocation();
  const { book, penName, from, loading, error } = useBook();
  const current = book ? stepFromPath(pathname, book.id) : null;
  const on = Boolean(book && current);

  useBookEvents(from === "api" ? bookId : undefined);

  useEffect(() => {
    document.documentElement.setAttribute("data-book", on ? "on" : "off");
    return () => document.documentElement.setAttribute("data-book", "off");
  }, [on]);

  if (!book) {
    if (loading) return <BookLoading />;
    if (error && error.code !== "not_found") {
      return (
        <div className="mx-auto grid w-full max-w-[1200px] gap-3 px-4 py-6 sm:px-8 lg:px-10">
          <p role="alert" className="text-body text-ink">
            The book could not be loaded. {error.message}
          </p>
        </div>
      );
    }
    if (error) return <NotFound what="book" />;
    return <Outlet />;
  }
  if (!current) return <Outlet />;
  return (
    <StepActionProvider>
      {from === "api" ? <ApiBookBar book={book} penName={penName} current={current} /> : <DemoBookBar book={book} penName={penName} current={current} />}
      {/* A viewer reads every step; the write buttons are hidden, and this says why (D-047). */}
      <ReadOnlyBanner className="mx-4 mt-4 sm:mx-6 lg:mx-10" />
      <Outlet />
      <StepFooter book={book} current={current} />
    </StepActionProvider>
  );
}
