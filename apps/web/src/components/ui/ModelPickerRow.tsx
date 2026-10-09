import type { KeyboardEvent, Ref } from "react";
import type { ModelInfo } from "../../demo/types";
import { cn } from "../../lib/cn";
import { formatContext, formatPerMillion, formatUsd, formatModel } from "../../lib/format";

interface ModelPickerRowProps {
  model: ModelInfo;
  selected: boolean;
  onSelect: () => void;
  /** Source line under the slug, for example "Anthropic, current writer". Defaults to provider and label. */
  note?: string | undefined;
  /** Roving tabindex, managed by ModelPicker. */
  tabIndex?: number | undefined;
  onKeyDown?: ((e: KeyboardEvent<HTMLDivElement>) => void) | undefined;
  ref?: Ref<HTMLDivElement> | undefined;
}

export function modelPrice(model: ModelInfo): string {
  const p = model.examplePrice;
  return "perImage" in p ? `${formatUsd(p.perImage)} per image` : formatPerMillion(p.inputPerMillion, p.outputPerMillion);
}

/**
 * One model in the picker: radio, friendly name (formatModel; the exact slug is in the title tooltip), source line, capability tags, context, price per million
 * tokens (example prices in the prototype) and the estimate for this book. Selected: radio on,
 * select-wash and a 3 px pencil edge. Use inside ModelPicker (role="radiogroup").
 */
export function ModelPickerRow({ model, selected, onSelect, note, tabIndex, onKeyDown, ref }: ModelPickerRowProps) {
  return (
    <div
      ref={ref}
      role="radio"
      aria-checked={selected}
      tabIndex={tabIndex}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        "relative grid cursor-pointer grid-cols-[20px_1fr] items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-[13.5px]",
        "lg:grid-cols-[20px_minmax(0,2.2fr)_minmax(0,1.2fr)_60px_140px_92px]",
        "focus-visible:-outline-offset-2",
        selected ? "bg-select-wash" : "hover:bg-sunken",
      )}
    >
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] origin-top animate-pencil bg-select" />}
      <span
        aria-hidden
        className={cn("grid size-5 place-items-center rounded-full border-[1.5px] bg-sheet", selected ? "border-select" : "border-border-strong")}
      >
        {selected && <span className="size-2.5 rounded-full bg-select" />}
      </span>
      <span className="min-w-0">
        <b title={`OpenRouter model: ${model.slug}`} className="block [overflow-wrap:anywhere] text-[14px] leading-[19px] font-semibold text-ink">
          {formatModel(model.slug)}
        </b>
        <small className="text-[12.5px] text-ink-secondary">{note ?? `${model.provider}, ${model.label.toLowerCase()}`}</small>
      </span>
      <span className="col-start-2 flex flex-wrap gap-1 lg:col-start-auto">
        {model.capabilities.map((c) => (
          <span key={c} className="inline-flex h-[22px] items-center rounded-pill bg-sunken px-2 text-caption text-ink-secondary">
            {c}
          </span>
        ))}
      </span>
      <span className="num col-start-2 text-ink-secondary lg:col-start-auto lg:text-right lg:text-ink">
        <span className="lg:hidden">Context </span>
        {formatContext(model.contextTokens)}
      </span>
      <span className="num col-start-2 lg:col-start-auto lg:text-right">{modelPrice(model)}</span>
      <span className="num col-start-2 font-semibold lg:col-start-auto lg:text-right">
        {model.exampleBookCostUsd !== null ? `about ${formatUsd(model.exampleBookCostUsd)}` : "None"}
      </span>
    </div>
  );
}
