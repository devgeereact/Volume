import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface InspectorProps {
  /** Accessible name of the aside, for example "Inspector". */
  label?: string | undefined;
  /** Fixed footer for the screen's actions (Regenerate part, Approve blueprint). */
  footer?: ReactNode | undefined;
  /**
   * Width from 1024 px up, as any CSS length. Defaults to the 320 px inspector token. Pass "100%" when
   * the screen's grid column sets the width (for example a 360 px column, or a stacked layout).
   */
  width?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}

/**
 * The right-hand inspector (320 px by default, sheet surface, hairline on the left). Put InspectorSection
 * blocks inside. On screens under 1024 px it is full width; the screen decides whether to hide it or show
 * it as a sheet. The scroll area is `relative`, so `.sr-only` text inside it is positioned against the
 * panel and never lengthens the page.
 */
export function Inspector({ label = "Inspector", footer, width, className, children }: InspectorProps) {
  const style = { "--inspector-width": width ?? "var(--vol-inspector)" } as CSSProperties;
  return (
    <aside
      aria-label={label}
      style={style}
      className={cn("flex min-h-0 w-full flex-col border-border bg-sheet lg:w-(--inspector-width) lg:border-l", className)}
    >
      <div className="relative min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      {footer && <div className="grid gap-2.5 border-t border-border bg-sheet px-6 pt-4 pb-5">{footer}</div>}
    </aside>
  );
}
