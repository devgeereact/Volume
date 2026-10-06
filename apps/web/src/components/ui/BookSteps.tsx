import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { Check, Flag } from "lucide-react";
import { bookSteps, stepState } from "../../data/books";
import type { Book, BookStepId, StepState } from "../../data/types";
import { cn } from "../../lib/cn";

interface BookStepsProps {
  book: Book;
  /** The page you are on. It is highlighted (aria-current="page"), whatever stage the book has reached. */
  current: BookStepId | null;
  /** Book id of the running writing job, if any (shows the live dot on Writing). */
  runningBookId?: string | null | undefined;
  className?: string | undefined;
}

const stateWords: Record<StepState, string> = {
  "not-started": "not started",
  "in-progress": "in progress",
  running: "writing now",
  attention: "needs attention",
  done: "done",
};

function Marker({ state, n }: { state: StepState; n: number }) {
  const base = "grid size-[22px] shrink-0 place-items-center rounded-full text-[11.5px] leading-none font-semibold";
  switch (state) {
    case "done":
      return (
        <span aria-hidden className={cn(base, "bg-ink text-canvas")}>
          <Check size={13} strokeWidth={2.75} />
        </span>
      );
    case "attention":
      return (
        <span aria-hidden className={cn(base, "border-[1.5px] border-accent text-accent-text")}>
          <Flag size={11} strokeWidth={2.5} />
        </span>
      );
    case "running":
    case "in-progress":
      return (
        <span aria-hidden className={cn(base, "border-[1.5px] border-accent")}>
          <span className={cn("rounded-full bg-accent", state === "running" ? "size-2.5" : "size-2")} />
        </span>
      );
    case "not-started":
      return (
        <span aria-hidden className={cn(base, "num border-[1.5px] border-border-strong text-ink-tertiary")}>
          {n}
        </span>
      );
  }
}

/**
 * The one step bar for a book (D-016): Research, Titles, Blueprint, Writing, Editor, Cover, Export,
 * Marketing. The marker shows each step's state from the book (done, in progress, needs attention,
 * not started); the blue pencil underline and bold label show the page you are on. Links, so Tab moves
 * through them; on phones the bar scrolls sideways and keeps the current step in view.
 */
export function BookSteps({ book, current, runningBookId = null, className }: BookStepsProps) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const list = listRef.current;
    if (!el || !list || list.scrollWidth <= list.clientWidth) return;
    list.scrollTo({ left: Math.max(0, el.offsetLeft - list.clientWidth / 2 + el.clientWidth / 2) });
  }, [current]);

  return (
    <nav aria-label={`Steps for ${book.title}`} className={cn("min-w-0", className)}>
      <ol ref={listRef} className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]">
        {bookSteps.map((s, i) => {
          const state = stepState(book, s.id, runningBookId);
          const here = s.id === current;
          return (
            <li key={s.id} className="flex shrink-0 items-center">
              {i > 0 && <span aria-hidden className="mx-0.5 h-px w-3 bg-border-strong xl:w-5" />}
              <Link
                to={`/books/${book.id}/${s.id}`}
                aria-current={here ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 items-center gap-2 rounded-sm px-2 text-label whitespace-nowrap xl:px-2.5",
                  here ? "font-semibold text-ink" : "font-medium text-ink-secondary hover:bg-sunken hover:text-ink",
                )}
              >
                <Marker state={state} n={i + 1} />
                {s.label}
                <span className="sr-only">
                  , step {i + 1} of {bookSteps.length}, {stateWords[state]}
                </span>
                {here && <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 origin-left rounded-full bg-select animate-pencil-x" />}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
