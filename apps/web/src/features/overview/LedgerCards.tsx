import { useId, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUpRight, BookOpen, Package, Tablet } from "lucide-react";
import { Card, buttonClasses } from "../../components/ui";
import type { Book } from "../../demo";
import { cn } from "../../lib/cn";
import { formatDate } from "../../lib/format";
import { bookStepPath } from "../../screens";
import {
  ebookBand70,
  ebookRates,
  ebookRoyalty,
  formatGbp,
  minimumListPrice,
  pageLimits,
  paperbackRate,
  paperbackTiers,
  percent,
  printingCost,
  rulesVersion,
} from "../export/kdpRules";

/* The Overview's ledger column: KDP royalty facts and the book's dates. Every KDP figure comes from
   config/kdp-rules through features/export/kdpRules (AGENTS.md rule 7). Prices are only shown once the
   owner has set them in KDP; sales are not tracked in Volume. Spend is shown elsewhere as a plain figure. */

/** A rough page count from the word target, only until the interior is built. Labelled "about" on screen. */
const WORDS_PER_PAGE = 300;
/** File size the eBook royalty assumes until a real EPUB is built. */
const EBOOK_MB = 2.4;

function Line({ label, children, total }: { label: string; children: ReactNode; total?: boolean }) {
  return (
    <div
      className={cn(
        "flex justify-between gap-2.5 text-[13px]",
        total ? "mt-1.5 border-t border-line-2 pt-3 text-[14px] font-bold text-ink" : "border-b border-dashed border-line-2 py-[9px]",
      )}
    >
      <span className={total ? "text-ink" : "text-ink-2"}>{label}</span>
      <span className={cn("text-right font-semibold", total ? "text-good" : "text-ink")}>{children}</span>
    </div>
  );
}

export function RoyaltyCard({ book }: { book: Book }) {
  const id = useId();
  const pb = book.published?.formats.find((f) => f.format === "Paperback");
  const eb = book.published?.formats.find((f) => f.format === "Kindle eBook");
  const known = pb?.pages ?? null;
  const pages = known ?? Math.max(pageLimits.min, Math.round(book.words.target / WORDS_PER_PAGE));
  const print = printingCost(pages).cost;
  const lowest = minimumListPrice(print).price;
  const pbPrice = pb?.listPriceGbp ?? null;
  const ebPrice = eb?.listPriceGbp ?? null;
  return (
    <Card as="section" aria-labelledby={id}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <h2 id={id} className="text-[15px] font-bold text-ink">
          Royalty summary
        </h2>
        <small className="text-small text-ink-3">Amazon UK</small>
      </div>
      <div className="grid">
        <p className="pb-0.5 text-[13px] font-semibold text-ink">
          Paperback, {known ? "" : "about "}
          {pages} pages
        </p>
        <Line label="List price">{pbPrice ? formatGbp(pbPrice) : "Not set"}</Line>
        <Line label="Printing cost">{formatGbp(print)}</Line>
        <Line label="Royalty rate">
          {pbPrice ? percent(paperbackRate(pbPrice)) : `${percent(paperbackTiers.low.rate)} or ${percent(paperbackTiers.high.rate)}`}
        </Line>
        <Line label="Lowest list price">{formatGbp(lowest)}</Line>
        <p className="pt-3.5 pb-0.5 text-[13px] font-semibold text-ink">Kindle eBook</p>
        <Line label="List price">{ebPrice ? formatGbp(ebPrice) : "Not set"}</Line>
        <Line label={`${percent(ebookRates.high)} band`}>
          {formatGbp(ebookBand70.min)} to {formatGbp(ebookBand70.max)}
        </Line>
        {pbPrice !== null && (
          <Line label="You earn per paperback" total>
            {formatGbp(paperbackRate(pbPrice) * pbPrice - print)}
          </Line>
        )}
        {ebPrice !== null && (
          <Line label="You earn per eBook" total>
            {formatGbp(ebookRoyalty(ebPrice, EBOOK_MB).royalty)}
          </Line>
        )}
      </div>
      <p className="mt-3 text-small text-ink-2">
        KDP rules {rulesVersion}. {known ? "" : `Pages are a guide from the word target, ${WORDS_PER_PAGE} words a page. `}
        eBook assumes a {EBOOK_MB} MB file. Sales are not tracked in Volume.
      </p>
      <Link to={bookStepPath(book.id, "export")} className={cn(buttonClasses("secondary", "md"), "mt-3 w-full")}>
        <Package size={16} strokeWidth={1.8} aria-hidden />
        Open Export
      </Link>
    </Card>
  );
}

const dayKey = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/London" });
const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" });
const weekday = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** This month's calendar with today and the book's own dates (started, updated, went live). */
export function ReleasesCard({ book, now }: { book: Book; now: string }) {
  const id = useId();
  const nowIso = now;
  const [y, m, d] = dayKey.format(new Date(nowIso)).split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prefix = `${y}-${String(m).padStart(2, "0")}-`;
  const marks = new Set<number>();
  for (const iso of [book.createdAt, book.updatedAt, ...(book.published?.formats.map((f) => f.liveOn) ?? [])]) {
    const k = dayKey.format(new Date(iso));
    if (k.startsWith(prefix)) marks.add(Number(k.slice(8)));
  }
  return (
    <Card as="section" aria-labelledby={id}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
        <h2 id={id} className="text-[15px] font-bold text-ink">
          Releases
        </h2>
        <Link to="/volume/schedule" className="inline-flex items-center gap-1 text-[13px] font-semibold text-mint-ink hover:underline">
          Schedule
          <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden />
        </Link>
      </div>
      <p className="mb-2.5 text-[14px] font-bold text-ink">{monthName.format(first)}</p>
      <div role="table" aria-label={`Calendar, ${monthName.format(first)}`} className="grid grid-cols-7 gap-1 text-center">
        <div role="row" className="contents">
          {weekday.map((w) => (
            <span key={w} role="columnheader" className="py-1 text-[11px] font-medium text-ink-3">
              {w}
            </span>
          ))}
        </div>
        <div role="row" className="contents">
          {Array.from({ length: offset }, (_, i) => (
            <span key={`pad-${i}`} role="cell" />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const n = i + 1;
            const today = n === d;
            const mark = marks.has(n);
            return (
              <span
                key={n}
                role="cell"
                aria-label={`${n}${today ? ", today" : ""}${mark ? ", a book date" : ""}`}
                className={cn(
                  "relative grid h-8 place-items-center rounded-[9px] text-[12.5px]",
                  today ? "bg-btn font-bold text-on-btn" : mark ? "bg-mint-wash font-semibold text-mint-ink" : "text-ink",
                )}
              >
                {n}
                {mark && <i aria-hidden className="absolute bottom-1 size-1 rounded-full bg-current" />}
              </span>
            );
          })}
        </div>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-small text-ink-2">
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="size-[9px] rounded-[3px] bg-btn" />
          Today
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i aria-hidden className="size-[9px] rounded-[3px] bg-mint" />
          Book dates
        </span>
      </p>
      {book.published ? (
        <ul className="grid gap-3">
          {book.published.formats.map((f) => (
            <li key={f.format} className="mt-3 flex items-center gap-2.5 rounded-control bg-soft px-3 py-2.5">
              <span aria-hidden className="grid size-9 place-items-center rounded-[11px] bg-good-wash text-good">
                {f.format === "Paperback" ? <BookOpen size={17} strokeWidth={1.8} /> : <Tablet size={17} strokeWidth={1.8} />}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[13px] font-semibold text-ink">
                  {f.format}, {formatGbp(f.listPriceGbp)}
                </b>
                <small className="text-small text-ink-3">Live since {formatDate(f.liveOn)}</small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-small text-ink-2">No release date planned yet.</p>
      )}
    </Card>
  );
}
