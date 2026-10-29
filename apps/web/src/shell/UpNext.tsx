import { useId } from "react";
import { Link } from "react-router";
import { Check, ChevronRight } from "lucide-react";
import { buttonClasses } from "../components/ui/Button";
import { StatusChip, type ChipTone, type Status } from "../components/ui/StatusChip";
import { bookSteps, stepState } from "../demo/books";
import type { Book, BookStepId, StepState } from "../demo/types";
import { cn } from "../lib/cn";
import { bookStepPath } from "../screens";
import { stepCopy, stepIcons } from "./stepCopy";

const chip: Record<StepState, { status: Status; tone: ChipTone; word: string }> = {
  done: { status: "passed", tone: "good", word: "Done" },
  attention: { status: "attention", tone: "warn", word: "Needs you" },
  running: { status: "writing", tone: "run", word: "Writing now" },
  "in-progress": { status: "progress", tone: "run", word: "In progress" },
  "not-started": { status: "todo", tone: "info", word: "Not started" },
};

/* The approved design's .upnext: a dashed card on the glass colour, no blur and no shadow. */
const card =
  "mx-4 mt-[22px] mb-6 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-card border border-dashed border-line-2 bg-panel px-[18px] py-4 min-[761px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[861px]:mx-6";
const icon = "grid size-11 shrink-0 place-items-center rounded-[14px] bg-mint-wash text-mint-ink";
const kicker = "num text-[11px] leading-[1.4] font-bold tracking-[0.08em] text-ink-3 uppercase";
const actions = "col-span-2 flex flex-wrap items-center gap-2.5 min-[761px]:col-span-1 min-[761px]:justify-end";
const open = cn(buttonClasses("primary", "md"), "max-[760px]:flex-1");

/**
 * The card at the end of a book step (.upnext in the approved design): the next step, what it is for, its
 * state and a link to open it. After Export, the last step, it points to publishing on KDP.
 */
export function UpNext({ book, current, runningBookId }: { book: Book; current: BookStepId; runningBookId: string | null }) {
  const headingId = useId();
  const i = bookSteps.findIndex((s) => s.id === current);
  const next = i >= 0 ? bookSteps[i + 1] : undefined;

  if (!next) {
    return (
      <section aria-labelledby={headingId} className={card}>
        <span aria-hidden className={icon}>
          <Check size={20} strokeWidth={1.8} />
        </span>
        <div className="min-w-0">
          <p className={kicker}>Last step</p>
          <h2 id={headingId} className="my-px text-[16px] leading-[1.35] font-bold text-ink">
            Then publish on KDP
          </h2>
          <p className="text-[13px] text-ink-2">Upload the pack, then mark the book published.</p>
        </div>
        <div className={actions}>
          <Link to="/published" className={open}>
            Open Published
            <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      </section>
    );
  }

  const n = i + 2;
  const state = stepState(book, next.id, runningBookId);
  const Icon = stepIcons[next.id];
  return (
    <section aria-labelledby={headingId} className={card}>
      <span aria-hidden className={icon}>
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p className={kicker}>
          Up next, step {n} of {bookSteps.length}
        </p>
        <h2 id={headingId} className="my-px text-[16px] leading-[1.35] font-bold text-ink">
          {next.label}
        </h2>
        <p className="text-[13px] text-ink-2">{stepCopy[next.id].short}</p>
      </div>
      <div className={actions}>
        <StatusChip status={chip[state].status} tone={chip[state].tone}>
          {chip[state].word}
        </StatusChip>
        <Link to={bookStepPath(book.id, next.id)} className={open}>
          Open {next.label}
          <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
