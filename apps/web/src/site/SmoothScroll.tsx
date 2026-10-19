import { useEffect, useRef } from "react";
import { ReactLenis, type LenisRef } from "lenis/react";
import "lenis/dist/lenis.css";
import { useMediaQuery } from "../lib/useMediaQuery";
import { gsap } from "./gsap";

/** Lenis smooth scroll on the public pages, driven by GSAP's ticker (one frame loop, not two).
    Off when the visitor prefers reduced motion; unmounting destroys the instance. */
export function SmoothScroll() {
  const lenisRef = useRef<LenisRef>(null);
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");

  useEffect(() => {
    if (reduce) return undefined;
    const update = (time: number) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    return () => gsap.ticker.remove(update);
  }, [reduce]);

  if (reduce) return null;
  return <ReactLenis root ref={lenisRef} options={{ autoRaf: false, lerp: 0.09, anchors: true }} />;
}
