import { useBookLive } from "../../api/events";
import { useExports, useMarketing } from "../../api/hooks";
import { DEMO_NOW, getPenName, type Book, type PenName } from "../../demo";
import { ReadOnlyBanner } from "../../lib/access";
import { useWritingJob } from "../../lib/job";
import { useBook } from "../../lib/useBook";
import { NotFound } from "../../shell/NotFound";
import { StepRail } from "../../shell/StepRail";
import { BookOverview } from "./BookOverview";

/* The book's Overview (approved Volume Studio design, bOverview): the first tab of the step bar.
   A profile column (cover and facts), a working column (next step, figures, steps, files, job notes)
   and a ledger column (KDP royalty facts and release dates). Built from data the app already has;
   nothing here is estimated except the page count, which says so. */

export default function OverviewPage() {
  const { book, penName, from } = useBook();
  if (!book) return <NotFound what="book" />;
  const pen = penName ?? getPenName(book.penNameId);
  return from === "api" ? <ApiOverview book={book} pen={pen} /> : <DemoOverview book={book} pen={pen} />;
}

function DemoOverview({ book, pen }: { book: Book; pen: PenName | undefined }) {
  const { job, running } = useWritingJob();
  return <Frame book={book} pen={pen} runningBookId={running ? job.bookId : null} now={DEMO_NOW} />;
}

/** Server books: the live dot follows the write job, and Export and Marketing read their own lists (as the book layout does). */
function ApiOverview({ book: base, pen }: { book: Book; pen: PenName | undefined }) {
  const live = useBookLive(base.id);
  const writing = Object.values(live.data.jobs).some(
    (j) => (j.kind === "write_book" || j.kind === "rebuild_book" || j.kind === "write_section") && (j.status === "running" || j.status === "queued"),
  );
  const exports = useExports(base.id, { staleTimeMs: 30_000 });
  const marketing = useMarketing(base.id);
  const pack = (exports.data ?? []).filter((e) => e.kind === "pack" && e.status === "done").sort((a, b) => b.createdAt - a.createdAt)[0];
  const book = { ...base, exported: !!pack && !pack.stale, marketingMade: (marketing.data?.length ?? 0) > 0 };
  return <Frame book={book} pen={pen} runningBookId={writing ? book.id : null} now={new Date().toISOString()} />;
}

function Frame({ book, pen, runningBookId, now }: { book: Book; pen: PenName | undefined; runningBookId: string | null; now: string }) {
  return (
    <>
      <StepRail book={book} author={pen?.name ?? ""} current="overview" runningBookId={runningBookId} action={null} />
      <ReadOnlyBanner className="mx-4 mb-4 min-[861px]:mx-6" />
      <BookOverview book={book} pen={pen} runningBookId={runningBookId} now={now} />
    </>
  );
}
