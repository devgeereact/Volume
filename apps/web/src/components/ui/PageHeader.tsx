import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface PageHeaderProps {
  /** The screen's one h1, Literata 36 px. */
  title: ReactNode;
  /** One-line summary beside or under the title ("8 books, one writing now"). */
  summary?: ReactNode | undefined;
  /** Right-hand tools. Put the screen's one primary (gilt) action last. */
  actions?: ReactNode | undefined;
  /** Hide the h1 visually when another element is the visual heading (book screens). */
  titleHidden?: boolean | undefined;
  className?: string | undefined;
}

/** Screen header: title, summary, then tools on the right. Wraps under 1024 px. */
export function PageHeader({ title, summary, actions, titleHidden = false, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-end gap-x-4 gap-y-3", className)}>
      <h1 className={cn("opsz-title font-book text-[30px] leading-9 text-ink sm:text-title", titleHidden && "sr-only")}>{title}</h1>
      {summary && <p className="pb-1.5 text-body text-ink-secondary">{summary}</p>}
      {actions && <div className="flex flex-wrap items-center gap-3 lg:ml-auto">{actions}</div>}
    </header>
  );
}
