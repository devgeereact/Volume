import { useRef } from "react";
import { gsap, prefersReducedMotion, SplitText as GSAPSplitText, useGSAP } from "../gsap";

/* Adapted from React Bits SplitText (MIT, https://reactbits.dev/text-animations/split-text), trimmed
   to what the public pages use. "scatter" is the depth-scatter assemble from the HyperFrames motion
   notes: characters start on a golden-angle spiral in 3D and settle into the word. */

export type SplitEffect = "rise" | "blur" | "scatter";

export interface SplitTextProps {
  text: string;
  className?: string | undefined;
  /** rise = masked lines or words slide up; blur = fade in from a soft blur; scatter = 3D assemble (characters). */
  effect?: SplitEffect | undefined;
  split?: "words" | "lines" | undefined;
  /** Seconds before the first piece moves. */
  delay?: number | undefined;
  stagger?: number | undefined;
  duration?: number | undefined;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

export function SplitText({ text, className, effect = "rise", split = "words", delay = 0, stagger = 0.06, duration = 1 }: SplitTextProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return undefined;

      if (effect === "scatter") {
        const parts = GSAPSplitText.create(el, { type: "words,chars", wordsClass: "split-word", charsClass: "split-char", aria: "none" });
        const last = Math.max(1, parts.chars.length - 1);
        gsap.set(el, { perspective: 900 });
        gsap.set(parts.words, { transformStyle: "preserve-3d" });
        gsap.from(parts.chars, {
          x: (i: number) => Math.cos(i * GOLDEN) * 240,
          y: (i: number) => Math.sin(i * GOLDEN) * 140,
          z: (i: number) => 420 - (i / last) * 1100,
          rotationX: (i: number) => Math.sin(i * GOLDEN) * 80,
          rotationY: (i: number) => Math.cos(i * GOLDEN) * 80,
          autoAlpha: 0,
          duration: duration * 1.5,
          ease: "expo.out",
          stagger: { each: stagger, from: "random" },
          delay,
        });
        return () => parts.revert();
      }

      const parts = GSAPSplitText.create(el, { type: split, ...(effect === "rise" ? { mask: split } : {}), autoSplit: split === "lines", aria: "none" });
      const pieces = split === "lines" ? parts.lines : parts.words;
      gsap.from(
        pieces,
        effect === "rise"
          ? { yPercent: 110, duration, ease: "expo.out", stagger, delay }
          : { y: 30, autoAlpha: 0, filter: "blur(10px)", duration, ease: "expo.out", stagger, delay },
      );
      return () => parts.revert();
    },
    { scope: ref, dependencies: [text, effect, split, delay, stagger, duration], revertOnUpdate: true },
  );

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
