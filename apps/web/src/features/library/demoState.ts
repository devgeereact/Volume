import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

/* Screen states for the clickable demo. Add ?state=loading, ?state=error or ?state=empty to the URL of
   Library, Profiles, Settings or Archive to see that state. Retry shows the skeleton briefly, then the
   screen. Shared by agent A's screens (library, profiles, settings, archive). */

export type DemoState = "ready" | "loading" | "error" | "empty";

const RETRY_MS = 700;

export function useDemoState(): { state: DemoState; retry: () => void } {
  const [params, setParams] = useSearchParams();
  const raw = params.get("state");
  const fromUrl: DemoState = raw === "loading" || raw === "error" || raw === "empty" ? raw : "ready";
  const [retrying, setRetrying] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const retry = useCallback(() => {
    setRetrying(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setRetrying(false);
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.delete("state");
          return next;
        },
        { replace: true },
      );
    }, RETRY_MS);
  }, [setParams]);

  return { state: retrying ? "loading" : fromUrl, retry };
}

/** Read and write a per-viewer convenience (a remembered view or tab). Storage can be blocked. */
export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the choice lasts for this visit only.
  }
}
