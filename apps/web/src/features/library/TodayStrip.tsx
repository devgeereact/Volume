import { Link } from "react-router";
import { activity, DEMO_NOW } from "../../demo/books";
import { formatTime } from "../../lib/format";
import { cn } from "../../lib/cn";

export interface TodayItem {
  id: string;
  at: string;
  bookId: string;
  title: string;
  detail: string;
  live: boolean;
}

/**
 * The "Today" strip that closes the Library: the latest four events for the books on show. Pass `items`
 * to show the server's own changes (books updated today); without it the demo activity is used.
 * `layout="column"` stacks it as a card for the Grid view's side column.
 */
export function TodayStrip({
  bookIds,
  items: given,
  layout = "strip",
}: {
  bookIds: Set<string>;
  items?: TodayItem[] | undefined;
  layout?: "strip" | "column" | undefined;
}) {
  const today = DEMO_NOW.slice(0, 10);
  const items: TodayItem[] = given ?? activity.filter((a) => a.at.slice(0, 10) === today && bookIds.has(a.bookId)).slice(0, 4);
  if (layout === "column")
    return (
      <section aria-labelledby="today-heading" className="vol-glass min-w-0 rounded-card p-4.5 max-[560px]:p-3.75">
        <h2 id="today-heading" className="mb-3.5 text-[15px] font-semibold text-ink">
          Today
        </h2>
        {items.length === 0 ? (
          <p className="text-small text-ink-2">Nothing has happened today for these books.</p>
        ) : (
          <ol className="grid">
            {items.map((a) => (
              <li key={a.id}>
                <Link
                  to={`/books/${a.bookId}`}
                  className="flex w-full gap-3 rounded-[10px] px-1.5 py-2.5 text-left transition-colors duration-(--vol-dur-fast) hover:bg-soft"
                >
                  <i
                    aria-hidden
                    className={cn("mt-1.5 size-[9px] shrink-0 rounded-full", a.live ? "bg-mint shadow-[0_0_0_4px_var(--vol-mint-wash)]" : "bg-line-2")}
                  />
                  <span className="grid min-w-0 gap-0.5">
                    <b className="text-[13px] font-semibold text-ink">{a.title}</b>
                    <small className="text-caption text-ink-2">{a.detail}</small>
                    <time dateTime={a.at} className="num text-[11px] text-ink-3">
                      {formatTime(a.at)}
                    </time>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    );
  return (
    <section aria-labelledby="today-heading" className="grid gap-x-7 gap-y-3 border-t border-border pt-4 md:grid-cols-[auto_minmax(0,1fr)]">
      <h2 id="today-heading" className="font-book text-[18px] leading-6 font-medium text-ink">
        Today
      </h2>
      {items.length === 0 ? (
        <p className="text-[13.5px] leading-[19px] text-ink-secondary">Nothing has happened today for these books.</p>
      ) : (
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((a) => (
            <li key={a.id} className="text-[13.5px] leading-[19px]">
              <time
                dateTime={a.at}
                className={cn("num mb-1.5 block text-[12.5px] leading-none font-semibold", a.live ? "text-accent-text" : "text-ink-tertiary")}
              >
                {formatTime(a.at)}
              </time>
              <Link to={`/books/${a.bookId}`} className="font-semibold text-ink hover:text-select">
                {a.title}
              </Link>
              <p className="text-ink-secondary">{a.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
