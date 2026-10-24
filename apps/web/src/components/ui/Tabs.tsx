import { useRef, type KeyboardEvent } from "react";
import { cn } from "../../lib/cn";

export interface TabItem {
  id: string;
  label: string;
  count?: number | undefined;
  /** "claim" shows the count in proof red (claims to verify). */
  countTone?: "default" | "claim" | undefined;
  disabled?: boolean | undefined;
}

interface TabsProps {
  /** Accessible name of the tab list, for example "Inspector". */
  label: string;
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Prefix for tab and panel ids. Pair each panel with tabPanelProps(idBase, id). */
  idBase: string;
  className?: string | undefined;
}

export function tabId(idBase: string, id: string): string {
  return `${idBase}-tab-${id}`;
}
export function tabPanelId(idBase: string, id: string): string {
  return `${idBase}-panel-${id}`;
}
/** Spread onto the panel element: <div {...tabPanelProps("insp", "checks")}>. */
export function tabPanelProps(idBase: string, id: string) {
  return { role: "tabpanel" as const, id: tabPanelId(idBase, id), "aria-labelledby": tabId(idBase, id), tabIndex: 0 };
}

/**
 * Tabs, 44 px tall, label plus count pill. The selected tab gets a 2 px pencil underline drawn left to
 * right. Arrow keys, Home and End move between tabs and select them (roving tabindex).
 */
export function Tabs({ label, items, value, onChange, idBase, className }: TabsProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = items.filter((t) => !t.disabled);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const idx = enabled.findIndex((t) => t.id === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = enabled[next];
    if (!target) return;
    onChange(target.id);
    refs.current[items.indexOf(target)]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKey}
      className={cn("relative flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border", className)}
    >
      {items.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(idBase, t.id)}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={tabPanelId(idBase, t.id)}
            tabIndex={selected ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={cn(
              "relative inline-flex h-11 shrink-0 items-center gap-1.5 px-3 text-label whitespace-nowrap",
              "focus-visible:-outline-offset-2",
              selected ? "text-ink" : "text-ink-secondary hover:text-ink",
              t.disabled && "text-ink-disabled hover:text-ink-disabled",
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  "num rounded-pill px-1.5 py-0.5 text-caption font-semibold",
                  t.countTone === "claim" ? "bg-claim-wash text-claim" : "bg-sunken text-ink-secondary",
                )}
              >
                {t.count}
              </span>
            )}
            {selected && <span aria-hidden className="absolute right-2 bottom-0 left-2 h-0.5 origin-left animate-pencil-x rounded-[1px] bg-select" />}
          </button>
        );
      })}
    </div>
  );
}
