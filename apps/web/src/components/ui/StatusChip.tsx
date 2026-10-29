import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type Status = "writing" | "attention" | "claim" | "passed" | "queued" | "locked" | "demo" | "progress" | "todo";

/* Chip tones from the approved design: good, run, warn, bad and info. Each chip has a dot and a word, so
   colour never works alone; the run dot pulses (it holds still with reduced motion). */
export type ChipTone = "good" | "run" | "warn" | "bad" | "info";

const tones: Record<ChipTone, string> = {
  good: "bg-good-wash text-good",
  run: "bg-blue-wash text-blue",
  warn: "bg-amber-wash text-amber",
  bad: "bg-red-wash text-red",
  info: "bg-soft text-ink-2 shadow-[inset_0_0_0_1px_var(--vol-line)]",
};

const config: Record<Status, { label: string; tone: ChipTone }> = {
  writing: { label: "Writing", tone: "run" },
  attention: { label: "Needs attention", tone: "warn" },
  claim: { label: "Claim to verify", tone: "bad" },
  passed: { label: "Checks passed", tone: "good" },
  queued: { label: "Queued", tone: "info" },
  locked: { label: "Approved, locked", tone: "info" },
  demo: { label: "Demo book", tone: "info" },
  /* A book step's state (Up next card): started but not finished, and not started yet. */
  progress: { label: "In progress", tone: "run" },
  todo: { label: "Not started", tone: "info" },
};

/** Classes for a chip of a tone, for screens that draw their own chip (a link or a button). */
export function chipClasses(tone: ChipTone): string {
  return cn("inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-[12px] leading-none font-semibold whitespace-nowrap", tones[tone]);
}

/** The chip's dot. Pulses for running work. */
export function ChipDot({ pulse = false }: { pulse?: boolean | undefined }) {
  return <i aria-hidden className={cn("size-1.5 shrink-0 rounded-full bg-current", pulse && "vol-pulse")} />;
}

interface StatusChipProps {
  status?: Status | undefined;
  /** A tone without a status word (for example "Version 3 of 3" in info). Wins over the status's tone. */
  tone?: ChipTone | undefined;
  /** Override the word, for example "Running for 1 h 12 min". Keep it short. */
  children?: ReactNode | undefined;
  className?: string | undefined;
}

/** 24 px status chip (.chip): a dot plus a word. */
export function StatusChip({ status, tone, children, className }: StatusChipProps) {
  const c = status ? config[status] : undefined;
  const t = tone ?? c?.tone ?? "info";
  return (
    <span className={cn(chipClasses(t), className)}>
      <ChipDot pulse={t === "run" && (status === "writing" || status === undefined)} />
      {children ?? c?.label}
    </span>
  );
}
