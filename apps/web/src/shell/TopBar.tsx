import type { Ref } from "react";
import { Menu, Search } from "lucide-react";
import { IconButton } from "../components/ui/IconButton";
import { Kbd, modKey } from "../components/ui/Kbd";
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

/** Slim bar above every screen: where you are, search (command menu), demo badge and theme. */
export function TopBar({ phone, onOpenMenu, menuButtonRef }: TopBarProps) {
  const { setOpen } = useCommandPalette();
  const mod = modKey();
  return (
    <header className="sticky top-0 z-30 flex h-(--shell-topbar) items-center gap-3 border-b border-border bg-canvas px-4 sm:px-6 lg:px-10">
      {phone && <IconButton ref={menuButtonRef} icon={Menu} label="Open menu" onClick={onOpenMenu} className="-ml-2" />}
      <Breadcrumbs />
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        {phone ? (
          <IconButton icon={Search} label="Search and commands" shortcut={[mod, "K"]} onClick={() => setOpen(true)} />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Search and commands"
            aria-keyshortcuts="Meta+K Control+K"
            className="flex h-10 w-[180px] items-center gap-2 rounded-sm border border-border-strong bg-sheet px-3 text-left text-body text-ink-tertiary hover:bg-sunken lg:w-[280px]"
          >
            <Search size={16} aria-hidden />
            <span className="flex-1 truncate">Search</span>
            <Kbd keys={[mod === "⌘" ? "⌘K" : "Ctrl K"]} />
          </button>
        )}
        <DemoBadge />
        <ThemeToggle compact={phone} />
      </div>
    </header>
  );
}
