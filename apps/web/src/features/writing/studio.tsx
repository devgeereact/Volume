import type { ReactNode } from "react";
import { Check, Flag } from "lucide-react";
import { cn } from "../../lib/cn";

/* Layout pieces of the approved step pages (Volume Studio, "v5 step pages") shared by Writing and the
   Editor: the page gutter, the three-card grid (.editor-g), the section list rows (.sl), the small count
   chip (.cnt), the status dots (.dot) and the card headings. Tokens only. */

/** Page gutter under the step head: 16 px on phones, 24 px from 861 px (the Up next card's gutter). */
export const stepBody = "px-4 min-[861px]:px-6";

/** Three cards: section list, page, side card. Two columns under 1201 px (side card below), one under 861 px. */
export const studioGrid = "grid grid-cols-1 items-start gap-4 min-[861px]:grid-cols-[200px_minmax(0,1fr)] min-[1201px]:grid-cols-[230px_minmax(0,1fr)_290px]";

/** The side card spans both columns under 1201 px and stays in view beside the page above it. */
export const studioSide = "min-w-0 min-[861px]:col-span-full min-[1201px]:sticky min-[1201px]:top-[calc(var(--shell-sticky-top)+16px)] min-[1201px]:col-span-1";

/** A glass card with no padding of its own (the list and page cards). */
export const glassCard = "vol-glass min-w-0 rounded-card";

/** Card heading (.card-h h3, .insp h3). */
export const cardTitle = "flex items-center gap-2 text-[14px] leading-5 font-semibold text-ink";

/** Small uppercase label (.lbl). */
export const smallLabel = "text-[10.5px] leading-4 font-bold tracking-[0.09em] text-ink-3 uppercase";

/** A section row (.sl): number, title, status. `on` is the selected or live row. */
export function rowClasses(on: boolean): string {
  return cn(
    "flex min-h-9 w-full min-w-0 items-center gap-2 rounded-[10px] p-2 text-left text-[13px] leading-[18px]",
    on ? "bg-mint-wash font-semibold text-mint-ink" : "text-ink hover:bg-soft",
  );
}

/** The row's number column (.sl em). */
export function RowNumber({ n }: { n: number | string | null }) {
  return <span className="num w-5 shrink-0 text-center font-bold text-ink-3">{n ?? ""}</span>;
}

/** The small count chip beside a heading (.cnt). */
export function Count({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return <span className={cn("num rounded-pill bg-soft px-2 py-px text-[12px] leading-[18px] font-semibold text-ink-2", className)}>{children}</span>;
}

/** Done (a check on mint) or needs a look (a flag on amber), as a 20 px dot (.dot). The words are for screen readers. */
export function RowDot({ tone, label }: { tone: "ok" | "warn"; label: string }) {
  return (
    <span className={cn("grid size-5 shrink-0 place-items-center rounded-pill", tone === "ok" ? "bg-mint-wash text-mint-ink" : "bg-amber-wash text-amber")}>
      {tone === "ok" ? <Check size={12} strokeWidth={2.2} aria-hidden /> : <Flag size={12} strokeWidth={2} aria-hidden />}
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** The chapter page inside the page card (.ed-page): centred, at most 760 px. */
export const pageColumn = "mx-auto w-full max-w-[760px] px-[clamp(4px,3vw,28px)] pt-2 pb-3";

/** The kicker over a chapter title ("Chapter 6, writing now"). */
export const pageKicker = "block text-[11px] leading-4 font-bold tracking-[0.09em] text-ink-3 uppercase";

/** The chapter title on the page (.ed-h), in the reading face. */
export const pageTitle = "font-book text-[24px] leading-[1.25] font-semibold text-ink max-[760px]:text-[21px]";
