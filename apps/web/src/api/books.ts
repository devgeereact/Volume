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
  ImportedBookProject,
  ImportedProject,
  PublishInput,
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
  /** Removes a withdrawn model from the book's, its pen name's and the workspace's model choices (owner only). */
  withdrawModel: (id: string, model: string, o?: Opts) =>
    api.post<{ removed: { scope: "book" | "profile" | "workspace"; stage: string }[] }>(`/books/${seg(id)}/models/withdraw`, { model }, o),
  action: (id: string, action: BookAction, o?: Opts) => api.post<ApiBookRow>(`/books/${seg(id)}/${action}`, undefined, o),
  /** Marks the book published. 400 `invalid_published_at` for a date after today; 409 when the batch quality gate holds it. */
  publish: (id: string, input: PublishInput = {}, o?: Opts) =>
    api.post<ApiBookRow>(`/books/${seg(id)}/publish`, input.publishedAt ? { publishedAt: input.publishedAt } : undefined, o),
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

  /** Moves a book in from another Volume (D-051): a new book under `profileId` from the zip that exportProject made.
      Owner or editor. 400 validation_failed, 403, 404 for a profile outside the workspace, 409 invalid_state for an
      archived pen name, 413, 415 and 429. */
  importProjectFile: (file: Blob, profileId: string, o?: Opts) => {
    const form = new FormData();
    form.append("profileId", profileId);
    form.append("file", file, file instanceof File ? file.name : "project.zip");
    return apiRequest<ImportedBookProject>("POST", "/books/import-project", form, o);
  },

  /* library feeds */
  activity: (limit = 30, o?: Opts) => api.get<ListResponse<ApiActivityItem>>("/activity", { ...o, query: { limit } }),
  /** Archived books, profiles and marketing items in one list. */
  archive: (o?: Opts) => api.get<ListResponse<ApiArchiveItem>>("/archive", o),
  /** POST to an archive item's restorePath. */
  restoreArchived: (item: Pick<ApiArchiveItem, "restorePath">, o?: Opts) => api.post<unknown>(item.restorePath, undefined, o),
};
