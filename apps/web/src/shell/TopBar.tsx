import type { ReactNode, Ref } from "react";
import { Link, useLocation } from "react-router";
import { ChevronLeft, Menu, Plus, Search } from "lucide-react";
import { AccountButton, useHostedName } from "../auth/AccountButton";
import { hostedSignIn } from "../auth/HostedAuth";
import { roleLabels, useVolumeMe } from "../api/wire-d";
import { useWireMode } from "../api/wire-a";
import { demoMembers } from "../demo/volume";
import { Tooltip } from "../components/ui/Tooltip";
import { useCanWrite } from "../lib/access";
import { cn } from "../lib/cn";
import { useCommandPalette } from "../lib/commandPalette";
import { Breadcrumbs } from "./Breadcrumbs";
import { DemoBadge } from "./DemoBadge";
import { useJobNeedsYou } from "./JobBar";
import { ThemeToggle } from "./ThemeToggle";

interface TopBarProps {
  /** Phone: shows the menu button that opens the nav drawer. */
  phone: boolean;
  onOpenMenu: () => void;
  menuButtonRef?: Ref<HTMLButtonElement> | undefined;
}

/** A 42 px square control on the top bar (approved design, .top .icon-btn). */
export const topControl =
  "inline-grid size-[42px] shrink-0 place-items-center rounded-control border border-edge bg-panel-2 text-ink-2 shadow-control transition-colors duration-(--vol-dur-fast) ease-out hover:text-ink active:scale-[.98]";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

function Who({ name, role, avatar, hideOnPhone }: { name: string | null; role: string; avatar: ReactNode; hideOnPhone: boolean }) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2.5 pl-1.5", hideOnPhone && "max-[560px]:hidden")}>
      {avatar}
      <span className="max-[1024px]:hidden">
        {name && <b className="block text-[13px] leading-[1.2] font-bold text-ink">{name}</b>}
        <small className="block text-caption font-normal text-ink-3">{role}</small>
      </span>
    </div>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <i aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-avatar text-[12px] font-bold text-on-avatar not-italic">
      {initials}
    </i>
  );
}

/** Hosted sign-in: Clerk's account menu as the avatar, with the person's name and role. */
function HostedUser() {
  const me = useVolumeMe();
  const name = useHostedName();
  return <Who name={name} role={me.state === "ready" ? roleLabels[me.role] : ""} avatar={<AccountButton />} hideOnPhone={false} />;
}

/** No hosted sign-in: the demo owner in demo mode, the role alone on a local server. */
function LocalUser() {
  const me = useVolumeMe();
  const mode = useWireMode();
  if (me.state !== "ready") return null;
  const name = mode === "mock" ? (demoMembers().find((m) => m.isYou)?.displayName ?? null) : null;
  return <Who name={name} role={roleLabels[me.role]} avatar={<Avatar initials={name ? initialsOf(name) : roleLabels[me.role].slice(0, 1)} />} hideOnPhone />;
}

/** Inside a book, the back button goes to the Library (the step bar has the step before). */
function BackButton() {
  const { pathname } = useLocation();
  const inBook = pathname.startsWith("/books/") && pathname !== "/books/new";
  if (!inBook) return null;
  return (
    <Tooltip content="Back to the Library" side="bottom">
      <Link to="/library" aria-label="Back to the Library" className={cn(topControl, "size-[34px] rounded-[10px]")}>
        <ChevronLeft size={18} strokeWidth={1.8} aria-hidden />
      </Link>
    </Tooltip>
  );
}

/**
 * The top bar from the approved design: the menu button on phones, the back button inside a book, the
 * breadcrumb and page title, then search (the command menu, Ctrl K), the Demo data chip, the theme
 * switch, New book and the signed-in person with their role.
 */
export function TopBar({ phone, onOpenMenu, menuButtonRef }: TopBarProps) {
  const { setOpen } = useCommandPalette();
  const canWrite = useCanWrite();
  const jobNeedsYou = useJobNeedsYou();
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return (
    <header className="vol-glass-bar sticky top-0 z-30 flex min-h-(--shell-topbar) items-center gap-2 px-4 pt-[18px] pb-3.5 min-[861px]:gap-2.5 min-[861px]:px-6">
      {phone && (
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onOpenMenu}
          aria-label={jobNeedsYou ? "Open menu, a job needs you" : "Open menu"}
          className={cn(topControl, "relative")}
        >
          <Menu size={18} strokeWidth={1.8} aria-hidden />
          {jobNeedsYou && <span aria-hidden className="absolute top-[9px] right-2.5 size-2 rounded-full border-2 border-panel-2-solid bg-red" />}
        </button>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <BackButton />
        <Breadcrumbs />
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search books, profiles and screens"
        aria-keyshortcuts="Meta+K Control+K"
        className={cn(
          topControl,
          "min-[1025px]:flex min-[1025px]:w-[min(320px,28vw)] min-[1025px]:items-center min-[1025px]:gap-2 min-[1025px]:px-3 min-[1025px]:text-left min-[1025px]:text-ink-3 min-[1025px]:hover:text-ink-2",
        )}
      >
        <Search size={18} strokeWidth={1.8} aria-hidden className="shrink-0" />
        <span className="hidden flex-1 truncate min-[1025px]:inline">Search books and screens</span>
        <kbd className="hidden rounded-xs border border-line bg-soft px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink-3 min-[1025px]:inline">
          {mac ? "⌘ K" : "Ctrl K"}
        </kbd>
      </button>
      {/* On phones the chip moves into the menu, as in the approved design; the title keeps its room. */}
      <DemoBadge className="max-[860px]:hidden" />
      {!phone && <ThemeToggle />}
      {canWrite && (
        <Tooltip content="New book" className="inline-flex">
          <Link to="/books/new" aria-label="New book" className={topControl}>
            <Plus size={18} strokeWidth={1.8} aria-hidden />
          </Link>
        </Tooltip>
      )}
      {hostedSignIn ? <HostedUser /> : <LocalUser />}
    </header>
  );
}
