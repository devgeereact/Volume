import type { ReactNode } from "react";
import { Loader, StatusChip, type ChipTone as ChipToneName } from "../../components/ui";
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
    <dl aria-label="Writing in numbers" className={cn("grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5", className)}>
      {/* One tile per figure (.kp in the approved design): the figure, then what it counts. */}
      {items.map((it) => (
        <div key={it.label} className="vol-glass grid min-w-0 content-start rounded-[16px] px-3.5 py-3">
          <dt className="order-2 text-[12px] leading-4 text-ink-2">{it.label}</dt>
          <dd className="num order-1 text-[20px] leading-[1.2] font-bold tracking-[-0.01em] text-ink">{it.value}</dd>
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

const tones: Record<ChipTone, ChipToneName> = {
  running: "run",
  pausing: "run",
  paused: "warn",
  stopped: "info",
  failed: "bad",
  finished: "good",
  idle: "info",
};

/** The job's state in the step head: a dot plus a word, so colour never works alone. `children` overrides the word. */
export function JobStateChip({ tone, children }: { tone: ChipTone; children?: string | undefined }) {
  const word = children ?? words[tone];
  return (
    <StatusChip tone={tones[tone]}>
      {tone === "pausing" ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader />
          {word}
        </span>
      ) : (
        word
      )}
    </StatusChip>
  );
}
