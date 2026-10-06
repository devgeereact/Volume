import type { CSSProperties } from "react";
import type { Book } from "../../data";
import { parseTrim } from "./kdpRules";
import { interiorLook } from "../../lib/interiorLook";

/* Printed-page colours: paper and black ink are book content (like cover palettes), not interface
   tokens, so the preview looks like the page in both themes. */
const PAPER = { white: "#FFFFFF", cream: "#FAF4E6" } as const;
const INK = "#1E1D1B";

interface PageSample {
  kicker: string | null;
  title: string;
  lead: string | null;
  meta: string | null;
  columns: [string[], string[]] | null;
  paragraphs: string[];
}

/** A first page for the preview, written for each book in the demo. */
function sampleFor(book: Book, numberFormat: string): PageSample {
  if (book.id === "sourdough-on-a-weeknight")
    return {
      kicker: null,
      title: "A Tuesday Loaf",
      lead: "Mix it before work, shape it after dinner and bake it before bed. This is the loaf the rest of the book builds on.",
      meta: "Makes 1 loaf. Hands-on 25 minutes. Ready in about 14 hours.",
      columns: [
        ["100 g active starter", "350 g water", "500 g strong white flour", "10 g fine salt"],
        [
          "Stir the starter into the water, then the flour, until no dry bits remain.",
          "Leave it covered for an hour, then add the salt with wet hands.",
          "Fold it four times over the next two hours, then cover it and leave it overnight.",
          "In the evening, shape it, prove it in the fridge for an hour and bake it in a hot lidded pot.",
        ],
      ],
      paragraphs: [],
    };
  const kicker = numberFormat === "words" ? "Chapter One" : numberFormat === "numerals" ? "1" : null;
  return {
    kicker,
    title: book.subtitle ? "Where it starts" : book.title,
    lead: null,
    meta: null,
    columns: null,
    paragraphs: [
      `${book.title} opens here. The first page sets the tone for everything after it, so it is set in the book's own theme.`,
      "Margins, leading and the chapter opener follow the theme's settings, checked against KDP's guidance.",
    ],
  };
}

/** The book's first interior page in its own theme: faces, sizes, alignment, opener and paper. */
export function InteriorPreview({ book, paper = "cream", width = 220 }: { book: Book; paper?: "white" | "cream"; width?: number }) {
  const look = interiorLook(book);
  const t = look.theme;
  const trim = parseTrim(book.trim);
  const scale = width / (trim.w * 72); // points to pixels at this preview width
  const bodyPx = (t?.sizes.bodyPt ?? 11) * scale * 1.5; // nudged up so the sample stays readable on screen
  const sample = sampleFor(book, t?.chapterOpener.numberFormat ?? "numerals");
  const align: CSSProperties["textAlign"] = t?.text.align === "justified" ? "justify" : "left";
  const margin = (t?.margins.outsideIn ?? 0.6) * 72 * scale;
  const dropCap = t?.dropCaps.enabled ?? false;

  return (
    <figure className="grid justify-items-start gap-2">
      <div
        aria-label={`First page in the ${look.name} theme: ${look.fontsLine}`}
        role="img"
        className="overflow-hidden rounded-xs shadow-sheet"
        style={{ width, aspectRatio: `${trim.w} / ${trim.h}`, background: PAPER[paper], color: INK, padding: `${margin * 1.4}px ${margin}px` }}
      >
        <div
          aria-hidden
          style={{ ...look.body, fontSize: bodyPx, lineHeight: t?.sizes.lineHeight ?? 1.4, textAlign: align, hyphens: t?.text.hyphenate ? "auto" : "manual" }}
        >
          {sample.kicker && <p style={{ ...look.heading, fontSize: bodyPx * 1.6, lineHeight: 1, opacity: 0.8 }}>{sample.kicker}</p>}
          <p style={{ ...look.heading, fontSize: bodyPx * 2, lineHeight: 1.05, fontWeight: 700, marginTop: bodyPx * 0.4, textAlign: "left" }}>{sample.title}</p>
          {t?.ornament && t.ornament !== "none" && <p style={{ marginTop: bodyPx * 0.5, opacity: 0.6, textAlign: "left" }}>{t.sceneBreak.glyph}</p>}
          {sample.lead && <p style={{ marginTop: bodyPx * 0.6, fontStyle: "italic" }}>{sample.lead}</p>}
          {sample.meta && <p style={{ ...look.heading, marginTop: bodyPx * 0.5, fontSize: bodyPx * 0.85, fontWeight: 600 }}>{sample.meta}</p>}
          {sample.columns && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: bodyPx, marginTop: bodyPx * 0.8, textAlign: "left" }}>
              <ul>
                {sample.columns[0].map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <ol style={{ listStyle: "decimal", paddingLeft: bodyPx }}>
                {sample.columns[1].map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ol>
            </div>
          )}
          {sample.paragraphs.map((x, i) => (
            <p key={i} style={{ marginTop: i === 0 ? bodyPx * 0.8 : 0, textIndent: i > 0 ? `${t?.text.paragraphIndentEm ?? 1.2}em` : 0 }}>
              {i === 0 && dropCap ? (
                <>
                  <span style={{ ...look.heading, float: "left", fontSize: bodyPx * 2.6, lineHeight: 0.85, paddingRight: bodyPx * 0.2 }}>{x.charAt(0)}</span>
                  {x.slice(1)}
                </>
              ) : (
                x
              )}
            </p>
          ))}
        </div>
      </div>
      <figcaption className="text-small text-ink-secondary">
        <span className="font-medium text-ink">{look.name}</span> interior: {look.fontsLine}, {t?.sizes.bodyPt ?? 11} pt body.
      </figcaption>
    </figure>
  );
}
