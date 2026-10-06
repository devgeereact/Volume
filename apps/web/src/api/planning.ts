/* Research, titles and blueprint (apps/server/src/routes/planning.ts). Generating calls return 202 with a job. */
import { api, seg, type RequestOptions } from "./client";
import type {
  AcceptedJob,
  ApiBlueprintVersion,
  ApiResearchRunWithSources,
  ApiResearchSource,
  ApiTitleSet,
  BlueprintApproveResponse,
  BlueprintCreateInput,
  BlueprintPartKey,
  BlueprintPatchInput,
  BlueprintResponse,
  ChooseTitleInput,
  ChooseTitleResponse,
  GenerateTitlesInput,
  ListResponse,
  ResearchOverview,
  ResearchStarted,
} from "./types";

type Opts = Pick<RequestOptions, "signal">;

export const planningApi = {
  /* research */
  startResearch: (bookId: string, input: { audienceHint?: string } = {}, o?: Opts) => api.post<ResearchStarted>(`/books/${seg(bookId)}/research`, input, o),
  research: (bookId: string, o?: Opts) => api.get<ResearchOverview>(`/books/${seg(bookId)}/research`, o),
  researchRun: (runId: string, o?: Opts) => api.get<ApiResearchRunWithSources>(`/research-runs/${seg(runId)}`, o),
  setSourceUse: (sourceId: string, useInBook: boolean, o?: Opts) => api.patch<ApiResearchSource>(`/research-sources/${seg(sourceId)}`, { useInBook }, o),

  /* titles */
  generateTitles: (bookId: string, input: GenerateTitlesInput = {}, o?: Opts) => api.post<AcceptedJob>(`/books/${seg(bookId)}/title-sets`, input, o),
  titleSets: (bookId: string, o?: Opts) => api.get<ListResponse<ApiTitleSet>>(`/books/${seg(bookId)}/title-sets`, o),
  chooseTitle: (titleSetId: string, input: ChooseTitleInput, o?: Opts) => api.post<ChooseTitleResponse>(`/title-sets/${seg(titleSetId)}/choose`, input, o),
  /** Stars or unstars option `index` of a title set. */
  setFavourite: (titleSetId: string, index: number, favourite: boolean, o?: Opts) =>
    api.patch<{ titleSet: ApiTitleSet }>(`/title-sets/${seg(titleSetId)}/options/${index}`, { favourite }, o),

  /* blueprint */
  createBlueprint: (bookId: string, input: BlueprintCreateInput = {}, o?: Opts) => api.post<AcceptedJob>(`/books/${seg(bookId)}/blueprints`, input, o),
  blueprint: (bookId: string, o?: Opts) => api.get<BlueprintResponse>(`/books/${seg(bookId)}/blueprint`, o),
  blueprintVersions: (bookId: string, o?: Opts) => api.get<ListResponse<ApiBlueprintVersion>>(`/books/${seg(bookId)}/blueprint/versions`, o),
  blueprintVersion: (bookId: string, version: number, o?: Opts) => api.get<ApiBlueprintVersion>(`/books/${seg(bookId)}/blueprint/versions/${version}`, o),
  patchBlueprint: (bookId: string, input: BlueprintPatchInput, o?: Opts) => api.patch<ApiBlueprintVersion>(`/books/${seg(bookId)}/blueprint`, input, o),
  regenerateBlueprintPart: (bookId: string, input: { part: BlueprintPartKey; instruction?: string }, o?: Opts) =>
    api.post<AcceptedJob>(`/books/${seg(bookId)}/blueprint/regenerate`, input, o),
  approveBlueprint: (bookId: string, input: { version?: number } = {}, o?: Opts) =>
    api.post<BlueprintApproveResponse>(`/books/${seg(bookId)}/blueprint/approve`, input, o),
};
