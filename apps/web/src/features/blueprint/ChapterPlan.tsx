import { useRef, useState, type ReactNode } from "react";
import { Check, History } from "lucide-react";
import { Button, Modal, StatusChip } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";

/* Blueprint overview pieces (studio redesign stage 4b): counts over the plan, the chapter plan (a list
   with word-target bars and a panel for the chosen chapter) and the version chip with its history.
   Every figure comes from the blueprint on screen; nothing is estimated here. */

/** A row of figures over the plan. Each value is counted from the blueprint that is open. */
export function PlanCounts({ items, className }: { items: { label: string; value: string | number }[]; className?: string | undefined }) {
  return (
    <dl
      aria-label="Blueprint in numbers"
      className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4", className)}
    >
      {items.map((it) => (
        <div key={it.label} className="grid content-start gap-0.5 bg-sheet px-4 py-3">
          <dt className="order-2 text-small text-ink-secondary">{it.label}</dt>
          <dd className="num order-1 font-book text-heading text-ink">{typeof it.value === "number" ? formatNumber(it.value) : it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface PlanChapter {
  /** The key the page uses for this chapter (a part id or "chapter:N"). */
  key: string;
  number: number;
  title: string;
  wordTarget: number;
  /** What the chapter is for: the blueprint's chapter summary. */
  purpose: string;
  /** The chapter's subheadings, in order. */
  sections: string[];
}

interface ChapterPlanProps {
  chapters: PlanChapter[];
  /** The chapter shown in the panel. Falls back to the first chapter. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Scrolls to the chapter in the full plan below. */
  onShow: (key: string) => void;
  /** Extra buttons in the panel, for example Edit chapter. */
  panelActions?: ((chapter: PlanChapter) => ReactNode) | undefined;
  className?: string | undefined;
}

/** The chapter list with word-target bars, and the panel for the chosen chapter. */
export function ChapterPlan({ chapters, selectedKey, onSelect, onShow, panelActions, className }: ChapterPlanProps) {
  const chosen = chapters.find((c) => c.key === selectedKey) ?? chapters[0];
  const longest = Math.max(1, ...chapters.map((c) => c.wordTarget));
  if (!chosen) return null;
  return (
    <section aria-labelledby="chapter-plan-title" className="@container rounded-lg border border-border bg-sheet shadow-sheet">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
        <h2 id="chapter-plan-title" className="text-subhead text-ink">
          Chapter plan
        </h2>
        <p className="text-small text-ink-secondary">Choose a chapter to see its sections, word target and purpose.</p>
      </div>
      <div className={cn("grid @2xl:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]", className)}>
        <ol aria-label="Chapters and word targets" className="grid content-start gap-0.5 p-2 sm:p-3">
          {chapters.map((c) => {
            const on = c.key === chosen.key;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSelect(c.key)}
                  className={cn(
                    "grid min-h-11 w-full grid-cols-[28px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 rounded-sm px-2 py-2 text-left sm:grid-cols-[28px_minmax(0,1fr)_minmax(6rem,9rem)]",
                    on ? "bg-select-wash" : "hover:bg-sunken",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "num grid size-7 place-items-center rounded-control text-small font-semibold",
                      on ? "bg-select text-canvas" : "bg-sunken text-ink-secondary",
                    )}
                  >
                    {c.number}
                  </span>
                  <span className={cn("min-w-0 text-[14px] leading-5 [overflow-wrap:anywhere]", on ? "font-semibold text-ink" : "text-ink")}>
                    <span className="sr-only">Chapter {c.number}: </span>
                    {c.title || "Untitled"}
                  </span>
                  <span className="col-start-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:col-start-3">
                    <span aria-hidden className="block h-1.5 overflow-hidden rounded-pill bg-sunken">
                      <span
                        className="block h-full origin-left rounded-pill bg-progress transition-transform duration-(--vol-dur-slow) ease-out"
                        style={{ transform: `scaleX(${c.wordTarget / longest})` }}
                      />
                    </span>
                    <span className="num text-small text-ink-secondary">
                      {formatNumber(c.wordTarget)}
                      <span className="sr-only"> words planned</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <div aria-live="polite" className="grid content-start gap-3 border-t border-border p-4 sm:p-5 @2xl:border-t-0 @2xl:border-l">
          <div>
            <p className="text-label font-semibold text-select">Chapter {chosen.number}</p>
            <h3 className="mt-0.5 font-book text-[21px] leading-7 font-medium text-ink [overflow-wrap:anywhere]">{chosen.title || "Untitled"}</h3>
          </div>
          <dl className="grid gap-3">
            <div className="grid gap-0.5">
              <dt className="text-caption font-semibold text-ink-tertiary">Purpose</dt>
              <dd className="text-small text-ink">{chosen.purpose || "No summary in this version."}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-caption font-semibold text-ink-tertiary">Word target</dt>
              <dd className="num text-small text-ink">{formatNumber(chosen.wordTarget)} words</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-caption font-semibold text-ink-tertiary">Sections, {chosen.sections.length}</dt>
              <dd>
                {chosen.sections.length === 0 ? (
                  <p className="text-small text-ink-secondary">No subheadings planned.</p>
                ) : (
                  <ol className="grid list-decimal gap-1 pl-5 text-small text-ink marker:text-ink-tertiary">
                    {chosen.sections.map((s, i) => (
                      <li key={`${i}-${s}`}>{s}</li>
                    ))}
                  </ol>
                )}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => onShow(chosen.key)}>
              Show in the full plan
            </Button>
            {panelActions?.(chosen)}
          </div>
        </div>
      </div>
    </section>
  );
}

export interface HistoryItem {
  version: number;
  /** When it was saved, already in words ("2 hours ago"). */
  when: string;
  note: string;
  approved?: boolean | undefined;
  /** Extra detail, for example the cost of the run. */
  detail?: string | undefined;
}

interface VersionChipProps {
  version: number;
  /** How many versions there are, or null while the list loads. */
  total: number | null;
  approved: boolean;
  items: HistoryItem[];
  /** The label of the per-version button, for example "Restore". */
  actionLabel: string;
  onAction: (version: number) => void;
  /** Why the per-version button is off, if it is. */
  actionDisabledReason?: string | undefined;
}

/** "Version N of M" in the step head. It opens the version history, where an old version can be restored as a new draft. */
export function VersionChip({ version, total, approved, items, actionLabel, onAction, actionDisabledReason }: VersionChipProps) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const label = total !== null && total > 0 ? `Version ${version} of ${total}` : `Version ${version}`;
  return (
    <>
      {approved && <StatusChip status="locked">Approved</StatusChip>}
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="hit-44 inline-flex h-[30px] items-center gap-1.5 rounded-pill border border-border bg-sheet px-3 text-[13px] font-semibold whitespace-nowrap text-ink hover:bg-sunken"
      >
        <History size={14} strokeWidth={2} aria-hidden />
        <span className="num">{label}</span>
        <span className="sr-only">, open the version history</span>
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        initialFocus={closeRef}
        title="Version history"
        description="Every version of this blueprint is kept. Restoring an old version makes a new draft; nothing is overwritten."
        footer={
          <Button ref={closeRef} variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        {items.length === 0 ? (
          <p className="text-small text-ink-secondary">Only the current version is known so far.</p>
        ) : (
          <ol aria-label="Blueprint versions" className="grid gap-2">
            {[...items]
              .sort((a, b) => b.version - a.version)
              .map((v) => {
                const current = v.version === version;
                return (
                  <li
                    key={v.version}
                    className={cn(
                      "flex items-start justify-between gap-3 rounded-md border px-3 py-2.5",
                      current ? "border-select bg-select-wash" : "border-border bg-sheet",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] leading-[18px] text-ink">
                        <span className="num font-semibold">Version {v.version}</span>
                        {current && <span className="text-small text-select">this one</span>}
                        {v.approved && (
                          <span className="inline-flex items-center gap-1 text-small text-success">
                            <Check size={13} strokeWidth={2.25} aria-hidden />
                            approved
                          </span>
                        )}
                      </p>
                      <p className="text-small [overflow-wrap:anywhere] text-ink-secondary">
                        {v.when}
                        {v.detail ? `, ${v.detail}` : ""}. {v.note}
                      </p>
                    </div>
                    {!current && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabledReason={actionDisabledReason}
                        onClick={() => {
                          setOpen(false);
                          onAction(v.version);
                        }}
                      >
                        {actionLabel}
                      </Button>
                    )}
                  </li>
                );
              })}
          </ol>
        )}
      </Modal>
    </>
  );
}
