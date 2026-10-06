import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";
import { dur, ease } from "../../lib/motion";

export interface ChapterSegment {
  state: "done" | "current" | "queued";
  /** 0 to 1 for the current chapter. */
  progress?: number | undefined;
}

interface ChapterBarsProps {
  segments: ChapterSegment[];
  label?: string | undefined;
  className?: string | undefined;
}

/** One 6 px segment per chapter with 4 px gaps. Done segments full, the current one partial with the nib. */
export function ChapterBars({ segments, label = "Chapters written", className }: ChapterBarsProps) {
  const reduce = useReducedMotion();
  const done = segments.filter((s) => s.state === "done").length;
  const currentIdx = segments.findIndex((s) => s.state === "current");
  const current = currentIdx >= 0 ? segments[currentIdx] : undefined;
  const valueText =
    `${done} of ${segments.length} chapters written` + (current ? `, chapter ${currentIdx + 1} at ${Math.round((current.progress ?? 0) * 100)}%` : "");
  const transition = reduce ? { duration: 0 } : { duration: dur.slow, ease: ease.out };

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={segments.length}
      aria-valuenow={done}
      aria-valuetext={valueText}
      className={cn("grid gap-1", className)}
      style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}
    >
      {segments.map((s, i) => {
        const p = s.state === "done" ? 1 : s.state === "current" ? Math.min(1, s.progress ?? 0) : 0;
        return (
          <span key={i} className={cn("relative h-1.5 rounded-[3px] bg-sunken", s.state !== "current" && "overflow-hidden")}>
            <span className="absolute inset-0 overflow-hidden rounded-[3px]">
              <motion.span
                className="absolute inset-0 origin-left bg-progress"
                initial={reduce ? false : { scaleX: 0 }}
                animate={{ scaleX: p }}
                transition={transition}
              />
            </span>
            {s.state === "current" && (
              <span aria-hidden className="pointer-events-none absolute inset-0 overflow-x-clip">
                <motion.span
                  aria-hidden
                  className="absolute inset-y-[-3px] left-0 w-full"
                  initial={reduce ? false : { x: "0%" }}
                  animate={{ x: `${p * 100}%` }}
                  transition={transition}
                >
                  <span className="vol-nib absolute inset-y-0 -left-px w-[3px] rounded-[2px] bg-accent" />
                </motion.span>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
