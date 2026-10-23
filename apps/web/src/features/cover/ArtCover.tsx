import { useMemo, useState } from "react";
import { chooseArtInk, inkScrimCss, zoneLuminance } from "@volume/core";
import { Cover } from "../../components/ui";
import type { CoverDesign } from "../../demo";
import { cn } from "../../lib/cn";

/**
 * A cover concept from the server: the image model's art (no text on it) with Volume's typographic
 * layer on top, in the book's own cover style (faces, palette colours for the type, layout). The
 * style's drawing gives way to the art, and a wash of its background keeps the type legible. While
 * the image loads, or if it fails, the plain typographic cover shows instead.
 */
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
  // The art's brightness behind the title (top) and the author (foot), measured as the build measures it.
  const [lum, setLum] = useState<{ top: number; bottom: number } | null>(null);
  const ink = useMemo(
    () =>
      lum
        ? chooseArtInk(
            { background: design.palette.background, title: design.palette.title, subtitle: design.palette.subtitle, author: design.palette.author },
            lum.top,
            lum.bottom,
          )
        : null,
    [lum, design.palette],
  );
  const scrim = ink ? inkScrimCss(ink) : null;
  const showArt = src !== null && state !== "failed";
  const overlay: CoverDesign = showArt
    ? {
        ...design,
        palette: { ...design.palette, background: "transparent", ...(ink ? { title: ink.title, subtitle: ink.subtitle, author: ink.author } : {}) },
        ...(ink?.shadow ? { textShadow: ink.shadow } : {}),
        motifBox: { top: 0, left: 0, width: 0, height: 0 },
        band: undefined,
      }
    : design;
  return (
    <div className={cn("relative", className)} style={width !== undefined ? { width } : undefined}>
      {showArt && (
        <img
          src={src}
          alt=""
          aria-hidden
          onLoad={(e) => {
            setState("ok");
            setLum(measureArt(e.currentTarget));
          }}
          onError={() => setState("failed")}
          className={cn("absolute inset-0 h-full w-full rounded-cover object-cover", state === "loading" && "opacity-0")}
        />
      )}
      {showArt && scrim && <span aria-hidden className="absolute inset-0 rounded-cover" style={{ background: scrim }} />}
      <Cover title={title} subtitle={subtitle} author={author} design={overlay} className="w-full" decorative={decorative} />
    </div>
  );
}

/** The art stretched to 32 by 48, read as the build reads it (packages/export covers.ts artInkFor); null when the browser will not let us. */
function measureArt(img: HTMLImageElement): { top: number; bottom: number } | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 48;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, 32, 48);
    const rgba = ctx.getImageData(0, 0, 32, 48).data;
    const rgb = new Uint8Array(32 * 48 * 3);
    for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
      rgb[j] = rgba[i] ?? 0;
      rgb[j + 1] = rgba[i + 1] ?? 0;
      rgb[j + 2] = rgba[i + 2] ?? 0;
    }
    return zoneLuminance(rgb, 32, 48);
  } catch {
    return null;
  }
}
