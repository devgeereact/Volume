import { useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { isApiError, type ApiError } from "../api/client";
import type { ApiBookDetail } from "../api/types";
import { queryKeys, useBook as useApiBook, useProfile } from "../api/hooks";
import { toPenName, toPrototypeBook } from "../api/adapters";
import { useDataSourceState } from "../api/source";
import { getBook } from "../data/books";
import { getPenName } from "../data/penNames";
import type { Book, PenName } from "../data/types";

export interface BookLookup {
  /** The book in the URL, from the demo data or (in API mode) mapped from the server. */
  book: Book | undefined;
  penName: PenName | undefined;
  /** "demo" for a sample book, "api" for a server book, "none" while loading or when unknown. */
  from: "demo" | "api" | "none";
  /** The server book (GET /books/:id) when `from` is "api". */
  apiBook: ApiBookDetail | undefined;
  /** True while the health check or the server book is still loading. */
  loading: boolean;
  /** The server's answer when the book could not be loaded (404 is `error.code === "not_found"`). */
  error: ApiError | null;
}

/**
 * The book in the URL (/books/:bookId/...) and its pen name.
 *
 * A demo book id always gives the demo book. Any other id is loaded from the server when it answers
 * (useDataSource() is "api"): the server book is mapped with toPrototypeBook, and `apiBook` holds the
 * original. BookLayout waits for `loading` to clear before it renders a screen, so screens inside a
 * book can keep the old pattern `const { book } = useBook(); if (!book) return <NotFound />`.
 */
export function useBook(): BookLookup {
  const { bookId } = useParams();
  const demo = getBook(bookId);
  const { source, checking } = useDataSourceState();
  // A health check that has answered or failed once is settled. A new observer on a failed check
  // reports "pending" again while it refetches, so counting that as loading would swap the screen for
  // the loader, unmount the observer and start over in a tight loop when the server is off.
  const qc = useQueryClient();
  const health = qc.getQueryState(queryKeys.system.health());
  const settled = !!health && (health.dataUpdatedAt > 0 || health.errorUpdatedAt > 0);
  const wantApi = !demo && !!bookId && source === "api";
  const q = useApiBook(wantApi ? bookId : undefined);
  const apiBook = wantApi ? q.data : undefined;
  const profile = useProfile(apiBook?.profileId);

  if (demo) return { book: demo, penName: getPenName(demo.penNameId), from: "demo", apiBook: undefined, loading: false, error: null };
  if (apiBook) {
    return {
      book: toPrototypeBook(apiBook),
      penName: profile.data ? toPenName(profile.data) : undefined,
      from: "api",
      apiBook,
      loading: false,
      error: null,
    };
  }
  const error = wantApi && q.error && isApiError(q.error) ? q.error : null;
  const loading = !!bookId && ((checking && !settled) || (wantApi && q.isPending && q.errorUpdateCount === 0));
  return { book: undefined, penName: undefined, from: "none", apiBook: undefined, loading, error };
}
