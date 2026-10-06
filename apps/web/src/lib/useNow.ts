import { useEffect, useState } from "react";

/**
 * The current time in epoch milliseconds, refreshed every `intervalMs` while the component is mounted.
 * Use it instead of calling Date.now() during render, which React treats as impure.
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
