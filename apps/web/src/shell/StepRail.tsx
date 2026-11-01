import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, House } from "lucide-react";
import { BookSteps } from "../components/ui/BookSteps";
import { Tooltip } from "../components/ui/Tooltip";
import { bookSteps } from "../demo/books";
import type { Book, BookStepId } from "../demo/types";
import type { StepAction } from "../lib/stepAction";
import { bookStepPath } from "../screens";
import { cn } from "../lib/cn";
import { StepActionButton } from "./StepActionButton";

interface StepRailProps {
  book: Book;
  /** Pen name (kept for callers; the approved step bar shows no cover). */
  author: string;
  /** The step on screen, or "overview" for the book's Overview page. */
  current: BookStepId | "overview";
  runningBookId: string | null;
  /** The screen's main action, shown here only on full-height steps (they have no step head). */
  action: StepAction | null;
}

/** Where Previous and Next go: Overview, then the steps in order, with the Library before Overview and after the last step. */
export function railTargets(book: Book, current: BookStepId | "overview") {
  const i = current === "overview" ? -1 : bookSteps.findIndex((s) => s.id === current);
  const prev = i > 0 ? bookSteps[i - 1] : undefined;
  const next = i < bookSteps.length - 1 ? bookSteps[i + 1] : undefined;
  const toOverview = i === 0;
  return {
    prevTo: prev ? bookStepPath(book.id, prev.id) : toOverview ? `/books/${book.id}/overview` : "/library",
    prevLabel: prev ? `Previous step: ${prev.label}` : toOverview ? "Back to the book overview" : "Back to the Library",
    nextTo: next ? bookStepPath(book.id, next.id) : book.published ? "/published" : "/library",
    nextName: next ? next.label : book.published ? "Published" : "Library",
  };
}

/* Which edge of the step list has more steps out of view: the fade shows only on that edge. */
type Edge = "none" | "start" | "end" | "both";
const edgeMask =
  "data-[edge=none]:[mask-image:none] data-[edge=start]:[mask-image:linear-gradient(90deg,transparent,black_28px)] data-[edge=end]:[mask-image:linear-gradient(90deg,black_calc(100%-28px),transparent)]";

/**
 * The book's step bar from the approved design (.srail): a strong glass bar that sticks under the top bar
 * on every book step. Back (the step before, or the Library), the eight steps with their markers, and a
 * quiet outlined Next control; on full-height steps also the screen's main action. The screen's one navy
 * action lives in the step head (or here, on full-height steps), so Next is never a second navy button.
 * When the steps do not fit, the list scrolls sideways inside the bar: the current step is kept in view
 * (also after a resize) and the fade shows only on the edge that has more steps.
 * It measures itself into --shell-bookbar, so h-screen-fill panes and sticky inspectors sit below it.
 * Under 1500 px Next is an arrow (its name in the tooltip and label); under 761 px it says "Next".
 */
export function StepRail({ book, current, runningBookId, action }: StepRailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const t = railTargets(book, current);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty("--shell-bookbar", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty("--shell-bookbar");
    };
  }, []);

  useLayoutEffect(() => {
    const list = ref.current?.querySelector<HTMLOListElement>("ol");
    if (!list) return;
    let width = list.clientWidth;
    const mark = () => {
      const more = list.scrollWidth - list.clientWidth;
      const start = more > 1 && list.scrollLeft > 1;
      const end = more > 1 && list.scrollLeft < more - 1;
      const edge: Edge = start && end ? "both" : start ? "start" : end ? "end" : "none";
      list.dataset["edge"] = edge;
    };
    const keepCurrent = () => {
      const el = list.querySelector<HTMLElement>('[aria-current="step"]');
      if (el && list.scrollWidth > list.clientWidth) {
        const left = el.offsetLeft;
        const right = left + el.offsetWidth;
        if (left < list.scrollLeft + 28) list.scrollLeft = Math.max(0, left - 28);
        else if (right > list.scrollLeft + list.clientWidth - 28) list.scrollLeft = right - list.clientWidth + 28;
      }
      mark();
    };
    keepCurrent();
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (list.clientWidth === width) return mark();
            width = list.clientWidth;
            keepCurrent();
          });
    ro?.observe(list);
    list.addEventListener("scroll", mark, { passive: true });
    return () => {
      ro?.disconnect();
      list.removeEventListener("scroll", mark);
    };
  }, [current]);

  return (
    <div ref={ref} className="sticky top-(--shell-topbar) z-20 px-4 pt-1 pb-[18px] min-[861px]:px-6 max-[760px]:pb-3.5">
      <nav
        aria-label="Book steps"
        className="vol-glass-2 flex flex-wrap items-center gap-1.5 rounded-[18px] p-1.5 min-[761px]:flex-nowrap max-[760px]:gap-1 max-[760px]:rounded-[14px] max-[760px]:p-[5px]"
      >
        <Tooltip content={t.prevLabel} side="bottom">
          <Link
            to={t.prevTo}
            aria-label={t.prevLabel}
            className="grid size-[38px] shrink-0 place-items-center rounded-control border border-line text-ink-2 hover:bg-soft hover:text-ink max-[760px]:size-9"
          >
            <ChevronLeft size={18} strokeWidth={1.8} aria-hidden />
          </Link>
        </Tooltip>
        <Link
          to={`/books/${book.id}/overview`}
          aria-current={current === "overview" ? "page" : undefined}
          className={cn(
            "flex h-9 shrink-0 items-center gap-1.5 rounded-[11px] px-[9px] text-[13px] font-medium whitespace-nowrap transition-colors duration-(--vol-dur-fast) ease-out",
            current === "overview" ? "bg-btn text-on-btn" : "text-ink-2 hover:bg-soft hover:text-ink",
          )}
        >
          <House size={15} strokeWidth={1.8} aria-hidden />
          <span className={cn(current !== "overview" && "max-[760px]:sr-only")}>Overview</span>
        </Link>
        <span aria-hidden className="h-[22px] w-px shrink-0 bg-line-2" />
        <BookSteps book={book} current={current === "overview" ? null : current} runningBookId={runningBookId} className={cn("flex-1 basis-0", edgeMask)} />
        {action && <StepActionButton action={action} compact className="max-w-[40%] max-[760px]:order-last max-[760px]:max-w-none max-[760px]:basis-full" />}
        <Tooltip content={`Next: ${t.nextName}`} side="bottom">
          <Link
            to={t.nextTo}
            aria-label={`Next: ${t.nextName}`}
            className="inline-flex h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-control border border-line pr-3 pl-3.5 text-label font-medium whitespace-nowrap text-ink-2 transition-colors duration-(--vol-dur-fast) ease-out hover:bg-soft hover:text-ink max-[1500px]:w-[38px] max-[1500px]:px-0 max-[760px]:h-9 max-[760px]:w-auto max-[760px]:pr-2.5 max-[760px]:pl-3"
          >
            <span className="max-[1500px]:hidden max-[760px]:inline">Next</span>
            <span className="text-ink max-[1500px]:hidden">{t.nextName}</span>
            <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
          </Link>
        </Tooltip>
      </nav>
    </div>
  );
}
