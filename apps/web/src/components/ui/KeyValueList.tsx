import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { ModelName } from "./ModelName";

export interface KeyValue {
  label: ReactNode;
  value: ReactNode;
  /** Model IDs only. A string slug ("~anthropic/claude-sonnet-latest") is shown as its friendly name with the slug in a tooltip. */
  mono?: boolean | undefined;
}

const SLUG = /^~?[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9.:_-]*$/i;

/** Key and value rows, values right-aligned with tabular figures. */
export function KeyValueList({ items, className }: { items: KeyValue[]; className?: string | undefined }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13.5px] leading-[18px]", className)}>
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="text-ink-secondary">{it.label}</dt>
          {it.mono && typeof it.value === "string" && SLUG.test(it.value) ? (
            <dd className="m-0 min-w-0 text-right text-ink">
              <ModelName slug={it.value} />
            </dd>
          ) : (
            <dd
              className={cn(
                "num m-0 text-right text-ink",
                it.mono ? "font-mono text-[12.5px] tracking-[-0.01em] [overflow-wrap:anywhere]" : "min-w-0 [overflow-wrap:anywhere]",
              )}
            >
              {it.value}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
