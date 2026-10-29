import type { CSSProperties } from "react";
import { Cover } from "../../components/ui";
import type { CoverDesign } from "../../demo";
import { barcodeArea, coverBleedIn, safeInsetIn } from "../export/kdpRules";

/* A drawing of the paperback wrap for the sample books (no server, so no build page to show): the back with the
   blurb, the spine and the front cover, laid out on the same print geometry WrapPreview's guides use. The real
   wrap is drawn by the build (packages/export); with the server on, the studio shows that page instead. */

export function DemoWrapArt({
  design,
  title,
  subtitle,
  author,
  blurb,
  trim,
  spineIn,
  spineText,
}: {
  design: CoverDesign;
  title: string;
  subtitle: string | undefined;
  author: string;
  blurb: string;
  trim: { w: number; h: number };
  spineIn: number;
  spineText: boolean;
}) {
  const b = coverBleedIn;
  const W = 2 * b + 2 * trim.w + spineIn;
  const H = 2 * b + trim.h;
  const box = (x: number, y: number, w: number, h: number): CSSProperties => ({
    position: "absolute",
    left: `${(x / W) * 100}%`,
    top: `${(y / H) * 100}%`,
    width: `${(w / W) * 100}%`,
    height: `${(h / H) * 100}%`,
  });
  const spineX = b + trim.w;
  const frontX = spineX + spineIn;
  const p = design.palette;
  const spineBg = design.bandColour ?? p.motif;
  const inset = safeInsetIn + 0.25;
  const paragraphs = blurb
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div aria-hidden className="absolute inset-0 [container-type:inline-size]" style={{ background: p.background }}>
      <div style={{ ...box(b + inset, b + inset, trim.w - 2 * inset, trim.h * 0.62), color: p.subtitle }} className="overflow-hidden">
        {paragraphs.map((t, i) => (
          <p key={i} className="m-0 mb-[0.9cqw] text-[1.05cqw] leading-[1.5]">
            {t}
          </p>
        ))}
      </div>
      <div style={{ ...box(b + inset, b + trim.h - inset - 0.9, trim.w * 0.45, 0.6), color: p.author, borderTopColor: p.motif }} className="border-t-2">
        <p className="m-0 pt-[0.6cqw] text-[0.9cqw] font-bold tracking-[.14em] uppercase">{author}</p>
      </div>
      <div
        style={{
          ...box(
            spineX - safeInsetIn - 0.25 - barcodeArea.widthIn,
            b + trim.h - safeInsetIn - 0.25 - barcodeArea.heightIn,
            barcodeArea.widthIn,
            barcodeArea.heightIn,
          ),
          // The white box KDP prints the barcode into: always white, whatever the cover colours.
          background: "#FFFFFF",
        }}
      />
      <div
        style={{ ...box(spineX, 0, spineIn, H), background: spineBg }}
        className="flex items-center justify-center overflow-hidden [writing-mode:vertical-rl]"
      >
        {spineText && (
          <span className="truncate text-[0.95cqw] font-bold tracking-[.04em]" style={{ color: p.background }}>
            {title}
            <span className="ml-[1.2cqw] font-medium opacity-90">{author}</span>
          </span>
        )}
      </div>
      <div style={box(frontX, 0, trim.w + b, H)} className="overflow-hidden">
        <Cover
          title={title}
          subtitle={subtitle}
          author={author}
          design={design}
          decorative
          className="aspect-auto! size-full rounded-none! shadow-none! after:hidden"
        />
      </div>
    </div>
  );
}
