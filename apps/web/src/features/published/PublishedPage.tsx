import { useMemo, useState } from "react";
import { ReadOnlyBanner, useCanWrite } from "../../lib/access";
import { Link } from "react-router";
import { BookOpen, Image, Megaphone, Tablet } from "lucide-react";
import { Banner, Button, buttonClasses, Card, Cover, EmptyState, FilterField, PageHeader, Skeleton } from "../../components/ui";
import type { ApiBook, ApiListPrices } from "../../api/types";
import { usePenNames, useWiredBooks, useWireMode } from "../../api/wire-a";
import { InlineStatus } from "../settings/PanelHeader";
import { PublishedDetailsDialog } from "./PublishedDetailsDialog";
import { getBookType, penNames, publishedBooks, type Book, type PenName, type PublishedFormat } from "../../demo";
import { formatDate, formatDayMonth, formatGbp, formatMonthYear, formatNumber } from "../../lib/format";
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

const PRICE_LABELS: { key: keyof ApiListPrices; label: PublishedFormat["format"] }[] = [
  { key: "ebook", label: "Kindle eBook" },
  { key: "paperback", label: "Paperback" },
  { key: "hardcover", label: "Hardcover" },
];

/** A row per format (.fmt): icon, the format with its live date and pages, and the list price on the right. */
function FormatRow({ format, liveOn, pages, price }: { format: PublishedFormat["format"]; liveOn: string; pages: number | null; price: number | null }) {
  const Icon = format === "Kindle eBook" ? Tablet : BookOpen;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[13px] border border-edge bg-soft px-3 py-2.25 text-[13px]">
      <Icon size={16} strokeWidth={1.8} aria-hidden className="text-ink-2" />
      <span className="min-w-0 text-ink">
        {format}
        <small className="block text-caption text-ink-3">
          Live since {formatDate(liveOn)}
          {pages ? `, ${formatNumber(pages)} pages` : ""}
        </small>
      </span>
      <b className="num font-bold text-ink">{price === null ? <span className="font-medium text-ink-3">No price yet</span> : formatGbp(price)}</b>
    </li>
  );
}

type ServerPrices = Pick<ApiBook, "listPrices" | "marketplace">;

/**
 * The book's formats: those in its export pack, then any format the owner priced with Set prices that the pack does
 * not hold. Server formats carry no date of their own, so they show the day the book was marked published.
 */
function formatRows(
  book: Book,
  server: ServerPrices | undefined,
): { format: PublishedFormat["format"]; liveOn: string; pages: number | null; price: number | null }[] {
  const pub = book.published;
  if (!pub) return [];
  const rows = pub.formats.map((f) => ({ format: f.format, liveOn: f.liveOn ?? pub.publishedOn, pages: f.pages, price: f.listPriceGbp }));
  if (!server) return rows;
  const priced = PRICE_LABELS.filter((p) => server.listPrices[p.key] !== null && !rows.some((r) => r.format === p.label)).map((p) => ({
    format: p.label,
    liveOn: pub.publishedOn,
    pages: null,
    price: server.listPrices[p.key],
  }));
  return [...rows, ...priced];
}

const pillClasses = "rounded-pill border border-edge bg-soft px-2.5 py-1 text-[11.5px] font-semibold text-ink-2";

/** One published book (.pubc): cover, title, author, a row per format, the facts in pills and the actions. */
function PublishedCard({
  book,
  getPenName,
  server,
  onSaved,
}: {
  book: Book;
  getPenName: PenLookup;
  server?: ServerPrices | undefined;
  onSaved?: ((m: string) => void) | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const canWrite = useCanWrite();
  const pen = getPenName(book.penNameId);
  const type = getBookType(book.bookTypeId);
  const pub = book.published;
  if (!pub) return null;
  const headingId = `published-${book.id}`;
  const cover = libraryCover(book);
  const rows = formatRows(book, server);
  const marketplace = server?.marketplace || pub.marketplace;
  return (
    <li
      aria-labelledby={headingId}
      className="vol-glass grid min-w-0 grid-cols-[132px_minmax(0,1fr)] gap-5 rounded-card p-4.5 max-[560px]:grid-cols-[90px_minmax(0,1fr)] max-[560px]:gap-3.5"
    >
      <Cover
        title={book.title}
        subtitle={book.subtitle}
        author={pen?.name ?? ""}
        design={book.cover ?? cover.design}
        image={cover.image}
        lift
        decorative
        className="w-full self-start"
      />
      <div className="grid min-w-0 content-start gap-2.5">
        <div>
          <h3 id={headingId} className="font-book text-[18px] leading-[1.25] font-semibold text-ink">
            {book.title}
          </h3>
          <p className="mt-1 text-[13px] text-ink-2">
            {pen?.name}
            {book.series ? `, ${book.series.name} book ${book.series.number}` : type ? `, ${type.name.toLowerCase()}` : ""}
          </p>
        </div>
        <ul className="grid gap-1.5" aria-label={`Formats of ${book.title}`}>
          {rows.map((r) => (
            <FormatRow key={r.format} {...r} />
          ))}
          {rows.length === 0 && (
            <li className="rounded-[13px] border border-edge bg-soft px-3 py-2.25 text-[13px] text-ink">
              Live since {formatDate(pub.publishedOn)}
              <small className="block text-caption text-ink-3">Formats show once an export pack is built.</small>
            </li>
          )}
        </ul>
        <p className="flex flex-wrap gap-1.5">
          <span className={pillClasses}>{pub.aiDisclosure}</span>
          <Link to={bookStepPath(book.id, "export")} className={`${pillClasses} hover:text-ink`}>
            {pub.packVersion > 0 ? `Export pack v${pub.packVersion}` : "Export pack"}
            <span className="sr-only"> of {book.title}</span>
          </Link>
          {marketplace && <span className={pillClasses}>{marketplace}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to={`/books/${book.id}`} className={buttonClasses("secondary", "sm")}>
            <BookOpen size={14} strokeWidth={1.8} aria-hidden />
            Open<span className="sr-only"> {book.title}</span>
          </Link>
          <Link to={bookStepPath(book.id, "cover")} className={buttonClasses("secondary", "sm")}>
            <Image size={14} strokeWidth={1.8} aria-hidden />
            Change cover<span className="sr-only"> of {book.title}</span>
          </Link>
          <Link to={bookStepPath(book.id, "marketing")} className={buttonClasses("secondary", "sm")}>
            <Megaphone size={14} strokeWidth={1.8} aria-hidden />
            Marketing<span className="sr-only"> for {book.title}</span>
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

/** A figure in the head card (.statpill). */
function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="grid min-w-30 gap-0.5 rounded-lg border border-edge bg-soft px-4 py-3 max-[560px]:min-w-0">
      <dt className="order-2 text-caption text-ink-3">{label}</dt>
      <dd className="num order-1 text-[24px] leading-[1.1] font-light tracking-[-0.02em] text-ink">{value}</dd>
    </div>
  );
}

/**
 * The Published shelf (D-016), as the approved design: a head card with the figures (books live, formats, the latest
 * release, and sales, which Volume does not track) and a filter, then every live book grouped by month, newest first.
 * Each card shows the formats with their live dates and list prices, the AI disclosure given to KDP, the export pack
 * and the store, with Open, Change cover and Marketing. The profile chosen in the Library (or the side menu) narrows
 * the shelf. With the server running, formats come from the export pack and prices from Set prices; nothing is made up.
 */
export default function PublishedPage() {
  const mode = useWireMode();
  const pens = usePenNames(mode, penNames);
  const wired = useWiredBooks(mode, publishedBooks(), { status: "published" });
  const getPenName = pens.get;
  const state = wired.state === "error" || pens.state === "error" ? "error" : wired.state === "loading" || pens.state === "loading" ? "loading" : "ready";
  const { selectedId: chosen, setSelectedId } = usePenNameFilter();
  const selectedId = chosen && getPenName(chosen) ? chosen : null;
  const [filter, setFilter] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const serverBooks = useMemo(() => new Map(wired.raw.map((b) => [b.id, b])), [wired.raw]);
  const q = filter.trim().toLowerCase();
  const all = useMemo(
    () => (mode === "api" ? [...wired.books].sort((a, b) => (b.published?.publishedOn ?? "").localeCompare(a.published?.publishedOn ?? "")) : wired.books),
    [mode, wired.books],
  );
  const byPen = useMemo(() => all.filter((b) => !selectedId || b.penNameId === selectedId), [all, selectedId]);
  const shown = useMemo(() => byPen.filter((b) => matches(b, q, getPenName)), [byPen, q, getPenName]);
  const months = useMemo(() => {
    const map = new Map<string, Book[]>();
    for (const b of shown) {
      const key = formatMonthYear(b.published?.publishedOn ?? b.updatedAt);
      map.set(key, [...(map.get(key) ?? []), b]);
    }
    return [...map.entries()];
  }, [shown]);
  const pen = selectedId ? getPenName(selectedId) : undefined;
  const formats = byPen.reduce((n, b) => n + formatRows(b, serverBooks.get(b.id)).length, 0);
  const latest = byPen.map((b) => b.published?.publishedOn ?? "").reduce((a, b) => (b > a ? b : a), "");

  return (
    <div className="grid content-start gap-4.5 px-4 pt-1 pb-6 min-[861px]:px-6">
      <PageHeader title="Published" titleHidden />
      <ReadOnlyBanner />

      {state === "ready" && all.length > 0 && (
        <Card as="section" aria-label="Published at a glance" className="flex flex-wrap items-center justify-between gap-3.5 p-5 max-[560px]:p-3.75">
          <dl className="grid grid-cols-2 gap-2.5 min-[561px]:flex min-[561px]:flex-wrap max-[560px]:w-full">
            <StatPill value={String(byPen.length)} label={byPen.length === 1 ? "Book live" : "Books live"} />
            <StatPill value={String(formats)} label={formats === 1 ? "Format" : "Formats"} />
            <StatPill value={latest ? formatDayMonth(latest) : "None"} label="Latest release" />
            <StatPill value="Not tracked" label="Sales and royalties" />
          </dl>
          <FilterField
            value={filter}
            onChange={setFilter}
            label="Filter published books"
            placeholder="Filter published books"
            count={shown.length}
            className="w-full min-[561px]:w-65"
          />
        </Card>
      )}

      {state === "ready" && pen && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-2">
          <span>
            Showing books by <b className="font-semibold text-ink">{pen.name}</b> only.
          </span>
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="hit-44 relative rounded-xs font-semibold text-mint-ink underline underline-offset-2"
          >
            Show all profiles
          </button>
        </p>
      )}

      {savedNote && <InlineStatus>{savedNote}</InlineStatus>}

      {state === "loading" ? (
        <ul role="status" aria-label="Loading published books" className="grid grid-cols-[repeat(auto-fill,minmax(min(500px,100%),1fr))] gap-4.5">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="vol-glass grid grid-cols-[132px_minmax(0,1fr)] gap-5 rounded-card p-4.5 max-[560px]:grid-cols-[90px_minmax(0,1fr)]">
              <Skeleton variant="cover" />
              <div className="grid content-start gap-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton variant="block" className="h-12 rounded-[13px]" />
              </div>
            </li>
          ))}
        </ul>
      ) : state === "error" ? (
        <Banner
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
        <Card>
          <EmptyState
            title="Nothing published yet"
            body="When a book goes live on Amazon, mark it published in Export and it moves to this shelf."
            drawing="books"
            action={
              <Link to="/library" className={buttonClasses("primary", "md")}>
                Open the Library
              </Link>
            }
          />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            title="No published books match"
            body={
              pen && !q
                ? `${pen.name} has nothing live yet. Show all profiles to see the whole shelf.`
                : "Try a shorter filter, or clear it to see the whole shelf."
            }
            drawing="search"
            action={
              q ? (
                <Button onClick={() => setFilter("")}>Clear filter</Button>
              ) : pen ? (
                <Button onClick={() => setSelectedId(null)}>Show all profiles</Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        months.map(([month, list]) => (
          <section key={month} aria-label={month} className="grid gap-3">
            <h2 className="mx-1 flex items-center gap-3 text-[13px] font-bold text-ink-2 after:h-px after:flex-1 after:bg-line-2">
              {month}
              <span className="num rounded-pill bg-soft px-2 py-px text-caption font-semibold text-ink-2">
                {list.length}
                <span className="sr-only"> {list.length === 1 ? "book" : "books"}</span>
              </span>
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(500px,100%),1fr))] gap-4.5">
              {list.map((b) => (
                <PublishedCard key={b.id} book={b} getPenName={getPenName} server={serverBooks.get(b.id)} onSaved={setSavedNote} />
              ))}
            </ul>
          </section>
        ))
      )}

      {state === "ready" && shown.length > 0 && (
        <p className="text-caption text-ink-2">
          {mode === "api"
            ? "Formats come from the export pack and the list prices you set with Set prices, as entered in KDP. Royalties and sales are not tracked in Volume."
            : "List prices as entered in KDP. Royalties and sales are not tracked in Volume."}
        </p>
      )}
    </div>
  );
}
