import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { useBook as useServerBook, useProfile } from "../api/hooks";
import { useWireMode } from "../api/wire-a";
import { ChevronRight } from "lucide-react";
import { getBook } from "../demo/books";
import { getPenName } from "../demo/penNames";
import { screens, settingsTabs } from "../screens";

interface Crumb {
  label: string;
  to: string;
}

/** Names the server knows for the page in the URL (API mode only). */
interface ServerNames {
  bookTitle?: string | undefined;
  profileName?: string | undefined;
}

export function crumbsFor(pathname: string, server: ServerNames): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const library = { label: "Library", to: "/library" };
  if (parts.length === 0 || parts[0] === "library") return [library];
  if (parts[0] === "published") return [{ label: screens.published.title, to: "/published" }];
  if (parts[0] === "books") {
    if (parts[1] === "new") return [library, { label: screens["new-book"].title, to: "/books/new" }];
    const book = getBook(parts[1]);
    // Library, then the book. The step bar under the top bar says which step you are on (D-016).
    if (book) return [library, { label: book.title, to: `/books/${book.id}` }];
    if (parts[1] && server.bookTitle !== undefined) return [library, { label: server.bookTitle, to: `/books/${parts[1]}` }];
    return [library];
  }
  if (parts[0] === "profiles") {
    const list: Crumb[] = [{ label: "Profiles", to: "/profiles" }];
    if (parts[1] === "new") list.push({ label: "New profile", to: "/profiles/new" });
    else if (parts[1]) list.push({ label: getPenName(parts[1])?.name ?? server.profileName ?? "Profile", to: `/profiles/${parts[1]}` });
    return list;
  }
  if (parts[0] === "settings") {
    const list: Crumb[] = [{ label: "Settings", to: "/settings" }];
    const tab = settingsTabs.find((t) => t.id === parts[1]);
    if (tab) list.push({ label: tab.label, to: `/settings/${tab.id}` });
    return list;
  }
  if (parts[0] === "archive") return [{ label: "Archive", to: "/archive" }];
  if (parts[0] === "volume") {
    const list: Crumb[] = [{ label: screens.volume.title, to: "/volume" }];
    if (parts[1] === "schedule") list.push({ label: screens.schedule.title, to: "/volume/schedule" });
    else if (parts[1] === "batches" && parts[2]) list.push({ label: "Batch", to: `/volume/batches/${parts[2]}` });
    return list;
  }
  if (parts[0] === "components") return [{ label: "Components", to: "/components" }];
  // An address the app does not know: the tab and the trail say so, not the screen before it.
  return [library, { label: "Page not found", to: pathname }];
}

/** Where you are: Library, then the book (never the step; the step bar shows that). The last crumb is the current page. */
export function Breadcrumbs() {
  const { pathname } = useLocation();
  const api = useWireMode() === "api";
  const parts = pathname.split("/").filter(Boolean);
  // The same queries lib/useBook and the profile editor use, so the title comes from the cache.
  const serverBookId = api && parts[0] === "books" && parts[1] && parts[1] !== "new" && !getBook(parts[1]) ? parts[1] : undefined;
  const serverProfileId = api && parts[0] === "profiles" && parts[1] && parts[1] !== "new" ? parts[1] : undefined;
  const book = useServerBook(serverBookId);
  const profile = useProfile(serverProfileId);
  const crumbs = crumbsFor(pathname, {
    bookTitle: book.data ? (book.data.title ?? "Untitled book") : undefined,
    profileName: profile.data?.penName,
  });
  // The browser tab names the page: the book step (if any), the current crumb, then Volume.
  const stepTitle = parts[0] === "books" && parts[2] ? (screens as Record<string, { title: string } | undefined>)[parts[2]]?.title : undefined;
  const pageTitle = [stepTitle, crumbs[crumbs.length - 1]?.label, "Volume"].filter(Boolean).join(" · ");
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);
  // Two lines: the whole trail above (hidden on small phones), then the current page as the bar's title.
  // The title repeats the last crumb, so it is hidden from screen readers; each screen keeps its own h1.
  const current = crumbs[crumbs.length - 1]?.label ?? "";
  return (
    <div className="min-w-0">
      <nav aria-label="Breadcrumb" className="max-[560px]:sr-only">
        <ol className="flex min-w-0 flex-wrap items-center gap-1 text-caption font-normal text-ink-3">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <li key={c.to + i} className="flex min-w-0 items-center gap-1">
                {i > 0 && <ChevronRight size={12} strokeWidth={1.8} className="shrink-0" aria-hidden />}
                {last ? (
                  <span aria-current="page" className="truncate font-medium text-ink-2">
                    {c.label}
                  </span>
                ) : (
                  <Link to={c.to} className="truncate rounded-xs hover:text-select hover:underline">
                    {c.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <p aria-hidden className="truncate text-[18px] leading-[1.2] font-bold tracking-[-0.01em] text-ink min-[561px]:text-bar-title">
        {current}
      </p>
    </div>
  );
}
