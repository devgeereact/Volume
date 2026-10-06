/* Author profiles and pen names, voice samples and profile memory (apps/server/src/routes/profiles.ts). */
import { api, apiRequest, seg, type RequestOptions } from "./client";
import type {
  ApiProfile,
  ListResponse,
  MemoryInput,
  MemoryPatch,
  ProfileInput,
  ProfileListQuery,
  ProfileMemoryItem,
  ProfilePatch,
  ProfileSample,
  SampleInput,
} from "./types";

type Opts = Pick<RequestOptions, "signal">;

export const profilesApi = {
  list: (q: ProfileListQuery = {}, o?: Opts) =>
    api.get<ListResponse<ApiProfile>>("/profiles", { ...o, query: { status: q.status, includeArchived: q.includeArchived } }),
  get: (id: string, o?: Opts) => api.get<ApiProfile>(`/profiles/${seg(id)}`, o),
  create: (input: ProfileInput, o?: Opts) => api.post<ApiProfile>("/profiles", input, o),
  update: (id: string, patch: ProfilePatch, o?: Opts) => api.patch<ApiProfile>(`/profiles/${seg(id)}`, patch, o),
  archive: (id: string, o?: Opts) => api.post<ApiProfile>(`/profiles/${seg(id)}/archive`, undefined, o),
  restore: (id: string, o?: Opts) => api.post<ApiProfile>(`/profiles/${seg(id)}/restore`, undefined, o),
  /** Owner-confirmed delete of an archived profile with no books. `confirm` must be its exact pen name. */
  remove: (id: string, confirm: string, o?: Opts) => apiRequest<void>("DELETE", `/profiles/${seg(id)}`, { confirm }, o),

  samples: (id: string, o?: Opts) => api.get<ListResponse<ProfileSample>>(`/profiles/${seg(id)}/samples`, o),
  addSample: (id: string, input: SampleInput, o?: Opts) => api.post<ProfileSample>(`/profiles/${seg(id)}/samples`, input, o),
  updateSample: (id: string, sampleId: string, patch: Partial<SampleInput>, o?: Opts) =>
    api.patch<ProfileSample>(`/profiles/${seg(id)}/samples/${seg(sampleId)}`, patch, o),
  deleteSample: (id: string, sampleId: string, o?: Opts) => api.delete(`/profiles/${seg(id)}/samples/${seg(sampleId)}`, o),

  memory: (id: string, o?: Opts) => api.get<ListResponse<ProfileMemoryItem>>(`/profiles/${seg(id)}/memory`, o),
  addMemory: (id: string, input: MemoryInput, o?: Opts) => api.post<ProfileMemoryItem>(`/profiles/${seg(id)}/memory`, input, o),
  updateMemory: (id: string, memoryId: string, patch: MemoryPatch, o?: Opts) =>
    api.patch<ProfileMemoryItem>(`/profiles/${seg(id)}/memory/${seg(memoryId)}`, patch, o),
  deleteMemory: (id: string, memoryId: string, o?: Opts) => api.delete(`/profiles/${seg(id)}/memory/${seg(memoryId)}`, o),
};
