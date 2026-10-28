import { Link, useLocation } from "react-router";
import { Check, CircleAlert, Zap } from "lucide-react";
import { JOB_LABELS, stepForJob, usePenNames, useApiSettings, useRunningJobs, useWireMode } from "../api/wire-a";
import { getBook } from "../demo/books";
import type { Book } from "../demo/types";
import { penNames } from "../demo/penNames";
import { workspace } from "../demo/workspace";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Tooltip } from "../components/ui/Tooltip";
import { cn } from "../lib/cn";
import { formatUsd } from "../lib/format";
import { useWritingJob } from "../lib/job";
import { usePenNameFilter } from "../lib/penName";
import { bookStepPath, globalNav } from "../screens";
import { Avatar, PenNameSwitcher, useCurrentProfileCount } from "./PenNameSwitcher";

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
  if (path === "/library") return pathname === "/library" || (pathname.startsWith("/books/") && pathname !== "/books/new");
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
  /** "float" (default) is the frosted panel beside the screen; "drawer" is the phone menu, more opaque. */
  variant?: "float" | "drawer" | undefined;
  className?: string | undefined;
}

/**
 * The left nav (studio redesign, stage 1): a frosted panel that floats 16 px from the window edges,
 * with Library, Published, Profiles, New book, Archive and Settings. Wide (240 px): brand, pen name
 * switcher, nav with the Library count, and a foot card with the job that is writing now, the OpenRouter
 * status and this month's spend. Collapsed (64 px, inside a book and on tablets): icons with tooltips
 * and the pen name avatar. A book's steps live in the step bar above the screen (BookSteps), not here.
 */
export function Spine({ collapsed, book, onNavigate, variant = "float", className }: SpineProps) {
  const { pathname } = useLocation();
  const { selectedId } = usePenNameFilter();
  const mode = useWireMode();
  const pens = usePenNames(mode, penNames);
  const bookPen = book ? pens.get(book.penNameId) : undefined;
  const selectedPen = selectedId ? pens.get(selectedId) : undefined;
  const avatarPen = bookPen ?? selectedPen;
  const nav = globalNav;
  const libraryCount = useCurrentProfileCount();

  return (
    <nav
      aria-label="Main"
      className={cn(
        "relative flex h-full flex-col overflow-y-auto text-ink",
        variant === "drawer" ? "vol-glass-drawer rounded-r-panel border-r border-glass-edge shadow-modal" : "vol-glass rounded-panel",
        collapsed ? "w-(--vol-nav-collapsed) items-center px-2.5 pt-4 pb-4" : "w-(--vol-nav) px-3 pt-5 pb-3",
        className,
      )}
    >
      <Link
        to="/library"
        onClick={onNavigate}
        className={cn("flex items-center gap-2.5 rounded-control text-ink", collapsed ? "mb-4 justify-center" : "mb-5 px-2")}
        aria-label="Volume, go to Library"
      >
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-control bg-nav-active text-on-nav-active shadow-glass-sm">
          <BrandMark className="size-5" />
        </span>
        {!collapsed && <span className="font-book text-[23px] leading-none font-medium tracking-[-0.015em]">Volume</span>}
      </Link>

      {!collapsed && <PenNameSwitcher />}

      <ul className={cn("grid gap-1", collapsed ? "mt-1" : "mt-4")}>
        {nav.map((s) => {
          const to = s.id === "settings" ? "/settings" : s.path;
          const active = isActive(pathname, s.path);
          const Icon = s.icon;
          const count = s.id === "library" ? libraryCount : null;
          const link = (
            <Link
              to={to}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? s.title : undefined}
              className={cn(
                "relative flex min-h-11 items-center gap-3 rounded-control text-[14.5px] leading-none font-medium transition-colors duration-(--vol-dur-fast) ease-out",
                collapsed ? "w-11 justify-center" : "px-3",
                active ? "bg-nav-active text-on-nav-active shadow-nav-active" : "text-ink-secondary hover:bg-glass-soft hover:text-ink",
              )}
            >
              <Icon size={18} aria-hidden />
              {!collapsed && <span className="min-w-0 flex-1 truncate">{s.title}</span>}
              {!collapsed && count !== null && (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      "num grid h-5 min-w-6 place-items-center rounded-pill px-1.5 text-caption",
                      active ? "bg-nav-count" : "bg-glass-soft text-ink-secondary ring-1 ring-glass-edge",
                    )}
                  >
                    {count}
                  </span>
                  <span className="sr-only">
                    , {count} {count === 1 ? "book" : "books"}
                  </span>
                </>
              )}
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
        <SpineStatus mode={mode} onNavigate={onNavigate} />
      )}
    </nav>
  );
}

/** The job writing now, for the foot card: the demo job in demo mode, the first running server job otherwise. */
function useWritingNow(mode: ReturnType<typeof useWireMode>): { title: string; detail: string; to: string } | null {
  const demo = useWritingJob();
  const jobs = useRunningJobs(mode === "api");
  if (mode === "mock" && demo.running) {
    const { job } = demo;
    const chapters = job.sections.filter((x) => x.number !== null).length;
    const title = getBook(job.bookId)?.title ?? job.label;
    return { title: "Writing now", detail: `${title}, chapter ${job.current.chapterNumber} of ${chapters}`, to: bookStepPath(job.bookId, "writing") };
  }
  if (mode !== "api") return null;
  const live = jobs.find((j) => j.status !== "failed");
  if (!live) return null;
  return { title: `${JOB_LABELS[live.kind] ?? "Working"} now`, detail: live.bookTitle, to: bookStepPath(live.bookId, stepForJob(live.kind)) };
}

/** Top of the foot card while a job runs: what is being written, linked to its screen. */
function WritingNow({ mode, onNavigate }: { mode: ReturnType<typeof useWireMode>; onNavigate?: (() => void) | undefined }) {
  const now = useWritingNow(mode);
  if (!now) return null;
  return (
    <Link to={now.to} onClick={onNavigate} className="-mx-1 mb-2 grid gap-0.5 rounded-sm px-1 py-0.5 hover:bg-glass-soft">
      <b className="flex items-center gap-1.5 text-label font-semibold text-ink">
        <Zap size={15} aria-hidden className="text-accent-text" />
        {now.title}
      </b>
      <span className="truncate text-ink-secondary">{now.detail}</span>
    </Link>
  );
}

/** Foot card of the wide spine: the job writing now, OpenRouter key status and this month's AI spend. */
function SpineStatus({ mode, onNavigate }: { mode: ReturnType<typeof useWireMode>; onNavigate?: (() => void) | undefined }) {
  const settings = useApiSettings(mode === "api");
  const box = "mt-auto rounded-card border border-glass-edge bg-glass-soft p-3.5 text-[13px] leading-5 text-ink-secondary";
  const writing = <WritingNow mode={mode} onNavigate={onNavigate} />;
  if (mode === "mock") {
    const spend = workspace.spend;
    return (
      <div className={box}>
        {writing}
        <p className="mb-1.5 flex items-center gap-2">
          <Check size={14} strokeWidth={2} aria-hidden className="text-success" />
          {workspace.openRouter.connected ? "OpenRouter connected" : "OpenRouter not connected"}
        </p>
        <p>
          {spend.monthLabel} spend <b className="num font-semibold text-ink">{formatUsd(spend.spentUsd)}</b> of {formatUsd(spend.budgetUsd).replace(".00", "")}
        </p>
        <ProgressBar
          className="mt-2"
          size="thin"
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
        {writing}
        <p>Connecting to Volume</p>
      </div>
    );
  if (settings.isError)
    return (
      <div className={box}>
        {writing}
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
      {writing}
      <Link to="/settings" className="mb-1.5 flex items-center gap-2 rounded-xs hover:text-ink">
        {s.openRouterKey.present ? (
          <Check size={14} strokeWidth={2} aria-hidden className="text-success" />
        ) : (
          <CircleAlert size={14} strokeWidth={2} aria-hidden />
        )}
        {s.openRouterKey.present ? "OpenRouter key set" : "No OpenRouter key"}
      </Link>
      <p>
        {month} spend <b className="num font-semibold text-ink">{formatUsd(spent)}</b>
        {cap !== null ? ` of ${formatUsd(cap).replace(".00", "")}` : ", no cap"}
      </p>
      {cap !== null && cap > 0 && (
        <ProgressBar
          className="mt-2"
          size="thin"
          value={Math.min(spent, cap)}
          max={cap}
          label={`${month} AI spend`}
          valueText={`${formatUsd(spent)} of ${formatUsd(cap)}`}
        />
      )}
    </div>
  );
}
