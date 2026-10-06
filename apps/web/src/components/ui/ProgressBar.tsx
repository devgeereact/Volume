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
  /** Show the gilt nib at the live edge while a job runs. */
  live?: boolean | undefined;
  size?: "md" | "thin" | undefined;
  /** "spine" for the spend meter on the left nav. */
  tone?: "default" | "spine" | undefined;
  className?: string | undefined;
}

/**
 * Ink fill: 6 px track in sunken, fill in progress (navy by day, gilt at night), grown with scaleX
 * from the left, never width. The live edge gets a 3 px gilt nib. role="progressbar" with values.
 */
export function ProgressBar({ value, max, label, valueText, live = false, size = "md", tone = "default", className }: ProgressBarProps) {
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
      <div className={cn("relative overflow-hidden rounded-pill", size === "md" ? "h-1.5" : "h-1", tone === "spine" ? "bg-spine-raised" : "bg-sunken")}>
        <motion.div
          className={cn("absolute inset-0 origin-left", tone === "spine" ? "bg-accent" : "bg-progress")}
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
            <span className="vol-nib absolute inset-y-0 -left-px w-[3px] rounded-[2px] bg-accent" />
          </motion.div>
        </div>
      )}
    </div>
  );
}
