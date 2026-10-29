import type { ReactNode } from "react";
import { Check, CircleAlert, Pause, Square } from "lucide-react";
import { LiveDot, Loader } from "../../components/ui";
import { cn } from "../../lib/cn";

/* Live counts over the writing page (studio redesign stage 4b). Each figure comes from the job and its
   event stream; a figure the job does not know yet is left out, never guessed. */

export interface LiveCount {
  label: string;
  value: ReactNode;
}

export function LiveCounts({ items, className }: { items: LiveCount[]; className?: string | undefined }) {
  if (items.length === 0) return null;
  return (
    <dl aria-label="Writing in numbers" className={cn("flex flex-wrap gap-px overflow-hidden rounded-md border border-border bg-border", className)}>
      {/* Each figure grows to fill its row, so a short last row never leaves an empty cell. */}
      {items.map((it) => (
        <div key={it.label} className="grid flex-[1_1_11rem] content-start gap-0.5 bg-sheet px-4 py-3">
          <dt className="order-2 text-small text-ink-secondary">{it.label}</dt>
          <dd className="num order-1 font-book text-heading text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type ChipTone = "running" | "pausing" | "paused" | "stopped" | "failed" | "finished" | "idle";

const words: Record<ChipTone, string> = {
  running: "Running",
  pausing: "Pausing",
  paused: "Paused",
  stopped: "Stopped",
  failed: "Stopped at a failure",
  finished: "Finished",
  idle: "Not started",
};

/** The job's state beside the Writing heading: icon plus word, so colour never works alone. */
export function JobStateChip({ tone }: { tone: ChipTone }) {
  const icon =
    tone === "running" ? (
      <LiveDot />
    ) : tone === "pausing" ? (
      <Loader />
    ) : tone === "paused" ? (
      <Pause size={14} strokeWidth={2} aria-hidden />
    ) : tone === "failed" ? (
      <CircleAlert size={14} strokeWidth={2} aria-hidden />
    ) : tone === "finished" ? (
      <Check size={14} strokeWidth={2} aria-hidden />
    ) : (
      <Square size={12} strokeWidth={2} aria-hidden />
    );
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-pill px-3 text-small font-semibold whitespace-nowrap",
        tone === "running" || tone === "pausing"
          ? "bg-accent-wash text-accent-text"
          : tone === "failed"
            ? "bg-claim-wash text-claim"
            : tone === "finished"
              ? "bg-success-wash text-success"
              : "bg-sunken text-ink-secondary",
      )}
    >
      {icon}
      {words[tone]}
    </span>
  );
}
