import { useState } from "react";
import { Cover } from "../../components/ui";
import type { CoverDesign } from "../../demo";
import { cn } from "../../lib/cn";

/**
 * A cover concept from the server: the image model's art (no text on it) with Volume's typographic
 * layer on top, in the book's own cover style (faces, palette colours for the type, layout). The
 * style's drawing gives way to the art, and a wash of its background keeps the type legible. While
 * the image loads, or if it fails, the plain typographic cover shows instead.
 */
/** Keep in step with artScrim in packages/export/src/covers.ts. */
export const artScrim = (bg: string): string =>
  `linear-gradient(to bottom, color-mix(in srgb, ${bg} 90%, transparent) 0%, color-mix(in srgb, ${bg} 62%, transparent) 24%, color-mix(in srgb, ${bg} 0%, transparent) 48%, color-mix(in srgb, ${bg} 0%, transparent) 66%, color-mix(in srgb, ${bg} 82%, transparent) 100%)`;

export function ArtCover({
  src,
  title,
  subtitle,
  author,
  design,
  width,
  className,
  decorative,
}: {
  src: string | null;
  title: string;
  subtitle?: string | undefined;
  author: string;
  design: CoverDesign;
  width?: number | string | undefined;
  className?: string | undefined;
  decorative?: boolean | undefined;
}) {
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  const showArt = src !== null && state !== "failed";
  const overlay: CoverDesign = showArt
    ? { ...design, palette: { ...design.palette, background: "transparent" }, motifBox: { top: 0, left: 0, width: 0, height: 0 }, band: undefined }
    : design;
  return (
    <div className={cn("relative", className)} style={width !== undefined ? { width } : undefined}>
      {showArt && (
        <img
          src={src}
          alt=""
          aria-hidden
          onLoad={() => setState("ok")}
          onError={() => setState("failed")}
          className={cn("absolute inset-0 h-full w-full rounded-cover object-cover", state === "loading" && "opacity-0")}
        />
      )}
      {showArt && (
        // A scrim of the style's own background, solid behind the title at the top and the author at the foot and clear
        // through the middle, keeps the type at the style's contrast and leaves the art vivid. The build draws the same
        // gradient (packages/export covers.ts artScrim), so the preview is what gets built.
        <span aria-hidden className="absolute inset-0 rounded-cover" style={{ background: artScrim(design.palette.background) }} />
      )}
      <Cover title={title} subtitle={subtitle} author={author} design={overlay} className="w-full" decorative={decorative} />
    </div>
  );
}
