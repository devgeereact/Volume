/* Cover studio, preflight and exports, marketing (apps/server/src/routes/production.ts). */
import { api, apiUrl, seg, type RequestOptions } from "./client";
import type {
  AcceptedJob,
  ApiExportRecord,
  ApiMarketingItem,
  ApiPreflightReport,
  CoverResponse,
  ExportsInput,
  ListResponse,
  MarketingKind,
  MarketingListQuery,
  MarketingPatch,
} from "./types";

type Opts = Pick<RequestOptions, "signal">;

export const productionApi = {
  /* cover */
  cover: (bookId: string, o?: Opts) => api.get<CoverResponse>(`/books/${seg(bookId)}/cover`, o),
  putCoverBrief: (bookId: string, brief: Record<string, unknown>, o?: Opts) => api.put<CoverResponse>(`/books/${seg(bookId)}/cover/brief`, { brief }, o),
  coverConcepts: (bookId: string, input: { regenerateBrief?: boolean } = {}, o?: Opts) =>
    api.post<AcceptedJob>(`/books/${seg(bookId)}/cover/concepts`, input, o),
  chooseCover: (bookId: string, input: { assetId: string; typography?: Record<string, unknown> }, o?: Opts) =>
    api.post<CoverResponse>(`/books/${seg(bookId)}/cover/choose`, input, o),
  buildCover: (bookId: string, o?: Opts) => api.post<AcceptedJob>(`/books/${seg(bookId)}/cover/build`, undefined, o),
  /** Puts the owner's uploaded covers in place (asset ids), or takes them out again with null. */
  ownCover: (bookId: string, input: { ebookAssetId?: string | null; wrapAssetId?: string | null }, o?: Opts) =>
    api.post<CoverResponse>(`/books/${seg(bookId)}/cover/own`, input, o),

  /* exports */
  preflight: (bookId: string, o?: Opts) => api.get<ApiPreflightReport>(`/books/${seg(bookId)}/preflight`, o),
  /** Saves (or clears) the owner's "I have checked this" tick for one warning. Answers the new report. */
  acknowledgePreflight: (bookId: string, input: { itemId: string; on: boolean }, o?: Opts) =>
    api.put<ApiPreflightReport>(`/books/${seg(bookId)}/preflight/acknowledgements`, input, o),
  startExports: (bookId: string, input: ExportsInput = {}, o?: Opts) => api.post<AcceptedJob>(`/books/${seg(bookId)}/exports`, input, o),
  exports: (bookId: string, o?: Opts) => api.get<ListResponse<ApiExportRecord>>(`/books/${seg(bookId)}/exports`, o),
  /** URL for an <a download> link. The server streams the file by id. */
  exportDownloadUrl: (exportId: string) => apiUrl(`/exports/${seg(exportId)}/download`),

  /* marketing */
  generateMarketing: (bookId: string, input: { kinds?: MarketingKind[] } = {}, o?: Opts) => api.post<AcceptedJob>(`/books/${seg(bookId)}/marketing`, input, o),
  marketing: (bookId: string, q: MarketingListQuery = {}, o?: Opts) =>
    api.get<ListResponse<ApiMarketingItem>>(`/books/${seg(bookId)}/marketing`, { ...o, query: { kind: q.kind, includeArchived: q.includeArchived } }),
  patchMarketing: (itemId: string, patch: MarketingPatch, o?: Opts) => api.patch<ApiMarketingItem>(`/marketing/${seg(itemId)}`, patch, o),
  archiveMarketing: (itemId: string, o?: Opts) => api.post<ApiMarketingItem>(`/marketing/${seg(itemId)}/archive`, undefined, o),
  restoreMarketing: (itemId: string, o?: Opts) => api.post<ApiMarketingItem>(`/marketing/${seg(itemId)}/restore`, undefined, o),
  /** Writes one item again in place (same id and kind, back to draft) as a job. */
  regenerateMarketing: (itemId: string, input: { instruction?: string } = {}, o?: Opts) =>
    api.post<AcceptedJob>(`/marketing/${seg(itemId)}/regenerate`, input, o),
};
