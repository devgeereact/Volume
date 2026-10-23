import { useEffect, type RefObject } from "react";

/*
 * Motion for the Library board (owner, 23 October 2026: "use /gsap"). GSAP is loaded only when the Library mounts, in
 * its own chunk, so no other screen pays for it. Cards rise in one after another and each step meter fills from the
 * left. Nothing moves for a visitor who asked for less motion: the board then simply shows its end state.
 * `key` changes when the set of books changes (a book added, archived or moved lane), not on every background refresh,
 * so the board does not replay while a job is running.
 */
export function useLibraryMotion(root: RefObject<HTMLElement | null>, key: string): void {
  useEffect(() => {
    let alive = true;
    let revert: (() => void) | undefined;
    void import("gsap").then(({ gsap }) => {
      const el = root.current;
      if (!alive || !el) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const cards = el.querySelectorAll("[data-lib-card]");
        const fills = el.querySelectorAll("[data-step-fill]");
        gsap.from(cards, {
          autoAlpha: 0,
          y: 14,
          duration: 0.45,
          ease: "power2.out",
          stagger: { each: 0.035, amount: 0.6 },
          clearProps: "opacity,visibility,transform",
        });
        gsap.from(fills, { scaleX: 0, duration: 0.6, ease: "power2.out", stagger: { each: 0.012, amount: 0.5 }, delay: 0.15, clearProps: "transform" });
      });
      revert = () => mm.revert();
    });
    return () => {
      alive = false;
      revert?.();
    };
  }, [root, key]);
}
