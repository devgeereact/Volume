import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Book } from "./Book";
import { ScrambleText } from "./bits/ScrambleText";
import { SplitText } from "./bits/SplitText";
import { gsap, prefersReducedMotion, useGSAP } from "./gsap";
import { useSeo } from "./seo";
import { useSiteCta } from "./SiteLayout";

/* Landing: one hero and nothing else. Headline left, the sample book right with a manuscript sheet
   showing a claim flagged for checking. The live line cycles through sample jobs. */

const JOBS = [
  "Writing chapter 7 of 12 · The Calm Ward",
  "Checking sources · claims flagged",
  "Line edit pass 2 of 3 · chapter 4",
  "Drawing the full-wrap cover",
  "Building the upload pack",
] as const;

const FORMATS = ["Print PDF", "EPUB", "Word", "Covers", "Listing copy"] as const;

const HEADLINE = "Bring a working title. Leave with a finished book.";

export default function LandingPage() {
  const scope = useRef<HTMLElement>(null);
  const cta = useSiteCta();
  useSeo("home");

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .from(".land-live", { y: 12, autoAlpha: 0, duration: 0.8 }, 0)
        .from(".land-rise", { y: 18, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.7)
        .from(".land-sheet", { x: -30, y: 30, rotate: -10, autoAlpha: 0, duration: 1.1 }, 1.2)
        .from(".land-flag", { scale: 0, autoAlpha: 0, duration: 0.7, ease: "back.out(3)", transformOrigin: "50% 60%" }, 2.3);
    },
    { scope },
  );

  return (
    <section
      ref={scope}
      aria-labelledby="land-title"
      className="mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-8 px-4 pt-2 pb-12 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-10 lg:pb-16"
    >
      <div className="grid min-w-0 gap-6">
        <p className="land-live inline-flex max-w-full items-center gap-2.5 justify-self-start rounded-full border border-border bg-sheet py-1.5 pr-3.5 pl-2.5 font-mono text-[12.5px] text-ink-secondary">
          <span className="site-live-dot" aria-hidden="true" />
          <ScrambleText lines={JOBS} className="truncate" />
        </p>

        <h1
          id="land-title"
          aria-label={HEADLINE}
          className="m-0 font-book text-[clamp(42px,6.4vw,84px)] leading-[1.02] font-medium tracking-[-0.025em] text-balance"
        >
          <span aria-hidden="true">
            <SplitText text="Bring a working title. Leave with a" effect="blur" stagger={0.06} />{" "}
            <SplitText text="finished book." effect="scatter" stagger={0.035} delay={0.35} className="font-normal text-accent-text italic" />
          </span>
        </h1>

        <p className="land-rise m-0 max-w-[34em] text-[18px] leading-relaxed text-pretty text-ink-secondary">
          Volume researches your topic with linked sources, writes the manuscript in your author&apos;s voice, edits it, designs the cover and builds an upload
          pack for Amazon KDP. Made for independent authors. You choose the title and approve the plan. Nothing is published for you.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={cta.to}
            className="land-rise site-sheen inline-flex h-12 items-center gap-2.5 rounded-md bg-accent px-5 text-label font-semibold text-on-accent shadow-button transition-colors hover:bg-accent-hover"
          >
            {cta.label}
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
          <Link
            to="/how-it-works"
            className="land-rise inline-flex h-12 items-center rounded-md border border-border px-5 text-label font-semibold text-ink transition-colors hover:border-border-strong"
          >
            How it works
          </Link>
        </div>

        <ul
          aria-label="In every upload pack"
          className="land-rise m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1.5 p-0 font-mono text-[12px] tracking-[0.02em] text-ink-tertiary"
        >
          {FORMATS.map((f) => (
            <li key={f} className="before:mr-1 before:text-accent before:content-['▪']">
              {f}
            </li>
          ))}
        </ul>
        <p className="land-rise m-0 text-caption text-ink-tertiary">The book and manuscript page shown are sample content.</p>
      </div>

      <div className="relative min-h-[420px] min-w-0 sm:min-h-[500px]">
        <Book delay={0.1} />
        <div
          aria-hidden="true"
          className="land-sheet absolute bottom-0 left-0 z-[2] grid w-[min(300px,64%)] -rotate-3 gap-2.5 rounded-md border border-border bg-sheet px-[18px] pt-4 pb-[18px] shadow-pop sm:bottom-8"
        >
          <div className="flex justify-between gap-2 font-mono text-[10.5px] tracking-[0.06em] text-ink-tertiary uppercase">
            <span>Ch. 7 · The Night Shift</span>
            <span className="text-success">Writing</span>
          </div>
          <p className="m-0 font-book text-[12.5px] leading-[1.6] sm:text-[13.5px] text-ink">
            By the third week the ward had learned its own rhythm. At 2 a.m. the nurses moved between beds the way a tide moves over sand,{" "}
            <span className="underline decoration-claim decoration-wavy decoration-1 underline-offset-[3px]">a pattern first described in 1987</span>
            <span className="land-flag ml-1 inline-block rounded-xs bg-claim-wash px-1.5 align-[2px] font-mono text-[9.5px] tracking-[0.06em] text-claim uppercase">
              Verify
            </span>
            <span className="site-caret" />
          </p>
        </div>
      </div>
    </section>
  );
}
