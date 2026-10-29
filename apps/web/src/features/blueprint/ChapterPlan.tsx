import { useId, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Check, History } from "lucide-react";
import { Button, Card, Modal, StatusChip } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";

/* Blueprint pieces from the approved Volume Studio design (stBlueprint): the figures over the plan, the
   Outline card (front matter, numbered chapters with editable titles and word-target bars, back matter),
   the labels, checks and version list of the right card, and the version chip with its history.
   Every figure comes from the blueprint on screen; nothing is estimated here. */

/** A row of figures over the plan (.kps). Each value is counted from the blueprint that is open. */
export function PlanCounts({ items, className }: { items: { label: string; value: string | number }[]; className?: string | undefined }) {
  return (
    <dl aria-label="Blueprint in numbers" className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-4", className)}>
      {items.map((it) => (
        <div key={it.label} className="vol-glass grid content-start rounded-[16px] px-3.5 py-3">
          <dt className="order-2 text-[12px] text-ink-2">{it.label}</dt>
          <dd className="num order-1 text-[20px] leading-tight font-bold tracking-[-0.01em] text-ink">
            {typeof it.value === "number" ? formatNumber(it.value) : it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The small capital label of the approved design (.lbl). */
export function SideLabel({ as: Tag = "p", children, className }: { as?: "p" | "h3" | "h2"; children: ReactNode; className?: string | undefined }) {
  return <Tag className={cn("mt-4 mb-2 block text-[10.5px] font-bold tracking-[0.09em] text-ink-3 uppercase first:mt-0", className)}>{children}</Tag>;
}

/** A list of checks with a tick, or an alert mark when a check fails. */
export function CheckList({ items }: { items: { label: ReactNode; ok: boolean; key?: string }[] }) {
  return (
    <ul className="my-3 grid gap-2 text-[13px] text-ink">
      {items.map((c, i) => (
        <li key={c.key ?? i} className="flex items-start gap-2">
          {c.ok ? (
            <Check size={16} strokeWidth={2} aria-hidden className="mt-px shrink-0 text-mint-ink" />
          ) : (
            <AlertCircle size={16} strokeWidth={2} aria-hidden className="mt-px shrink-0 text-amber" />
          )}
          <span className="min-w-0">
            <span className="sr-only">{c.ok ? "Done: " : "To do: "}</span>
            {c.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface OutlineChip {
  key: string;
  label: string;
  /** Off in this plan (switched off in Arrange sections). */
  off?: boolean | undefined;
}

export interface OutlineChapter {
  /** The key the page uses for this chapter (a part id or "chapter:N"). */
  key: string;
  number: number;
  title: string;
  wordTarget: number;
  /** Open claims to verify in this chapter, if any. */
  claims?: number | undefined;
}

interface OutlineCardProps {
  front: OutlineChip[];
  chapters: OutlineChapter[];
  back: OutlineChip[];
  /** The part shown in the right card. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  /** Saves a new chapter title. Without it the titles are read only. */
  onTitle?: ((key: string, title: string) => void) | undefined;
  /** Why titles cannot be edited now, shown under the hint. */
  titleLockedReason?: string | undefined;
  /** Buttons in the card head, for example Arrange sections. */
  tools?: ReactNode;
  /** Shown under the chapters, for example a note while a part is regenerated. */
  footer?: ReactNode;
}

/** The Outline card (.bp in the approved design). Click a number or a chip to see that part in the right card. */
export function OutlineCard({ front, chapters, back, selectedKey, onSelect, onTitle, titleLockedReason, tools, footer }: OutlineCardProps) {
  const titleId = useId();
  const longest = Math.max(1, ...chapters.map((c) => c.wordTarget));
  return (
    <Card as="section" aria-labelledby={titleId} className="min-w-0">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <h2 id={titleId} className="text-[15px] font-bold text-ink">
          Outline
        </h2>
        <p className="text-small text-ink-2">
          {onTitle ? "Click a chapter number to see its plan. Titles can be edited here." : "Click a chapter number to see its plan."}
          {titleLockedReason ? ` ${titleLockedReason}` : ""}
        </p>
      </div>
      {tools && <div className="mt-2 flex flex-wrap gap-2">{tools}</div>}
      <ChipGroup title="Front matter" items={front} selectedKey={selectedKey} onSelect={onSelect} />
      <SideLabel as="h3" className="mt-4!">
        Chapters
      </SideLabel>
      {chapters.length === 0 ? (
        <p className="text-small text-ink-2">No chapters in this version.</p>
      ) : (
        <ol aria-label="Chapters and word targets" className="grid gap-0.5">
          {chapters.map((c) => (
            // Keyed by title too, so a saved or restored title resets the field.
            <ChapterRow key={`${c.key}:${c.title}`} chapter={c} longest={longest} on={c.key === selectedKey} onSelect={onSelect} onTitle={onTitle} />
          ))}
        </ol>
      )}
      <ChipGroup title="Back matter" items={back} selectedKey={selectedKey} onSelect={onSelect} />
      {footer}
    </Card>
  );
}

function ChipGroup({
  title,
  items,
  selectedKey,
  onSelect,
}: {
  title: string;
  items: OutlineChip[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <>
      <SideLabel as="h3" className="mt-4!">
        {title}
      </SideLabel>
      {items.length === 0 ? (
        <p className="text-small text-ink-2">None in this version.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((it) => {
            const on = it.key === selectedKey;
            return (
              <li key={it.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSelect(it.key)}
                  className={cn(
                    "hit-44 inline-flex items-center rounded-pill border px-2.5 py-1 text-[12px] transition-colors duration-(--vol-dur-fast) ease-out",
                    on ? "border-mint bg-mint-wash text-mint-ink" : "border-line bg-soft text-ink hover:bg-panel-2",
                    it.off && "text-ink-3 line-through",
                  )}
                >
                  {it.label}
                  {it.off && <span className="sr-only">, switched off</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function ChapterRow({
  chapter: c,
  longest,
  on,
  onSelect,
  onTitle,
}: {
  chapter: OutlineChapter;
  longest: number;
  on: boolean;
  onSelect: (key: string) => void;
  onTitle?: ((key: string, title: string) => void) | undefined;
}) {
  const [value, setValue] = useState(c.title);
  function commit() {
    const next = value.trim();
    if (!onTitle) return;
    if (!next) setValue(c.title);
    else if (next !== c.title) onTitle(c.key, next);
  }
  return (
    <li
      className={cn(
        "grid grid-cols-[34px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1 rounded-control px-1.5 py-1 sm:grid-cols-[34px_minmax(0,1fr)_140px]",
        on ? "bg-mint-wash" : "hover:bg-soft",
      )}
    >
      <button
        type="button"
        aria-pressed={on}
        aria-label={`Show chapter ${c.number}${c.claims ? `, ${c.claims} ${c.claims === 1 ? "claim" : "claims"} to verify` : ""}`}
        onClick={() => onSelect(c.key)}
        className={cn(
          "hit-44 num relative grid size-[30px] place-items-center rounded-[9px] border text-[12.5px] font-bold",
          on ? "border-transparent bg-mint text-on-mint" : "border-line text-ink-2 hover:bg-panel-2",
        )}
      >
        {c.number}
        {c.claims ? <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-claim" /> : null}
      </button>
      {onTitle ? (
        <input
          value={value}
          aria-label={`Chapter ${c.number} title`}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => onSelect(c.key)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setValue(c.title);
              e.currentTarget.blur();
            }
          }}
          className="h-10 w-full min-w-0 rounded-[9px] border border-edge bg-panel-2 px-2.5 text-[13.5px] text-ink hover:border-line-2 focus:border-mint focus:bg-panel-2 focus:shadow-[0_0_0_3px_var(--vol-mint-wash)] focus:outline-none"
        />
      ) : (
        <span className="min-w-0 px-2.5 py-2 text-[13.5px] text-ink [overflow-wrap:anywhere]">{c.title || "Untitled"}</span>
      )}
      <span className="col-start-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:col-start-3">
        <span aria-hidden className="block h-[5px] overflow-hidden rounded-pill bg-track">
          <span
            className="block h-full origin-left rounded-pill bg-mint transition-transform duration-(--vol-dur-slow) ease-out"
            style={{ transform: `scaleX(${c.wordTarget / longest})` }}
          />
        </span>
        <span className="num min-w-10 text-right text-[12px] text-ink-2">
          {formatNumber(c.wordTarget)}
          <span className="sr-only"> words planned</span>
        </span>
      </span>
    </li>
  );
}

export interface VersionRow {
  version: number;
  note: string;
  /** For example the cost of the run, or when it was saved. */
  detail?: string | undefined;
  approved?: boolean | undefined;
}

/** The Versions list of the right card (.ev-line rows): each old version has its action, the current one says so. */
export function VersionList({
  items,
  current,
  actionLabel,
  onAction,
  disabledReason,
}: {
  items: VersionRow[];
  current: number;
  actionLabel: string;
  onAction: (version: number) => void;
  disabledReason?: string | undefined;
}) {
  if (items.length === 0) return <p className="text-small text-ink-2">Only the current version is known so far.</p>;
  return (
    <ol aria-label="Blueprint versions" className="grid gap-3">
      {[...items]
        .sort((a, b) => a.version - b.version)
        .map((v) => {
          const here = v.version === current;
          return (
            <li key={v.version} className="flex items-center gap-2.5 rounded-control bg-soft px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <b className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold text-ink">
                  Version {v.version}
                  {here ? " (this one)" : ""}
                  {v.approved && (
                    <span className="inline-flex items-center gap-1 text-small font-medium text-good">
                      <Check size={13} strokeWidth={2.25} aria-hidden />
                      approved
                    </span>
                  )}
                </b>
                <small className="block text-small text-ink-3 [overflow-wrap:anywhere]">{v.note}</small>
              </span>
              {here ? (
                v.detail ? (
                  <small className="num shrink-0 text-small text-ink-3">{v.detail}</small>
                ) : null
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 font-semibold text-mint-ink"
                  disabledReason={disabledReason}
                  onClick={() => onAction(v.version)}
                >
                  {actionLabel}
                  <span className="sr-only"> version {v.version}</span>
                </Button>
              )}
            </li>
          );
        })}
    </ol>
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
