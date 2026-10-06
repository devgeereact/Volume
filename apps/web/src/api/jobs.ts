/* Jobs: one job with its children, a book's jobs, cancel, pause, resume (apps/server/src/routes/jobs.ts).
   Every job record is passed through withPlainJobError, so known error codes reach the screens in plain words. */
import { api, seg, type RequestOptions } from "./client";
import { withPlainJobError } from "./jobErrors";
import type { ApiJob, ApiJobDetail, ListResponse } from "./types";

type Opts = Pick<RequestOptions, "signal">;

export const jobsApi = {
  get: (jobId: string, o?: Opts) =>
    api.get<ApiJobDetail>(`/jobs/${seg(jobId)}`, o).then((j) => ({ ...withPlainJobError(j), children: j.children.map(withPlainJobError) })),
  forBook: (bookId: string, q: { status?: string; limit?: number } = {}, o?: Opts) =>
    api
      .get<ListResponse<ApiJob>>(`/books/${seg(bookId)}/jobs`, { ...o, query: { status: q.status, limit: q.limit } })
      .then((r) => ({ ...r, items: r.items.map(withPlainJobError) })),
  cancel: (jobId: string, o?: Opts) => api.post<ApiJob>(`/jobs/${seg(jobId)}/cancel`, undefined, o).then(withPlainJobError),
  pause: (jobId: string, o?: Opts) => api.post<ApiJob>(`/jobs/${seg(jobId)}/pause`, undefined, o).then(withPlainJobError),
  resume: (jobId: string, o?: Opts) => api.post<ApiJob>(`/jobs/${seg(jobId)}/resume`, undefined, o).then(withPlainJobError),
};
