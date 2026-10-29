import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { Check, Flag } from "lucide-react";
import { bookSteps, stepState } from "../../demo/books";
import type { Book, BookStepId, StepState } from "../../demo/types";
import { cn } from "../../lib/cn";

interface BookStepsProps {
  book: Book;
  /** The page you are on. It is highlighted (aria-current="step"), whatever stage the book has reached. */
  current: BookStepId | null;
  /** Book id of the running writing job, if any (shows the live dot on Writing). */
  runningBookId?: string | null | undefined;
  className?: string | undefined;
}

export const stepStateWords: Record<StepState, string> = {
  "not-started": "not started",
  "in-progress": "in progress",
  running: "writing now",
  attention: "needs attention",
  done: "done",
};

/** A step's marker: check when done, flag when it needs you, a dot while in progress, else its number. */
export function StepMarker({ state, n, onDark = false }: { state: StepState; n: number; onDark?: boolean }) {
  const base = "grid size-[22px] shrink-0 place-items-center rounded-full text-[11.5px] leading-none font-semibold";
  switch (state) {
    case "done":
      return (
        <span aria-hidden className={cn(base, onDark ? "border-[1.5px] border-current" : "bg-ink text-canvas")}>
          <Check size={13} strokeWidth={2.75} />
        </span>
      );
    case "attention":
      return (
        <span aria-hidden className={cn(base, "border-[1.5px]", onDark ? "border-current" : "border-accent text-accent-text")}>
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
        <span aria-hidden className={cn(base, "num border-[1.5px]", onDark ? "border-current" : "border-border-strong text-ink-tertiary")}>
          {n}
        </span>
      );
  }
}

/**
 * The book's eight steps (D-016) as links: Research, Titles, Blueprint, Writing, Editor, Cover, Marketing,
 * Export (last). The marker shows each step's state from the book; the filled pill shows the page you are on.
 * Used inside the step rail (shell/StepRail). The list scrolls sideways when it does not fit and keeps the
 * current step in view; on phones only the current step shows its name.
 */
export function BookSteps({ book, current, runningBookId = null, className }: BookStepsProps) {
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!el || !list || list.scrollWidth <= list.clientWidth) return;
    // The list is positioned, so offsetLeft is measured from its own edge, like scrollLeft.
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) list.scrollLeft = Math.max(0, left - 24);
  }, [current]);

  return (
    <ol
      ref={listRef}
      className={cn(
        "relative flex min-w-0 items-center gap-0.5 overflow-x-auto px-3 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        "[mask-image:linear-gradient(90deg,transparent,black_12px,black_calc(100%-12px),transparent)]",
        className,
      )}
    >
      {bookSteps.map((s, i) => {
        const state = stepState(book, s.id, runningBookId);
        const here = s.id === current;
        return (
          <li key={s.id} className="flex shrink-0">
            <Link
              to={`/books/${book.id}/${s.id}`}
              aria-current={here ? "step" : undefined}
              className={cn(
                "flex h-11 min-w-11 items-center justify-center gap-2 rounded-control px-2.5 text-label whitespace-nowrap transition-colors duration-(--vol-dur-fast) ease-out",
                here
                  ? "bg-nav-active font-semibold text-on-nav-active shadow-nav-active"
                  : "font-medium text-ink-secondary hover:bg-glass-strong hover:text-ink max-sm:px-2",
              )}
            >
              <StepMarker state={state} n={i + 1} onDark={here} />
              <span className={cn(!here && "max-sm:sr-only")}>{s.label}</span>
              <span className="sr-only">
                , step {i + 1} of {bookSteps.length}, {stepStateWords[state]}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
