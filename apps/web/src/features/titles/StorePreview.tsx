import { Cover } from "../../components/ui";
import { usePenNames, useWireMode } from "../../api/wire-a";
import { penNames, TITLE_SUBTITLE_FACT, TITLE_SUBTITLE_MAX, titleLength, type Book } from "../../demo";
import { cn } from "../../lib/cn";
import { libraryCover, titleLines } from "../library/draftCover";

/* A store-listing preview for a title (studio redesign stage 4a). It is a neutral layout, not any store's
   branding: a small cover, the title with its subtitle, and the author. Ratings and reviews are never shown,
   because the book has none yet and Volume never invents them. */

interface StorePreviewProps {
  book: Book;
  title: string;
  subtitle: string;
  className?: string | undefined;
}

/** The book's cover for the preview. A built cover image shows only while the previewed title is the book's own. */
function previewCover(book: Book, title: string): { design: ReturnType<typeof libraryCover>["design"]; image: string | null } {
  const { design, image } = libraryCover(book);
  if (title === book.title) return { design, image };
  return { design: design ? { ...design, titleLines: titleLines(title) } : null, image: null };
}

export function StorePreview({ book, title, subtitle, className }: StorePreviewProps) {
  const pens = usePenNames(useWireMode(), penNames);
  const author = pens.get(book.penNameId)?.name ?? "";
  const cover = previewCover(book, title);
  return (
    <figure className={cn("grid gap-2.5", className)}>
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3.5 rounded-md border border-border bg-sheet p-3.5">
        <Cover title={title} subtitle={subtitle} author={author} design={cover.design} image={cover.image} width={64} hideSubtitle decorative />
        <div className="grid min-w-0 content-start gap-1">
          <p className="text-body font-semibold [overflow-wrap:anywhere] text-ink">
            {title}
            {subtitle && <span className="font-normal text-ink-secondary">: {subtitle}</span>}
          </p>
          {author && <p className="text-small text-ink-secondary">by {author}</p>}
          {book.series && (
            <p className="text-small text-ink-tertiary">
              {book.series.name}, book {book.series.number}
            </p>
          )}
        </div>
      </div>
      <figcaption className="text-caption text-ink-tertiary">How the title reads in a store listing. No ratings or reviews are shown.</figcaption>
    </figure>
  );
}

/** Title and subtitle length against the KDP limit, read from config/kdp-rules (listing.titleSubtitle.maxChars). */
export function TitleLengthBar({ title, subtitle, className }: { title: string; subtitle: string; className?: string | undefined }) {
  const length = titleLength(title, subtitle);
  const over = length > TITLE_SUBTITLE_MAX;
  const share = Math.min(1, length / TITLE_SUBTITLE_MAX);
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-small">
        <span className="text-ink-secondary">Title and subtitle</span>
        <span className={cn("num font-semibold", over ? "text-claim" : "text-ink")}>
          {length} of {TITLE_SUBTITLE_MAX}
        </span>
      </div>
      <div
        role="meter"
        aria-label="Title and subtitle length"
        aria-valuemin={0}
        aria-valuemax={TITLE_SUBTITLE_MAX}
        aria-valuenow={Math.min(length, TITLE_SUBTITLE_MAX)}
        aria-valuetext={`${length} of ${TITLE_SUBTITLE_MAX} characters${over ? ", over the limit" : ""}`}
        className="block h-1.5 overflow-hidden rounded-pill bg-sunken"
      >
        <span
          className={cn("block h-full origin-left rounded-pill transition-transform duration-(--vol-dur-slow) ease-out", over ? "bg-claim" : "bg-progress")}
          style={{ transform: `scaleX(${share})` }}
        />
      </div>
      <p className="text-caption text-ink-tertiary">
        {over ? `${length - TITLE_SUBTITLE_MAX} characters over the KDP limit` : `${TITLE_SUBTITLE_MAX - length} characters to spare`}
        {TITLE_SUBTITLE_FACT ? `, KDP fact ${TITLE_SUBTITLE_FACT}` : ""}.
      </p>
    </div>
  );
}
