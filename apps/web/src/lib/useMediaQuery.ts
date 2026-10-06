import { useSyncExternalStore } from "react";

/** Subscribe to a CSS media query. Returns false when matchMedia is not available. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** Breakpoints from 08-DESIGN-GUIDE: phone under 640, tablet 640 to 1023, laptop 1024 and up. */
export function useBreakpoint(): "phone" | "tablet" | "laptop" {
  const tablet = useMediaQuery("(min-width: 640px)");
  const laptop = useMediaQuery("(min-width: 1024px)");
  return laptop ? "laptop" : tablet ? "tablet" : "phone";
}
