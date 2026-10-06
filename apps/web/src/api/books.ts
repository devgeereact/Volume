/* Books: library list, create, one book, status actions, duplicate, delete, costs, estimates, project
   files and the library feeds (apps/server/src/routes/books.ts, estimate.ts, transfer.ts). */
import { api, apiDownload, apiRequest, seg, type RequestOptions } from "./client";
import type {
  ApiActivityItem,
  ApiArchiveItem,
  ApiBookDetail,
  ApiBookRow,
  BookAction,
  BookCosts,
  BookInput,
  BookListQuery,
  BookPatch,
  Estimate,
  EstimateInput,
  ImportedProject,
  ListResponse,
} from "./types";

type Opts = Pick<RequestOptions, "signal">;

export const booksApi = {
  importManuscript: (input: { profileId: string; markdown: string }, o?: Opts) =>
    api.post<{ bookId: string; sections: number }>("/books/import-manuscript", input, o),
  list: (q: BookListQuery = {}, o?: Opts) =>
    api.get<ListResponse<ApiBookRow>>("/books", {
      ...o,
      query: { profileId: q.profileId, stage: q.stage, status: q.status, published: q.published, q: q.q, limit: q.limit, offset: q.offset },
    }),
  /** One book with manuscript totals and the last ten jobs. */
  get: (id: string, o?: Opts) => api.get<ApiBookDetail>(`/books/${seg(id)}`, o),
  create: (input: BookInput, o?: Opts) => api.post<ApiBookRow>("/books", input, o),
  /** Also sets list prices (pounds, null clears one) and the marketplace (null resets it). */
  update: (id: string, patch: BookPatch, o?: Opts) => api.patch<ApiBookRow>(`/books/${seg(id)}`, patch, o),
  action: (id: string, action: BookAction, o?: Opts) => api.post<ApiBookRow>(`/books/${seg(id)}/${action}`, undefined, o),
  duplicate: (id: string, o?: Opts) => api.post<ApiBookRow>(`/books/${seg(id)}/duplicate`, undefined, o),
  /** Owner-confirmed delete of an archived book. `confirm` must be its exact title (409 otherwise). */
  remove: (id: string, confirm: string, o?: Opts) => apiRequest<void>("DELETE", `/books/${seg(id)}`, { confirm }, o),
  costs: (id: string, o?: Opts) => api.get<BookCosts>(`/books/${seg(id)}/costs`, o),
  /** What a stage would cost before it runs. */
  estimate: (id: string, input: EstimateInput, o?: Opts) => api.post<Estimate>(`/books/${seg(id)}/estimate`, input, o),

  /* moving a book between workspaces */
  /** The book's project zip (project.json and its files). */
  exportProject: (id: string, o?: Opts) => apiDownload("POST", `/books/${seg(id)}/export-project`, "application/zip", o),
  /** Loads a project zip. Without profileId the matching pen name is used, else a copy is made. */
  importProject: (file: Blob, profileId: string | null, o?: Opts) =>
    apiRequest<ImportedProject>("POST", "/projects/import", new Blob([file], { type: "application/zip" }), {
      ...o,
      query: { profileId: profileId ?? undefined },
    }),

  /* library feeds */
  activity: (limit = 30, o?: Opts) => api.get<ListResponse<ApiActivityItem>>("/activity", { ...o, query: { limit } }),
  /** Archived books, profiles and marketing items in one list. */
  archive: (o?: Opts) => api.get<ListResponse<ApiArchiveItem>>("/archive", o),
  /** POST to an archive item's restorePath. */
  restoreArchived: (item: Pick<ApiArchiveItem, "restorePath">, o?: Opts) => api.post<unknown>(item.restorePath, undefined, o),
};
