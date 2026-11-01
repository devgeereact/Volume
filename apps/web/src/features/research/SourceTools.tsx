import { useState, type ReactNode } from "react";
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
    // Two columns on phones (an odd last figure takes the whole row, so no orphan), five in one row from tablets up.
    <dl aria-label="Research in numbers" className={cn("grid grid-cols-2 gap-2.5 md:grid-cols-5 max-md:[&>*:last-child:nth-child(odd)]:col-span-2", className)}>
      {items.map((it) => (
        <div key={it.label} className="vol-glass grid content-start rounded-[16px] px-3.5 py-3">
          <dt className="order-2 text-[12px] text-ink-2">{it.label}</dt>
          <dd className="num order-1 text-[20px] leading-tight font-bold tracking-[-0.01em] text-ink">{it.value}</dd>
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

/**
 * The dossier's two columns from 768 px: each column is its own stack (Audience, Angles, Gaps on the left;
 * Reader pains, Competing themes, Keyword ideas on the right), so no card is stretched to its neighbour's
 * height. The last card of each stack takes the leftover height, so both columns end level. On phones the
 * stacks dissolve into one column and the cards read in their `max-md:order-*` order.
 */
export function DossierColumns({ left, right, after }: { left: ReactNode; right: ReactNode; after?: ReactNode }) {
  const stack = "contents md:flex md:min-w-0 md:flex-col md:gap-4 md:[&>*:last-child]:flex-1";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={stack}>{left}</div>
      <div className={stack}>{right}</div>
      {after && <div className="max-md:order-last md:col-span-2">{after}</div>}
    </div>
  );
}
