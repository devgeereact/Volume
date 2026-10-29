import { cn } from "../../lib/cn";

/** The live dot (running blue) with a soft ring; it pulses. Decorative: always pair it with words ("Writing now"). */
export function LiveDot({ className }: { className?: string | undefined }) {
  return <span aria-hidden className={cn("vol-pulse inline-block size-2 shrink-0 rounded-full bg-blue shadow-[0_0_0_3px_var(--vol-blue-wash)]", className)} />;
}
