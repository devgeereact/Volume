import type { CSSProperties } from "react";
import { getInteriorTheme, type Book, type InteriorTheme } from "../demo";

/* The book's own interior theme (config/interior-themes.json) as CSS for the screens that show its pages:
   the Editor's galley, the Writing live page and the Export page preview. Each book has its own theme,
   so no two books read alike. The faces are the OFL book fonts in styles/book-fonts.css; Literata, the
   interface's book face, is the fallback. Shared by the Editor, Writing and Export screens. */

export interface InteriorLook {
  theme: InteriorTheme | undefined;
  /** Theme name for people ("Thriller Sharp"). */
  name: string;
  /** Body text face, for style={...}. */
  body: CSSProperties;
  /** Chapter and subheading face. */
  heading: CSSProperties;
  /** "Merriweather and Libre Franklin", the faces the PDF embeds. */
  fontsLine: string;
}

const stack = (family: string | undefined) => (family ? `'${family}', var(--font-book)` : "var(--font-book)");

export function interiorLook(book: Book): InteriorLook {
  const theme = getInteriorTheme(book.interiorThemeId);
  const fonts = theme ? [...new Set([theme.bodyFont, theme.headingFont, theme.accentFont].filter((f): f is string => Boolean(f)))] : [];
  return {
    theme,
    name: theme?.name ?? "House style",
    body: { fontFamily: stack(theme?.bodyFont) },
    heading: { fontFamily: stack(theme?.headingFont) },
    fontsLine: fonts.length > 1 ? `${fonts.slice(0, -1).join(", ")} and ${fonts[fonts.length - 1]}` : (fonts[0] ?? "Literata"),
  };
}
