import { useEffect } from "react";
import pages from "./seo-pages.json";

/* Head tags for the public pages. The server writes the same tags into the first response (apps/server
   src/http/seo.ts, which keeps its own copy of seo-pages.json; a server test keeps the two in step), so
   crawlers and link previews see them without running scripts. This hook keeps them right when the visitor
   moves between pages, and puts the private-app defaults back when a public page unmounts, so a signed-in
   screen never carries a public page's title or an "index" robots tag. */

export type SeoKey = keyof typeof pages;

/** Pages search engines may index. Everything else is noindex. */
// D-053 item 5: noindex stays. To index the landing page and How it works, add 'home' and 'how-it-works' here and in the web seo.ts, after a superseding decision.
export const INDEXABLE: readonly SeoKey[] = [];

/** First path segments that belong to the signed-in app. A signed-out visitor who follows one gets sign-in. */
export const APP_PATH_PREFIXES: readonly string[] = [
  "sign-in",
  "library",
  "published",
  "profiles",
  "books",
  "settings",
  "archive",
  "volume",
  "new-book",
  "components",
];

/** True for /library, /books/abc and the like. */
export function isAppPath(pathname: string): boolean {
  const first = pathname.split("/")[1]?.toLowerCase() ?? "";
  return APP_PATH_PREFIXES.includes(first);
}

export const DEFAULT_TITLE = "Volume";
export const DEFAULT_DESCRIPTION = "Volume, a private book production studio.";
const SITE_NAME = "Volume";
const IMAGE_PATH = "/og-image.png";
const IMAGE_ALT = "Volume, a book production studio";

function head(): HTMLHeadElement | null {
  return typeof document === "undefined" ? null : document.head;
}

function upsert(selector: string, create: () => HTMLElement, set: (el: HTMLElement) => void): void {
  const h = head();
  if (!h) return;
  let el = h.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    h.appendChild(el);
  }
  set(el);
}

function meta(attr: "name" | "property", key: string, content: string): void {
  upsert(
    `meta[${attr}="${key}"]`,
    () => {
      const el = document.createElement("meta");
      el.setAttribute(attr, key);
      return el;
    },
    (el) => el.setAttribute("content", content),
  );
}

function canonical(href: string): void {
  upsert(
    'link[rel="canonical"]',
    () => {
      const el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      return el;
    },
    (el) => el.setAttribute("href", href),
  );
}

const SOCIAL = 'meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"], script[type="application/ld+json"]';

/** The head of a private app screen: generic title, no social tags, noindex. */
export function resetSeo(): void {
  const h = head();
  if (!h) return;
  document.title = DEFAULT_TITLE;
  meta("name", "description", DEFAULT_DESCRIPTION);
  meta("name", "robots", "noindex, nofollow");
  h.querySelectorAll(SOCIAL).forEach((el) => el.remove());
}

export function applySeo(key: SeoKey, origin: string = window.location.origin): void {
  const page = pages[key];
  const index = INDEXABLE.includes(key);
  const own = key === "home" || key === "how-it-works";
  const url = `${origin}${own ? page.path : window.location.pathname}`;
  document.title = page.title;
  meta("name", "description", page.description);
  meta("name", "robots", index ? "index, follow, max-image-preview:large" : "noindex, nofollow");
  if (index) canonical(url);
  else head()?.querySelector('link[rel="canonical"]')?.remove();
  // Social tags only on the two pages people share, as the server writes them (apps/server/src/http/seo.ts).
  if (!own) {
    head()
      ?.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]')
      .forEach((el) => el.remove());
    return;
  }
  meta("property", "og:type", "website");
  meta("property", "og:site_name", SITE_NAME);
  meta("property", "og:locale", "en_GB");
  meta("property", "og:title", page.title);
  meta("property", "og:description", page.description);
  meta("property", "og:url", url);
  meta("property", "og:image", `${origin}${IMAGE_PATH}`);
  meta("property", "og:image:width", "1200");
  meta("property", "og:image:height", "630");
  meta("property", "og:image:alt", IMAGE_ALT);
  meta("name", "twitter:card", "summary_large_image");
  meta("name", "twitter:title", page.title);
  meta("name", "twitter:description", page.description);
  meta("name", "twitter:image", `${origin}${IMAGE_PATH}`);
  meta("name", "twitter:image:alt", IMAGE_ALT);
}

/** Sets the title, description, canonical, robots and social tags for a public page while it is mounted. */
export function useSeo(key: SeoKey): void {
  useEffect(() => {
    applySeo(key);
    return resetSeo;
  }, [key]);
}

/** Title and noindex for a private app screen that has no public page, such as the in-app "not found". */
export function applyPrivateTitle(title: string): void {
  if (!head()) return;
  document.title = title;
  meta("name", "robots", "noindex, nofollow");
}

/** The in-app "not found" screen: its own title and noindex while mounted, the private defaults after. */
export function useNotFoundSeo(): void {
  useEffect(() => {
    applyPrivateTitle(pages["not-found"].title);
    return resetSeo;
  }, []);
}
