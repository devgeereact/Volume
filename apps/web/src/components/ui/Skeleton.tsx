import { cn } from "../../lib/cn";

interface SkeletonProps {
  /** line: 12 px text line. block: any box. cover: 2:3 cover. circle: avatar. */
  variant?: "line" | "block" | "cover" | "circle" | undefined;
  /** Set width and height with classes, for example "h-3 w-4/5". */
  className?: string | undefined;
}

/**
 * Skeleton block in sunken, in the shape of the content. Breathes with opacity only and holds still
 * with reduced motion. Decorative: wrap a group in <div role="status" aria-label="Loading books">.
 */
export function Skeleton({ variant = "line", className }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "vol-breathe block bg-sunken",
        variant === "line" && "h-3 rounded-xs",
        variant === "block" && "rounded-md",
        variant === "cover" && "aspect-[2/3] w-full rounded-cover",
        variant === "circle" && "size-7 rounded-full",
        className,
      )}
    />
  );
}
