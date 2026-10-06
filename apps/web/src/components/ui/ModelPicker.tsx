import { useRef, type KeyboardEvent } from "react";
import type { ModelInfo } from "../../data/types";
import { examplePricesNote } from "../../data/models";
import { cn } from "../../lib/cn";
import { ModelPickerRow } from "./ModelPickerRow";

interface ModelPickerProps {
  /** Accessible name, for example "Writer model". */
  label: string;
  models: ModelInfo[];
  value: string;
  onChange: (slug: string) => void;
  /** Override the source line per model, for example { "~anthropic/claude-sonnet-latest": "Anthropic, current writer" }. */
  notes?: Record<string, string> | undefined;
  className?: string | undefined;
}

/**
 * Model picker table (radiogroup). Price before the click. Arrow keys move and select, one tab stop.
 * The caption says the prices are examples; the real app shows live OpenRouter prices with the date read.
 */
export function ModelPicker({ label, models, value, onChange, notes, className }: ModelPickerProps) {
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const index = Math.max(
    0,
    models.findIndex((m) => m.slug === value),
  );

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    let next = -1;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = Math.min(models.length - 1, index + 1);
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = Math.max(0, index - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = models.length - 1;
    else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      return;
    }
    if (next < 0) return;
    e.preventDefault();
    const m = models[next];
    if (!m) return;
    onChange(m.slug);
    refs.current[next]?.focus();
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <div role="radiogroup" aria-label={label} className="overflow-hidden rounded-md border border-border bg-sheet">
        <div
          aria-hidden
          className="hidden grid-cols-[20px_minmax(0,2.2fr)_minmax(0,1.2fr)_60px_140px_92px] gap-4 bg-canvas px-4 py-3 text-[12.5px] leading-none font-semibold text-ink-secondary lg:grid"
        >
          <span />
          <span>Model</span>
          <span>Can do</span>
          <span className="text-right">Context</span>
          <span className="text-right">Per million tokens</span>
          <span className="text-right">This book</span>
        </div>
        {models.map((m, i) => (
          <ModelPickerRow
            key={m.slug}
            ref={(el) => {
              refs.current[i] = el;
            }}
            model={m}
            selected={m.slug === value}
            onSelect={() => onChange(m.slug)}
            note={notes?.[m.slug]}
            tabIndex={i === index ? 0 : -1}
            onKeyDown={onKey}
          />
        ))}
      </div>
      <p className="text-small text-ink-tertiary">{examplePricesNote}</p>
    </div>
  );
}
