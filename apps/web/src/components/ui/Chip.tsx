import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  pressed: boolean;
  count?: number | undefined;
  children: ReactNode;
}

/** Filter chip: 30 px pill with a 44 px hit area. Pressed: select-wash, pencil border and text, aria-pressed. */
export function Chip({ pressed, count, children, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        "hit-44 inline-flex h-[30px] items-center gap-1.5 rounded-pill border px-3 text-[13px] font-medium whitespace-nowrap",
        pressed ? "border-select bg-select-wash text-select" : "border-border bg-sheet text-ink-secondary hover:bg-sunken hover:text-ink",
        className,
      )}
      {...rest}
    >
      {children}
      {count !== undefined && <em className={cn("num not-italic", pressed ? "text-select" : "text-ink-tertiary")}>{count}</em>}
    </button>
  );
}
