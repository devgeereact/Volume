import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/cn";

/* Adapted from React Bits ShinyText (MIT, https://reactbits.dev/text-animations/shiny-text): a light
   band sweeps across the text. Done in CSS (site.css, .shiny-text) so it costs no frame loop; it stops
   for reduced motion. The text keeps its own colour; the shine colour is a token. */

export interface ShinyTextProps {
  children: ReactNode;
  className?: string | undefined;
  /** Seconds for one sweep, pause included. */
  speed?: number | undefined;
}

export function ShinyText({ children, className, speed = 5 }: ShinyTextProps) {
  return (
    <span className={cn("shiny-text", className)} style={{ "--shiny-speed": `${speed}s` } as CSSProperties}>
      {children}
    </span>
  );
}
