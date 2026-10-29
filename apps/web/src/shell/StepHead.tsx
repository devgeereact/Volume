import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Check, Flag } from "lucide-react";
import { stepHeadSummaryClasses, stepHeadTitleClasses } from "../components/ui/PageHeader";
import { stepStateWords } from "../components/ui/BookSteps";
import { bookSteps, stepState } from "../demo/books";
import type { Book, BookStepId, StepState } from "../demo/types";
import { cn } from "../lib/cn";
import type { StepAction } from "../lib/stepAction";
import { StepHeadContext, type StepHeadPart, type StepHeadSlots } from "../lib/stepHead";
import { StepActionButton } from "./StepActionButton";
import { stepCopy } from "./stepCopy";

const markClasses: Record<StepState, string> = {
  done: "bg-success-wash text-success",
  attention: "bg-accent-wash text-accent-text",
  running: "border border-glass-edge bg-glass-strong text-ink shadow-glass-sm",
  "in-progress": "border border-glass-edge bg-glass-strong text-ink shadow-glass-sm",
  "not-started": "border border-glass-edge bg-glass-strong text-ink-secondary shadow-glass-sm",
};

function HeadMark({ state, n }: { state: StepState; n: number }) {
  return (
    <span
      aria-hidden
      className={cn(
        "num grid size-11 shrink-0 place-items-center rounded-control text-label font-bold",
        markClasses[state],
        (state === "done" || state === "attention") && "border border-transparent",
      )}
    >
      {state === "done" ? (
        <Check size={18} strokeWidth={2.5} />
      ) : state === "attention" ? (
        <Flag size={16} strokeWidth={2.25} />
      ) : state === "running" || state === "in-progress" ? (
        <span className="grid size-[22px] place-items-center rounded-full border-[1.5px] border-accent text-[11.5px] leading-none">{n}</span>
      ) : (
        n
      )}
    </span>
  );
}

interface StepHeadProps {
  book: Book;
  current: BookStepId;
  runningBookId: string | null;
  action: StepAction | null;
  children: ReactNode;
}

/**
 * The head of a book step (studio redesign, stage 2): the step's marker and state, its title, a one-line
 * purpose, the screen's tools and the one gilt action from useStepAction. The screen's PageHeader fills
 * the title, purpose and tools through StepHeadContext; until it does (while loading, or on screens
 * without one) the head shows the step's name and purpose from stepCopy. Wraps the screen (children).
 */
export function StepHead({ book, current, runningBookId, action, children }: StepHeadProps) {
  const [title, setTitle] = useState<HTMLElement | null>(null);
  const [summary, setSummary] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState<Record<StepHeadPart, number>>({ title: 0, summary: 0, actions: 0 });
  const claim = useCallback((part: StepHeadPart) => {
    setClaims((c) => ({ ...c, [part]: c[part] + 1 }));
    return () => setClaims((c) => ({ ...c, [part]: c[part] - 1 }));
  }, []);
  const slots = useMemo<StepHeadSlots>(() => ({ title, summary, actions, claim }), [title, summary, actions, claim]);

  const i = bookSteps.findIndex((s) => s.id === current);
  const step = bookSteps[i];
  const state = stepState(book, current, runningBookId);
  const hasTools = claims.actions > 0 || action !== null;

  return (
    <StepHeadContext.Provider value={slots}>
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 px-4 pt-5 sm:px-8 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:px-10">
        <HeadMark state={state} n={i + 1} />
        <div className="min-w-0">
          <div ref={setTitle} />
          {claims.title === 0 && <h1 className={stepHeadTitleClasses}>{step?.label}</h1>}
          <p className="sr-only">
            Step {i + 1} of {bookSteps.length}, {stepStateWords[state]}.
          </p>
          <div ref={setSummary} />
          {claims.summary === 0 && <p className={stepHeadSummaryClasses}>{stepCopy[current].purpose}</p>}
        </div>
        <div className={cn("col-span-2 flex min-w-0 flex-wrap items-center gap-2 lg:col-span-1 lg:justify-end", !hasTools && "hidden")}>
          <div ref={setActions} className="contents" />
          {action && <StepActionButton action={action} className="max-w-full" />}
        </div>
      </header>
      {children}
    </StepHeadContext.Provider>
  );
}
