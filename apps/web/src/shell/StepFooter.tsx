import { Link, useNavigate } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { bookSteps } from "../data/books";
import type { Book, BookStepId } from "../data/types";
import { cn } from "../lib/cn";
import { useCurrentStepAction } from "../lib/stepAction";
import { bookStepPath } from "../screens";

interface StepFooterProps {
  book: Book;
  current: BookStepId;
}

/**
 * Back and Next at the foot of every book screen (D-016). "Back: Research" and "Next: Blueprint"
 * follow the step order; the first step goes back to the Library and the last goes on to the Library.
 * When the screen registers its main action with useStepAction, Next becomes that gilt button (the only
 * primary button on the screen) and a quiet link still moves on to the next step.
 */
export function StepFooter({ book, current }: StepFooterProps) {
  const action = useCurrentStepAction();
  const navigate = useNavigate();
  const i = bookSteps.findIndex((s) => s.id === current);
  const prev = i > 0 ? bookSteps[i - 1] : undefined;
  const next = i >= 0 && i < bookSteps.length - 1 ? bookSteps[i + 1] : undefined;
  const backTo = prev ? bookStepPath(book.id, prev.id) : "/";
  const backLabel = prev ? `Back: ${prev.label}` : "Back: Library";
  const nextTo = next ? bookStepPath(book.id, next.id) : book.published ? "/published" : "/";
  const nextLabel = next ? `Next: ${next.label}` : book.published ? "Next: Published" : "Next: Library";

  return (
    <footer aria-label="Step navigation" className="flex h-(--shell-stepfooter) items-center gap-3 border-t border-border bg-canvas px-4 sm:px-6 lg:px-10">
      <Link to={backTo} aria-label={backLabel} className={cn(buttonClasses("ghost", "md"), "-ml-3 shrink-0 max-sm:px-3")}>
        <span className="sm:hidden">Back</span>
        <span className="hidden sm:inline">{backLabel}</span>
      </Link>
      <span className="num ml-auto hidden text-small text-ink-tertiary md:inline">
        Step {i + 1} of {bookSteps.length}
      </span>
      {action ? (
        <span className="ml-auto flex min-w-0 items-center gap-1 md:ml-3">
          <Link to={nextTo} className={cn(buttonClasses("ghost", "md"), "hidden sm:inline-flex")}>
            {next ? `Skip to ${next.label}` : nextLabel}
          </Link>
          <Button
            variant="primary"
            title={action.label}
            className="min-w-0 max-w-full overflow-hidden max-sm:[&_small]:hidden [&>span]:min-w-0 [&>span]:max-w-full [&>span>span]:min-w-0 [&>span>span]:max-w-full [&>span>span>span]:truncate"
            estimate={action.estimate}
            disabledReason={action.disabledReason}
            onClick={() => {
              if (action.onClick) action.onClick();
              else if (action.to) void navigate(action.to);
            }}
          >
            {action.label}
          </Button>
        </span>
      ) : (
        <Link to={nextTo} className={cn(buttonClasses("secondary", "md"), "ml-auto md:ml-3")}>
          {nextLabel}
        </Link>
      )}
    </footer>
  );
}
