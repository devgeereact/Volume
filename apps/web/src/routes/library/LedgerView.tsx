import { useRef, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { Cover } from "../../components/ui";
import { getPenName } from "../../data/penNames";
import type { Book, PenName } from "../../data/types";
import { cn } from "../../lib/cn";
import { formatRelative, formatUsd } from "../../lib/format";
import { columnIndex, ledgerStatus, ledgerWords } from "./bookStatus";
import { libraryCover } from "./draftCover";
import { StageTicks } from "./StageTicks";

interface LedgerViewProps {
  books: Book[];
  live: { bookId: string; words: number; costSpent: number } | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Pen name lookup for the current data source (server profiles or the demo list). */
  penName?: (id: string) => PenName | undefined;
  /** "Now" for the Updated column. The demo uses its own fixed date. */
  now?: string | undefined;
}

function mobileWords(w: string): string {
  if (w === "None yet") return "No words yet";
  return `${w} words`;
}

/**
 * Ledger view: a table of book, profile, stage ticks, words, AI spend and updated. The selected row
 * gets select-wash and a 3 px pencil edge (aria-selected). Each title is a link that opens the book;
 * Up and Down move between rows. Under 640 px the rows stack as a list.
 */
export function LedgerView({ books, live, selectedId, onSelect, penName = getPenName, now }: LedgerViewProps) {
  const links = useRef<(HTMLAnchorElement | null)[]>([]);

  function onKey(e: KeyboardEvent<HTMLAnchorElement>, i: number) {
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(books.length - 1, i + 1);
    else if (e.key === "ArrowUp") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = books.length - 1;
    if (next < 0) return;
    e.preventDefault();
    links.current[next]?.focus();
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-md border border-border bg-sheet sm:block">
        <table role="grid" aria-readonly="true" aria-label="Books" className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="bg-canvas text-left text-[12.5px] leading-none font-semibold text-ink-secondary">
              <th scope="col" className="border-b border-border px-4 py-3 font-semibold">
                Book
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 font-semibold">
                Profile
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 font-semibold">
                Stage
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 text-right font-semibold">
                Words
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 text-right font-semibold">
                AI spend
              </th>
              <th scope="col" className="border-b border-border px-4 py-3 text-right font-semibold">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {books.map((b, i) => {
              const pen = penName(b.penNameId);
              const selected = b.id === selectedId;
              const isLive = live?.bookId === b.id;
              const st = ledgerStatus(b);
              const cell = cn(
                "border-b border-border px-4 py-[9px] align-middle text-[14px] text-ink",
                i === books.length - 1 && "border-b-0",
                selected && "bg-select-wash",
              );
              return (
                <tr
                  key={b.id}
                  aria-selected={selected}
                  onClick={() => onSelect(b.id)}
                  onFocusCapture={() => onSelect(b.id)}
                  className={cn("cursor-pointer", !selected && "hover:[&>td]:bg-sunken")}
                >
                  <td className={cn(cell, selected && "shadow-[inset_3px_0_0_var(--vol-select)]")}>
                    <div className="flex items-center gap-3.5">
                      <Cover
                        title={b.title}
                        author={pen?.name ?? ""}
                        design={libraryCover(b).design}
                        width={34}
                        hideSubtitle
                        decorative
                        className="shrink-0 [--vol-shadow-cover:none]"
                      />
                      <div className="min-w-0">
                        <Link
                          ref={(el) => {
                            links.current[i] = el;
                          }}
                          to={`/books/${b.id}`}
                          onKeyDown={(e) => onKey(e, i)}
                          className="block font-book text-[16px] leading-5 font-medium text-ink hover:text-select"
                        >
                          {b.title}
                        </Link>
                        <small className="block text-[13px] leading-[18px] text-ink-secondary">
                          {b.subtitle || (b.template === "picture-book" ? "Picture book for ages 3 to 6" : "No subtitle yet")}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td className={cell}>{pen?.name}</td>
                  <td className={cell}>
                    <StageTicks current={columnIndex(b)} className="mb-1.5" />
                    <span className="text-[13px] text-ink-secondary">
                      <b className="font-semibold text-ink">{st.stage}</b>, {st.detail}
                    </span>
                  </td>
                  <td className={cn(cell, "num text-right whitespace-nowrap")}>{ledgerWords(b, isLive ? (live?.words ?? null) : null)}</td>
                  <td className={cn(cell, "num text-right")}>{formatUsd(isLive && live ? live.costSpent : b.cost.spent)}</td>
                  <td className={cn(cell, "num text-right whitespace-nowrap")}>{formatRelative(b.updatedAt, now)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul aria-label="Books" className="grid overflow-hidden rounded-md border border-border bg-sheet sm:hidden">
        {books.map((b) => {
          const pen = penName(b.penNameId);
          const isLive = live?.bookId === b.id;
          const st = ledgerStatus(b);
          return (
            <li key={b.id} className="border-b border-border last:border-b-0">
              <Link to={`/books/${b.id}`} className="flex gap-3.5 px-4 py-3 -outline-offset-2 hover:bg-sunken">
                <Cover
                  title={b.title}
                  author={pen?.name ?? ""}
                  design={libraryCover(b).design}
                  width={40}
                  hideSubtitle
                  decorative
                  className="shrink-0 [--vol-shadow-cover:none]"
                />
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="font-book text-[16px] leading-5 font-medium text-ink">{b.title}</span>
                  <span className="text-[13px] leading-[18px] text-ink-secondary">{pen?.name}</span>
                  <StageTicks current={columnIndex(b)} className="mt-0.5" />
                  <span className="text-[13px] leading-[18px] text-ink-secondary">
                    <b className="font-semibold text-ink">{st.stage}</b>, {st.detail}
                  </span>
                  <span className="num text-[13px] leading-[18px] text-ink-secondary">
                    {mobileWords(ledgerWords(b, isLive ? (live?.words ?? null) : null))}, {formatUsd(isLive && live ? live.costSpent : b.cost.spent)} spent
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
