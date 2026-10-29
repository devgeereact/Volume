import { useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { useStepHeadSlots } from "../../lib/stepHead";

interface PageHeaderProps {
  /** The screen's one h1, Literata 36 px. */
  title: ReactNode;
  /** One-line summary beside or under the title ("8 books, one writing now"). */
  summary?: ReactNode | undefined;
  /** Right-hand tools. Put the screen's one primary (navy) action last. */
  actions?: ReactNode | undefined;
  /** Hide the h1 visually when another element is the visual heading (book screens). */
  titleHidden?: boolean | undefined;
  className?: string | undefined;
}

/** Title style inside a book's step head (shell/StepHead), shared with the head's own default title. */
export const stepHeadTitleClasses = "text-step-title text-ink";
/** Purpose line style inside a book's step head. */
export const stepHeadSummaryClasses = "mt-0.5 max-w-[72ch] text-[13.5px] leading-[1.45] text-ink-2";

/**
 * Screen header: title, summary, then tools on the right. Wraps under 1024 px.
 * Inside a book step with a step head, the title, summary and tools draw in the head instead (one head
 * per step, studio redesign stage 2); the h1 stays the screen's one h1.
 */
export function PageHeader({ title, summary, actions, titleHidden = false, className }: PageHeaderProps) {
  const slots = useStepHeadSlots();
  const claim = slots?.claim;
  const hasSummary = Boolean(summary);
  const hasActions = Boolean(actions);
  useLayoutEffect(() => {
    if (!claim) return;
    const releases = [claim("title")];
    if (hasSummary) releases.push(claim("summary"));
    if (hasActions) releases.push(claim("actions"));
    return () => releases.forEach((r) => r());
  }, [claim, hasSummary, hasActions]);

  if (slots) {
    return (
      <>
        {slots.title && createPortal(<h1 className={stepHeadTitleClasses}>{title}</h1>, slots.title)}
        {summary && slots.summary && createPortal(<p className={stepHeadSummaryClasses}>{summary}</p>, slots.summary)}
        {actions &&
          slots.actions &&
          createPortal(<div className="flex flex-wrap items-center justify-end gap-2 max-[760px]:justify-start">{actions}</div>, slots.actions)}
      </>
    );
  }

  return (
    <header className={cn("flex flex-wrap items-end gap-x-4 gap-y-3", className)}>
      <h1 className={cn("opsz-title font-book text-[30px] leading-9 text-ink sm:text-title", titleHidden && "sr-only")}>{title}</h1>
      {summary && <p className="pb-1.5 text-body text-ink-secondary">{summary}</p>}
      {actions && <div className="flex flex-wrap items-center gap-3 lg:ml-auto">{actions}</div>}
    </header>
  );
}
