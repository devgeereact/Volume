import { useId, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "../../lib/cn";
import { fieldBoxClasses } from "./FieldShell";

interface FilterFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name. Keep it "Filter" or "Filter <things>"; the global search lives in the top bar (Cmd K). */
  label?: string | undefined;
  /** Show the label above the field. Default false: the label is for screen readers and the icon shows the role. */
  showLabel?: boolean | undefined;
  placeholder?: string | undefined;
  /** Number of items shown after filtering; announced politely, for example "4 shown". */
  count?: number | undefined;
  className?: string | undefined;
}

/**
 * Narrows the list on this page. It is a filter, not a second search: one global search sits in the
 * top bar (Cmd K, D-016). The approved design's .search: 40 px tall, a clear button appears when there is text, and Escape clears.
 */
export function FilterField({ value, onChange, label = "Filter", showLabel = false, placeholder = "Filter", count, className }: FilterFieldProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={id} className={showLabel ? "text-label text-ink" : "sr-only"}>
        {label}
      </label>
      <span className="relative flex items-center">
        <Search size={16} strokeWidth={1.8} className="pointer-events-none absolute left-3 text-ink-3" aria-hidden />
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && value) {
              e.preventDefault();
              e.stopPropagation();
              onChange("");
            }
          }}
          className={cn(fieldBoxClasses({ error: false, disabled: false }), "h-10 pl-9", value && "pr-10")}
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute right-0 grid size-10 place-items-center rounded-md text-ink-3 hover:text-ink"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </span>
      {count !== undefined && (
        <span className="sr-only" aria-live="polite">
          {value ? `${count} shown` : ""}
        </span>
      )}
    </div>
  );
}
