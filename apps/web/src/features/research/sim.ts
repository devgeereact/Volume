import { useCallback, useEffect, useRef, useState } from "react";
import { getModel } from "../../demo";

/* Simulated AI runs for the prototype screens owned by agent B (new book, research, titles,
   blueprint). Nothing here calls a provider: a timer moves progress, steps and cost forward so the
   screens can show their running state. Phase 1 replaces this with the server's SSE job stream. */

export type RunStatus = "idle" | "running" | "done" | "failed";

export interface RunPlan {
  /** Total length of the simulated run in milliseconds. */
  durationMs: number;
  /** Cost when the run finishes, in US dollars. */
  costUsd: number;
  /** Status lines, shown in order as progress passes each step. */
  steps: string[];
  /** Fail when progress reaches this share (0 to 1). Nothing is charged on failure. */
  failAt?: number | undefined;
  /** Stop and hold at this share, for a run that is still going elsewhere. */
  holdAt?: number | undefined;
}

export interface SimulatedRun {
  status: RunStatus;
  /** 0 to 1. */
  progress: number;
  /** Cost so far in US dollars. */
  cost: number;
  /** Index of the current status line. */
  step: number;
  start: (plan: RunPlan) => void;
  cancel: () => void;
  reset: () => void;
}

const TICK_MS = 120;

/** A fake job: progress, the current status line and cost so far, ticking on a timer. */
export function useSimulatedRun(onDone?: () => void): SimulatedRun {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState(0);
  const [cost, setCost] = useState(0);
  const timer = useRef<number | null>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    (plan: RunPlan) => {
      stop();
      setStatus("running");
      setProgress(0);
      setStep(0);
      setCost(0);
      const began = performance.now();
      timer.current = window.setInterval(() => {
        const share = Math.min(1, (performance.now() - began) / plan.durationMs);
        const held = plan.holdAt !== undefined ? Math.min(share, plan.holdAt) : share;
        setProgress(held);
        setStep(Math.min(plan.steps.length - 1, Math.floor(held * plan.steps.length)));
        if (plan.failAt !== undefined && held >= plan.failAt) {
          stop();
          setCost(0);
          setStatus("failed");
          return;
        }
        setCost(Math.round(plan.costUsd * held * 100) / 100);
        if (share >= 1 && plan.holdAt === undefined) {
          stop();
          setCost(plan.costUsd);
          setStep(plan.steps.length - 1);
          setStatus("done");
          doneRef.current?.();
        }
      }, TICK_MS);
    },
    [stop],
  );

  const cancel = useCallback(() => {
    stop();
    setStatus("idle");
    setProgress(0);
    setCost(0);
  }, [stop]);

  const reset = useCallback(() => {
    stop();
    setStatus("idle");
    setProgress(0);
    setStep(0);
    setCost(0);
  }, [stop]);

  return { status, progress, cost, step, start, cancel, reset };
}

/**
 * Example estimate for running a stage on another model: the base cost scaled by the model's
 * example prices against the base model's. Example prices only, as the data says.
 */
export function estimateFor(baseUsd: number, baseSlug: string, slug: string): number {
  const base = getModel(baseSlug)?.examplePrice;
  const next = getModel(slug)?.examplePrice;
  if (!base || !next || !("inputPerMillion" in base) || !("inputPerMillion" in next)) return baseUsd;
  const ratio = (next.inputPerMillion + next.outputPerMillion) / (base.inputPerMillion + base.outputPerMillion);
  return Math.max(0.01, Math.round(baseUsd * ratio * 100) / 100);
}

/** "about $0.31". */
export function about(usd: number): string {
  return `about $${usd.toFixed(2)}`;
}
