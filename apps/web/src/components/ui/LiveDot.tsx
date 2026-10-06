import { cn } from "../../lib/cn";

/** The gilt live dot with a soft ring. Decorative: always pair it with words ("Writing now"). */
export function LiveDot({ className }: { className?: string | undefined }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full bg-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--vol-accent)_25%,transparent)]", className)}
    />
  );
}
