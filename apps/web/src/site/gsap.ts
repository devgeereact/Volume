import { gsap } from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";

/* GSAP for the public pages (landing, how it works, sign-in). Plugins are registered once, here.
   Every plugin is free under the GSAP licence. The app screens use motion/react instead. */
gsap.registerPlugin(SplitText, ScrambleTextPlugin, useGSAP);

export { gsap, SplitText, useGSAP };

/** True when the visitor asked for less motion. Animations then show their end state. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}
