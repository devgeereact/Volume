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

/**
 * A step's marker (.sn in the approved design): a green check circle when done, an amber flag when it
 * needs you, the number in an accent ring while in progress, else the number in a quiet ring. On the
 * current step (onDark) it takes the pill's colour.
 */
export function StepMarker({ state, n, onDark = false }: { state: StepState; n: number; onDark?: boolean }) {
  const base = "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] text-[11px] leading-none font-bold";
  if (onDark)
    return (
      <span aria-hidden className={cn(base, "num border-current bg-transparent")}>
        {state === "done" ? <Check size={12} strokeWidth={2.4} /> : state === "attention" ? <Flag size={11} strokeWidth={2.2} /> : n}
      </span>
    );
  switch (state) {
    case "done":
      return (
        <span aria-hidden className={cn(base, "border-transparent bg-good text-sky-1")}>
          <Check size={12} strokeWidth={2.4} />
        </span>
      );
    case "attention":
      return (
        <span aria-hidden className={cn(base, "border-amber bg-amber-wash text-amber")}>
          <Flag size={11} strokeWidth={2.2} />
        </span>
      );
    case "running":
    case "in-progress":
      return (
        <span aria-hidden className={cn(base, "num border-mint text-mint-ink", state === "running" && "vol-pulse")}>
          {n}
        </span>
      );
    case "not-started":
      return (
        <span aria-hidden className={cn(base, "num border-line-2")}>
          {n}
        </span>
      );
  }
}

/**
 * The book's eight steps (D-016) as links: Research, Titles, Blueprint, Writing, Editor, Cover, Marketing,
 * Export (last). The marker shows each step's state from the book; the navy pill shows the page you are on.
 * Used inside the step bar (shell/StepRail). The list scrolls sideways when it does not fit and keeps the
 * current step in view; under 761 px only the current step shows its name.
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
        "relative flex min-w-0 items-center gap-0.5 overflow-x-auto px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
                "flex h-9 items-center justify-center gap-1.5 rounded-[11px] px-[9px] text-[13px] font-medium whitespace-nowrap transition-colors duration-(--vol-dur-fast) ease-out",
                here ? "bg-btn text-on-btn" : "text-ink-2 hover:bg-soft hover:text-ink max-[760px]:px-2",
              )}
            >
              <StepMarker state={state} n={i + 1} onDark={here} />
              <span className={cn(!here && "max-[760px]:sr-only")}>{s.label}</span>
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
