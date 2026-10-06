import { cn } from "../../lib/cn";

interface LoaderProps {
  /** Spoken label. Leave empty when a visible label sits beside it. */
  label?: string | undefined;
  className?: string | undefined;
}

/** Pen-stroke loader: three short strokes drawn in turn. Holds still with reduced motion. */
export function Loader({ label, className }: LoaderProps) {
  return (
    <span
      className={cn("vol-loader inline-flex items-center gap-[3px]", className)}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <i />
      <i />
      <i />
    </span>
  );
}
