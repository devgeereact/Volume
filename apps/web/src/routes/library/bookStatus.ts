import { libraryColumns, stageLabels } from "../../data/books";
import type { Book, StageId } from "../../data/types";
import { formatNumber } from "../../lib/format";

/* Small helpers that turn a book into the words the Library shows. */

/** The Library column a book sits in. Titles live inside Research on the board. */
export function columnFor(book: Book): StageId {
  return book.stage === "title" ? "research" : book.stage;
}

/** Index of the book's column (0 to 7), used for the ledger's stage ticks. */
export function columnIndex(book: Book): number {
  return libraryColumns.indexOf(columnFor(book));
}

/** Ledger stage line: "Blueprint, ready to approve". The stage word is bold in the row. */
export function ledgerStatus(book: Book): { stage: string; detail: string } {
  const stage = stageLabels[columnFor(book)];
  let detail = book.statusLine;
  if (book.stage === "idea") detail = "saved";
  else if (book.stage === "published") detail = book.statusLine.replace(/^Published\s*/, "") || "marked published";
  else detail = detail.charAt(0).toLowerCase() + detail.slice(1);
  return { stage, detail };
}

/** Words column: "None yet", "0 of 42,000", "21,340 of 38,000" or "44,120". */
export function ledgerWords(book: Book, liveWords: number | null): string {
  const written = liveWords ?? book.words.written;
  if (written === 0 && (book.stage === "idea" || book.stage === "research" || book.stage === "title")) return "None yet";
  if (book.stage === "blueprint" || book.stage === "writing") return `${formatNumber(written)} of ${formatNumber(book.words.target)}`;
  return formatNumber(written);
}

/** Splits a status line into a leading figure and the rest, so "18 sources so far" can bold the 18. */
export function splitLeadingFigure(line: string): { figure: string | null; rest: string } {
  const m = /^(\d[\d,]*)(\s.*)$/.exec(line);
  if (!m || m[1] === undefined || m[2] === undefined) return { figure: null, rest: line };
  return { figure: m[1], rest: m[2] };
}

/** True when the book matches the search text (title, subtitle or pen name). */
export function matchesQuery(book: Book, penName: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [book.title, book.subtitle, penName].some((s) => s.toLowerCase().includes(q));
}
