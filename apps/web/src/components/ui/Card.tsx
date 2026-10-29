import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "article" | "section" | "li" | undefined;
  padding?: "none" | "sm" | "md" | "lg" | undefined;
  /** "sheet" (default) for cards on paper, "canvas" for a card inside a sheet panel. */
  tone?: "sheet" | "canvas" | undefined;
  /** Selected: select-wash with the pencil edge and aria-selected handled by the caller. */
  selected?: boolean | undefined;
  children: ReactNode;
}

const pads = { none: "", sm: "p-3", md: "p-[18px] max-[560px]:p-[15px]", lg: "p-6" };

/**
 * Card from the approved design (.card): a glass panel with a 22 px radius, a 1 px light edge, a soft
 * shadow and a backdrop blur, solid where blur is not available. "canvas" is an inset card inside a
 * panel, on the stronger glass. Selected: the accent blue edge with a soft ring.
 */
export function Card({ as: Tag = "div", padding = "md", tone = "sheet", selected = false, className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        tone === "sheet" ? "vol-glass min-w-0 rounded-card" : "rounded-lg border bg-panel-2",
        selected ? "border-mint bg-select-wash shadow-[0_0_0_3px_var(--vol-mint-wash)]" : tone === "canvas" && "border-edge",
        pads[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
