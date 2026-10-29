import { motion, useReducedMotion } from "motion/react";
import { cn } from "../../lib/cn";
import { dur, ease } from "../../lib/motion";

interface ProgressBarProps {
  value: number;
  max: number;
  /** Accessible name, for example "Words written". */
  label: string;
  /** Spoken value, for example "21,340 of 38,000 words". Always show the same words as visible text nearby. */
  valueText?: string | undefined;
  /** Show the nib at the live edge while a job runs. */
  live?: boolean | undefined;
  size?: "md" | "thin" | undefined;
  /** Kept for older callers: the spine meter now uses the same track and fill as every bar. */
  tone?: "default" | "spine" | undefined;
  className?: string | undefined;
}

/**
 * Progress (.prog): an 8 px track, the accent blue fill, grown with scaleX from the left, never width.
 * The live edge gets a 3 px nib. role="progressbar" with values.
 */
export function ProgressBar({ value, max, label, valueText, live = false, size = "md", className }: ProgressBarProps) {
  const reduce = useReducedMotion();
  const p = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const transition = reduce ? { duration: 0 } : { duration: dur.slow, ease: ease.out };
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-valuetext={valueText}
      className={cn("relative", className)}
    >
      <div className={cn("relative overflow-hidden rounded-pill", size === "md" ? "h-2" : "h-1", "bg-track")}>
        <motion.div
          className={cn("absolute inset-0 origin-left", "bg-progress")}
          initial={reduce ? false : { scaleX: 0 }}
          animate={{ scaleX: p }}
          transition={transition}
        />
      </div>
      {live && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-x-clip">
          <motion.div
            aria-hidden
            className="absolute inset-y-[-3px] left-0 w-full"
            initial={reduce ? false : { x: "0%" }}
            animate={{ x: `${p * 100}%` }}
            transition={transition}
          >
            <span className="vol-nib absolute inset-y-0 -left-px w-[3px] rounded-[2px] bg-mint-ink" />
          </motion.div>
        </div>
      )}
    </div>
  );
}
