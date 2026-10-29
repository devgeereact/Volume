import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Globe,
  Image,
  Layers,
  Megaphone,
  NotebookPen,
  Package,
  PenLine,
  Tablet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button, Card, chipClasses, ChipDot, Skeleton } from "../../components/ui";
import type { WireMode } from "../../api/wire-a";
import type { Book, BookStepId } from "../../demo/types";
import { cn } from "../../lib/cn";
import { bookStepPath } from "../../screens";
import { formatLabels, sameDay, windowDays, windowRange } from "../volume-mode/model";
import { useToday, useVolumeSchedule } from "../volume-mode/useVolume";

/**
 * The Covers view's side column. From 1201 px it sits beside the books and stays in view while the page scrolls: CSS
 * sticky under the top bar, never taller than the window, with its own scroll and a fade at the bottom edge while
 * more of it is below. Narrower, it stacks under the books and scrolls with the page.
 */
export function LibrarySide({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const below = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
    setMore((was) => (was === below ? was : below));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // The column's content grows (Today fills in) and the window changes height: both change whether it overflows.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure]);
  return (
    <aside
      ref={ref}
      aria-label="Library overview"
      data-lib-side
      onScroll={measure}
      className={cn(
        "grid min-w-0 content-start gap-4 min-[1201px]:sticky-side",
        // The fade marks that the column scrolls; it never applies on narrow screens, where the column is not a scroller.
        more && "min-[1201px]:mask-b-from-90%",
      )}
    >
      {children}
    </aside>
  );
}

/** Card head from the approved design (.card-h): the title, then a chip or link on the right. */
function CardHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
      <h2 id={id} className="text-[15px] font-semibold text-ink">
        {title}
      </h2>
      {children}
    </div>
  );
}

const stepIcons: Record<BookStepId, LucideIcon> = {
  research: Globe,
  titles: PenLine,
  blueprint: Layers,
  writing: Zap,
  editor: NotebookPen,
  cover: Image,
  marketing: Megaphone,
  export: Package,
};

/**
 * Needs you: every book on show with a step waiting for the owner, each a link to that step. The line under the title
 * is the book's own status line. The server does not report these yet (adapters.ts sends no attention steps), so with
 * the server running the list says nothing is waiting rather than guessing.
 */
export function NeedsYou({ books, api }: { books: readonly Book[]; api: boolean }) {
  const waiting = books.filter((b) => b.attentionSteps.length > 0);
  return (
    <Card as="section" aria-labelledby="needs-you-heading">
      <CardHead id="needs-you-heading" title="Needs you">
        {waiting.length > 0 && (
          <span className={chipClasses("warn")}>
            <ChipDot />
            {waiting.length}
            <span className="sr-only"> {waiting.length === 1 ? "book" : "books"}</span>
          </span>
        )}
      </CardHead>
      {waiting.length === 0 ? (
        <p className="text-small text-ink-2">
          {api ? "Nothing is flagged for you. Each book's steps show what is left to do." : "Nothing is waiting for you."}
        </p>
      ) : (
        <ul className="grid gap-0.5">
          {waiting.map((b) => {
            const step = b.attentionSteps[0] ?? "research";
            const Icon = stepIcons[step];
            return (
              <li key={b.id}>
                <Link
                  to={bookStepPath(b.id, step)}
                  className="flex w-full items-center gap-3 rounded-md p-2.5 text-left transition-colors duration-(--vol-dur-fast) hover:bg-soft"
                >
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-amber-wash text-amber">
                    <Icon size={17} strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[13px] leading-[1.3] font-semibold text-ink">{b.title}</b>
                    <small className="block truncate text-caption text-ink-3">{b.statusLine}</small>
                  </span>
                  <ChevronRight size={16} strokeWidth={1.8} aria-hidden className="shrink-0 text-ink-3" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Releases, next 7 days: a week strip from today with a dot on each day that has a planned title, then one row per
 * planned release (book, format, day, Confirmed or Planned). It reads the same schedule as Volume mode: the server's
 * GET /schedule, or the demo's planned releases.
 */
export function Releases({ mode }: { mode: WireMode }) {
  const today = useToday(mode);
  const range = useMemo(() => windowRange(today), [today]);
  const days = useMemo(() => windowDays(today), [today]);
  const schedule = useVolumeSchedule(mode, range);
  const slots = useMemo(() => [...schedule.slots].sort((a, b) => a.plannedAt - b.plannedAt), [schedule.slots]);
  return (
    <Card as="section" aria-labelledby="releases-heading">
      <CardHead id="releases-heading" title="Releases, next 7 days">
        <Link to="/volume/schedule" className="hit-44 inline-flex items-center gap-1 rounded-xs text-[13px] font-semibold text-mint-ink hover:underline">
          Schedule
          <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden />
        </Link>
      </CardHead>
      {schedule.state === "loading" ? (
        <div role="status" aria-label="Loading releases" className="grid gap-2">
          <Skeleton variant="block" className="h-14 rounded-md" />
          <Skeleton className="w-3/4" />
        </div>
      ) : schedule.state === "error" ? (
        <div className="grid justify-items-start gap-2 text-small text-ink-2">
          <p>{schedule.error ?? "The schedule did not load."}</p>
          <Button size="sm" onClick={schedule.retry}>
            Retry
          </Button>
        </div>
      ) : (
        <>
          <ol aria-label="The next 7 days" className="mb-1 grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const n = slots.filter((s) => sameDay(s.plannedAt, d)).length;
              const isToday = i === 0;
              return (
                <li
                  key={d}
                  aria-current={isToday ? "date" : undefined}
                  className={cn("grid justify-items-center gap-0.5 rounded-md py-2 text-caption", isToday ? "bg-btn text-on-btn" : "text-ink")}
                >
                  <small className={cn("text-[11px]", isToday ? "opacity-80" : "text-ink-3")}>{dayFmt.format(d)}</small>
                  <b className="num text-[14px] font-bold">{dateFmt.format(d)}</b>
                  <i aria-hidden className={cn("size-1.5 rounded-full", n > 0 && (isToday ? "bg-on-btn" : "bg-mint"))} />
                  {n > 0 && (
                    <span className="sr-only">
                      {n} {n === 1 ? "release" : "releases"}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {slots.length === 0 ? (
            <p className="mt-2 text-small text-ink-2">Nothing planned these 7 days.</p>
          ) : (
            <ul className="grid gap-1.5">
              {slots.map((s) => {
                const confirmed = s.status === "confirmed";
                const Icon = s.format === "ebook" ? Tablet : BookOpen;
                return (
                  <li key={s.id}>
                    <Link
                      to={bookStepPath(s.bookId, "export")}
                      className="mt-1.5 flex items-center gap-2.5 rounded-md bg-soft px-3 py-2.5 transition-colors duration-(--vol-dur-fast) hover:bg-panel-2"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-[11px]",
                          confirmed ? "bg-good-wash text-good" : "bg-blue-wash text-blue",
                        )}
                      >
                        <Icon size={17} strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-[13px] font-semibold text-ink">{s.book.title ?? "Untitled book"}</b>
                        <small className="block truncate text-caption text-ink-3">
                          {formatLabels[s.format]}, {longFmt.format(s.plannedAt)}
                        </small>
                      </span>
                      <span className={chipClasses(confirmed ? "good" : "info")}>{confirmed ? "Confirmed" : "Planned"}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
