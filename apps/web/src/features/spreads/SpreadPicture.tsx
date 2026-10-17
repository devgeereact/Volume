import { ImageOff } from "lucide-react";
import type { SpreadView } from "../../api/picture";
import { Loader, ProgressBar } from "../../components/ui";
import { cn } from "../../lib/cn";
import { textPlacement, type PctRect, type SpreadOverlay } from "./geometry";

interface SpreadPictureProps {
  spread: SpreadView;
  overlay: SpreadOverlay;
  /** Show the trim, the bleed and the safe area over the picture. */
  showSafeArea: boolean;
  /** 0 to 1 while a new picture is being made, else null. */
  painting: number | null;
  className?: string | undefined;
}

const box = (r: PctRect) => ({ left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%` });

/**
 * One spread as it prints: the 2:1 picture across two facing pages with bleed, and the text box where the exporter
 * puts it (left or right page, middle; top or bottom of the left page). With the safe area on, the bleed that is cut
 * off is shaded, the trim is a dashed line, the gutter a thin rule and the safe area a solid box.
 */
export function SpreadPicture({ spread, overlay, showSafeArea, painting, className }: SpreadPictureProps) {
  const place = textPlacement(spread.layout);
  const safe = overlay.safe[place.side];
  const trim = {
    left: overlay.trim.left.left,
    top: overlay.trim.left.top,
    width: overlay.trim.left.width + overlay.trim.right.width,
    height: overlay.trim.left.height,
  };
  const alt = spread.sceneSummary ? `Picture for spread ${spread.n}: ${spread.sceneSummary}` : `Picture for spread ${spread.n}`;

  return (
    <div className={cn("relative w-full overflow-hidden rounded-sm border border-border bg-sunken", className)} style={{ aspectRatio: String(overlay.aspect) }}>
      {spread.imageUrl ? (
        <img src={spread.imageUrl} alt={alt} className="absolute inset-0 size-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <div className="absolute inset-0 grid place-items-center border-2 border-dashed border-border-strong">
          <p className="flex items-center gap-2 text-small text-ink-secondary">
            <ImageOff size={16} aria-hidden /> No picture yet
          </p>
        </div>
      )}

      {/* Where the text prints. Not to scale: the PDF uses the book's own type size. */}
      {spread.text.trim() && (
        <div
          className={cn("absolute flex flex-col", place.align === "top" ? "justify-start" : place.align === "bottom" ? "justify-end" : "justify-center")}
          style={box(safe)}
          aria-hidden
        >
          <div className="max-h-full overflow-hidden rounded-sm bg-sheet/85 px-2 py-1.5 text-ink shadow-pop">
            <p className="line-clamp-5 font-book text-caption max-sm:hidden">{spread.text}</p>
            <span className="block h-6 w-12 sm:hidden" />
          </div>
        </div>
      )}

      {showSafeArea && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {/* Bleed: cut off in print. */}
          <div className="absolute inset-x-0 top-0 bg-scrim/45" style={{ height: `${trim.top}%` }} />
          <div className="absolute inset-x-0 bottom-0 bg-scrim/45" style={{ height: `${100 - trim.top - trim.height}%` }} />
          <div className="absolute bg-scrim/45" style={{ left: 0, top: `${trim.top}%`, width: `${trim.left}%`, height: `${trim.height}%` }} />
          <div
            className="absolute bg-scrim/45"
            style={{ right: 0, top: `${trim.top}%`, width: `${100 - trim.left - trim.width}%`, height: `${trim.height}%` }}
          />
          {/* Trim line and gutter. */}
          <div className="absolute border-2 border-dashed border-raised" style={box(trim)} />
          <div className="absolute w-0 border-l border-raised/80" style={{ left: `${overlay.gutter}%`, top: `${trim.top}%`, height: `${trim.height}%` }} />
          {/* Safe area on each page. */}
          <div className="absolute rounded-xs border-2 border-select-wash" style={box(overlay.safe.left)} />
          <div className="absolute rounded-xs border-2 border-select-wash" style={box(overlay.safe.right)} />
        </div>
      )}

      {painting !== null && (
        <div className="absolute inset-x-3 bottom-3 grid gap-1.5 rounded-md border border-border bg-raised px-3 py-2 shadow-pop">
          <p className="flex items-center gap-2 text-small text-ink">
            <Loader /> Painting a new picture
          </p>
          <ProgressBar
            value={Math.round(painting * 100)}
            max={100}
            label={`New picture for spread ${spread.n}`}
            valueText={`${Math.round(painting * 100)}%`}
            live
            size="thin"
          />
        </div>
      )}
    </div>
  );
}
