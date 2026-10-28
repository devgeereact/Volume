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

const pads = { none: "", sm: "p-3", md: "p-4", lg: "p-6" };

/**
 * Card. "sheet" is a glass panel (studio redesign): translucent with a 1 px edge, a soft shadow and a
 * backdrop blur, solid where blur is not available. "canvas" stays a flat inset card inside a panel.
 */
export function Card({ as: Tag = "div", padding = "md", tone = "sheet", selected = false, className, children, ...rest }: CardProps) {
  return (
    <Tag
      className={cn(
        tone === "sheet" ? "vol-glass rounded-card" : "rounded-md border bg-canvas",
        selected ? "vol-pencil-edge border-select bg-select-wash" : tone === "canvas" && "border-border",
        pads[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
