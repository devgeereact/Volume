import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";
import { inkIn } from "../../lib/motion";

interface StreamTextProps {
  /** Chunks that have arrived for the paragraph being written. */
  chunks: string[];
  /** The writer is still going: show the gilt caret. */
  live?: boolean | undefined;
  /** Text already in place before the streamed chunks (rendered without animation). */
  lead?: string | undefined;
  size?: "prose" | "prose-sm" | undefined;
  className?: string | undefined;
}

/**
 * Ink in: each streamed chunk fades in and settles 2 px, with a gilt caret at the end.
 * The region is aria-live="off" (progress is announced by the job bar instead).
 * Reduced motion: no fade, and the paragraph appears only when it is complete. Chunks are inline blocks
 * with text-indent reset, so a print-indent paragraph indents its first line only, never mid-line.
 */
export function StreamText({ chunks, live = true, lead, size = "prose", className }: StreamTextProps) {
  const reduce = useReducedMotion();
  const visible = reduce && live ? [] : chunks;
  return (
    <p aria-live="off" className={cn("font-book text-ink", size === "prose" ? "text-prose" : "text-prose-sm", className)}>
      {lead}
      {visible.map((c, i) =>
        reduce ? (
          <span key={i}>{c}</span>
        ) : (
          <motion.span key={i} initial={inkIn.initial} animate={inkIn.animate} className="inline-block indent-0 whitespace-pre-wrap">
            {c}
          </motion.span>
        ),
      )}
      {live && <span className="vol-caret" aria-hidden />}
    </p>
  );
}
