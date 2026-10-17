/* Sections, versions, writing jobs, notes, suggestions and claims (apps/server/src/routes/manuscript.ts). */
import { api, seg, type RequestOptions } from "./client";
import type {
  ApiSectionVersionSummary,
  AcceptedJob,
  AcceptSuggestionResponse,
  ApiAuthorNote,
  ApiClaim,
  ApiLedgerItem,
  ApiSection,
  ApiSectionVersion,
  ApiSuggestion,
  ClaimResolveResponse,
  ClaimStatus,
  ClaimVerifyInput,
  EditPassInput,
  FindQuery,
  FindResult,
  ListResponse,
  NoteInput,
  NotePatch,
  NoteStatus,
  ReplaceInput,
  ReplaceResult,
  RewriteSelectionInput,
  SaveVersionInput,
  SectionDetail,
  SectionDiff,
  SectionPatch,
  SectionTree,
  SuggestionStatus,
  WeaveInput,
} from "./types";

type Opts = Pick<RequestOptions, "signal">;

export const manuscriptApi = {
  /* sections */
  tree: (bookId: string, o?: Opts) => api.get<SectionTree>(`/books/${seg(bookId)}/sections`, o),
  section: (sectionId: string, o?: Opts) => api.get<SectionDetail>(`/sections/${seg(sectionId)}`, o),
  /** The story ledger, optionally one kind (character, setting and so on). Read only. */
  storyLedger: (bookId: string, kind?: string, o?: Opts) =>
    api.get<ListResponse<ApiLedgerItem>>(`/books/${seg(bookId)}/story-ledger`, { ...o, query: { kind } }),
  patchSection: (sectionId: string, patch: SectionPatch, o?: Opts) => api.patch<ApiSection>(`/sections/${seg(sectionId)}`, patch, o),

  /* versions */
  saveVersion: (sectionId: string, input: SaveVersionInput, o?: Opts) => api.post<ApiSectionVersion>(`/sections/${seg(sectionId)}/versions`, input, o),
  versions: (sectionId: string, o?: Opts) => api.get<ListResponse<ApiSectionVersionSummary>>(`/sections/${seg(sectionId)}/versions`, o),
  version: (sectionId: string, versionId: string, o?: Opts) => api.get<ApiSectionVersion>(`/sections/${seg(sectionId)}/versions/${seg(versionId)}`, o),
  restoreVersion: (sectionId: string, versionId: string, o?: Opts) =>
    api.post<ApiSectionVersion>(`/sections/${seg(sectionId)}/versions/${seg(versionId)}/restore`, undefined, o),
  diff: (sectionId: string, from: string, to?: string, o?: Opts) => api.get<SectionDiff>(`/sections/${seg(sectionId)}/diff`, { ...o, query: { from, to } }),

  /* writing jobs (202) */
  writeBook: (bookId: string, input: { onlyEmpty?: boolean } = {}, o?: Opts) => api.post<AcceptedJob>(`/books/${seg(bookId)}/write`, input, o),
  writeSection: (sectionId: string, input: { instruction?: string } = {}, o?: Opts) => api.post<AcceptedJob>(`/sections/${seg(sectionId)}/write`, input, o),
  editPass: (sectionId: string, input: EditPassInput, o?: Opts) => api.post<AcceptedJob>(`/sections/${seg(sectionId)}/edit-pass`, input, o),
  /** Summary rerun for a saved section whose summary failed (open summary_missing flag). The text is not rewritten. */
  summarise: (sectionId: string, o?: Opts) => api.post<AcceptedJob>(`/sections/${seg(sectionId)}/summarise`, {}, o),

  /* author notes */
  addNote: (sectionId: string, input: NoteInput, o?: Opts) => api.post<ApiAuthorNote>(`/sections/${seg(sectionId)}/notes`, input, o),
  sectionNotes: (sectionId: string, status?: NoteStatus, o?: Opts) =>
    api.get<ListResponse<ApiAuthorNote>>(`/sections/${seg(sectionId)}/notes`, { ...o, query: { status } }),
  bookNotes: (bookId: string, status?: NoteStatus, o?: Opts) =>
    api.get<ListResponse<ApiAuthorNote>>(`/books/${seg(bookId)}/notes`, { ...o, query: { status } }),
  patchNote: (noteId: string, patch: NotePatch, o?: Opts) => api.patch<ApiAuthorNote>(`/notes/${seg(noteId)}`, patch, o),
  /** Weave (or, with mode "expand", expand) notes into the section as a job. */
  weaveNotes: (sectionId: string, input: WeaveInput = {}, o?: Opts) => api.post<AcceptedJob>(`/sections/${seg(sectionId)}/notes/weave`, input, o),
  /** A woven or dismissed note goes back to open. */
  reopenNote: (noteId: string, o?: Opts) => api.post<ApiAuthorNote>(`/notes/${seg(noteId)}/reopen`, undefined, o),

  /* selection rewrite (job; the result is a RewriteProposal, nothing is saved) */
  rewriteSelection: (sectionId: string, input: RewriteSelectionInput, o?: Opts) =>
    api.post<AcceptedJob>(`/sections/${seg(sectionId)}/rewrite-selection`, input, o),

  /* whole-book find and replace */
  find: (bookId: string, q: FindQuery, o?: Opts) =>
    api.get<FindResult>(`/books/${seg(bookId)}/find`, {
      ...o,
      query: { q: q.q, case: q.caseSensitive ? "true" : undefined, word: q.word ? "true" : undefined },
    }),
  replace: (bookId: string, input: ReplaceInput, o?: Opts) => api.post<ReplaceResult>(`/books/${seg(bookId)}/replace`, input, o),

  /* suggestions */
  suggestions: (sectionId: string, status?: SuggestionStatus, o?: Opts) =>
    api.get<ListResponse<ApiSuggestion>>(`/sections/${seg(sectionId)}/suggestions`, { ...o, query: { status } }),
  acceptSuggestion: (suggestionId: string, input: { remember?: boolean } = {}, o?: Opts) =>
    api.post<AcceptSuggestionResponse>(`/suggestions/${seg(suggestionId)}/accept`, input, o),
  rejectSuggestion: (suggestionId: string, o?: Opts) => api.post<{ suggestion: ApiSuggestion }>(`/suggestions/${seg(suggestionId)}/reject`, undefined, o),

  /* claims */
  claims: (bookId: string, filter: { status?: ClaimStatus; sectionId?: string } = {}, o?: Opts) =>
    api.get<ListResponse<ApiClaim>>(`/books/${seg(bookId)}/claims`, { ...o, query: { status: filter.status, sectionId: filter.sectionId } }),
  verifyClaim: (claimId: string, input: ClaimVerifyInput = {}, o?: Opts) => api.post<ClaimResolveResponse>(`/claims/${seg(claimId)}/verify`, input, o),
  /** Without a replacement the server uses the claim's suggestedSoftening (400 when there is neither). */
  softenClaim: (claimId: string, input: { replacement?: string; note?: string }, o?: Opts) =>
    api.post<ClaimResolveResponse>(`/claims/${seg(claimId)}/soften`, input, o),
  removeClaim: (claimId: string, input: { note?: string } = {}, o?: Opts) => api.post<ClaimResolveResponse>(`/claims/${seg(claimId)}/remove`, input, o),
};
