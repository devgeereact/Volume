import type { Ref } from "react";
import { Link } from "react-router";
import { Menu, Plus, Search } from "lucide-react";
import { AccountButton } from "../auth/AccountButton";
import { IconButton } from "../components/ui/IconButton";
import { Kbd, modKey } from "../components/ui/Kbd";
import { Tooltip } from "../components/ui/Tooltip";
import { useCanWrite } from "../lib/access";
import { useCommandPalette } from "../lib/commandPalette";
import { Breadcrumbs } from "./Breadcrumbs";
import { DemoBadge } from "./DemoBadge";
import { ThemeToggle } from "./ThemeToggle";

interface TopBarProps {
  /** Phone: shows the menu button that opens the nav drawer. */
  phone: boolean;
  onOpenMenu: () => void;
  menuButtonRef?: Ref<HTMLButtonElement> | undefined;
}

/**
 * Glass bar above every screen: where you are and the page name on the left; search (command menu),
 * demo badge, theme, New book (not on phones, where the menu has it) and, when hosted, the account menu.
 */
export function TopBar({ phone, onOpenMenu, menuButtonRef }: TopBarProps) {
  const { setOpen } = useCommandPalette();
  const canWrite = useCanWrite();
  const mod = modKey();
  return (
    <header className="vol-glass-bar sticky top-0 z-30 flex h-(--shell-topbar) items-center gap-3 border-b border-glass-line px-4 sm:px-6 lg:px-8">
      {phone && <IconButton ref={menuButtonRef} icon={Menu} label="Open menu" variant="glass" onClick={onOpenMenu} />}
      <Breadcrumbs />
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
        {phone ? (
          <IconButton icon={Search} label="Search and commands" variant="glass" shortcut={[mod, "K"]} onClick={() => setOpen(true)} />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Search and commands"
            aria-keyshortcuts="Meta+K Control+K"
            className="flex h-11 w-[180px] items-center gap-2 rounded-control border border-glass-edge bg-glass-strong px-3 text-left text-body text-ink-tertiary shadow-glass-sm hover:text-ink-secondary lg:w-[280px]"
          >
            <Search size={16} aria-hidden />
            <span className="flex-1 truncate">Search</span>
            <Kbd keys={[mod === "⌘" ? "⌘K" : "Ctrl K"]} />
          </button>
        )}
        <DemoBadge />
        <ThemeToggle />
        {canWrite && (
          <Tooltip content="New book" className="inline-flex max-sm:hidden">
            <Link
              to="/books/new"
              aria-label="New book"
              className="inline-grid size-11 shrink-0 place-items-center rounded-control border border-glass-edge bg-glass-strong text-ink-secondary shadow-glass-sm transition-transform duration-(--vol-dur-fast) ease-out hover:bg-glass-drawer hover:text-ink active:translate-y-px"
            >
              <Plus size={18} aria-hidden />
            </Link>
          </Tooltip>
        )}
        <AccountButton />
      </div>
    </header>
  );
}
