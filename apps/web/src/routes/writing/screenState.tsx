import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { RotateCw } from "lucide-react";
import { Banner, Button, Skeleton } from "../../components/ui";
import { cn } from "../../lib/cn";

/* Screen states for agent C's screens (Writing, Editor, Cover, Export, Marketing).
   Every screen opens with a short simulated load, then shows its content. A demo reviewer can force a
   state with ?state=loading, ?state=empty or ?state=error. Retry clears the forced state and loads
   again. Nothing here talks to a server. */

export type ScreenState = "loading" | "ready" | "empty" | "error";

const FORCEABLE: ScreenState[] = ["loading", "empty", "error"];
const LOAD_MS = 380;

export function useScreenState(): { state: ScreenState; forced: string | null; retry: () => void } {
  const [params, setParams] = useSearchParams();
  const forcedRaw = params.get("state");
  const forced = forcedRaw && (FORCEABLE as string[]).includes(forcedRaw) ? (forcedRaw as ScreenState) : null;
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(() => {
    setLoaded(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLoaded(true), LOAD_MS);
  }, []);

  // First load: the state starts as not loaded, so only the timer is needed here.
  useEffect(() => {
    timer.current = window.setTimeout(() => setLoaded(true), LOAD_MS);
    return () => window.clearTimeout(timer.current);
  }, []);

  const retry = useCallback(() => {
    if (forced) {
      const next = new URLSearchParams(params);
      next.delete("state");
      setParams(next, { replace: true });
    }
    load();
  }, [forced, params, setParams, load]);

  const state: ScreenState = forced ?? (loaded ? "ready" : "loading");
  return { state, forced: forcedRaw, retry };
}

/** Skeleton rows in the shape of a panel, announced once as loading. */
export function LoadingBlock({ label, rows = 5, className }: { label: string; rows?: number; className?: string | undefined }) {
  return (
    <div role="status" aria-label={label} className={cn("grid gap-3 rounded-md border border-border bg-sheet p-6", className)}>
      <Skeleton className="h-7 w-2/5" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i % 3 === 2 ? "w-3/5" : "w-full")} />
      ))}
    </div>
  );
}

/** Error panel: what went wrong, what to do, and Retry. */
export function ErrorPanel({ title, body, onRetry, className }: { title: string; body: string; onRetry: () => void; className?: string | undefined }) {
  return (
    <Banner
      tone="error"
      title={title}
      className={className}
      action={
        <Button size="sm" icon={RotateCw} onClick={onRetry}>
          Retry
        </Button>
      }
    >
      {body}
    </Banner>
  );
}
