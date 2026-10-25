import { lazy, Suspense, useEffect, useState } from "react";
import { useMediaQuery } from "../lib/useMediaQuery";

/** Lenis smooth scroll on the public pages. The library (and its stylesheet) is a separate chunk that loads only
    when the page really scrolls (a phone, say) and the visitor has not asked for reduced motion. On a screen where
    the whole hero fits, it never loads. Unmounting destroys the instance. */
const SmoothScrollRoot = lazy(() => import("./SmoothScrollRoot"));

function pageScrolls(): boolean {
  const el = document.documentElement;
  return el.scrollHeight > el.clientHeight + 8;
}

export function SmoothScroll() {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [needed, setNeeded] = useState(false);

  useEffect(() => {
    if (reduce) return undefined;
    // The page arrives lazily and grows as it lays out, so watch the body's size rather than check once.
    const check = () => setNeeded((was) => was || pageScrolls());
    check();
    const observer = new ResizeObserver(check);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [reduce]);

  if (reduce || !needed) return null;
  return (
    <Suspense fallback={null}>
      <SmoothScrollRoot />
    </Suspense>
  );
}
