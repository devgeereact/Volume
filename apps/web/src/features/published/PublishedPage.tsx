import { useMemo, useState } from "react";
import { ReadOnlyBanner, useCanWrite } from "../../lib/access";
import { Link } from "react-router";
import { Banner, Button, buttonClasses, Cover, EmptyState, FilterField, PageHeader, Skeleton } from "../../components/ui";
import type { ApiBook, ApiListPrices } from "../../api/types";
import { usePenNames, useWiredBooks, useWireMode } from "../../api/wire-a";
import { InlineStatus } from "../settings/PanelHeader";
import { PublishedDetailsDialog } from "./PublishedDetailsDialog";
import { getBookType, penNames, publishedBooks, type Book, type PenName } from "../../demo";
import { cn } from "../../lib/cn";
import { formatDate, formatGbp, formatMonthYear, formatNumber } from "../../lib/format";
import { usePenNameFilter } from "../../lib/penName";
import { bookStepPath } from "../../screens";
import { libraryCover } from "../library/draftCover";

type PenLookup = (id: string) => PenName | undefined;

function matches(book: Book, q: string, getPenName: PenLookup): boolean {
  if (!q) return true;
  const pen = getPenName(book.penNameId)?.name ?? "";
  const type = getBookType(book.bookTypeId)?.name ?? "";
  return `${book.title} ${book.subtitle} ${pen} ${type} ${book.series?.name ?? ""}`.toLowerCase().includes(q);
}

/** One book standing on the shelf: cover on a ledge, then what went live and when. */
const PRICE_LABELS: { key: keyof ApiListPrices; label: string }[] = [
  { key: "ebook", label: "Kindle eBook" },
  { key: "paperback", label: "Paperback" },
  { key: "hardcover", label: "Hardcover" },
];

function ShelfBook({
  book,
  getPenName,
  server,
  onSaved,
}: {
  book: Book;
  getPenName: PenLookup;
  server?: Pick<ApiBook, "listPrices" | "marketplace"> | undefined;
  onSaved?: ((m: string) => void) | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const canWrite = useCanWrite();
  const pen = getPenName(book.penNameId);
  const type = getBookType(book.bookTypeId);
  const pub = book.published;
  if (!pub) return null;
  const headingId = `published-${book.id}`;
  return (
    <li className="grid min-w-0 content-start" aria-labelledby={headingId}>
      <Link to={bookStepPath(book.id, "export")} className="group relative block rounded-sm px-6 pt-2" aria-label={`${book.title}, open the export pack`}>
        <Cover
          title={book.title}
          subtitle={book.subtitle}
          author={pen?.name ?? ""}
          design={book.cover ?? libraryCover(book).design}
          image={libraryCover(book).image}
          lift
          decorative
          className="mx-auto w-full max-w-[168px]"
        />
        {/* The shelf ledge the cover stands on. */}
        <span aria-hidden className="absolute inset-x-0 -bottom-2 h-2 rounded-xs border-t border-border-strong bg-sunken shadow-sheet" />
      </Link>
      <div className="mt-6 grid gap-3">
        <div>
          <h3 id={headingId} className="font-book text-[19px] leading-6 font-medium text-ink">
            {book.title}
          </h3>
          {book.subtitle && <p className="mt-1 line-clamp-2 text-small text-ink-secondary">{book.subtitle}</p>}
          <p className="mt-1.5 text-small text-ink-secondary">
            {pen?.name}
            {book.series ? `, ${book.series.name} book ${book.series.number}` : type ? `, ${type.name.toLowerCase()}` : ""}
          </p>
        </div>
        <dl className="grid gap-1.5 border-t border-border pt-3 text-small">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-secondary">Live since</dt>
            <dd className="text-right text-ink">{formatDate(pub.publishedOn)}</dd>
          </div>
          {pub.formats.map((f) => (
            <div key={f.format} className="flex justify-between gap-3">
              <dt className="text-ink-secondary">{f.format}</dt>
              <dd className="num text-right text-ink">
                {f.listPriceGbp === null ? <span className="text-ink-secondary">No price yet</span> : formatGbp(f.listPriceGbp)}
                {f.pages ? <span className="text-ink-secondary">, {formatNumber(f.pages)} pages</span> : null}
              </dd>
            </div>
          ))}
          {server &&
            PRICE_LABELS.filter((p) => server.listPrices[p.key] !== null && !pub.formats.some((f) => f.format === p.label)).map((p) => (
              <div key={p.key} className="flex justify-between gap-3">
                <dt className="text-ink-secondary">{p.label}</dt>
                <dd className="num text-right text-ink">{formatGbp(server.listPrices[p.key] ?? 0)}</dd>
              </div>
            ))}
          {server && pub.formats.length === 0 && PRICE_LABELS.every((p) => server.listPrices[p.key] === null) && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-secondary">Formats and prices</dt>
              <dd className="text-right text-ink-secondary">Not set yet</dd>
            </div>
          )}
          {server && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-secondary">Store</dt>
              <dd className="text-right text-ink">{server.marketplace ?? "amazon.co.uk"}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <dt className="text-ink-secondary">AI disclosure</dt>
            <dd className="text-right text-ink">{pub.aiDisclosure}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={bookStepPath(book.id, "export")} className={buttonClasses("secondary", "sm")}>
            {pub.packVersion > 0 ? `Export pack v${pub.packVersion}` : "Export pack"}
          </Link>
          <Link to={bookStepPath(book.id, "cover")} className={buttonClasses("ghost", "sm")}>
            Change cover<span className="sr-only"> of {book.title}</span>
          </Link>
          <Link to={bookStepPath(book.id, "marketing")} className={buttonClasses("ghost", "sm")}>
            Marketing
          </Link>
          {server && canWrite && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Set prices<span className="sr-only"> for {book.title}</span>
            </Button>
          )}
        </div>
        {server && editing && (
          <PublishedDetailsDialog
            open={editing}
            onClose={() => setEditing(false)}
            bookId={book.id}
            title={book.title}
            marketplace={server.marketplace ?? ""}
            prices={server.listPrices}
            onSaved={(m) => onSaved?.(m)}
          />
        )}
      </div>
    </li>
  );
}

/**
 * The Published shelf (D-016): every book that is live on Amazon, newest first, grouped by month. Each
 * book stands on a ledge with its formats, list prices, live date and the AI disclosure given to KDP.
 * The spine's pen name switcher narrows the shelf; the filter narrows it further. With the server running
 * the shelf holds the books marked published there; the server keeps the date and the AI disclosure, not
 * formats or prices, so those rows are left out rather than made up.
 */
export default function PublishedPage() {
  const mode = useWireMode();
  const pens = usePenNames(mode, penNames);
  const wired = useWiredBooks(mode, publishedBooks(), { status: "published" });
  const getPenName = pens.get;
  const state = wired.state === "error" || pens.state === "error" ? "error" : wired.state === "loading" || pens.state === "loading" ? "loading" : "ready";
  const { selectedId: chosen } = usePenNameFilter();
  const selectedId = chosen && getPenName(chosen) ? chosen : null;
  const [filter, setFilter] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const serverBooks = useMemo(() => new Map(wired.raw.map((b) => [b.id, b])), [wired.raw]);
  const q = filter.trim().toLowerCase();
  const all = useMemo(
    () => (mode === "api" ? [...wired.books].sort((a, b) => (b.published?.publishedOn ?? "").localeCompare(a.published?.publishedOn ?? "")) : wired.books),
    [mode, wired.books],
  );
  const shown = useMemo(() => all.filter((b) => (!selectedId || b.penNameId === selectedId) && matches(b, q, getPenName)), [all, selectedId, q, getPenName]);
  const months = useMemo(() => {
    const map = new Map<string, Book[]>();
    for (const b of shown) {
      const key = formatMonthYear(b.published?.publishedOn ?? b.updatedAt);
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return [...map.entries()];
  }, [shown]);
  const pen = selectedId ? getPenName(selectedId) : undefined;
  const formats = shown.reduce((n, b) => n + (b.published?.formats.length ?? 0), 0);
  const marketplaces = [...new Set(shown.map((b) => b.published?.marketplace).filter((m): m is string => Boolean(m)))];
  const marketplace = marketplaces.length === 1 ? (marketplaces[0] ?? "") : "";

  return (
    <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <PageHeader
        title="Published"
        summary={
          state !== "ready"
            ? undefined
            : all.length === 0
              ? "Nothing live yet."
              : mode === "api" && formats === 0
                ? `${shown.length} ${shown.length === 1 ? "book" : "books"} marked published${marketplace ? ` on ${marketplace}` : ""}${pen ? `, by ${pen.name}` : ""}.`
                : `${shown.length} ${shown.length === 1 ? "book" : "books"} live on ${marketplace || "amazon.co.uk"} in ${formats} ${formats === 1 ? "format" : "formats"}${pen ? `, by ${pen.name}` : ""}.`
        }
        actions={
          state === "ready" && all.length > 0 ? (
            <FilterField
              value={filter}
              onChange={setFilter}
              label="Filter published books"
              placeholder="Filter by title, profile or series"
              count={shown.length}
              className="w-full sm:w-[300px]"
            />
          ) : undefined
        }
      />
      <ReadOnlyBanner />
      {state === "ready" && all.length > 0 && (
        <p className="mt-2 text-small text-ink-tertiary">
          {mode === "api" && formats === 0
            ? "Formats show once an export pack is built. Set the list prices you entered in KDP with Set prices. Royalties and sales are not tracked here."
            : "List prices as entered in KDP. Royalties and sales are not tracked here."}
        </p>
      )}

      {savedNote && (
        <div className="mt-3">
          <InlineStatus>{savedNote}</InlineStatus>
        </div>
      )}

      {state === "loading" ? (
        <ul role="status" aria-label="Loading published books" className="mt-10 grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="grid gap-3 px-6">
              <Skeleton variant="cover" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </li>
          ))}
        </ul>
      ) : state === "error" ? (
        <Banner
          className="mt-8"
          tone="error"
          title="Could not load the published books"
          action={
            <Button
              size="sm"
              onClick={() => {
                wired.retry();
                pens.retry();
              }}
            >
              Retry
            </Button>
          }
        >
          {wired.error ?? pens.error}
        </Banner>
      ) : all.length === 0 ? (
        <EmptyState
          className="mt-10"
          title="Nothing published yet"
          body="When a book goes live on Amazon, mark it published in Export and it moves to this shelf."
          drawing="books"
          action={
            <Link to="/library" className={buttonClasses("primary", "md")}>
              Open the Library
            </Link>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          className="mt-10"
          title="No published books match"
          body={
            pen && !q
              ? `${pen.name} has nothing live yet. Choose All profiles in the menu to see the whole shelf.`
              : "Try a shorter filter, or clear it to see the whole shelf."
          }
          drawing="search"
          action={
            q ? (
              <button type="button" onClick={() => setFilter("")} className={buttonClasses("secondary", "md")}>
                Clear filter
              </button>
            ) : undefined
          }
        />
      ) : (
        months.map(([month, list], i) => (
          <section key={month} aria-label={month} className={cn("mt-10", i > 0 && "border-t border-border pt-8")}>
            <h2 className="mb-6 flex items-baseline gap-3 font-book text-heading text-ink">
              {month}
              <span className="font-ui text-small font-normal text-ink-tertiary">
                {list.length} {list.length === 1 ? "book" : "books"}
              </span>
            </h2>
            <ul className="grid grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((b) => (
                <ShelfBook key={b.id} book={b} getPenName={getPenName} server={serverBooks.get(b.id)} onSaved={setSavedNote} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
