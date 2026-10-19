import { createContext, useContext } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { cn } from "../lib/cn";
import { SmoothScroll } from "./SmoothScroll";
import "./site.css";

/* The public pages' frame: brand mark, two links, the page, one quiet footer line. Signed-out
   visitors see it at / (hosted builds). Signed-in users and local builds reach it at /welcome. */

interface SiteContextValue {
  /** Where the brand mark goes: / for signed-out visitors, /welcome inside the app. */
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
  return signedIn ? { to: "/", label: "Open the library" } : { to: "/sign-in", label: "Sign in to start" };
}

const pill =
  "inline-flex h-9 items-center rounded-full border border-border px-4 text-small font-semibold text-ink transition-colors hover:border-border-strong";

export function SiteLayout({ home, signedIn }: SiteContextValue) {
  return (
    <SiteContext.Provider value={{ home, signedIn }}>
      <SmoothScroll />
      <div className="flex min-h-dvh flex-col overflow-x-clip bg-canvas text-ink">
        <a href="#site-main" className="sr-only rounded-md bg-sheet px-3 py-2 text-small focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-10">
          Skip to content
        </a>
        <header className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <nav aria-label="Main" className="flex items-center justify-between gap-4 py-5">
            <Link to={home} className="flex items-center gap-2.5 font-book text-[22px] font-semibold tracking-[-0.01em] text-ink">
              <span className="site-mark" aria-hidden="true" />
              Volume
            </Link>
            <div className="flex items-center gap-5 text-small text-ink-secondary">
              <NavLink to="/how-it-works" className={({ isActive }) => cn("transition-colors hover:text-ink", isActive && "font-semibold text-ink")}>
                How it works
              </NavLink>
              <Link to={signedIn ? "/" : "/sign-in"} className={pill}>
                {signedIn ? "Open library" : "Sign in"}
              </Link>
            </div>
          </nav>
        </header>
        <main id="site-main" className="flex flex-1 flex-col">
          <Outlet />
        </main>
        <footer className="mx-auto w-full max-w-[1200px] px-4 pb-6 text-caption text-ink-tertiary sm:px-6">
          A private book studio. Access is by invitation.
        </footer>
      </div>
    </SiteContext.Provider>
  );
}

/** The frame as the app's router uses it (signed in, or a local build). */
export default function InAppSiteLayout() {
  return <SiteLayout home="/welcome" signedIn />;
}
