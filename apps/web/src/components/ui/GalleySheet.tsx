import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface GalleySheetProps {
  /** Small line at the top, left and right ("Blueprint, version 3 of 3" and "Non-fiction, 10 chapters"). */
  metaLeft?: ReactNode | undefined;
  metaRight?: ReactNode | undefined;
  label: string;
  className?: string | undefined;
  children: ReactNode;
}

/** The galley sheet: a white page (sheet at night) with a 16 px top radius and 44 by 52 px padding. */
export function GalleySheet({ metaLeft, metaRight, label, className, children }: GalleySheetProps) {
  return (
    <article aria-label={label} className={cn("rounded-t-lg border border-b-0 border-border bg-sheet px-6 py-8 shadow-sheet sm:px-[52px] sm:py-11", className)}>
      {(metaLeft || metaRight) && (
        <p className="flex justify-between gap-4 text-[12.5px] leading-none font-medium text-ink-tertiary">
          <span>{metaLeft}</span>
          <span>{metaRight}</span>
        </p>
      )}
      {children}
    </article>
  );
}
