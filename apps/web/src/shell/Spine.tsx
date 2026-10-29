import { Link, useLocation } from "react-router";
import { Archive, Book, FilePlus, Layers2, SlidersHorizontal, Star, Users, type LucideIcon } from "lucide-react";
import { useApiBooks, useWireMode } from "../api/wire-a";
import { publishedBooks } from "../demo/books";
import { cn } from "../lib/cn";
import { usePenNameFilter } from "../lib/penName";
import { globalNav, type ScreenDef } from "../screens";
import { useCurrentProfileCount } from "./PenNameSwitcher";
import { DemoBadge } from "./DemoBadge";
import { SideStatus } from "./JobBar";

/** The Volume mark: the book icon from the approved design, on navy. */
export function BrandMark({ className }: { className?: string | undefined }) {
  return (
    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-md bg-btn text-on-btn", className)}>
      <Book size={19} strokeWidth={1.8} />
    </span>
  );
}

/** Icons of the side menu, as in the approved design (the command menu keeps the screens' own icons). */
const navIcons: Partial<Record<string, LucideIcon>> = {
  library: Book,
  published: Star,
  volume: Layers2,
  profiles: Users,
  "new-book": FilePlus,
  archive: Archive,
  settings: SlidersHorizontal,
};

function isActive(pathname: string, path: string): boolean {
  if (path === "/library") return pathname === "/library" || (pathname.startsWith("/books/") && pathname !== "/books/new");
  if (path === "/published") return pathname === "/published";
  if (path === "/books/new") return pathname === "/books/new";
  if (path.startsWith("/settings")) return pathname.startsWith("/settings");
  if (path.startsWith("/profiles")) return pathname.startsWith("/profiles");
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Published books under the profile picked in the switcher: the demo shelf, or the server's list. Null until known. */
function usePublishedCount(): number | null {
  const mode = useWireMode();
  const { selectedId } = usePenNameFilter();
  const books = useApiBooks(mode === "api");
  if (mode === "mock") return publishedBooks().filter((b) => selectedId === null || b.penNameId === selectedId).length;
  if (mode !== "api" || !books.data) return null;
  return books.data.filter((b) => b.status === "published" && (selectedId === null || b.profileId === selectedId)).length;
}

interface SpineProps {
  /** Called after a link is followed (closes the phone drawer). */
  onNavigate?: (() => void) | undefined;
  /** "float" (default) is the glass card beside the screen; "drawer" is the phone menu, more opaque. */
  variant?: "float" | "drawer" | undefined;
  className?: string | undefined;
}

function NavItem({
  screen,
  pathname,
  count,
  countLabel,
  onNavigate,
}: {
  screen: ScreenDef;
  pathname: string;
  count: number | null;
  countLabel: string;
  onNavigate?: (() => void) | undefined;
}) {
  const to = screen.id === "settings" ? "/settings" : screen.path;
  const active = isActive(pathname, screen.path);
  const Icon = navIcons[screen.id] ?? screen.icon;
  return (
    <li>
      <Link
        to={to}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-[42px] w-full items-center gap-3 rounded-control px-3 py-[9px] font-medium transition-colors duration-(--vol-dur-fast) ease-out",
          active ? "bg-btn text-on-btn shadow-nav-active" : "text-ink-2 hover:bg-soft hover:text-ink",
        )}
      >
        <Icon size={18} strokeWidth={1.8} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{screen.title}</span>
        {count !== null && (
          <>
            <span
              aria-hidden
              className={cn(
                "grid h-5 min-w-[22px] place-items-center rounded-pill px-1.5 text-[11px] leading-none font-semibold",
                active ? "bg-nav-count text-current" : "bg-soft text-ink-2 shadow-[inset_0_0_0_1px_var(--vol-edge)]",
              )}
            >
              {count}
            </span>
            <span className="sr-only">
              , {count} {countLabel}
            </span>
          </>
        )}
      </Link>
    </li>
  );
}

/**
 * The side menu card from the approved design (Volume Studio, frost edition): a glass card that floats
 * 16 px from the window edges. The brand, then Library, Published, Volume mode, Profiles, New book,
 * Archive and Settings with their counts, the pen name switcher, and the status box at the foot (what is
 * running, OpenRouter, this month's spend, credit left, Open Volume mode). On phones the same card is
 * the menu drawer. A book's steps live in the step bar above the screen (StepRail), not here.
 */
export function Spine({ onNavigate, variant = "float", className }: SpineProps) {
  const { pathname } = useLocation();
  const libraryCount = useCurrentProfileCount();
  const publishedCount = usePublishedCount();

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "flex h-full w-full flex-col gap-1 overflow-y-auto px-4 pt-[22px] pb-[18px] text-ink",
        variant === "drawer" ? "vol-glass-2 rounded-r-panel shadow-modal" : "vol-glass rounded-panel",
        className,
      )}
    >
      <Link
        to="/library"
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-control px-2 pb-3.5 leading-[1.1]"
        aria-label="Volume, go to Library"
      >
        <BrandMark />
        <span className="text-[19px] font-bold tracking-[-0.02em]">
          Volume
          <small className="block text-[11px] font-medium tracking-normal text-ink-3">Gakinz, London</small>
        </span>
      </Link>

      {variant === "drawer" && <DemoBadge className="mx-2 mb-2 self-start" />}

      <nav aria-label="Main">
        <ul className="grid">
          {globalNav.map((s) => (
            <NavItem
              key={s.id}
              screen={s}
              pathname={pathname}
              onNavigate={onNavigate}
              count={s.id === "library" ? libraryCount : s.id === "published" ? publishedCount : null}
              countLabel={s.id === "published" ? "published" : "books"}
            />
          ))}
        </ul>
      </nav>

      <div className="mt-auto grid gap-3 pt-4">
        <SideStatus onNavigate={onNavigate} />
      </div>
    </aside>
  );
}
