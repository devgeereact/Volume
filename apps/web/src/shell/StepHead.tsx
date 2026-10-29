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

/* The head's tile (.sh-n): a check when done, a flag when it needs you, else the step number. */
const markClasses: Record<StepState, string> = {
  done: "border-transparent bg-good-wash text-good",
  attention: "border-transparent bg-amber-wash text-amber",
  running: "border-transparent bg-mint-wash text-mint-ink",
  "in-progress": "border-transparent bg-mint-wash text-mint-ink",
  "not-started": "border-edge bg-panel-2 text-ink-2 shadow-glass",
};

function HeadMark({ state, n }: { state: StepState; n: number }) {
  return (
    <span aria-hidden className={cn("num grid size-[38px] shrink-0 place-items-center rounded-control border text-[14px] font-bold", markClasses[state])}>
      {state === "done" ? <Check size={17} strokeWidth={2} /> : state === "attention" ? <Flag size={17} strokeWidth={1.8} /> : n}
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
 * The head of a book step (.sh in the approved design): the step's tile, its title in the interface font,
 * a one-line purpose, the screen's chips and tools and the one navy action from useStepAction. The screen's PageHeader fills
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
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 px-[18px] pb-4 min-[761px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[861px]:px-[26px]">
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
        <div className={cn("col-span-2 flex min-w-0 flex-wrap items-center gap-2 min-[761px]:col-span-1 min-[761px]:justify-end", !hasTools && "hidden")}>
          <div ref={setActions} className="contents" />
          {action && <StepActionButton action={action} size="sm" className="max-w-full" />}
        </div>
      </header>
      {children}
    </StepHeadContext.Provider>
  );
}
