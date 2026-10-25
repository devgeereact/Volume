import { useEffect, useRef } from "react";
import { ReactLenis, type LenisRef } from "lenis/react";
import "lenis/dist/lenis.css";
import { gsap } from "./gsap";

/** Lenis driven by GSAP's ticker (one frame loop, not two). Loaded by SmoothScroll only when needed. */
export default function SmoothScrollRoot() {
  const lenisRef = useRef<LenisRef>(null);

  useEffect(() => {
    const update = (time: number) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(update);
    return () => gsap.ticker.remove(update);
  }, []);

  return <ReactLenis root ref={lenisRef} options={{ autoRaf: false, lerp: 0.09, anchors: true }} />;
}
