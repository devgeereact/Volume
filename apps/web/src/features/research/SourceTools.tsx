import { useState } from "react";
import { Button, Chip, FilterField } from "../../components/ui";
import { cn } from "../../lib/cn";

/* Research counts and the source filter (studio redesign stage 4a). Every count comes from the run that is
   on screen; the filter and search work only on the sources already loaded, in the browser. */

export type SourceShow = "all" | "used" | "unused";

export interface SourceFilterState {
  query: string;
  show: SourceShow;
  setQuery: (q: string) => void;
  setShow: (s: SourceShow) => void;
  clear: () => void;
  active: boolean;
}

export function useSourceFilter(): SourceFilterState {
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<SourceShow>("all");
  function clear() {
    setQuery("");
    setShow("all");
  }
  return { query, show, setQuery, setShow, clear, active: query.trim() !== "" || show !== "all" };
}

/** True when a source passes the filter. `text` is what the card shows: title, publisher, domain, excerpt. */
export function sourceMatches(f: Pick<SourceFilterState, "query" | "show">, used: boolean, text: (string | null | undefined)[]): boolean {
  if (f.show === "used" && !used) return false;
  if (f.show === "unused" && used) return false;
  const words = f.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = text.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** A row of figures over the dossier. Each value is counted from the loaded run. */
export function ResearchCounts({ items, className }: { items: { label: string; value: number }[]; className?: string | undefined }) {
  return (
    <dl
      aria-label="Research in numbers"
      className={cn("grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 xl:grid-cols-5", className)}
    >
      {items.map((it) => (
        <div key={it.label} className="grid content-start gap-0.5 bg-sheet px-4 py-3">
          <dt className="order-2 text-small text-ink-secondary">{it.label}</dt>
          <dd className="num order-1 font-book text-heading text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Search box and Used / Not used chips over the sources list. */
export function SourceFilterBar({ filter, total, used, shown }: { filter: SourceFilterState; total: number; used: number; shown: number }) {
  return (
    <div className="grid gap-2.5">
      <FilterField label="Filter sources" placeholder="Filter sources" value={filter.query} onChange={filter.setQuery} count={shown} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show sources">
        <Chip pressed={filter.show === "all"} count={total} onClick={() => filter.setShow("all")}>
          All
        </Chip>
        <Chip pressed={filter.show === "used"} count={used} onClick={() => filter.setShow("used")}>
          Used
        </Chip>
        <Chip pressed={filter.show === "unused"} count={total - used} onClick={() => filter.setShow("unused")}>
          Not used
        </Chip>
      </div>
    </div>
  );
}

/** Shown when the filter hides every source. */
export function NoSourceMatch({ filter }: { filter: SourceFilterState }) {
  return (
    <div className="grid justify-items-start gap-2 rounded-md border border-dashed border-border-strong p-4">
      <p className="text-small text-ink-secondary">No sources match this filter.</p>
      <Button size="sm" variant="ghost" onClick={filter.clear}>
        Clear the filter
      </Button>
    </div>
  );
}
