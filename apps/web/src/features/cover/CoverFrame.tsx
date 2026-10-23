import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import type { PartAlign } from "./coverEdit";

/** Where one line sits on the cover, in cover-width percent, as the page itself measured it. */
export interface MeasuredPart {
  top: number;
  height: number;
  align: PartAlign;
}
export interface CoverMeasure {
  title: MeasuredPart | null;
  subtitle: MeasuredPart | null;
  author: MeasuredPart | null;
  /** The cover's height in cover-width percent (160 for the 1600 x 2560 eBook cover). */
  unitsH: number;
  /** The title's fitted font size in cover-width percent. */
  titleSize: number;
}

const toAlign = (v: unknown): PartAlign => (v === "center" ? "center" : v === "right" || v === "end" ? "right" : "left");
const asPart = (v: unknown): MeasuredPart | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return typeof o["top"] === "number" && typeof o["height"] === "number" ? { top: o["top"], height: o["height"], align: toAlign(o["align"]) } : null;
};

/**
 * The page a cover build renders, shown as it is. The server sends the same HTML it renders for the build (same fonts,
 * same layout, same art, same ink); the browser draws it at its natural size and the frame scales it down. Nothing is
 * redrawn here, so the preview cannot differ from the output. The page reports where its lines are (onMeasure) so the
 * studio's editing handles sit on them.
 */
export function CoverFrame({
  html,
  widthPx,
  heightPx,
  width,
  title,
  onMeasure,
  children,
  className,
}: {
  html: string;
  widthPx: number;
  heightPx: number;
  /** Display width in px, or undefined to fill the parent. */
  width?: number | undefined;
  title: string;
  onMeasure?: ((m: CoverMeasure) => void) | undefined;
  /** Drawn over the page, filling it (editing handles, guides). */
  children?: ReactNode;
  className?: string | undefined;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [fill, setFill] = useState(0);
  const shown = width ?? fill;

  useEffect(() => {
    if (width !== undefined) return;
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFill(el.getBoundingClientRect().width));
    ro.observe(el);
    setFill(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [width]);

  useEffect(() => {
    if (!onMeasure) return;
    const listen = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || d["type"] !== "volume-cover-boxes" || typeof d["width"] !== "number" || typeof d["height"] !== "number") return;
      onMeasure({
        title: asPart(d["title"]),
        subtitle: asPart(d["subtitle"]),
        author: asPart(d["author"]),
        unitsH: (d["height"] / d["width"]) * 100,
        titleSize: typeof d["titleSize"] === "number" ? d["titleSize"] : 0,
      });
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [onMeasure]);

  const scale = shown > 0 ? shown / widthPx : 0;
  return (
    <div
      ref={wrap}
      className={cn("relative overflow-hidden rounded-cover", className)}
      style={{ width: width ?? "100%", aspectRatio: `${widthPx} / ${heightPx}`, boxShadow: "var(--vol-shadow-cover)" }}
    >
      {scale > 0 && (
        <iframe
          ref={frame}
          title={title}
          srcDoc={html}
          sandbox="allow-scripts"
          tabIndex={-1}
          aria-hidden
          // Out of flow: a scaled iframe still takes its full layout size, which would stretch a fill-width frame to the
          // page's natural width and lock the scale at 1.
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: widthPx,
            height: heightPx,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            pointerEvents: "none",
          }}
        />
      )}
      {children && <div className="absolute inset-0">{children}</div>}
    </div>
  );
}
