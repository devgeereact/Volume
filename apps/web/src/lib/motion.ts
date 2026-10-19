/* Motion presets for motion/react, mirroring the duration and easing tokens in @volume/ui.
   Animate transform and opacity only. Components pair these with useReducedMotion(). */

export const dur = { fast: 0.15, base: 0.2, slow: 0.3 } as const;

export const ease = {
  out: [0.2, 0.8, 0.2, 1] as const,
  in: [0.4, 0, 1, 1] as const,
  page: [0.3, 0.7, 0.1, 1] as const,
};

/** Menus and popovers: fade and settle 4 px, 200 ms. */
export const popover = {
  initial: { opacity: 0, y: -4 },
  animate: { opacity: 1, y: 0, transition: { duration: dur.base, ease: ease.out } },
  exit: { opacity: 0, y: -4, transition: { duration: dur.fast, ease: ease.in } },
};

/** Modal and command menu: fade and settle 8 px, 300 ms. */
export const dialog = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: dur.slow, ease: ease.out } },
  exit: { opacity: 0, y: 4, scale: 0.99, transition: { duration: dur.fast, ease: ease.in } },
};

/** Scrim behind a dialog. */
export const scrim = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: dur.base, ease: ease.out } },
  exit: { opacity: 0, transition: { duration: dur.fast, ease: ease.in } },
};

/** Reduced motion: a short fade, nothing moves. */
export const fadeOnly = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

/** Ink in: a streamed chunk fades in and settles 2 px. */
export const inkIn = {
  initial: { opacity: 0, y: 2 },
  animate: { opacity: 1, y: 0, transition: { duration: dur.base, ease: ease.out } },
};

/** True when the reader has asked the system for reduced motion. Read at call time, so it follows a live change. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Scroll behaviour for scrollIntoView and scrollTo: smooth, or an instant jump under reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
