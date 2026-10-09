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

function crumbsFor(pathname: string, server: ServerNames): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const library = { label: "Library", to: "/" };
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
  if (parts[0] === "components") return [{ label: "Components", to: "/components" }];
  return [library];
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
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-[13.5px] font-medium">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.to + i} className={last ? "flex min-w-0 items-center gap-1" : "hidden min-w-0 items-center gap-1 sm:flex"}>
              {i > 0 && <ChevronRight size={14} className="hidden shrink-0 text-ink-tertiary sm:block" aria-hidden />}
              {last ? (
                <span aria-current="page" className="truncate text-ink">
                  {c.label}
                </span>
              ) : (
                <Link to={c.to} className="truncate rounded-xs text-ink-secondary hover:text-ink">
                  {c.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
