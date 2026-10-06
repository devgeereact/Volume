import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

interface FigureProps {
  value: ReactNode;
  /** Unit beside the number in 14 px Schibsted, for example "of 38,000 words". */
  unit?: ReactNode | undefined;
  className?: string | undefined;
}

/** Big figure: Literata 30 px with tabular lining numbers and a small unit beside it. */
export function Figure({ value, unit, className }: FigureProps) {
  return (
    <p className={cn("num font-book text-figure text-ink", className)}>
      {value}
      {unit && <span className="ml-1.5 font-ui text-label font-normal tracking-normal text-ink-secondary normal-nums">{unit}</span>}
    </p>
  );
}
