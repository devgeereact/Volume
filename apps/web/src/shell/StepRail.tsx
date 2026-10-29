import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BookSteps } from "../components/ui/BookSteps";
import { Cover } from "../components/ui/Cover";
import { Tooltip } from "../components/ui/Tooltip";
import { libraryCover } from "../features/library/draftCover";
import { bookSteps } from "../demo/books";
import type { Book, BookStepId } from "../demo/types";
import { cn } from "../lib/cn";
import type { StepAction } from "../lib/stepAction";
import { bookStepPath } from "../screens";
import { StepActionButton } from "./StepActionButton";

interface StepRailProps {
  book: Book;
  /** Pen name on the small cover. */
  author: string;
  current: BookStepId;
  runningBookId: string | null;
  /** The screen's main action, shown here only on full-height steps (they have no step head). */
  action: StepAction | null;
}

/** Where Previous and Next go: the step order, with the Library before the first step and after the last. */
export function railTargets(book: Book, current: BookStepId) {
  const i = bookSteps.findIndex((s) => s.id === current);
  const prev = i > 0 ? bookSteps[i - 1] : undefined;
  const next = i >= 0 && i < bookSteps.length - 1 ? bookSteps[i + 1] : undefined;
  return {
    prevTo: prev ? bookStepPath(book.id, prev.id) : "/library",
    prevLabel: prev ? `Previous step: ${prev.label}` : "Back to the Library",
    nextTo: next ? bookStepPath(book.id, next.id) : book.published ? "/published" : "/library",
    nextName: next ? next.label : book.published ? "Published" : "Library",
  };
}

const control =
  "inline-flex h-11 shrink-0 items-center justify-center rounded-control border border-glass-edge bg-glass-strong text-ink shadow-glass-sm transition-transform duration-(--vol-dur-fast) ease-out hover:bg-glass-drawer active:translate-y-px";

/**
 * The book's step rail (studio redesign, stage 2): a glass bar that sticks under the top bar on every
 * book step. The book's small cover (not on phones), Previous, the eight steps, and Next; on full-height
 * steps also the screen's main action.
 * It measures itself into --shell-bookbar, so h-screen-fill panes and sticky inspectors sit below it.
 * On phones the steps scroll sideways with the current one in view, and the action takes its own row.
 */
export function StepRail({ book, author, current, runningBookId, action }: StepRailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const t = railTargets(book, current);
  // Same cover as the Library card: the real one, or a draft from the cover style until the Cover studio makes it.
  const { design, image } = libraryCover(book);

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

  return (
    <div ref={ref} className="sticky top-(--shell-topbar) z-20 px-4 pt-3 sm:px-8 lg:px-10">
      <nav
        aria-label="Book steps"
        className="vol-glass-bar flex flex-wrap items-center gap-1 rounded-card border border-glass-edge p-1 shadow-glass sm:flex-nowrap"
      >
        <span className="hidden shrink-0 pr-1 pl-2 sm:flex">
          <Cover title={book.title} author={author} design={design} image={image} width={26} hideSubtitle decorative className="[--vol-shadow-cover:none]" />
        </span>
        <Tooltip content={t.prevLabel} side="bottom">
          <Link to={t.prevTo} aria-label={t.prevLabel} className={cn(control, "w-11")}>
            <ChevronLeft size={18} aria-hidden />
          </Link>
        </Tooltip>
        <BookSteps book={book} current={current} runningBookId={runningBookId} className="flex-1 basis-0" />
        {action && <StepActionButton action={action} compact className="max-w-[40%] max-sm:order-last max-sm:max-w-none max-sm:basis-full" />}
        <Link to={t.nextTo} aria-label={`Next: ${t.nextName}`} className={cn(control, "gap-1.5 px-3 text-label font-semibold max-sm:w-11 max-sm:px-0")}>
          <span className="hidden font-medium text-ink-secondary 2xl:inline">Next</span>
          <span className="max-sm:sr-only">{t.nextName}</span>
          <ChevronRight size={16} aria-hidden />
        </Link>
      </nav>
    </div>
  );
}
