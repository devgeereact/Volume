import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "./gsap";

/* The sample cloth-bound book on the public pages: built in CSS 3D (site.css), animated with GSAP.
   On the way in it turns to face the reader, gains its thickness, and the cover swings open on its
   hinge to show the title page, then closes. A fine pointer tilts it and peeks the cover. Decorative
   only, so it is hidden from screen readers. The title and author are sample content. */

export interface BookProps {
  size?: "md" | "sm" | undefined;
  /** Seconds before the intro starts. */
  delay?: number | undefined;
  /** Tilt and peek on pointer hover. */
  interactive?: boolean | undefined;
}

export function Book({ size = "md", delay = 0, interactive = true }: BookProps) {
  const scope = useRef<HTMLDivElement>(null);

  const { contextSafe } = useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const full = size === "sm" ? "22px" : "30px";
      gsap
        .timeline({ delay, defaults: { ease: "expo.out" } })
        .from(".site-book", { rotateY: -100, y: 60, autoAlpha: 0, duration: 1.6 }, 0)
        .fromTo(".site-book", { "--t": "4px", "--tn": 0 }, { "--t": full, "--tn": 1, duration: 1.8, ease: "power2.inOut" }, 0.4)
        .to(".cover-hinge", { rotationY: -150, duration: 1.3, ease: "power3.inOut" }, 1.4)
        .to(".cover-hinge", { rotationY: 0, duration: 1.1, ease: "power3.inOut" }, 3.2)
        .fromTo(".foil", { xPercent: -100 }, { xPercent: 100, duration: 1.4, ease: "power2.inOut" }, 4.2);
      gsap.to(".site-book-float", { y: -10, duration: 3.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap.to(".site-lamp", { scale: 1.12, opacity: 0.75, duration: 4, ease: "sine.inOut", yoyo: true, repeat: -1 });
      gsap
        .timeline({ repeat: -1, repeatDelay: 5, delay: delay + 6 })
        .fromTo(".foil", { xPercent: -100 }, { xPercent: 100, duration: 1.4, ease: "power2.inOut" });
    },
    { scope, dependencies: [size, delay] },
  );

  const canTilt = () => interactive && !prefersReducedMotion() && window.matchMedia("(pointer: fine)").matches;

  const onMove = contextSafe((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canTilt()) return;
    const r = e.currentTarget.getBoundingClientRect();
    gsap.to(".site-book-tilt", {
      rotationY: ((e.clientX - r.left) / r.width - 0.5) * 22,
      rotationX: -((e.clientY - r.top) / r.height - 0.5) * 14,
      duration: 0.8,
      ease: "power3.out",
      overwrite: "auto",
    });
  });
  const onEnter = contextSafe(() => {
    if (canTilt()) gsap.to(".cover-hinge", { rotationY: -38, duration: 0.8, ease: "power3.out", overwrite: "auto" });
  });
  const onLeave = contextSafe(() => {
    if (!canTilt()) return;
    gsap.to(".site-book-tilt", { rotationX: 0, rotationY: 0, duration: 0.8, ease: "power3.out", overwrite: "auto" });
    gsap.to(".cover-hinge", { rotationY: 0, duration: 0.9, ease: "power3.inOut", overwrite: "auto" });
  });

  const small = size === "sm";
  return (
    <div
      ref={scope}
      aria-hidden="true"
      className="site-book-stage relative grid h-full w-full place-items-center"
      onPointerMove={onMove}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <div className="site-lamp" />
      <div className="site-book-shadow" />
      <div className="site-book-tilt">
        <div className="site-book-float">
          <div className="site-book" data-size={size}>
            <div className="face back" />
            <div className="face pages" />
            <div className="face top" />
            <div className="face spine">
              <span className="font-book text-caption text-accent italic">The Calm Ward · M. R. Hale</span>
            </div>
            <div className="face titlepage">
              <span className="font-mono text-[9px] tracking-[0.3em] text-[#5e6375] uppercase">A novel</span>
              <span className={`font-book leading-tight italic ${small ? "text-[19px]" : "text-[26px]"}`}>The Calm Ward</span>
              <span className="h-px w-9 bg-[#7f5b0b]" />
              <span className="font-ui text-[10px] tracking-[0.3em] uppercase">M. R. Hale</span>
            </div>
            <div className="cover-pos">
              <div className="cover-hinge">
                <div className="face front">
                  <div className="cover">
                    <div className="font-mono text-[9.5px] tracking-[0.28em] uppercase opacity-85">A novel</div>
                    <div className={`self-center font-book leading-[1.05] font-normal italic ${small ? "text-[28px]" : "text-[38px]"}`}>
                      The Calm
                      <br />
                      Ward
                      <div className="orn" />
                    </div>
                    <div className="font-ui text-[11px] tracking-[0.32em] uppercase">M. R. Hale</div>
                  </div>
                  <div className="foil" />
                </div>
                <div className="face endpaper" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
