import { useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { tabId, tabPanelId } from "../../components/ui";
import { cn } from "../../lib/cn";

export interface SegTab<T extends string> {
  id: T;
  label: string;
  /** A count beside the label. 0 shows a check on the good tone (nothing to do). */
  count?: number | undefined;
  tone?: "good" | "warn" | "bad" | "info" | undefined;
}

const toneClasses = {
  good: "bg-mint-wash text-mint-ink",
  warn: "bg-amber-wash text-amber",
  bad: "bg-red-wash text-red",
  info: "bg-soft text-ink-2",
};

/**
 * The Editor's side card tabs as one segmented control (.seg.tgl.ci-tabs in the approved design), with
 * tab semantics: arrow keys, Home and End move between tabs and select them (roving tabindex). Pair each
 * panel with tabPanelProps(idBase, id).
 */
export function SegTabs<T extends string>({
  label,
  items,
  value,
  onChange,
  idBase,
}: {
  label: string;
  items: SegTab<T>[];
  value: T;
  onChange: (id: T) => void;
  idBase: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const idx = items.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    const target = items[next];
    if (!target) return;
    e.preventDefault();
    onChange(target.id);
    refs.current[next]?.focus();
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className="mb-3 flex gap-0.5 rounded-[12px] bg-soft p-[3px] shadow-[inset_0_0_0_1px_var(--vol-line)]"
    >
      {items.map((t, i) => {
        const on = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(idBase, t.id)}
            role="tab"
            type="button"
            aria-selected={on}
            aria-controls={tabPanelId(idBase, t.id)}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={cn(
              "inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2 text-[12.5px] whitespace-nowrap",
              on ? "bg-panel-2 font-semibold text-ink shadow-segment" : "font-medium text-ink-2 hover:text-ink",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn("num grid h-[18px] min-w-[18px] place-items-center rounded-pill px-1 text-[10.5px] font-bold", toneClasses[t.tone ?? "info"])}
              >
                {t.count === 0 ? <Check size={11} strokeWidth={2.5} aria-label="nothing to fix" /> : t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
