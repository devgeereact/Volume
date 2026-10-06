import type { CSSProperties, ReactNode } from "react";
import type { CoverDesign, CoverTypeface } from "../../data/types";
import { cn } from "../../lib/cn";

interface CoverProps {
  title: string;
  subtitle?: string | undefined;
  author: string;
  /** null draws the dashed "No cover yet" frame. */
  design: CoverDesign | null;
  /** CSS width (number = px). Use className="w-full" for a fluid cover. */
  width?: number | string | undefined;
  /** Hide the subtitle on very small covers (thumbnails, ledger rows). */
  hideSubtitle?: boolean | undefined;
  /** Wrap in the cover-lift layer. The nearest ancestor with class "group" triggers the lift on hover and focus. */
  lift?: boolean | undefined;
  /** Force the lifted pose (style guide). */
  lifted?: boolean | undefined;
  /** Set when the title is already announced next to the cover. */
  decorative?: boolean | undefined;
  className?: string | undefined;
}

/* Cover title faces. All are SIL OFL 1.1 book-content fonts installed from Fontsource
   (styles/book-fonts.css, assets/fonts/README.md); config/cover-styles.json names the same families.
   The interface never uses these fonts. Each stack falls back to the app's own fonts. */
const book = "var(--vol-font-book)";
const ui = "var(--vol-font-ui)";
const faces: Record<CoverTypeface, CSSProperties> = {
  "serif-display": { fontFamily: `'DM Serif Display', ${book}`, fontWeight: 400, lineHeight: 0.94, letterSpacing: "-0.01em" },
  "condensed-black": { fontFamily: `'Big Shoulders Display', ${ui}`, fontWeight: 900, lineHeight: 0.84, letterSpacing: "-0.01em" },
  "grotesk-heavy": { fontFamily: `'Libre Franklin', ${ui}`, fontWeight: 800, lineHeight: 0.98, letterSpacing: "-0.025em" },
  "italic-serif": { fontFamily: `'DM Serif Display', ${book}`, fontStyle: "italic", fontWeight: 400, lineHeight: 0.98 },
  "slab-serif": { fontFamily: `'Young Serif', ${book}`, fontWeight: 400, lineHeight: 1.04, letterSpacing: "-0.01em" },
  "didone-italic": { fontFamily: `'Bodoni Moda', ${book}`, fontStyle: "italic", fontWeight: 600, lineHeight: 0.98, fontVariationSettings: '"opsz" 16' },
  "playfair-italic": { fontFamily: `'Playfair Display', ${book}`, fontStyle: "italic", fontWeight: 500, lineHeight: 1.02 },
  "playfair-roman": { fontFamily: `'Playfair Display', ${book}`, fontWeight: 700, lineHeight: 1.02, letterSpacing: "-0.01em" },
  "wide-caps": { fontFamily: `'Libre Franklin', ${ui}`, fontWeight: 800, lineHeight: 1.2 },
  "soft-serif": { fontFamily: `'Fraunces', ${book}`, fontWeight: 700, lineHeight: 1, fontVariationSettings: '"opsz" 72' },
  "friendly-round": { fontFamily: `'Nunito', ${ui}`, fontWeight: 900, lineHeight: 0.96 },
  "tech-grotesk": { fontFamily: `'Space Grotesk', ${ui}`, fontWeight: 700, lineHeight: 0.98 },
  "garamond-caps": { fontFamily: `'Cormorant Garamond', ${book}`, fontWeight: 600, lineHeight: 1.06 },
  "garamond-italic": { fontFamily: `'Cormorant Garamond', ${book}`, fontStyle: "italic", fontWeight: 500, lineHeight: 1.06 },
  "stack-black": { fontFamily: `'Libre Franklin', ${ui}`, fontWeight: 900, lineHeight: 0.86 },
  "hyperlegible-bold": { fontFamily: `'Atkinson Hyperlegible Next', ${ui}`, fontWeight: 800, lineHeight: 1 },
};

const cq = (n: number) => `${n}cqw`;

/** Small four-point stars for the stars-moon motif: x, y, size. */
const stars: [number, number, number][] = [
  [14, 14, 1.6],
  [28, 30, 1.1],
  [20, 50, 1.4],
  [42, 12, 1],
  [46, 44, 1.8],
  [88, 12, 1.2],
  [92, 56, 1.5],
  [34, 62, 1],
  [70, 62, 1.1],
  [8, 34, 0.9],
];

function starPath(x: number, y: number, r: number): string {
  const l = r * 2.4;
  const w = r * 0.7;
  return `M${x} ${y - l} L${x + w} ${y - w} L${x + l} ${y} L${x + w} ${y + w} L${x} ${y + l} L${x - w} ${y + w} L${x - l} ${y} L${x - w} ${y - w} Z`;
}

function Svg({ box, viewBox, children, preserve }: { box: CSSProperties; viewBox: string; children: ReactNode; preserve?: string }) {
  return (
    <svg viewBox={viewBox} preserveAspectRatio={preserve} style={box} aria-hidden>
      {children}
    </svg>
  );
}

function Motif({ design }: { design: CoverDesign }) {
  const { motif, motifBox: b, palette: p } = design;
  const box: CSSProperties = { top: cq(b.top), left: cq(b.left), width: cq(b.width), height: cq(b.height) };
  switch (motif) {
    case "waves":
      return (
        <Svg box={box} viewBox="0 0 100 40" preserve="none">
          <g fill="none" stroke={p.motif} strokeWidth=".9">
            <path d="M0 6 Q6.25 0 12.5 6 T25 6 T37.5 6 T50 6 T62.5 6 T75 6 T87.5 6 T100 6" opacity=".9" />
            <path d="M0 15 Q6.25 11 12.5 15 T25 15 T37.5 15 T50 15 T62.5 15 T75 15 T87.5 15 T100 15" opacity=".75" />
            <path d="M0 23 Q6.25 20.6 12.5 23 T25 23 T37.5 23 T50 23 T62.5 23 T75 23 T87.5 23 T100 23" opacity=".6" />
            <path d="M0 30 Q6.25 29 12.5 30 T25 30 T37.5 30 T50 30 T62.5 30 T75 30 T87.5 30 T100 30" opacity=".5" />
            <path d="M0 36.5 H100" opacity=".4" />
          </g>
        </Svg>
      );
    case "rule":
      return <span aria-hidden style={{ ...box, background: p.motif }} />;
    case "orbs":
      return (
        <>
          <span aria-hidden style={{ ...box, borderRadius: "50%", background: p.motif }} />
          <span
            aria-hidden
            style={{ top: cq(b.top + 20), left: cq(b.left + 20), width: cq(16), height: cq(16), borderRadius: "50%", background: p.motifAlt }}
          />
        </>
      );
    case "speech":
      return (
        <Svg box={box} viewBox="0 0 44 40">
          <path d="M4 4 H40 V28 H18 L9 36 V28 H4 Z" fill="none" stroke={p.motif} strokeWidth="2.2" strokeLinejoin="round" />
          <path d="M12 13 H32 M12 19 H26" stroke={p.motif} strokeWidth="2.2" strokeLinecap="round" />
        </Svg>
      );
    case "loaf":
      return (
        <Svg box={box} viewBox="0 0 60 60">
          <circle cx="30" cy="30" r="26" fill={p.motif} />
          <circle cx="30" cy="30" r="26" fill="none" stroke={p.motifAlt} strokeWidth="1.2" opacity=".6" />
          <path d="M14 22 Q30 14 46 22 M12 31 Q30 23 48 31 M15 40 Q30 33 45 40" fill="none" stroke={p.background} strokeWidth="2.4" strokeLinecap="round" />
        </Svg>
      );
    case "sprig":
      return (
        <Svg box={box} viewBox="0 0 40 68">
          <path d="M20 66 V6" stroke={p.motif} strokeWidth="1.6" fill="none" />
          <g fill={p.motif}>
            <path d="M20 14 C12 12 8 6 9 2 C15 3 19 8 20 14Z" />
            <path d="M20 14 C28 12 32 6 31 2 C25 3 21 8 20 14Z" />
            <path d="M20 30 C10 28 5 21 6 16 C14 17 19 23 20 30Z" />
            <path d="M20 30 C30 28 35 21 34 16 C26 17 21 23 20 30Z" />
            <path d="M20 47 C9 45 3 37 4 31 C13 32 19 39 20 47Z" />
            <path d="M20 47 C31 45 37 37 36 31 C27 32 21 39 20 47Z" />
          </g>
        </Svg>
      );
    case "stars-moon":
      return (
        <Svg box={box} viewBox="0 0 100 70">
          <path d="M62 10 A20 20 0 1 0 82 38 A15 15 0 1 1 62 10 Z" fill={p.motif} />
          <g fill={p.motifAlt}>
            {stars.map(([x, y, r]) => (
              <path key={`${x}-${y}`} d={starPath(x, y, r)} />
            ))}
          </g>
        </Svg>
      );
    case "kite":
      return (
        <Svg box={box} viewBox="0 0 40 80">
          <path d="M20 2 L36 22 L20 46 L4 22 Z" fill={p.motif} />
          <path d="M20 2 V46 M4 22 H36" stroke={p.background} strokeWidth="1.4" />
          <path d="M20 46 C14 54 26 58 20 66 C14 72 22 76 18 79" fill="none" stroke={p.motifAlt} strokeWidth="1.6" strokeLinecap="round" />
          <g fill={p.motifAlt}>
            <path d="M17 54 L23 52 L22 57 Z" />
            <path d="M17 66 L23 64 L22 69 Z" />
          </g>
        </Svg>
      );
    case "keyhole":
      return (
        <Svg box={box} viewBox="0 0 36 62">
          <circle cx="18" cy="18" r="17" fill="none" stroke={p.motifAlt} strokeWidth=".8" />
          <circle cx="18" cy="18" r="13" fill="none" stroke={p.motifAlt} strokeWidth=".6" opacity=".7" />
          <circle cx="18" cy="17" r="7" fill={p.motif} />
          <path d="M14.2 21 L11 46 H25 L21.8 21 Z" fill={p.motif} />
          <path d="M18 50 V62" stroke={p.motifAlt} strokeWidth=".8" />
        </Svg>
      );
    case "circuit-grid":
      return (
        <Svg box={box} viewBox="0 0 100 52" preserve="none">
          <g stroke={p.motifAlt} strokeWidth=".35">
            {[8, 18, 28, 38, 48].map((y) => (
              <path key={`h${y}`} d={`M0 ${y} H100`} />
            ))}
            {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((x) => (
              <path key={`v${x}`} d={`M${x} 0 V52`} />
            ))}
          </g>
          <g fill="none" stroke={p.motif} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 38 H30 V18 H60 V28 H80" />
            <path d="M40 48 V28 H50" />
            <path d="M70 8 V18" />
          </g>
          <g fill={p.motif}>
            <circle cx="10" cy="38" r="1.8" />
            <circle cx="80" cy="28" r="1.8" />
            <circle cx="50" cy="28" r="1.8" />
            <circle cx="70" cy="8" r="1.8" />
            <circle cx="40" cy="48" r="1.8" />
          </g>
        </Svg>
      );
    case "sun-sea":
      return (
        <Svg box={box} viewBox="0 0 100 40" preserve="none">
          <path d="M28 18 A22 22 0 0 1 72 18 Z" fill={p.motif} />
          <g fill="none" stroke={p.motifAlt} strokeWidth="1.1" strokeLinecap="round">
            <path d="M0 18 H100" />
            <path d="M8 24 H40 M52 24 H92" opacity=".85" />
            <path d="M18 30 H56 M66 30 H84" opacity=".7" />
            <path d="M30 36 H70" opacity=".55" />
          </g>
          <g fill="none" stroke={p.title} strokeWidth=".7" strokeLinecap="round" opacity=".7">
            <path d="M14 6 Q16 4 18 6 Q20 4 22 6" />
            <path d="M80 3 Q81.5 1.5 83 3 Q84.5 1.5 86 3" />
          </g>
        </Svg>
      );
    case "rays":
      return (
        <Svg box={box} viewBox="0 0 100 70" preserve="none">
          <g stroke={p.motif} strokeWidth=".5" opacity=".75">
            {[-40, -28, -17, -8, 0, 8, 17, 28, 40].map((dx) => (
              <path key={dx} d={`M50 0 L${50 + dx * 1.6} 70`} />
            ))}
          </g>
          <circle cx="50" cy="0" r="7" fill={p.motif} opacity=".9" />
        </Svg>
      );
    case "magnifier":
      return (
        <Svg box={box} viewBox="0 0 32 40">
          <circle cx="13" cy="13" r="10" fill="none" stroke={p.motif} strokeWidth="2.2" />
          <path d="M20.5 20.5 L29 36" stroke={p.motif} strokeWidth="3.2" strokeLinecap="round" />
        </Svg>
      );
    case "crest":
      return (
        <Svg box={box} viewBox="0 0 50 50">
          <circle cx="25" cy="25" r="23" fill="none" stroke={p.motif} strokeWidth=".9" />
          <circle cx="25" cy="25" r="18" fill="none" stroke={p.motif} strokeWidth=".5" strokeDasharray="1 1.6" />
          <circle cx="25" cy="25" r="12" fill={p.motifAlt} />
          <path d="M25 9 L27.4 22.6 L41 25 L27.4 27.4 L25 41 L22.6 27.4 L9 25 L22.6 22.6 Z" fill={p.motif} />
        </Svg>
      );
    case "blocks":
      return (
        <Svg box={box} viewBox="0 0 80 52">
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={i * 6} y={i * 17} width={80 - i * 12} height="13" rx="1.5" fill={p.motif} opacity={1 - i * 0.18} />
              <rect x={i * 6 + 4} y={i * 17 + 3.5} width="6" height="6" rx="1" fill="none" stroke={p.background} strokeWidth="1.2" />
              {i < 2 && (
                <path
                  d={`M${i * 6 + 5.2} ${i * 17 + 6.6} L${i * 6 + 6.8} ${i * 17 + 8.2} L${i * 6 + 9} ${i * 17 + 4.8}`}
                  fill="none"
                  stroke={p.background}
                  strokeWidth="1.2"
                />
              )}
              <rect x={i * 6 + 14} y={i * 17 + 5.5} width={40 - i * 8} height="2" rx="1" fill={p.background} opacity=".7" />
            </g>
          ))}
        </Svg>
      );
    case "none":
      return null;
  }
}

/**
 * Typographic book cover drawn from data: 2:3, 3 px radius, spine shade and cover shadow, so it sits
 * on the page like an object. Designs come from config/cover-styles.json via coverFromStyle (data/covers.ts):
 * an OFL title face, a layout, a motif and a palette. The interface never puts its own text on a cover.
 */
export function Cover({ title, subtitle, author, design, width, hideSubtitle, lift, lifted, decorative, className }: CoverProps) {
  const style: CSSProperties = width !== undefined ? { width } : {};
  const a11y = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": design ? `Cover of ${title}${author ? ` by ${author}` : ""}` : `No cover yet for ${title}` };

  let cover: ReactNode;
  if (design) {
    const align = design.align ?? "left";
    const centred = align === "center";
    const accent = design.accentFamily ? `'${design.accentFamily}', ${ui}` : ui;
    const authorStyle = design.authorStyle ?? "caps";
    const sides: CSSProperties = centred ? { left: cq(9), right: cq(9), textAlign: "center" } : { left: cq(10), right: cq(9) };
    cover = (
      <div className={cn("vol-cover", !lift && className)} style={{ ...style, background: design.palette.background }} {...a11y}>
        {design.band && (
          <span
            aria-hidden
            style={{ top: cq(design.band.top), left: 0, right: 0, height: cq(design.band.height), background: design.bandColour ?? design.palette.motifAlt }}
          />
        )}
        {design.frame && (
          <>
            <span aria-hidden style={{ inset: cq(4.5), border: `${cq(0.7)} solid ${design.palette.motif}` }} />
            <span aria-hidden style={{ inset: cq(6.5), border: `${cq(0.3)} solid ${design.palette.motif}` }} />
          </>
        )}
        <Motif design={design} />
        <p
          style={{
            ...faces[design.typeface],
            ...sides,
            top: cq(design.titleTop),
            fontSize: cq(design.titleSize),
            color: design.palette.title,
            textTransform: design.titleUppercase ? "uppercase" : "none",
            ...(design.titleTracking ? { letterSpacing: design.titleTracking } : {}),
          }}
        >
          {design.titleLines.map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </p>
        {subtitle && design.subtitleTop !== null && !hideSubtitle && (
          <p
            style={{
              ...(centred
                ? { left: cq(design.subtitleRightInset), right: cq(design.subtitleRightInset), textAlign: "center" }
                : { left: cq(10), right: cq(design.subtitleRightInset) }),
              top: cq(design.subtitleTop),
              fontFamily: accent,
              fontSize: cq(5.2),
              lineHeight: 1.3,
              fontWeight: 500,
              color: design.palette.subtitle,
            }}
          >
            {subtitle}
          </p>
        )}
        <p
          style={{
            ...sides,
            bottom: cq(design.frame ? 11 : 9),
            fontFamily: authorStyle === "caps" ? ui : accent,
            fontSize: cq(authorStyle === "caps" ? 4.4 : 5.6),
            lineHeight: 1,
            fontWeight: authorStyle === "caps" ? 600 : 500,
            fontStyle: authorStyle === "italic" ? "italic" : "normal",
            letterSpacing: authorStyle === "caps" ? "0.16em" : "0.01em",
            textTransform: authorStyle === "caps" ? "uppercase" : "none",
            color: design.palette.author,
          }}
        >
          {author}
        </p>
      </div>
    );
  } else {
    cover = (
      <div className={cn("vol-cover vol-cover-none", !lift && className)} style={style} {...a11y}>
        <p className="px-[10cqw] text-center font-book text-ink-secondary italic" style={{ fontSize: cq(11), lineHeight: 1.1 }}>
          {title}
          <span className="mt-[6cqw] block font-ui font-medium text-ink-tertiary not-italic" style={{ fontSize: cq(7), lineHeight: 1.2 }}>
            No cover yet
          </span>
        </p>
      </div>
    );
  }

  if (!lift) return cover;
  return (
    <div className={cn("vol-lift", className)} style={style} data-lifted={lifted ? "true" : undefined}>
      {cover}
    </div>
  );
}
