import { cn } from "../../lib/cn";

export type SegState = "on" | "half" | "off";

/**
 * Segmented bar from the approved design (.segbar): one 8 px segment per step, filled when done, half
 * filled while in progress. Decorative: always show the same state in words nearby ("Step 3 of 8").
 */
export function Segbar({ segments, className }: { segments: SegState[]; className?: string | undefined }) {
  return (
    <span aria-hidden className={cn("flex min-w-24 gap-[3px]", className)}>
      {segments.map((s, i) => (
        <i
          key={i}
          className={cn(
            "h-2 flex-1 rounded-[3px]",
            s === "on" ? "bg-mint" : s === "half" ? "bg-[linear-gradient(90deg,var(--vol-mint)_50%,var(--vol-track)_50%)]" : "bg-track",
          )}
        />
      ))}
    </span>
  );
}
