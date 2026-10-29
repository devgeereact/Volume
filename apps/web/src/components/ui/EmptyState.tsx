import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type EmptyDrawing = "books" | "pen" | "search" | "box" | "archive" | "page";

interface EmptyStateProps {
  title: ReactNode;
  body?: ReactNode | undefined;
  /** The one action that fills this space (usually a primary Button). */
  action?: ReactNode | undefined;
  drawing?: EmptyDrawing | undefined;
  /** Heading level, so the page keeps one h1 and a logical outline. */
  headingLevel?: 2 | 3 | undefined;
  className?: string | undefined;
}

/** Simple line drawings, the only illustrations the app uses. */
function Drawing({ kind }: { kind: EmptyDrawing }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="4 4 48 48" className="size-[22px]" aria-hidden>
      {kind === "books" && (
        <g {...common}>
          <rect x="10" y="12" width="14" height="34" rx="2" />
          <rect x="26" y="8" width="12" height="38" rx="2" />
          <path d="m40 14 8 3-9 30-7-2.5" />
          <path d="M6 46h44" />
        </g>
      )}
      {kind === "pen" && (
        <g {...common}>
          <path d="M10 44h36" />
          <path d="M33 10.5a3.5 3.5 0 0 1 5 5L19 34.5l-7 2 2-7Z" />
          <path d="m30 13.5 5 5" />
        </g>
      )}
      {kind === "search" && (
        <g {...common}>
          <circle cx="24" cy="24" r="13" />
          <path d="m34 34 11 11" />
          <path d="M18 24h12" />
        </g>
      )}
      {kind === "box" && (
        <g {...common}>
          <path d="M28 8 46 17v22L28 48 10 39V17Z" />
          <path d="M10 17l18 9 18-9" />
          <path d="M28 26v22" />
        </g>
      )}
      {kind === "archive" && (
        <g {...common}>
          <rect x="8" y="10" width="40" height="10" rx="2" />
          <path d="M11 20v22a3 3 0 0 0 3 3h28a3 3 0 0 0 3-3V20" />
          <path d="M23 29h10" />
        </g>
      )}
      {kind === "page" && (
        <g {...common}>
          <path d="M16 8h17l9 9v31H16Z" />
          <path d="M33 8v9h9" />
          <path d="M21 26h14M21 32h14M21 38h9" />
        </g>
      )}
    </svg>
  );
}

/**
 * Empty state from the approved design (.card.empty): a glass card, centred, with the drawing in a
 * 42 px icon tile, a 16 px heading, one sentence and one action. Copy comes from 09-UX-FLOWS.
 */
export function EmptyState({ title, body, action, drawing = "books", headingLevel = 2, className }: EmptyStateProps) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={cn("vol-glass grid content-start justify-items-center gap-2 rounded-card px-5 py-9 text-center", className)}>
      <span className="grid size-[42px] place-items-center rounded-[14px] bg-panel-2 text-mint-ink shadow-control">
        <Drawing kind={drawing} />
      </span>
      <H className="mt-1 text-[16px] leading-[1.35] font-semibold tracking-[-0.01em] text-ink">{title}</H>
      {body && <p className="max-w-[46ch] text-body text-ink-2">{body}</p>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}
