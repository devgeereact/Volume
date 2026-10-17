import { useEffect, useRef, useState } from "react";
import { Check, CircleX, Clock, Flag } from "lucide-react";
import { Button, LiveDot, Loader, ProgressBar } from "../../components/ui";
import { cn } from "../../lib/cn";
import type { RunStep } from "./model";

interface RunProgressProps {
  /** 0 to 1. */
  progress: number;
  message: string | null;
  steps: RunStep[];
  onCancel?: (() => void) | undefined;
  cancelling?: boolean | undefined;
}

const ANNOUNCE_EVERY_MS = 10_000;

function StepIcon({ state }: { state: RunStep["state"] }) {
  if (state === "done") return <Check size={16} strokeWidth={2} className="text-success" aria-hidden />;
  if (state === "running") return <Loader />;
  if (state === "failed") return <CircleX size={16} className="text-claim" aria-hidden />;
  if (state === "attention") return <Flag size={16} className="text-accent-text" aria-hidden />;
  return <Clock size={16} className="text-ink-tertiary" aria-hidden />;
}

const stateWords: Record<RunStep["state"], string> = {
  done: "Done",
  running: "Running",
  queued: "Waiting",
  failed: "Failed",
  attention: "Needs attention",
};

/**
 * The live run: the step the server is on, a progress bar and the three steps (story, references, pictures).
 * Screen readers hear the current step at most every 10 seconds (DESIGN-SYSTEM accessibility floor).
 */
export function RunProgress({ progress, message, steps, onCancel, cancelling }: RunProgressProps) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const line = message ?? "Starting";
  const [announced, setAnnounced] = useState(line);
  const last = useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - last.current < ANNOUNCE_EVERY_MS) return;
    last.current = now;
    const t = window.setTimeout(() => setAnnounced(line), 0);
    return () => window.clearTimeout(t);
  }, [line]);

  return (
    <section aria-labelledby="run-title" className="relative grid gap-4 overflow-hidden rounded-lg border border-border bg-sheet p-5 shadow-sheet sm:p-6">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" aria-hidden />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <LiveDot />
        <h2 id="run-title" className="font-book text-heading text-ink">
          Making the picture book
        </h2>
        {onCancel && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onCancel} loading={cancelling} loadingLabel="Stopping">
            Stop
          </Button>
        )}
      </div>
      <p className="text-body text-ink">
        <span className="text-accent-text">{line}</span>
        <span className="num text-ink-secondary">, {pct}% done</span>
      </p>
      <ProgressBar value={pct} max={100} label="Picture book progress" valueText={`${pct}% done. ${line}`} live />
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((s) => (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-2 rounded-md border border-border px-3 py-2 text-small",
              s.state === "running" ? "bg-accent-wash text-ink" : "bg-canvas text-ink-secondary",
            )}
          >
            <StepIcon state={s.state} />
            <span className="min-w-0">
              <span className="block text-label text-ink">{s.label}</span>
              <span className="num block text-caption">
                {stateWords[s.state]}
                {s.detail && `, ${s.detail}`}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-small text-ink-secondary">You can leave this page. The run carries on, and the spreads appear here when it is done.</p>
      <p className="sr-only" aria-live="polite">
        {announced}
      </p>
    </section>
  );
}
