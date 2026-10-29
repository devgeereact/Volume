import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  pressed: boolean;
  count?: number | undefined;
  children: ReactNode;
}

/** Filter chip (the approved design's .tag): 30 px pill with a 44 px hit area. Pressed: the accent blue wash, aria-pressed. */
export function Chip({ pressed, count, children, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        "hit-44 inline-flex h-[30px] items-center gap-1.5 rounded-pill border px-2.5 text-[12px] font-medium whitespace-nowrap",
        pressed ? "border-transparent bg-mint-wash text-mint-ink" : "border-line bg-soft text-ink-2 hover:bg-panel-2 hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
      {count !== undefined && <em className={cn("num not-italic", pressed ? "text-mint-ink" : "text-ink-3")}>{count}</em>}
    </button>
  );
}
