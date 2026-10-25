import { useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "react-router";
import { cn } from "../lib/cn";
import { ShinyText } from "./bits/ShinyText";
import { SplitText } from "./bits/SplitText";
import { gsap, prefersReducedMotion, useGSAP } from "./gsap";
import { useSeo } from "./seo";
import { useSiteCta } from "./SiteLayout";

/* How it works: its own hero. Copy left; right, a sample book runs through the seven stages on a
   loop, and the upload pack appears when the last one finishes. Reduced motion shows the end state. */

const STAGES = [
  { name: "Research", detail: "Sources gathered and linked. Claims the sources do not back are flagged for you." },
  { name: "Title options", detail: "Titles proposed. You choose the one you want." },
  { name: "Blueprint", detail: "The chapter plan, ready before writing starts." },
  { name: "Manuscript", detail: "Written in your author's voice, chapter by chapter." },
  { name: "Editing", detail: "Edit passes. Claims to check go to their own report." },
  { name: "Cover", detail: "Front cover and full wrap, spine sized to the page count." },
  { name: "Upload pack", detail: "Interior files, covers and listing copy for your KDP upload." },
] as const;

const PACK = ["Print PDF", "EPUB", "Word", "Covers", "Listing copy", "Claims to verify"] as const;

const STEP = 1.6;
const HEADLINE = "Seven stages from title to upload pack.";

export default function HowItWorksPage() {
  const scope = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const cta = useSiteCta();
  useSeo("how-it-works");
  // Stages before `step` are done; `step` is running. STAGES.length means all done.
  const [step, setStep] = useState(() => (prefersReducedMotion() ? STAGES.length : 0));
  const finished = step >= STAGES.length;
  const current = STAGES[Math.min(step, STAGES.length - 1)] ?? STAGES[0];

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        // The shine clips its gradient to the text, so it rises whole rather than split.
        .from(".how-shiny", { yPercent: 40, autoAlpha: 0, filter: "blur(10px)", duration: 1.1 }, 0.35)
        .from(".how-rise", { y: 18, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.5)
        .from(".how-card", { y: 40, autoAlpha: 0, duration: 1.2 }, 0.3);

      const run = gsap.timeline({ repeat: -1, repeatDelay: 3, delay: 1.2 });
      STAGES.forEach((_, i) => {
        run.call(() => setStep(i), undefined, i * STEP);
      });
      run.call(() => setStep(STAGES.length), undefined, STAGES.length * STEP);
      run.fromTo(barRef.current, { scaleX: 0 }, { scaleX: 1, duration: STAGES.length * STEP, ease: "none" }, 0);
    },
    { scope },
  );

  // Decode the stage name when it changes. GSAP owns this node's text, so React renders it once.
  useGSAP(
    () => {
      const el = nameRef.current;
      if (!el) return;
      if (prefersReducedMotion()) {
        el.textContent = current.name;
        return;
      }
      gsap.to(el, { duration: 0.7, overwrite: true, scrambleText: { text: current.name, chars: "upperCase", speed: 0.5 } });
    },
    { scope, dependencies: [current.name] },
  );

  return (
    <section
      ref={scope}
      aria-labelledby="how-title"
      className="mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-10 px-4 pt-2 pb-12 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14 lg:pb-16"
    >
      <div className="grid min-w-0 gap-6">
        <p className="how-rise m-0 font-mono text-[12px] tracking-[0.14em] text-accent-text uppercase">How it works</p>
        <h1
          id="how-title"
          aria-label={HEADLINE}
          className="m-0 font-book text-[clamp(38px,5.2vw,68px)] leading-[1.04] font-medium tracking-[-0.022em] text-balance"
        >
          <span aria-hidden="true">
            <SplitText text="Seven stages from title to" effect="rise" stagger={0.07} />{" "}
            <ShinyText className="how-shiny inline-block font-normal text-accent-text italic">upload pack.</ShinyText>
          </span>
        </h1>
        <p className="how-rise m-0 max-w-[32em] text-[18px] leading-relaxed text-pretty text-ink-secondary">
          You choose the title and approve the plan. Volume writes, edits and builds the files. Nothing is published for you. Made for independent authors who
          publish on Amazon KDP.
        </p>
        <div className="how-rise flex flex-wrap items-center gap-3">
          <Link
            to={cta.to}
            className="site-sheen inline-flex h-12 items-center gap-2.5 rounded-md bg-accent px-5 text-label font-semibold text-on-accent shadow-button transition-colors hover:bg-accent-hover"
          >
            {cta.label}
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </div>

      <div className="how-card grid min-w-0 gap-5 rounded-lg border border-border bg-sheet p-5 shadow-sheet sm:p-7">
        <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] tracking-[0.12em] text-ink-tertiary uppercase">
          <span>{finished ? "Finished" : "Now running"}</span>
          <span className="tracking-normal normal-case">
            Sample book · <span className="font-book italic">The Calm Ward</span>
          </span>
        </div>

        <div className="grid gap-1.5">
          <span ref={nameRef} className="min-h-[1.1em] font-book text-[clamp(28px,3.2vw,40px)] leading-[1.1] font-medium tracking-[-0.015em]">
            {STAGES[0].name}
          </span>
          <p className="m-0 min-h-[1.55em] text-ink-secondary">{current.detail}</p>
        </div>

        <div className="h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <span ref={barRef} className="block h-full origin-left bg-accent" />
        </div>

        <h2 className="sr-only">The seven stages</h2>
        <ol className="site-rail m-0 grid list-none gap-0.5 p-0">
          {STAGES.map((s, i) => {
            const done = i < step;
            const live = i === step;
            return (
              <li key={s.name} className={cn("grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-md px-3 py-2", live && "bg-accent-wash")}>
                <span className="font-mono text-[12px] text-ink-tertiary tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className={cn("text-label font-semibold", done || live ? "text-ink" : "text-ink-tertiary")}>
                  {s.name}
                  <span className="sr-only">. {s.detail}</span>
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] uppercase",
                    done && "border-current text-success",
                    live && "border-accent bg-accent text-on-accent",
                    !done && !live && "border-border text-ink-tertiary",
                  )}
                >
                  {done && <Check aria-hidden="true" size={11} />}
                  {done ? "Done" : live ? "Running" : "Queued"}
                </span>
              </li>
            );
          })}
        </ol>

        <div className={cn("grid gap-2.5 transition-opacity duration-500", finished ? "opacity-100" : "opacity-40")}>
          <h2 className="m-0 font-mono text-[11px] font-normal tracking-[0.12em] text-ink-tertiary uppercase">Upload pack</h2>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {PACK.map((p) => (
              <li
                key={p}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-small font-medium",
                  p === "Claims to verify" ? "border-claim bg-claim-wash text-claim" : "border-border bg-canvas text-ink",
                )}
              >
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
