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
      <section aria-labelledby="today-heading" className="vol-glass grid gap-3 rounded-card p-4">
        <h2 id="today-heading" className="font-book text-[18px] leading-6 font-medium text-ink">
          Today
        </h2>
        {items.length === 0 ? (
          <p className="text-small text-ink-secondary">Nothing has happened today for these books.</p>
        ) : (
          <ol className="grid gap-3">
            {items.map((a) => (
              <li key={a.id} className="grid gap-0.5 border-t border-glass-line pt-3 text-small first:border-t-0 first:pt-0">
                <time dateTime={a.at} className={cn("num text-[12.5px] leading-4 font-semibold", a.live ? "text-accent-text" : "text-ink-tertiary")}>
                  {formatTime(a.at)}
                </time>
                <Link to={`/books/${a.bookId}`} className="rounded-xs font-semibold text-ink hover:text-select">
                  {a.title}
                </Link>
                <p className="text-ink-secondary">{a.detail}</p>
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
