import { useRef } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "../gsap";

/* Adapted from React Bits DecryptedText (MIT, https://reactbits.dev/text-animations/decrypted-text),
   built on GSAP's ScrambleText plugin instead of motion. Cycles through lines, decoding each one.
   Screen readers get the first line once (aria-label), not every change. */

export interface ScrambleTextProps {
  lines: readonly string[];
  className?: string | undefined;
  /** Seconds each line stays before the next one decodes. */
  hold?: number | undefined;
}

export function ScrambleText({ lines, className, hold = 2.6 }: ScrambleTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const first = lines[0] ?? "";

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || lines.length < 2 || prefersReducedMotion()) return;
      const tl = gsap.timeline({ repeat: -1 });
      lines.forEach((_, i) => {
        const next = lines[(i + 1) % lines.length] ?? first;
        tl.to(el, { duration: 1, ease: "none", scrambleText: { text: next, chars: "lowerCase", speed: 0.6 } }, `+=${hold}`);
      });
    },
    { scope: ref, dependencies: [lines.join("|"), hold] },
  );

  return (
    <span className={className} aria-label={first}>
      <span ref={ref} aria-hidden="true">
        {first}
      </span>
    </span>
  );
}
