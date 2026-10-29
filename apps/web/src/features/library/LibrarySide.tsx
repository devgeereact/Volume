import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { bookGroups, groupOf, type BookGroup } from "./bookStatus";
import type { Book } from "../../demo/types";

/**
 * The Grid view's side column. From 1280 px it sits beside the grid and stays in view while the page scrolls: CSS
 * sticky under the top bar, never taller than the window, with its own scroll and a fade at the bottom edge while
 * more of it is below. Below 1280 px it stacks under the grid and scrolls with the page.
 */
export function LibrarySide({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const below = el.scrollTop + el.clientHeight < el.scrollHeight - 4;
    setMore((was) => (was === below ? was : below));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // The column's content grows (Today fills in) and the window changes height: both change whether it overflows.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure]);
  return (
    <aside
      ref={ref}
      aria-label="Library overview"
      data-lib-side
      onScroll={measure}
      className={cn(
        "grid min-w-0 content-start gap-4 xl:sticky-side",
        // The fade marks that the column scrolls; it never applies on phones, where the column is not a scroller.
        more && "xl:mask-b-from-90%",
      )}
    >
      {children}
    </aside>
  );
}

/**
 * Stage filter for the grid: All books and the three groups, each with its count of the books on show. Pressing one
 * narrows the grid; pressing it again (or All books) shows every book.
 */
export function GroupFilter({ books, value, onChange }: { books: readonly Book[]; value: BookGroup | null; onChange: (g: BookGroup | null) => void }) {
  const counts: Record<BookGroup, number> = { progress: 0, ready: 0, published: 0 };
  for (const b of books) counts[groupOf(b)] += 1;
  const rows: { id: BookGroup | null; title: string; hint: string; count: number }[] = [
    { id: null, title: "All books", hint: "Every book on show.", count: books.length },
    ...bookGroups.map((g) => ({ id: g.id, title: g.title, hint: g.hint, count: counts[g.id] })),
  ];
  return (
    <section aria-labelledby="by-stage-heading" className="vol-glass grid gap-2 rounded-card p-4">
      <h2 id="by-stage-heading" className="font-book text-[18px] leading-6 font-medium text-ink">
        By stage
      </h2>
      <ul className="grid gap-1">
        {rows.map((r) => {
          const on = value === r.id;
          return (
            <li key={r.id ?? "all"}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on || r.id === null ? null : r.id)}
                className={cn(
                  "grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-control px-3 py-2 text-left transition-colors duration-(--vol-dur-fast)",
                  on ? "vol-pencil-edge bg-select-wash" : "hover:bg-sunken",
                )}
              >
                <span className="min-w-0">
                  <span className={cn("block text-label font-semibold", on ? "text-select" : "text-ink")}>{r.title}</span>
                  <span className="block text-small text-ink-secondary">{r.hint}</span>
                </span>
                <span className="num rounded-full bg-sunken px-2 py-0.5 text-[12.5px] font-medium text-ink-secondary">
                  {r.count}
                  <span className="sr-only"> {r.count === 1 ? "book" : "books"}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
