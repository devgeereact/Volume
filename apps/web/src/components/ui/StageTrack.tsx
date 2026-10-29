import { useRef, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { Check } from "lucide-react";
import type { StageId } from "../../demo/types";
import { stageLabels } from "../../demo/books";
import { cn } from "../../lib/cn";

export const trackStages: StageId[] = ["research", "title", "blueprint", "writing", "editing", "cover", "export", "published"];

interface StageTrackProps {
  /** The current stage. Earlier stages are done, later ones upcoming. */
  current: StageId;
  /** A stage with a job running (pen loader in its marker). */
  loading?: StageId | undefined;
  stages?: StageId[] | undefined;
  /** Makes each stage a link. Return undefined to leave a stage as plain text. */
  hrefFor?: ((stage: StageId) => string | undefined) | undefined;
  /** Hide labels except the current one (narrow layouts). */
  compact?: boolean | undefined;
  label?: string | undefined;
  className?: string | undefined;
}

type MarkerState = "done" | "current" | "upcoming" | "loading";

/**
 * Stage track: marker plus label per stage, joined by short rules. Done: ink marker with a check.
 * Current: accent marker with a dot, page-turn entrance, aria-current="step". Upcoming: outlined.
 * Loading (a job runs in that stage): a softly pulsing dot, still with reduced motion. When stages are links, it has one tab stop and the
 * arrow keys, Home and End move between stages.
 */
export function StageTrack({ current, loading, stages = trackStages, hrefFor, compact = false, label = "Book stages", className }: StageTrackProps) {
  const refs = useRef<(HTMLAnchorElement | null)[]>([]);
  const currentIdx = Math.max(0, stages.indexOf(current));
  const interactive = Boolean(hrefFor);

  function state(i: number, s: StageId): MarkerState {
    if (s === loading && s !== current) return "loading";
    if ((current === "published" && s !== "published") || i < currentIdx) return "done";
    if (i === currentIdx) return "current";
    return "upcoming";
  }

  function onKey(e: KeyboardEvent<HTMLOListElement>) {
    if (!interactive) return;
    const focused = refs.current.findIndex((r) => r === document.activeElement);
    if (focused < 0) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(stages.length - 1, focused + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, focused - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = stages.length - 1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
  }

  return (
    <ol aria-label={label} onKeyDown={onKey} className={cn("relative flex items-center overflow-x-auto", className)}>
      {stages.map((s, i) => {
        const st = state(i, s);
        const prevDone = i > 0 && state(i - 1, stages[i - 1] ?? s) === "done";
        const showLabel = !compact || st === "current";
        const spoken = `${stageLabels[s]}, ${st === "done" ? "done" : st === "current" ? (s === loading ? "current stage, running" : "current stage") : st === "loading" ? "running" : "not started"}`;
        const href = hrefFor?.(s);
        const inner = (
          <>
            <span
              aria-hidden
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px]",
                st === "done" && "border-ink bg-ink text-sheet",
                st === "current" && "origin-left animate-page-turn border-accent bg-accent",
                (st === "upcoming" || st === "loading") && "border-border-strong",
                st === "loading" && "text-ink-secondary",
              )}
            >
              {st === "done" && <Check size={12} strokeWidth={2.5} />}
              {st === "current" && <span className={cn("size-1.5 rounded-full bg-on-accent", s === loading && "vol-nib")} />}
              {st === "loading" && <span className="vol-nib size-1.5 rounded-full bg-accent-text" />}
            </span>
            <span className={cn(!showLabel && "sr-only")}>{stageLabels[s]}</span>
          </>
        );
        return (
          <li
            key={s}
            aria-current={st === "current" ? "step" : undefined}
            className={cn(
              "flex shrink-0 items-center text-[13px] leading-none font-medium whitespace-nowrap",
              st === "done" && "text-ink-secondary",
              st === "current" && "font-semibold text-ink",
              (st === "upcoming" || st === "loading") && "text-ink-tertiary",
            )}
          >
            {i > 0 && <span aria-hidden className={cn("mx-2 h-px w-3.5", prevDone ? "bg-ink" : "bg-border-strong")} />}
            {href ? (
              <Link
                ref={(el) => {
                  refs.current[i] = el;
                }}
                to={href}
                aria-label={spoken}
                tabIndex={i === currentIdx ? 0 : -1}
                className="inline-flex min-h-11 items-center gap-2 rounded-sm px-1 hover:text-ink"
              >
                {inner}
              </Link>
            ) : (
              <span className="inline-flex min-h-8 items-center gap-2" aria-label={spoken}>
                {inner}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
