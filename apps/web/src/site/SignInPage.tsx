import { useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { SignIn } from "@clerk/react";
import { Link } from "react-router";
import { Book } from "./Book";
import { SplitText } from "./bits/SplitText";
import { gsap, prefersReducedMotion, useGSAP } from "./gsap";
import "./site.css";

/* Sign-in, in Volume's own clothes: a spine-navy panel with the brand and the sample book, and the
   Clerk form themed from the design tokens (CSS variables, so light and dark both follow). In a
   local build there is no sign-in, so the form is replaced by a note and a link to the library. */

export interface SignInPageProps {
  /** clerk = hosted build, signed out. local = no Clerk key, the app opens without sign-in. */
  mode: "clerk" | "local";
}

const clerkAppearance = {
  variables: {
    colorPrimary: "var(--vol-accent)",
    colorPrimaryForeground: "var(--vol-on-accent)",
    colorBackground: "var(--vol-sheet)",
    colorForeground: "var(--vol-ink)",
    colorMutedForeground: "var(--vol-ink-secondary)",
    colorMuted: "var(--vol-sunken)",
    colorInput: "var(--vol-raised)",
    colorInputForeground: "var(--vol-ink)",
    colorBorder: "var(--vol-border)",
    colorDanger: "var(--vol-claim)",
    colorSuccess: "var(--vol-success)",
    colorRing: "var(--vol-select)",
    colorNeutral: "var(--vol-ink)",
    fontFamily: "var(--vol-font-ui)",
    borderRadius: "10px",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full max-w-[420px] rounded-lg border border-border shadow-sheet",
    // The page already has its own "Sign in to Volume" heading, so Clerk's card header would repeat it.
    header: { display: "none" },
  },
};

export default function SignInPage({ mode }: SignInPageProps) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .from(".in-rise", { y: 16, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, 0.4)
        .from(".in-form", { y: 24, autoAlpha: 0, duration: 1 }, 0.2);
    },
    { scope },
  );

  return (
    <div ref={scope} className="grid min-h-dvh bg-canvas text-ink lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-spine text-ink-on-spine lg:flex lg:flex-col lg:justify-between lg:p-10">
        <Link to="/" className="flex items-center gap-2.5 font-book text-[22px] font-semibold tracking-[-0.01em] text-ink-on-spine">
          <span className="site-mark" aria-hidden="true" />
          Volume
        </Link>
        <div className="relative h-[380px]">
          <Book size="sm" delay={0.2} interactive={false} />
        </div>
        <div className="grid max-w-[30em] gap-3">
          <p className="m-0 font-book text-[clamp(30px,3vw,42px)] leading-[1.08] font-medium tracking-[-0.02em]">
            <SplitText text="Welcome back to the" effect="blur" stagger={0.06} />{" "}
            <SplitText text="studio." effect="blur" stagger={0.06} delay={0.3} className="font-normal text-accent italic" />
          </p>
          <p className="in-rise m-0 text-ink-on-spine-muted">Your books, pen names and upload packs are where you left them.</p>
        </div>
      </aside>

      <main className="flex flex-col px-4 py-6 sm:px-8 lg:py-10">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 font-book text-[22px] font-semibold tracking-[-0.01em] text-ink lg:hidden">
            <span className="site-mark" aria-hidden="true" />
            Volume
          </Link>
          <Link to="/" className="ml-auto inline-flex items-center gap-1.5 text-small text-ink-secondary transition-colors hover:text-ink">
            <ArrowLeft aria-hidden="true" size={15} />
            Back to home
          </Link>
        </div>

        <div className="grid flex-1 place-items-center py-10">
          <div className="grid w-full max-w-[420px] justify-items-center gap-6">
            <div className="in-rise grid gap-2 text-center">
              <h1 className="m-0 font-book text-[32px] leading-tight font-medium tracking-[-0.015em]">Sign in to Volume</h1>
              <p className="m-0 text-ink-secondary">A private book studio. Access is by invitation.</p>
            </div>
            <div className="in-form flex w-full justify-center">
              {mode === "clerk" ? (
                <SignIn routing="hash" appearance={clerkAppearance} />
              ) : (
                <div className="w-full rounded-lg border border-border bg-sheet p-6 text-center shadow-sheet">
                  <p className="m-0 text-body text-ink-secondary">This is a local build, so sign-in is off and the app opens straight away.</p>
                  <Link
                    to="/"
                    className="mt-5 inline-flex h-11 items-center rounded-md bg-accent px-5 text-label font-semibold text-on-accent shadow-button transition-colors hover:bg-accent-hover"
                  >
                    Open the library
                  </Link>
                </div>
              )}
            </div>
            <Link to="/how-it-works" className="in-rise text-small text-ink-secondary underline-offset-4 hover:text-ink hover:underline">
              New here? See how it works
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
