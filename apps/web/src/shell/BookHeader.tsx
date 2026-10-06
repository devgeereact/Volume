import type { Book } from "../data/types";

/**
 * Deprecated (D-016). The book's identity and the one step bar now sit in the shell (BookLayout:
 * BookBar with BookSteps above every book screen, StepFooter below). BookHeader renders nothing so the
 * old StageTrack row does not appear twice; screen agents remove their <BookHeader /> calls.
 */
export function BookHeader(_props: { book: Book }) {
  return null;
}
