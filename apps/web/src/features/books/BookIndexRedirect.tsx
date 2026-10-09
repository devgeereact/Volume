import { Navigate } from "react-router";
import { currentStep } from "../../demo/books";
import { useBook } from "../../lib/useBook";
import { NotFound } from "../../shell/NotFound";
import { bookStepPath } from "../../screens";

/** /books/:bookId opens the book at its current step. */
export default function BookIndexRedirect() {
  const { book } = useBook();
  if (!book) return <NotFound what="book" />;
  return <Navigate to={bookStepPath(book.id, currentStep(book))} replace />;
}
