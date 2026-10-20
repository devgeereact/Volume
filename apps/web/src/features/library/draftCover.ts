import { getBookType } from "../../demo/config";
import { coverFromStyle } from "../../demo/covers";
import type { Book, CoverDesign } from "../../demo/types";

/* Books at Idea or Research have no cover yet. So the Library still shows every book with its own look,
   they get a draft cover drawn from the book's cover style (config/cover-styles.json) and its first
   palette. The Cover studio replaces it with the real one. */

/** Splits a title into two lines of about the same length ("Night Shift" / "Survival"). */
export function titleLines(title: string): string[] {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return [title];
  let best = 1;
  let bestGap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const gap = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

const cache = new Map<string, CoverDesign | null>();

/** The book's cover, or a draft from its cover style when it has none yet. */
export function libraryCover(book: Book): { design: CoverDesign | null; draft: boolean; image: string | null } {
  if (book.cover) return { design: book.cover, draft: false, image: null };
  const image = book.coverImage?.src ?? null;
  if (!cache.has(book.id)) {
    let design: CoverDesign | null;
    try {
      // A book without its own style yet borrows its book type's default style.
      const style = book.coverStyleId || getBookType(book.bookTypeId)?.defaultCoverStyle || "";
      design = coverFromStyle(style, "", titleLines(book.title));
    } catch {
      design = null;
    }
    cache.set(book.id, design);
  }
  return { design: cache.get(book.id) ?? null, draft: image === null, image };
}
