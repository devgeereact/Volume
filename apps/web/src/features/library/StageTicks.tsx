import { cn } from "../../lib/cn";

/**
 * Ledger stage ticks: one 12 px tick per Library column. Done ticks are ink, the current one gilt,
 * later ones outlined. Decorative: the row says the stage in words beside it.
 */
export function StageTicks({ current, total = 8, className }: { current: number; total?: number | undefined; className?: string | undefined }) {
  return (
    <span aria-hidden className={cn("grid grid-cols-[repeat(8,12px)] gap-[3px]", className)} style={{ gridTemplateColumns: `repeat(${total}, 12px)` }}>
      {Array.from({ length: total }, (_, i) => (
        <i
          key={i}
          className={cn(
            "h-1 rounded-[2px] border",
            i < current && "border-ink bg-ink",
            i === current && "border-accent bg-accent",
            i > current && "border-border bg-sunken",
          )}
        />
      ))}
    </span>
  );
}
