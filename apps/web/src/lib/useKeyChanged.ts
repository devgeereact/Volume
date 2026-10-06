import { useState } from "react";

/**
 * True during the render in which `key` is first seen or differs from the last render. A component
 * uses it to reset or adjust its own state while rendering (React's "adjusting state when a prop
 * changes" pattern) instead of calling setState in an effect. `key` must be a primitive.
 */
export function useKeyChanged(key: string | number | boolean | null): boolean {
  const [seen, setSeen] = useState<{ key: string | number | boolean | null } | null>(null);
  const changed = seen === null || seen.key !== key;
  if (changed) setSeen({ key });
  return changed;
}
