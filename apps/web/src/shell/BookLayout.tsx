import { useEffect } from "react";
import { ReadOnlyBanner } from "../lib/access";
import { Outlet, useLocation, useParams } from "react-router";
import { useBookEvents, useBookLive } from "../api/events";
import { useExports, useMarketing } from "../api/hooks";
import { Loader } from "../components/ui/Loader";
import { bookSteps } from "../demo/books";
import type { Book, BookStepId } from "../demo/types";
import { useWritingJob } from "../lib/job";
import { StepActionProvider, useCurrentStepAction } from "../lib/stepAction";
import { useBook } from "../lib/useBook";
import { NotFound } from "./NotFound";
import { StepHead } from "./StepHead";
import { StepRail } from "./StepRail";
import { fullSteps } from "./stepCopy";
import { UpNext } from "./UpNext";

/** The step the URL is on: /books/:bookId/<step>[/...]. */
function stepFromPath(pathname: string, bookId: string): BookStepId | null {
  const rest = pathname.slice(`/books/${bookId}/`.length);
  const id = rest.split("/")[0];
  return bookSteps.find((s) => s.id === id)?.id ?? null;
}

/** Rail, head, screen and Up next for one book step. The head and Up next are left out on full-height steps. */
function StepPage({ book, author, current, runningBookId }: { book: Book; author: string; current: BookStepId; runningBookId: string | null }) {
  const action = useCurrentStepAction();
  const full = fullSteps.has(current);
  return (
    <>
      <StepRail book={book} author={author} current={current} runningBookId={runningBookId} action={full ? action : null} />
      {/* A viewer reads every step; the write buttons are hidden, and this says why (D-047). */}
      <ReadOnlyBanner className="mx-4 mb-4 min-[861px]:mx-6" />
      {full ? (
        <Outlet />
      ) : (
        <StepHead book={book} current={current} runningBookId={runningBookId} action={action}>
          <Outlet />
          <UpNext book={book} current={current} runningBookId={runningBookId} />
        </StepHead>
      )}
    </>
  );
}

/** Demo books: the live dot on Writing follows the demo writing job. */
function DemoStepPage(props: { book: Book; author: string; current: BookStepId }) {
  const { job, running } = useWritingJob();
  return <StepPage {...props} runningBookId={running ? job.bookId : null} />;
}

/** Server books: the live dot on Writing shows while a write job is running (from the event stream). */
function ApiStepPage(props: { book: Book; author: string; current: BookStepId }) {
  const live = useBookLive(props.book.id);
  const writing = Object.values(live.data.jobs).some(
    (j) => (j.kind === "write_book" || j.kind === "rebuild_book" || j.kind === "write_section") && (j.status === "running" || j.status === "queued"),
  );
  // Export is done while the newest pack still matches the book; marketing is done once posts exist.
  const exports = useExports(props.book.id, { staleTimeMs: 30_000 });
  const marketing = useMarketing(props.book.id);
  const pack = (exports.data ?? []).filter((e) => e.kind === "pack" && e.status === "done").sort((a, b) => b.createdAt - a.createdAt)[0];
  const book = { ...props.book, exported: !!pack && !pack.stale, marketingMade: (marketing.data?.length ?? 0) > 0 };
  return <StepPage {...props} book={book} runningBookId={writing ? props.book.id : null} />;
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
 * Layout for every /books/:bookId/<step> route (D-016, approved design): the step bar that sticks
 * under the top bar (Previous, the eight steps, Next), the step head, the screen, and the Up next card.
 * Full-height steps (writing, editor, cover) skip the head and the card and put their main action in the
 * rail. It sets data-book on <html>; the rail measures itself into --shell-bookbar, so h-screen-fill and
 * sticky inspectors sit below it. The index redirect and unknown books render the screen alone.
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
      {from === "api" ? (
        <ApiStepPage book={book} author={penName?.name ?? ""} current={current} />
      ) : (
        <DemoStepPage book={book} author={penName?.name ?? ""} current={current} />
      )}
    </StepActionProvider>
  );
}
