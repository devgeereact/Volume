/* Volume mode: who am I, members and invitations (owner only), data rights (leave, delete, export), batches and
   the title schedule (apps/server/src/routes/members.ts, account.ts, batches.ts, schedule.ts). */
import { api, apiDownload, seg, type RequestOptions } from "./client";
import { withPlainJobError } from "./jobErrors";
import type {
  ApiBatchDetail,
  ApiBatchItem,
  ApiBatchSummary,
  ApiInvitation,
  ApiMe,
  ApiMember,
  ApiTitleSlot,
  BatchGatesResponse,
  BatchInput,
  BatchPatch,
  BatchStarted,
  InvitationInput,
  ListResponse,
  MemberRole,
  MembersResponse,
  ScheduleResponse,
  SlotInput,
} from "./types";

type Opts = Pick<RequestOptions, "signal">;

export const volumeApi = {
  me: (o?: Opts) => api.get<ApiMe>("/me", o),

  members: (o?: Opts) => api.get<MembersResponse>("/members", o),
  invite: (body: InvitationInput, o?: Opts) => api.post<ApiInvitation>("/invitations", body, o),
  revokeInvitation: (id: string, o?: Opts) => api.delete(`/invitations/${seg(id)}`, o),
  setMemberRole: (userId: string, role: MemberRole, o?: Opts) => api.patch<ApiMember>(`/members/${seg(userId)}`, { role }, o),
  /** D-050: the server needs { confirm: "REMOVE" }, typed by the owner. */
  removeMember: (userId: string, confirm: string, o?: Opts) => api.delete(`/members/${seg(userId)}`, o, { confirm }),

  /** D-050: an editor or viewer leaves this workspace. Owners get 409. */
  leave: (confirm: string, o?: Opts) => api.post("/me/leave", { confirm }, o),
  /** D-050: the owner of a guest workspace deletes it with every book and file. 403 for the instance workspace, 409 while a job runs. */
  deleteWorkspace: (confirm: string, o?: Opts) => api.delete("/workspace", o, { confirm }),
  /** D-050: the owner's zip of the whole workspace. 403 for editors and viewers, 409 while one runs, 429 when rate limited. */
  exportWorkspace: (o?: Opts) => apiDownload("GET", "/workspace/export", "application/zip", o),

  batches: (o?: Opts) => api.get<ListResponse<ApiBatchSummary>>("/batches", o).then((r) => r.items),
  batch: (id: string, o?: Opts) => api.get<ApiBatchDetail>(`/batches/${seg(id)}`, o),
  createBatch: (body: BatchInput, o?: Opts) => api.post<ApiBatchDetail>("/batches", body, o),
  patchBatch: (id: string, body: BatchPatch, o?: Opts) => api.patch<ApiBatchDetail>(`/batches/${seg(id)}`, body, o),
  deleteBatch: (id: string, o?: Opts) => api.delete(`/batches/${seg(id)}`, o),
  startBatch: (id: string, body: { chapterCount?: number } = {}, o?: Opts) =>
    api.post<BatchStarted>(`/batches/${seg(id)}/start`, body, o).then((r) => ({ ...r, job: withPlainJobError(r.job) })),
  gates: (id: string, o?: Opts) => api.get<BatchGatesResponse>(`/batches/${seg(id)}/gates`, o),
  markReady: (id: string, itemId: string, o?: Opts) => api.post<ApiBatchItem>(`/batches/${seg(id)}/items/${seg(itemId)}/ready`, undefined, o),

  schedule: (q: { from?: number; to?: number } = {}, o?: Opts) => api.get<ScheduleResponse>("/schedule", { ...o, query: { from: q.from, to: q.to } }),
  addSlot: (body: SlotInput, o?: Opts) => api.post<ApiTitleSlot>("/schedule/slots", body, o),
  confirmSlot: (id: string, o?: Opts) => api.post<ApiTitleSlot>(`/schedule/slots/${seg(id)}/confirm`, undefined, o),
  removeSlot: (id: string, o?: Opts) => api.delete(`/schedule/slots/${seg(id)}`, o),
};
