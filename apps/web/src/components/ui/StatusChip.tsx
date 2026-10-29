import type { ReactNode } from "react";
import { Check, Circle, CircleDot, Clock, Flag, Lock } from "lucide-react";
import { cn } from "../../lib/cn";
import { LiveDot } from "./LiveDot";

export type Status = "writing" | "attention" | "claim" | "passed" | "queued" | "locked" | "demo" | "progress" | "todo";

const config: Record<Status, { label: string; classes: string; icon: ReactNode }> = {
  writing: { label: "Writing", classes: "bg-accent-wash text-accent-text", icon: <LiveDot /> },
  attention: { label: "Needs attention", classes: "bg-accent-wash text-accent-text", icon: <Flag size={14} strokeWidth={2} aria-hidden /> },
  claim: { label: "Claim to verify", classes: "bg-claim-wash text-claim", icon: <Flag size={14} strokeWidth={2} aria-hidden /> },
  passed: { label: "Checks passed", classes: "bg-success-wash text-success", icon: <Check size={14} strokeWidth={2} aria-hidden /> },
  queued: { label: "Queued", classes: "bg-sunken text-ink-secondary", icon: <Clock size={14} strokeWidth={2} aria-hidden /> },
  locked: { label: "Approved, locked", classes: "bg-sunken text-ink-secondary", icon: <Lock size={14} strokeWidth={2} aria-hidden /> },
  demo: { label: "Demo book", classes: "border border-border-strong bg-transparent text-ink-secondary", icon: null },
  /* A book step's state (Up next card): started but not finished, and not started yet. */
  progress: { label: "In progress", classes: "bg-sunken text-ink", icon: <CircleDot size={14} strokeWidth={2} aria-hidden /> },
  todo: { label: "Not started", classes: "bg-sunken text-ink-secondary", icon: <Circle size={14} strokeWidth={2} aria-hidden /> },
};

interface StatusChipProps {
  status: Status;
  /** Override the word, for example "Running for 1 h 12 min". Keep it short. */
  children?: ReactNode | undefined;
  className?: string | undefined;
}

/** 24 px status pill: icon plus word, so colour never works alone. */
export function StatusChip({ status, children, className }: StatusChipProps) {
  const c = config[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-pill px-2.5 text-[12.5px] leading-none font-semibold whitespace-nowrap",
        c.classes,
        className,
      )}
    >
      {c.icon}
      {children ?? c.label}
    </span>
  );
}
