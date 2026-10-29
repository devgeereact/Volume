import type { CSSProperties, ReactNode } from "react";
import { barcodeArea, coverBleedIn, inches, safeInsetIn, spineTextMinPages, wrapSize, type Paper } from "../export/kdpRules";
import { CoverFrame } from "./CoverFrame";

interface WrapPreviewProps {
  /** The wrap page the build renders (POST /cover/preview), or undefined while it loads. */
  page: { html: string; widthPx: number; heightPx: number } | undefined;
  trim: { w: number; h: number };
  pages: number;
  paper: Paper;
  /** Spine width in inches when it is not the paper's (colour ink). */
  spineIn?: number | undefined;
  /** A drawing of the wrap to show instead of the build's page (sample books, no server). */
  art?: ReactNode;
  /** Display width in px; fills the parent when missing. */
  width?: number | undefined;
  /** Show the print guides (default on). */
  guides?: boolean | undefined;
  /** Show the guides key and the panel sizes under the wrap (default on). The cover studio has them in a popover. */
  legend?: boolean | undefined;
}

/**
 * The paperback wrap exactly as the build draws it (the build's own page, see CoverFrame) with the print guides laid
 * over it: bleed shaded, trim and spine folds in blue pencil, the safe area dashed and the barcode keep-out. Sizes come
 * from the KDP rules file. The labels sit in the legend, never on the cover.
 */
export function WrapPreview({ page, trim, pages, paper, spineIn, art, width, guides: showGuides = true, legend = true }: WrapPreviewProps) {
  const paperSize = wrapSize(trim, pages, paper);
  const size = spineIn === undefined ? paperSize : { ...paperSize, spine: spineIn, width: paperSize.width - paperSize.spine + spineIn };
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
  const bc = { x: spineX - safeInsetIn - 0.25 - barcodeArea.widthIn, y: b + trim.h - safeInsetIn - 0.25 - barcodeArea.heightIn };

  const guides = !showGuides ? null : (
    <div aria-hidden>
      {/* Bleed shading on the four outer edges */}
      <div className="bg-scrim/35" style={box(0, 0, W, b)} />
      <div className="bg-scrim/35" style={box(0, H - b, W, b)} />
      <div className="bg-scrim/35" style={box(0, b, b, H - 2 * b)} />
      <div className="bg-scrim/35" style={box(W - b, b, b, H - 2 * b)} />
      {/* Trim line and spine folds */}
      <div className="border border-select" style={box(b, b, W - 2 * b, H - 2 * b)} />
      <div className="border-x border-dashed border-select" style={box(spineX, b, size.spine, trim.h)} />
      {/* Safe area on back and front */}
      <div
        className="border border-dashed border-select/70"
        style={box(backX + safeInsetIn, b + safeInsetIn, trim.w - 2 * safeInsetIn, trim.h - 2 * safeInsetIn)}
      />
      <div
        className="border border-dashed border-select/70"
        style={box(frontX + safeInsetIn, b + safeInsetIn, trim.w - 2 * safeInsetIn, trim.h - 2 * safeInsetIn)}
      />
      {/* Barcode keep-out */}
      <div className="border border-dashed border-select" style={box(bc.x - 0.05, bc.y - 0.05, barcodeArea.widthIn + 0.1, barcodeArea.heightIn + 0.1)} />
    </div>
  );

  const label = `Paperback wrap preview, ${inches(W)} by ${inches(H, 2)}: back cover, spine ${inches(size.spine)} wide, front cover.${spineText ? "" : " No spine text under 80 pages."}`;
  const drawn = page ? (
    <CoverFrame html={page.html} widthPx={page.widthPx} heightPx={page.heightPx} width={width} title="Paperback wrap, as the build draws it">
      {guides}
    </CoverFrame>
  ) : art ? (
    <div className="relative overflow-hidden rounded-xs" style={{ width: width ?? "100%", aspectRatio: `${W} / ${H}`, boxShadow: "var(--vol-shadow-cover)" }}>
      {art}
      {guides && <div className="absolute inset-0">{guides}</div>}
    </div>
  ) : (
    <div className="animate-pulse rounded-xs bg-sunken" style={{ width: width ?? "100%", aspectRatio: `${W} / ${H}` }} />
  );

  if (!legend)
    return (
      <div role="img" aria-label={label}>
        {drawn}
      </div>
    );

  return (
    <figure className="grid gap-3">
      <div role="img" aria-label={label}>
        {drawn}
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
