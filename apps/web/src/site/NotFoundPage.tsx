import { Link } from "react-router";
import { useSeo } from "./seo";

/* A public address that matches nothing. The server answers these with status 404 and noindex, and shows
   this page to a signed-out visitor, so the address is a real "not found" and not a blank shell. */

export default function NotFoundPage() {
  useSeo("not-found");
  return (
    <section aria-labelledby="nf-title" className="mx-auto grid w-full max-w-[1200px] flex-1 content-center justify-items-start gap-5 px-4 pb-16 sm:px-6">
      <p className="m-0 font-mono text-[12px] tracking-[0.14em] text-accent-text uppercase">Error 404</p>
      <h1 id="nf-title" className="m-0 font-book text-[clamp(36px,5vw,60px)] leading-[1.05] font-medium tracking-[-0.02em] text-balance">
        Page not found
      </h1>
      <p className="m-0 max-w-[32em] text-[18px] leading-relaxed text-pretty text-ink-secondary">
        There is nothing at this address. The link may be out of date.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to="/"
          className="inline-flex h-12 items-center rounded-md bg-accent px-5 text-label font-semibold text-on-accent shadow-button transition-colors hover:bg-accent-hover"
        >
          Back to the home page
        </Link>
        <Link
          to="/how-it-works"
          className="inline-flex h-12 items-center rounded-md border border-border px-5 text-label font-semibold text-ink transition-colors hover:border-border-strong"
        >
          How it works
        </Link>
      </div>
    </section>
  );
}
