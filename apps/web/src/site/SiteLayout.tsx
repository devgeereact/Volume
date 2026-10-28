import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { cn } from "../lib/cn";
import { useMediaQuery } from "../lib/useMediaQuery";
import { gsap } from "./gsap";
import { SmoothScroll } from "./SmoothScroll";
import "./site.css";

/* The public pages' frame: brand mark, two links, the page, one quiet footer line. The landing at /
   is the front of the app for everyone (D-054); signed-in users get "Open library" instead of "Sign in". */

interface SiteContextValue {
  /** Where the brand mark goes (the landing). */
  home: string;
  signedIn: boolean;
}

const SiteContext = createContext<SiteContextValue>({ home: "/", signedIn: false });

export function useSite(): SiteContextValue {
  return useContext(SiteContext);
}

/** Primary call to action on the public pages: sign in, or open the library when already in. */
export function useSiteCta(): { to: string; label: string } {
  const { signedIn } = useSite();
  return signedIn ? { to: "/library", label: "Open the library" } : { to: "/sign-in", label: "Sign in to start" };
}

const pill =
  "inline-flex h-11 items-center rounded-full border border-border px-5 text-small font-semibold text-ink transition-colors hover:border-border-strong";

const footLink = "inline-flex min-h-11 items-center underline-offset-4 transition-colors hover:text-ink hover:underline";

/** Attribute on <html> that pauses the CSS loops in site.css (sheen, shiny text, live dot, caret). */
const PAUSED_ATTR = "data-site-paused";

/**
 * Pauses or resumes every animation on the page, GSAP and the CSS loops (WCAG 2.2.2: moving content that runs for
 * more than five seconds needs a stop). Leaving the public pages clears the pause.
 */
function MotionToggle() {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [paused, setPaused] = useState(false);
  useEffect(
    () => () => {
      document.documentElement.removeAttribute(PAUSED_ATTR);
      gsap.globalTimeline.paused(false);
    },
    [],
  );
  if (reduce) return null;
  return (
    <button
      type="button"
      aria-pressed={paused}
      onClick={() => {
        gsap.globalTimeline.paused(!paused);
        document.documentElement.toggleAttribute(PAUSED_ATTR, !paused);
        setPaused(!paused);
      }}
      className={cn(footLink, "cursor-pointer")}
    >
      {paused ? "Play animation" : "Pause animation"}
    </button>
  );
}

export interface SiteLayoutProps extends SiteContextValue {
  /** The page to show. The router's outlet when left out. */
  children?: ReactNode;
}

export function SiteLayout({ home, signedIn, children }: SiteLayoutProps) {
  return (
    <SiteContext.Provider value={{ home, signedIn }}>
      <SmoothScroll />
      <div className="flex min-h-dvh flex-col overflow-x-clip bg-canvas text-ink">
        <a href="#site-main" className="sr-only rounded-md bg-sheet px-3 py-2 text-small focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10">
          Skip to content
        </a>
        <header className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <nav aria-label="Main" className="flex items-center justify-between gap-4 py-3">
            <Link
              to={home}
              aria-label="Volume, home"
              className="flex min-h-11 items-center gap-2.5 font-book text-[22px] font-semibold tracking-[-0.01em] text-ink"
            >
              <span className="site-mark" aria-hidden="true" />
              Volume
            </Link>
            <div className="flex items-center gap-5 text-small text-ink-secondary">
              <NavLink
                to="/how-it-works"
                className={({ isActive }) => cn("inline-flex min-h-11 items-center transition-colors hover:text-ink", isActive && "font-semibold text-ink")}
              >
                How it works
              </NavLink>
              <Link to={signedIn ? "/library" : "/sign-in"} className={pill}>
                {signedIn ? "Open library" : "Sign in"}
              </Link>
            </div>
          </nav>
        </header>
        <main id="site-main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          {children ?? <Outlet />}
        </main>
        <footer className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-6 gap-y-0 px-4 pb-2 text-caption text-ink-tertiary sm:px-6">
          <p className="m-0">A private book studio. Access is by invitation.</p>
          <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5">
            <Link to="/how-it-works" className={footLink}>
              How it works
            </Link>
            <Link to={signedIn ? "/library" : "/sign-in"} className={footLink}>
              {signedIn ? "Open library" : "Sign in"}
            </Link>
            <MotionToggle />
          </nav>
        </footer>
      </div>
    </SiteContext.Provider>
  );
}

/** The frame as the app's router uses it (signed in, or a local build). */
export default function InAppSiteLayout() {
  return <SiteLayout home="/" signedIn />;
}
