import { useId } from "react";
import { Link } from "react-router";
import { BookCheck } from "lucide-react";
import { buttonClasses } from "../components/ui/Button";
import { StatusChip, type Status } from "../components/ui/StatusChip";
import { bookSteps, stepState } from "../demo/books";
import type { Book, BookStepId, StepState } from "../demo/types";
import { cn } from "../lib/cn";
import { bookStepPath, screens } from "../screens";
import { stepCopy } from "./stepCopy";

const chip: Record<StepState, { status: Status; word: string }> = {
  done: { status: "passed", word: "Done" },
  attention: { status: "attention", word: "Needs attention" },
  running: { status: "writing", word: "Writing now" },
  "in-progress": { status: "progress", word: "In progress" },
  "not-started": { status: "todo", word: "Not started" },
};

const card =
  "vol-glass mx-4 mt-4 mb-8 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-card border-dashed border-border-strong px-4 py-4 sm:mx-8 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-5 lg:mx-10";
const icon = "grid size-11 shrink-0 place-items-center rounded-control bg-sunken text-ink-secondary";

/**
 * The card at the end of a book step (studio redesign, stage 2): the next step, what it is for, its
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
          <BookCheck size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-small text-ink-tertiary">Last step</p>
          <h2 id={headingId} className="text-subhead text-ink">
            Then publish on KDP
          </h2>
          <p className="text-small text-ink-secondary">Upload the pack, then mark the book published.</p>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-2.5 sm:col-span-1 sm:justify-end">
          <Link to="/published" className={cn(buttonClasses("secondary", "md"), "max-sm:flex-1")}>
            Open Published
          </Link>
        </div>
      </section>
    );
  }

  const n = i + 2;
  const state = stepState(book, next.id, runningBookId);
  const Icon = screens[next.id].icon;
  return (
    <section aria-labelledby={headingId} className={card}>
      <span aria-hidden className={icon}>
        <Icon size={20} />
      </span>
      <div className="min-w-0">
        <p className="num text-small text-ink-tertiary">
          Up next, step {n} of {bookSteps.length}
        </p>
        <h2 id={headingId} className="text-subhead text-ink">
          {next.label}
        </h2>
        <p className="text-small text-ink-secondary">{stepCopy[next.id].short}</p>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-2.5 sm:col-span-1 sm:justify-end">
        <StatusChip status={chip[state].status}>{chip[state].word}</StatusChip>
        <Link to={bookStepPath(book.id, next.id)} className={cn(buttonClasses("secondary", "md"), "max-sm:flex-1")}>
          Open {next.label}
        </Link>
      </div>
    </section>
  );
}
