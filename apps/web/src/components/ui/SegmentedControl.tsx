import { useRef, type KeyboardEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/cn";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon | undefined;
  /** Hide the label visually (icon only); it stays as the accessible name. */
  iconOnly?: boolean | undefined;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md" | undefined;
  className?: string | undefined;
}

/**
 * Segmented control (Covers or Ledger, Light or Dark). Radio semantics; arrow keys move and select.
 * The sheet thumb slides with transform; it never repaints its width.
 */
export function SegmentedControl<T extends string>({ label, options, value, onChange, size = "md", className }: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    if (next < 0) return;
    e.preventDefault();
    const opt = options[next];
    if (!opt) return;
    onChange(opt.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKey}
      className={cn("relative inline-grid grid-flow-col auto-cols-fr rounded-sm bg-sunken p-[3px]", size === "md" ? "h-10" : "h-9", className)}
    >
      <span
        aria-hidden
        className="absolute top-[3px] bottom-[3px] left-[3px] rounded-xs bg-sheet shadow-[0_0_0_1px_var(--vol-border)] transition-transform duration-(--vol-dur-base) ease-out"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o, i) => {
        const checked = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.iconOnly ? o.label : undefined}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-[1] inline-flex items-center justify-center gap-1.5 rounded-xs px-3.5 text-[13.5px] font-medium whitespace-nowrap",
              "focus-visible:outline-offset-1",
              checked ? "text-ink" : "text-ink-secondary hover:text-ink",
            )}
          >
            {Icon && <Icon size={16} aria-hidden />}
            {!o.iconOnly && o.label}
          </button>
        );
      })}
    </div>
  );
}
