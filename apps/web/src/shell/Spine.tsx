import { Link, useLocation } from "react-router";
import { Check, CircleAlert } from "lucide-react";
import { usePenNames, useApiSettings, useWireMode } from "../api/wire-a";
import type { Book } from "../data/types";
import { penNames } from "../data/penNames";
import { workspace } from "../data/workspace";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Tooltip } from "../components/ui/Tooltip";
import { cn } from "../lib/cn";
import { formatUsd } from "../lib/format";
import { usePenNameFilter } from "../lib/penName";
import { globalNav } from "../screens";
import { Avatar, PenNameSwitcher } from "./PenNameSwitcher";

/** The Volume mark: a book with a gilt bookmark. */
export function BrandMark({ className }: { className?: string | undefined }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6 shrink-0", className)} aria-hidden>
      <rect x="4" y="2.5" width="16" height="19" rx="2" fill="currentColor" opacity=".18" />
      <rect x="4" y="2.5" width="16" height="19" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 2.5v19" stroke="currentColor" strokeWidth="1.75" />
      <rect x="11" y="7" width="6" height="2.2" rx="1" fill="var(--vol-accent)" />
    </svg>
  );
}

function isActive(pathname: string, path: string): boolean {
  if (path === "/") return pathname === "/" || pathname === "/library" || (pathname.startsWith("/books/") && pathname !== "/books/new");
  if (path === "/published") return pathname === "/published";
  if (path === "/books/new") return pathname === "/books/new";
  if (path.startsWith("/settings")) return pathname.startsWith("/settings");
  if (path.startsWith("/profiles")) return pathname.startsWith("/profiles");
  return pathname === path || pathname.startsWith(`${path}/`);
}

interface SpineProps {
  collapsed: boolean;
  book?: Book | undefined;
  /** Called after a link is followed (closes the phone drawer). */
  onNavigate?: (() => void) | undefined;
  className?: string | undefined;
}

/**
 * The left nav, the navy cloth spine with a gilt edge (D-016): Library, Published, Profiles, New book,
 * Archive, Settings. Wide (240 px): brand, pen name switcher, nav, and the OpenRouter status with this
 * month's spend. Collapsed (64 px, inside a book and on tablets): icons with tooltips and the pen name
 * avatar. A book's steps live in the step bar above the screen (BookSteps), not here.
 */
export function Spine({ collapsed, book, onNavigate, className }: SpineProps) {
  const { pathname } = useLocation();
  const { selectedId } = usePenNameFilter();
  const mode = useWireMode();
  const pens = usePenNames(mode, penNames);
  const bookPen = book ? pens.get(book.penNameId) : undefined;
  const selectedPen = selectedId ? pens.get(selectedId) : undefined;
  const avatarPen = bookPen ?? selectedPen;
  const nav = globalNav;

  return (
    <nav
      aria-label="Main"
      className={cn(
        "relative flex h-full flex-col overflow-y-auto bg-spine text-ink-on-spine",
        collapsed ? "w-(--vol-nav-collapsed) items-center px-2.5 pt-5 pb-5" : "w-(--vol-nav) px-4 pt-6 pb-5",
        "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-accent after:opacity-55",
        className,
      )}
    >
      <Link
        to="/"
        onClick={onNavigate}
        className={cn("flex items-center gap-2.5 rounded-sm text-ink-on-spine", collapsed ? "mb-5 justify-center p-1" : "mb-6 px-2")}
        aria-label="Volume, go to Library"
      >
        <BrandMark />
        {!collapsed && <span className="font-book text-[23px] leading-none font-medium tracking-[-0.015em]">Volume</span>}
      </Link>

      {!collapsed && <PenNameSwitcher />}

      <ul className={cn("grid gap-0.5", collapsed ? "mt-1" : "mt-5")}>
        {nav.map((s) => {
          const to = s.id === "settings" ? "/settings" : s.path;
          const active = isActive(pathname, s.path);
          const Icon = s.icon;
          const link = (
            <Link
              to={to}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? s.title : undefined}
              className={cn(
                "relative flex min-h-11 items-center gap-3 rounded-sm text-[14.5px] leading-none font-medium",
                collapsed ? "w-11 justify-center" : "px-3",
                active ? "bg-spine-raised text-ink-on-spine" : "text-ink-on-spine-muted hover:bg-spine-raised/60 hover:text-ink-on-spine",
              )}
            >
              {active && (
                <span aria-hidden className={cn("absolute top-2.5 bottom-2.5 w-[3px] rounded-r-[3px] bg-accent", collapsed ? "-left-2.5" : "-left-4")} />
              )}
              <Icon size={18} className={active ? "text-accent" : undefined} aria-hidden />
              {!collapsed && s.title}
            </Link>
          );
          return (
            <li key={s.id}>
              {collapsed ? (
                <Tooltip content={s.title} side="right">
                  {link}
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>

      {collapsed ? (
        <div className="mt-auto pt-4">
          <Tooltip content={avatarPen ? `Profile: ${avatarPen.name}` : "All profiles"} side="right">
            <Link
              to={avatarPen ? `/profiles/${avatarPen.id}` : "/profiles"}
              onClick={onNavigate}
              aria-label={avatarPen ? `Profile: ${avatarPen.name}` : "All profiles"}
              className="grid size-11 place-items-center rounded-full"
            >
              <Avatar initials={avatarPen?.initials ?? "All"} />
            </Link>
          </Tooltip>
        </div>
      ) : (
        <SpineStatus mode={mode} />
      )}
    </nav>
  );
}

/** Foot of the wide spine: OpenRouter key status and this month's AI spend. */
function SpineStatus({ mode }: { mode: ReturnType<typeof useWireMode> }) {
  const settings = useApiSettings(mode === "api");
  const box = "mt-auto border-t border-spine-raised px-2 pt-4 text-[13px] leading-5 text-ink-on-spine-muted";
  if (mode === "mock") {
    const spend = workspace.spend;
    return (
      <div className={box}>
        <p className="mb-1.5 flex items-center gap-2">
          <Check size={14} strokeWidth={2} aria-hidden />
          {workspace.openRouter.connected ? "OpenRouter connected" : "OpenRouter not connected"}
        </p>
        <p>
          {spend.monthLabel} spend <b className="num font-semibold text-ink-on-spine">{formatUsd(spend.spentUsd)}</b> of{" "}
          {formatUsd(spend.budgetUsd).replace(".00", "")}
        </p>
        <ProgressBar
          className="mt-2"
          size="thin"
          tone="spine"
          value={spend.spentUsd}
          max={spend.budgetUsd}
          label={`${spend.monthLabel} AI spend`}
          valueText={`${formatUsd(spend.spentUsd)} of ${formatUsd(spend.budgetUsd)}`}
        />
      </div>
    );
  }
  if (mode === "checking" || settings.isPending)
    return (
      <div className={box}>
        <p>Connecting to Volume</p>
      </div>
    );
  if (settings.isError)
    return (
      <div className={box}>
        <p className="flex items-center gap-2">
          <CircleAlert size={14} strokeWidth={2} aria-hidden />
          Settings did not load
        </p>
      </div>
    );
  const s = settings.data;
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date());
  const spent = s.budgets.monthSpendUsd;
  const cap = s.budgets.monthlyCapUsd;
  return (
    <div className={box}>
      <Link to="/settings" className="mb-1.5 flex items-center gap-2 rounded-xs hover:text-ink-on-spine">
        {s.openRouterKey.present ? <Check size={14} strokeWidth={2} aria-hidden /> : <CircleAlert size={14} strokeWidth={2} aria-hidden />}
        {s.openRouterKey.present ? "OpenRouter key set" : "No OpenRouter key"}
      </Link>
      <p>
        {month} spend <b className="num font-semibold text-ink-on-spine">{formatUsd(spent)}</b>
        {cap !== null ? ` of ${formatUsd(cap).replace(".00", "")}` : ", no cap"}
      </p>
      {cap !== null && cap > 0 && (
        <ProgressBar
          className="mt-2"
          size="thin"
          tone="spine"
          value={Math.min(spent, cap)}
          max={cap}
          label={`${month} AI spend`}
          valueText={`${formatUsd(spent)} of ${formatUsd(cap)}`}
        />
      )}
    </div>
  );
}
