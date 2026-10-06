import type { CSSProperties } from "react";
import { Cover } from "../../components/ui";
import type { CoverDesign } from "../../data";
import { barcodeArea, coverBleedIn, inches, safeInsetIn, spineTextMinPages, wrapSize, type Paper } from "../export/kdpRules";

/* Print colours for the barcode box: KDP prints a black barcode on white whatever the cover colours, so
   these are book content like the cover palettes, not interface tokens. */
const PRINT_WHITE = "#FFFFFF";
const PRINT_INK = "#1B1B1B";
/** A fixed bar pattern (x, width) inside a 100 by 60 box, standing in for the barcode KDP adds. */
const BARS: [number, number][] = [
  [12, 1.4],
  [14.6, 0.7],
  [16.4, 2.2],
  [19.8, 0.7],
  [21.6, 1.4],
  [24.4, 0.7],
  [26.2, 2.8],
  [30.2, 0.7],
  [32, 1.4],
  [34.8, 2.2],
  [38.2, 0.7],
  [40, 1.4],
  [42.8, 0.7],
  [44.6, 2.8],
  [48.6, 1.4],
  [51.2, 0.7],
  [53, 2.2],
  [56.4, 0.7],
  [58.2, 1.4],
  [61, 2.8],
  [65, 0.7],
  [66.8, 1.4],
  [69.6, 2.2],
  [73, 0.7],
  [74.8, 1.4],
  [77.6, 0.7],
  [79.4, 2.8],
  [83.4, 0.7],
  [85.2, 1.4],
  [87.4, 0.7],
];

interface WrapPreviewProps {
  title: string;
  subtitle: string;
  author: string;
  design: CoverDesign;
  showSubtitle: boolean;
  blurb: string;
  trim: { w: number; h: number };
  pages: number;
  paper: Paper;
}

/**
 * Paperback wrap drawn to scale: back, spine and front on one sheet, with the bleed shaded, trim and
 * spine folds in blue pencil, the safe area dashed and the barcode keep-out box. Sizes come from the
 * KDP rules file. The labels sit in the legend, never on the cover.
 */
export function WrapPreview({ title, subtitle, author, design, showSubtitle, blurb, trim, pages, paper }: WrapPreviewProps) {
  const size = wrapSize(trim, pages, paper);
  const W = size.width;
  const H = size.height;
  const b = coverBleedIn;
  const pctX = (x: number) => `${(x / W) * 100}%`;
  const pctY = (y: number) => `${(y / H) * 100}%`;
  const box = (x: number, y: number, w: number, h: number): CSSProperties => ({
    position: "absolute",
    left: pctX(x),
    top: pctY(y),
    width: pctX(w),
    height: pctY(h),
  });
  const backX = b;
  const spineX = b + trim.w;
  const frontX = spineX + size.spine;
  const spineText = pages >= spineTextMinPages;
  const pal = design.palette;
  const face = design.accentFamily ? `'${design.accentFamily}', var(--font-book)` : "var(--font-book)";
  const bc = { x: spineX - safeInsetIn - 0.25 - barcodeArea.widthIn, y: b + trim.h - safeInsetIn - 0.25 - barcodeArea.heightIn };

  return (
    <figure className="grid gap-3">
      <div
        role="img"
        aria-label={`Paperback wrap preview, ${inches(W)} by ${inches(H, 2)}: back cover, spine ${inches(size.spine)} wide, front cover.${spineText ? "" : " No spine text under 80 pages."}`}
        className="relative w-full overflow-hidden rounded-xs shadow-cover"
        style={{ aspectRatio: `${W} / ${H}`, background: pal.background, containerType: "inline-size" }}
      >
        {/* Back cover: blurb, short bio line */}
        <div style={{ ...box(backX + 0.55, b + 0.9, trim.w - 1.1, trim.h - 3) }} aria-hidden>
          <p style={{ fontFamily: face, color: pal.subtitle, fontSize: "1.45cqw", lineHeight: 1.5 }}>{blurb}</p>
          <p className="mt-[2cqw] font-semibold uppercase" style={{ fontFamily: face, color: pal.author, fontSize: "0.95cqw", letterSpacing: "0.14em" }}>
            {author}
          </p>
        </div>

        {/* Barcode keep-out: KDP prints the barcode here on a white box, so the drawing shows where it lands. No number is drawn. */}
        <div aria-hidden style={box(bc.x, bc.y, barcodeArea.widthIn, barcodeArea.heightIn)}>
          <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="block size-full">
            <rect x="0" y="0" width="100" height="60" fill={PRINT_WHITE} />
            {BARS.map(([x, w], i) => (
              <rect key={i} x={x} y="8" width={w} height="36" fill={PRINT_INK} />
            ))}
            <rect x="12" y="48" width="76" height="3" rx="1.5" fill={PRINT_INK} opacity="0.35" />
          </svg>
          <span className="absolute -inset-[0.6cqw] border border-dashed border-select" />
        </div>

        {/* Spine */}
        <div aria-hidden style={{ ...box(spineX, b, size.spine, trim.h), display: "grid", placeItems: "center" }}>
          {spineText && (
            <span
              className="font-semibold whitespace-nowrap"
              style={{ writingMode: "vertical-rl", fontFamily: face, color: pal.title, fontSize: `${Math.min(1.5, (size.spine / W) * 100 * 0.55)}cqw` }}
            >
              {title}
              <span style={{ opacity: 0.75, marginTop: "2cqw", display: "inline-block" }}>{author}</span>
            </span>
          )}
        </div>

        {/* Front cover: the chosen concept at trim size */}
        <div aria-hidden style={box(frontX, b, trim.w, trim.h)}>
          <Cover
            title={title}
            subtitle={showSubtitle ? subtitle : undefined}
            author={author}
            design={design}
            className="w-full rounded-none shadow-none"
            decorative
          />
        </div>

        {/* Bleed shading on the four outer edges */}
        <div aria-hidden className="bg-scrim/35" style={box(0, 0, W, b)} />
        <div aria-hidden className="bg-scrim/35" style={box(0, H - b, W, b)} />
        <div aria-hidden className="bg-scrim/35" style={box(0, b, b, H - 2 * b)} />
        <div aria-hidden className="bg-scrim/35" style={box(W - b, b, b, H - 2 * b)} />

        {/* Trim line and spine folds */}
        <div aria-hidden className="border border-select" style={box(b, b, W - 2 * b, H - 2 * b)} />
        <div aria-hidden className="border-x border-dashed border-select" style={box(spineX, b, size.spine, trim.h)} />

        {/* Safe area on back and front */}
        <div
          aria-hidden
          className="border border-dashed border-select/70"
          style={box(backX + safeInsetIn, b + safeInsetIn, trim.w - 2 * safeInsetIn, trim.h - 2 * safeInsetIn)}
        />
        <div
          aria-hidden
          className="border border-dashed border-select/70"
          style={box(frontX + safeInsetIn, b + safeInsetIn, trim.w - 2 * safeInsetIn, trim.h - 2 * safeInsetIn)}
        />
      </div>

      <div className="num grid grid-cols-[1fr_auto_1fr] gap-1 text-center text-caption text-ink-secondary" aria-hidden>
        <span>Back, {inches(trim.w, 3)}</span>
        <span className="px-1">Spine {inches(size.spine)}</span>
        <span>Front, {inches(trim.w, 3)}</span>
      </div>

      <figcaption>
        <ul className="grid grid-cols-1 gap-x-5 gap-y-1.5 text-small text-ink-secondary sm:grid-cols-2">
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-0 w-6 border-t border-select" />
            Trim line
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-6 bg-scrim/35" />
            Bleed, {inches(b, 3)} on every outer edge
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-0 w-6 border-t border-dashed border-select" />
            Spine folds and safe area ({inches(safeInsetIn, 3)} inset, unverified)
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden className="h-3 w-6 border border-dashed border-select" />
            Barcode keep-out, {barcodeArea.widthIn} x {barcodeArea.heightIn} in ({barcodeArea.status})
          </li>
        </ul>
      </figcaption>
    </figure>
  );
}
