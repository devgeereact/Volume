/* TanStack Query hooks for every server area. Screens import from here (or from "./index").

   Query keys
   - Book-scoped data lives under ["book", bookId, ...], so invalidating ["book", bookId] refreshes
     everything for one book. Section-scoped data lives under ["section", sectionId, ...].
   - Lists that span books (library, profiles) have their own roots: ["books"], ["profiles"].
   Mutations invalidate the narrowest keys that the server call changes. Calls that start a job
   (202) put the job into the cache under ["job", jobId] and refresh the book's job list; the
   finished result arrives through useBookEvents (events.ts), which invalidates the area. */

import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { booksApi } from "./books";
import { jobsApi } from "./jobs";
import { manuscriptApi } from "./manuscript";
import { planningApi } from "./planning";
import { productionApi } from "./production";
import { profilesApi } from "./profiles";
import { systemApi } from "./system";
import {
  isTerminalJob,
  type AcceptedJob,
  type ApiBlueprintVersion,
  type ApiJob,
  type ApiJobDetail,
  type ApiArchiveItem,
  type ApiListPrices,
  type BlueprintCreateInput,
  type BlueprintPartKey,
  type BlueprintPatchInput,
  type BookInput,
  type BookListQuery,
  type BookPatch,
  type CatalogueName,
  type ChooseTitleInput,
  type ClaimStatus,
  type ClaimVerifyInput,
  type EditPassInput,
  type EstimateInput,
  type EstimateStage,
  type ExportsInput,
  type FindQuery,
  type GenerateTitlesInput,
  type MarketingKind,
  type MarketingListQuery,
  type MarketingPatch,
  type ModelSettingsPut,
  type NoteInput,
  type NotePatch,
  type NoteStatus,
  type ProfileListQuery,
  type SaveVersionInput,
  type SettingValues,
  type SuggestionStatus,
} from "./types";

/* ---------- Query keys ---------- */

export const queryKeys = {
  system: {
    all: ["system"] as const,
    health: () => ["system", "health"] as const,
    settings: () => ["system", "settings"] as const,
    models: () => ["system", "models"] as const,
  },
  catalogue: {
    all: ["catalogue"] as const,
    one: (name: CatalogueName) => ["catalogue", name] as const,
  },
  profiles: {
    all: ["profiles"] as const,
    list: (q: ProfileListQuery = {}) => ["profiles", "list", q] as const,
    detail: (id: string) => ["profiles", "detail", id] as const,
    samples: (id: string) => ["profiles", "detail", id, "samples"] as const,
    memory: (id: string) => ["profiles", "detail", id, "memory"] as const,
  },
  books: {
    all: ["books"] as const,
    list: (q: BookListQuery = {}) => ["books", "list", q] as const,
  },
  /** Workspace-wide feeds: the library's activity, the archive and backups. */
  workspace: {
    all: ["workspace"] as const,
    activity: (limit: number) => ["workspace", "activity", limit] as const,
    activityAll: ["workspace", "activity"] as const,
    archive: () => ["workspace", "archive"] as const,
    backups: () => ["workspace", "backups"] as const,
  },
  book: {
    all: (bookId: string) => ["book", bookId] as const,
    detail: (bookId: string) => ["book", bookId, "detail"] as const,
    costs: (bookId: string) => ["book", bookId, "costs"] as const,
    research: (bookId: string) => ["book", bookId, "research"] as const,
    titleSets: (bookId: string) => ["book", bookId, "title-sets"] as const,
    blueprint: (bookId: string) => ["book", bookId, "blueprint"] as const,
    blueprintVersions: (bookId: string) => ["book", bookId, "blueprint", "versions"] as const,
    blueprintVersion: (bookId: string, version: number) => ["book", bookId, "blueprint", "versions", version] as const,
    sections: (bookId: string) => ["book", bookId, "sections"] as const,
    notes: (bookId: string, status?: NoteStatus) => ["book", bookId, "notes", status ?? "all"] as const,
    notesAll: (bookId: string) => ["book", bookId, "notes"] as const,
    claims: (bookId: string, f: { status?: ClaimStatus; sectionId?: string } = {}) => ["book", bookId, "claims", f] as const,
    claimsAll: (bookId: string) => ["book", bookId, "claims"] as const,
    cover: (bookId: string) => ["book", bookId, "cover"] as const,
    preflight: (bookId: string) => ["book", bookId, "preflight"] as const,
    exports: (bookId: string) => ["book", bookId, "exports"] as const,
    marketing: (bookId: string, q: MarketingListQuery = {}) => ["book", bookId, "marketing", q] as const,
    marketingAll: (bookId: string) => ["book", bookId, "marketing"] as const,
    jobs: (bookId: string, q: { status?: string; limit?: number } = {}) => ["book", bookId, "jobs", q] as const,
    jobsAll: (bookId: string) => ["book", bookId, "jobs"] as const,
    /** Under the book, so a book refresh refreshes estimates too. */
    estimate: (bookId: string, input: EstimateInput) => ["book", bookId, "estimate", input] as const,
    find: (bookId: string, q: FindQuery | null) => ["book", bookId, "find", q] as const,
    findAll: (bookId: string) => ["book", bookId, "find"] as const,
    /** Live state from SSE (events.ts). Not fetched from the server. */
    live: (bookId: string) => ["book", bookId, "live"] as const,
  },
  researchRun: (runId: string) => ["research-run", runId] as const,
  section: {
    all: (sectionId: string) => ["section", sectionId] as const,
    detail: (sectionId: string) => ["section", sectionId, "detail"] as const,
    versions: (sectionId: string) => ["section", sectionId, "versions"] as const,
    version: (sectionId: string, versionId: string) => ["section", sectionId, "versions", versionId] as const,
    diff: (sectionId: string, from: string, to?: string) => ["section", sectionId, "diff", from, to ?? "current"] as const,
    notes: (sectionId: string, status?: NoteStatus) => ["section", sectionId, "notes", status ?? "all"] as const,
    notesAll: (sectionId: string) => ["section", sectionId, "notes"] as const,
    suggestions: (sectionId: string, status?: SuggestionStatus) => ["section", sectionId, "suggestions", status ?? "all"] as const,
    suggestionsAll: (sectionId: string) => ["section", sectionId, "suggestions"] as const,
  },
  job: (jobId: string) => ["job", jobId] as const,
};

/* ---------- Helpers ---------- */

/** Route params can be undefined; queries stay disabled until the id is known. */
function need(id: string | undefined, what: string): string {
  if (!id) throw new Error(`${what} is missing.`);
  return id;
}

function invalidate(qc: QueryClient, ...keys: QueryKey[]): Promise<void> {
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey }))).then(() => undefined);
}

/** After a 202: cache the job, refresh the book's job list and its detail (recentJobs). */
export function rememberJob(qc: QueryClient, accepted: AcceptedJob): void {
  const job = accepted.job;
  qc.setQueryData<ApiJobDetail>(queryKeys.job(job.id), (old) => ({ ...job, children: old?.children ?? [] }));
  if (job.projectId) void invalidate(qc, queryKeys.book.jobsAll(job.projectId), queryKeys.book.detail(job.projectId));
}

/** rememberJob for screens that start a job with a plain call (for example rewrite-selection) rather than a mutation hook. */
export function useRememberJob(): (accepted: AcceptedJob) => void {
  const qc = useQueryClient();
  return useCallback((accepted: AcceptedJob) => rememberJob(qc, accepted), [qc]);
}

/** Book changes show on the library list and on the book itself. */
function bookChanged(qc: QueryClient, bookId: string): Promise<void> {
  return invalidate(qc, queryKeys.books.all, queryKeys.book.detail(bookId));
}

/* ---------- System ---------- */

export function useHealth(options: { refetchIntervalMs?: number | false } = {}) {
  return useQuery({
    queryKey: queryKeys.system.health(),
    queryFn: ({ signal }) => systemApi.health({ signal }),
    retry: false,
    refetchInterval: options.refetchIntervalMs ?? false,
  });
}

/** Options every list and settings query takes. `enabled: false` keeps the query switched off (demo mode). */
export interface QueryOptions {
  enabled?: boolean | undefined;
}

export function useSettings(options: QueryOptions = {}) {
  return useQuery({ queryKey: queryKeys.system.settings(), queryFn: ({ signal }) => systemApi.settings({ signal }), enabled: options.enabled ?? true });
}

export function usePatchSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingValues) => systemApi.patchSettings(patch),
    onSuccess: () => invalidate(qc, queryKeys.system.settings(), queryKeys.system.models()),
  });
}

export function useModelSettings(options: QueryOptions = {}) {
  return useQuery({ queryKey: queryKeys.system.models(), queryFn: ({ signal }) => systemApi.models({ signal }), enabled: options.enabled ?? true });
}

export function usePutModelSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ModelSettingsPut) => systemApi.putModels(body),
    onSuccess: () => invalidate(qc, queryKeys.system.models(), queryKeys.system.settings()),
  });
}

/** POST /settings/openrouter/test. Settings refresh afterwards (the credit is read again). */
export function useTestOpenRouter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => systemApi.testOpenRouter(),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.system.settings() }),
  });
}

export function useBackups(options: QueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.workspace.backups(),
    queryFn: ({ signal }) => systemApi.backups({ signal }),
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/** Make a backup now. */
export function useMakeBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => systemApi.makeBackup(),
    onSuccess: () => invalidate(qc, queryKeys.workspace.backups(), queryKeys.system.settings()),
  });
}

/* ---------- Catalogues ---------- */

/* ---------- Profiles ---------- */

export function useProfiles(q: ProfileListQuery = {}, options: QueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.profiles.list(q),
    queryFn: ({ signal }) => profilesApi.list(q, { signal }),
    select: (r) => r.items,
    enabled: options.enabled ?? true,
  });
}

export function useProfile(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profiles.detail(id ?? ""),
    queryFn: ({ signal }) => profilesApi.get(need(id, "Profile id"), { signal }),
    enabled: !!id,
  });
}

export function useProfileSamples(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profiles.samples(id ?? ""),
    queryFn: ({ signal }) => profilesApi.samples(need(id, "Profile id"), { signal }),
    enabled: !!id,
    select: (r) => r.items,
  });
}

export function useProfileMemory(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.profiles.memory(id ?? ""),
    queryFn: ({ signal }) => profilesApi.memory(need(id, "Profile id"), { signal }),
    enabled: !!id,
    select: (r) => r.items,
  });
}

/* ---------- Books ---------- */

export function useBooks(q: BookListQuery = {}, options: QueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.books.list(q),
    queryFn: ({ signal }) => booksApi.list(q, { signal }),
    select: (r) => r.items,
    enabled: options.enabled ?? true,
  });
}

export function useBook(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.detail(bookId ?? ""),
    queryFn: ({ signal }) => booksApi.get(need(bookId, "Book id"), { signal }),
    enabled: !!bookId,
  });
}

export function useBookCosts(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.costs(bookId ?? ""),
    queryFn: ({ signal }) => booksApi.costs(need(bookId, "Book id"), { signal }),
    enabled: !!bookId,
  });
}

export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BookInput) => booksApi.create(input),
    onSuccess: () => invalidate(qc, queryKeys.books.all),
  });
}

export function useUpdateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; patch: BookPatch }) => booksApi.update(v.bookId, v.patch),
    onSuccess: (_b, v) => bookChanged(qc, v.bookId),
  });
}

/** List prices (pounds, null clears one) and the marketplace (null resets it) of a published book. */
export function useSetPublishedDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; listPrices: Partial<ApiListPrices>; marketplace: string | null }) =>
      booksApi.update(v.bookId, { listPrices: v.listPrices, marketplace: v.marketplace }),
    onSuccess: (_b, v) => bookChanged(qc, v.bookId),
  });
}

/** What a stage would cost before it runs. Cached under the book, so it refreshes with it. */
export function useEstimate(
  bookId: string | undefined,
  stage: EstimateStage,
  opts: { sectionIds?: string[] | undefined; partTarget?: string | undefined; enabled?: boolean | undefined } = {},
) {
  const input: EstimateInput = { stage };
  if (opts.sectionIds) input.sectionIds = opts.sectionIds;
  if (opts.partTarget) input.partTarget = opts.partTarget;
  return useQuery({
    queryKey: queryKeys.book.estimate(bookId ?? "", input),
    queryFn: ({ signal }) => booksApi.estimate(need(bookId, "Book id"), input, { signal }),
    enabled: !!bookId && (opts.enabled ?? true),
    staleTime: 60_000,
    retry: false,
  });
}

/* ---------- Library feeds: activity and archive ---------- */

/** Everything an archive restore, a delete or an import can change. */
function libraryChanged(qc: QueryClient): Promise<void> {
  return invalidate(qc, queryKeys.workspace.archive(), queryKeys.workspace.activityAll, queryKeys.books.all, queryKeys.profiles.all, ["book"]);
}

/** The library's live panel, newest first. */
export function useActivity(limit = 30, options: QueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.workspace.activity(limit),
    queryFn: ({ signal }) => booksApi.activity(limit, { signal }),
    select: (r) => r.items,
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/** Archived books, profiles and marketing items in one list. */
export function useArchive(options: QueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.workspace.archive(),
    queryFn: ({ signal }) => booksApi.archive({ signal }),
    select: (r) => r.items,
    enabled: options.enabled ?? true,
    retry: false,
  });
}

/** Restore an archive item (POST to its restorePath). */
export function useRestoreArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (item: ApiArchiveItem) => booksApi.restoreArchived(item),
    onSuccess: () => libraryChanged(qc),
  });
}

/** Delete an archived book or profile for good. `confirm` is its exact title or pen name (409 otherwise). */
export function useDeleteArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { item: Pick<ApiArchiveItem, "kind" | "id">; confirm: string }) =>
      v.item.kind === "book" ? booksApi.remove(v.item.id, v.confirm) : profilesApi.remove(v.item.id, v.confirm),
    onSuccess: () => libraryChanged(qc),
  });
}

/** Load a project zip. `profileId` puts the book under an existing profile. */
export function useImportProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { file: File; profileId: string | null }) => booksApi.importProject(v.file, v.profileId),
    onSuccess: () => libraryChanged(qc),
  });
}

/* ---------- Research ---------- */

export function useResearch(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.research(bookId ?? ""),
    queryFn: ({ signal }) => planningApi.research(need(bookId, "Book id"), { signal }),
    enabled: !!bookId,
  });
}

export function useResearchRun(runId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.researchRun(runId ?? ""),
    queryFn: ({ signal }) => planningApi.researchRun(need(runId, "Research run id"), { signal }),
    enabled: !!runId,
  });
}

export function useStartResearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; audienceHint?: string }) =>
      planningApi.startResearch(v.bookId, v.audienceHint === undefined ? {} : { audienceHint: v.audienceHint }),
    onSuccess: (r, v) => {
      rememberJob(qc, r);
      return invalidate(qc, queryKeys.book.research(v.bookId));
    },
  });
}

export function useSetSourceUse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sourceId: string; useInBook: boolean }) => planningApi.setSourceUse(v.sourceId, v.useInBook),
    onSuccess: (s, v) => invalidate(qc, queryKeys.book.research(v.bookId), queryKeys.researchRun(s.researchRunId)),
  });
}

/* ---------- Titles ---------- */

export function useTitleSets(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.titleSets(bookId ?? ""),
    queryFn: ({ signal }) => planningApi.titleSets(need(bookId, "Book id"), { signal }),
    enabled: !!bookId,
    select: (r) => r.items,
  });
}

/**
 * New title ideas. With `directionKey` (from a title set) the writer drafts titles for that direction only;
 * without it the server suggests directions itself.
 */
export function useGenerateTitles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; directionKey?: string; titleSetId?: string; instruction?: string }) => {
      const input: GenerateTitlesInput = {};
      if (v.directionKey) input.directionKey = v.directionKey;
      if (v.directionKey && v.titleSetId) input.titleSetId = v.titleSetId;
      if (v.instruction) input.instruction = v.instruction;
      return planningApi.generateTitles(v.bookId, input);
    },
    onSuccess: (r, v) => {
      rememberJob(qc, r);
      void qc.invalidateQueries({ queryKey: queryKeys.book.titleSets(v.bookId) });
    },
  });
}

/** Star or unstar option `index` of a title set. */
export function useSetFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; titleSetId: string; index: number; favourite: boolean }) => planningApi.setFavourite(v.titleSetId, v.index, v.favourite),
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: queryKeys.book.titleSets(v.bookId) }),
  });
}

export function useChooseTitle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; titleSetId: string; input: ChooseTitleInput }) => planningApi.chooseTitle(v.titleSetId, v.input),
    onSuccess: (_r, v) => Promise.all([invalidate(qc, queryKeys.book.titleSets(v.bookId)), bookChanged(qc, v.bookId)]),
  });
}

/* ---------- Blueprint ---------- */

export function useBlueprint(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.blueprint(bookId ?? ""),
    queryFn: ({ signal }) => planningApi.blueprint(need(bookId, "Book id"), { signal }),
    enabled: !!bookId,
  });
}

export function useBlueprintVersions(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.blueprintVersions(bookId ?? ""),
    queryFn: ({ signal }) => planningApi.blueprintVersions(need(bookId, "Book id"), { signal }),
    enabled: !!bookId,
    select: (r) => r.items,
  });
}

export function useCreateBlueprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; input?: BlueprintCreateInput }) => planningApi.createBlueprint(v.bookId, v.input ?? {}),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

/** Owner edit saved as a new version. A stale baseVersion fails with ApiError code "conflict". */
export function usePatchBlueprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; input: BlueprintPatchInput }) => planningApi.patchBlueprint(v.bookId, v.input),
    onSuccess: (_bp: ApiBlueprintVersion, v) => invalidate(qc, queryKeys.book.blueprint(v.bookId)),
  });
}

export function useRegenerateBlueprintPart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; part: BlueprintPartKey; instruction?: string }) =>
      planningApi.regenerateBlueprintPart(v.bookId, v.instruction === undefined ? { part: v.part } : { part: v.part, instruction: v.instruction }),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

/** Approve: creates or updates the sections and moves the book to writing. */
export function useApproveBlueprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; version?: number }) => planningApi.approveBlueprint(v.bookId, v.version === undefined ? {} : { version: v.version }),
    onSuccess: (_r, v) => Promise.all([invalidate(qc, queryKeys.book.blueprint(v.bookId), queryKeys.book.sections(v.bookId)), bookChanged(qc, v.bookId)]),
  });
}

/* ---------- Manuscript ---------- */

export function useSectionTree(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.sections(bookId ?? ""),
    queryFn: ({ signal }) => manuscriptApi.tree(need(bookId, "Book id"), { signal }),
    enabled: !!bookId,
  });
}

export function useSection(sectionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.section.detail(sectionId ?? ""),
    queryFn: ({ signal }) => manuscriptApi.section(need(sectionId, "Section id"), { signal }),
    enabled: !!sectionId,
  });
}

export function useSectionVersions(sectionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.section.versions(sectionId ?? ""),
    queryFn: ({ signal }) => manuscriptApi.versions(need(sectionId, "Section id"), { signal }),
    enabled: !!sectionId,
    select: (r) => r.items,
  });
}

export function useSectionVersion(sectionId: string | undefined, versionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.section.version(sectionId ?? "", versionId ?? ""),
    queryFn: ({ signal }) => manuscriptApi.version(need(sectionId, "Section id"), need(versionId, "Version id"), { signal }),
    enabled: !!sectionId && !!versionId,
    staleTime: Infinity,
  });
}

export function useSectionDiff(sectionId: string | undefined, from: string | undefined, to?: string) {
  return useQuery({
    queryKey: queryKeys.section.diff(sectionId ?? "", from ?? "", to),
    queryFn: ({ signal }) => manuscriptApi.diff(need(sectionId, "Section id"), need(from, "Version id"), to, { signal }),
    enabled: !!sectionId && !!from,
  });
}

function sectionTextChanged(qc: QueryClient, bookId: string, sectionId: string): Promise<void> {
  return invalidate(qc, queryKeys.section.all(sectionId), queryKeys.book.sections(bookId), queryKeys.book.preflight(bookId), queryKeys.book.exports(bookId));
}

/** Save the editor text. A stale baseVersionId fails with ApiError code "conflict". */
export function useSaveVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string; input: SaveVersionInput }) => manuscriptApi.saveVersion(v.sectionId, v.input),
    onSuccess: (_ver, v) => sectionTextChanged(qc, v.bookId, v.sectionId),
  });
}

export function useRestoreVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string; versionId: string }) => manuscriptApi.restoreVersion(v.sectionId, v.versionId),
    onSuccess: (_ver, v) => sectionTextChanged(qc, v.bookId, v.sectionId),
  });
}

export function useWriteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; onlyEmpty?: boolean }) => manuscriptApi.writeBook(v.bookId, v.onlyEmpty === undefined ? {} : { onlyEmpty: v.onlyEmpty }),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

export function useWriteSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string; instruction?: string }) =>
      manuscriptApi.writeSection(v.sectionId, v.instruction === undefined ? {} : { instruction: v.instruction }),
    onSuccess: (r, v) => {
      rememberJob(qc, r);
      return invalidate(qc, queryKeys.book.sections(v.bookId), queryKeys.section.detail(v.sectionId));
    },
  });
}

export function useEditPass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string; input: EditPassInput }) => manuscriptApi.editPass(v.sectionId, v.input),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

export function useBookNotes(bookId: string | undefined, status?: NoteStatus) {
  return useQuery({
    queryKey: queryKeys.book.notes(bookId ?? "", status),
    queryFn: ({ signal }) => manuscriptApi.bookNotes(need(bookId, "Book id"), status, { signal }),
    enabled: !!bookId,
    select: (r) => r.items,
  });
}

function notesChanged(qc: QueryClient, bookId: string, sectionId: string): Promise<void> {
  return invalidate(qc, queryKeys.section.notesAll(sectionId), queryKeys.book.notesAll(bookId));
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string; input: NoteInput }) => manuscriptApi.addNote(v.sectionId, v.input),
    onSuccess: (_n, v) => notesChanged(qc, v.bookId, v.sectionId),
  });
}

export function usePatchNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string; noteId: string; patch: NotePatch }) => manuscriptApi.patchNote(v.noteId, v.patch),
    onSuccess: (_n, v) => notesChanged(qc, v.bookId, v.sectionId),
  });
}

/** Whole-book find. Off while the query is empty. */
export function useBookFind(bookId: string | undefined, q: FindQuery | null) {
  return useQuery({
    queryKey: queryKeys.book.find(bookId ?? "", q),
    queryFn: ({ signal }) => manuscriptApi.find(need(bookId, "Book id"), q ?? { q: "", caseSensitive: false, word: false }, { signal }),
    enabled: !!bookId && !!q && q.q.length > 0,
    staleTime: 0,
  });
}

/**
 * Refreshes what a server-side text change touches (replace, weave, restore): the tree, preflight,
 * exports, notes, find results and the sections named.
 */
export function useTextChanged(): (bookId: string, sectionIds: string[]) => Promise<void> {
  const qc = useQueryClient();
  return useCallback(
    (bookId: string, sectionIds: string[]) =>
      invalidate(
        qc,
        queryKeys.book.sections(bookId),
        queryKeys.book.preflight(bookId),
        queryKeys.book.exports(bookId),
        queryKeys.book.notesAll(bookId),
        queryKeys.book.findAll(bookId),
        ...sectionIds.map((id) => queryKeys.section.all(id)),
      ),
    [qc],
  );
}

export function useSuggestions(sectionId: string | undefined, status?: SuggestionStatus) {
  return useQuery({
    queryKey: queryKeys.section.suggestions(sectionId ?? "", status),
    queryFn: ({ signal }) => manuscriptApi.suggestions(need(sectionId, "Section id"), status, { signal }),
    enabled: !!sectionId,
    select: (r) => r.items,
  });
}

/** Accept a suggestion. A stale one fails with ApiError code "conflict" and is marked stale. */
export function useAcceptSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string; suggestionId: string; remember?: boolean }) =>
      manuscriptApi.acceptSuggestion(v.suggestionId, v.remember === undefined ? {} : { remember: v.remember }),
    onSuccess: (r, v) => {
      const keys: QueryKey[] = [queryKeys.book.detail(v.bookId)];
      if (r.memory) keys.push(queryKeys.profiles.memory(r.memory.profileId));
      return Promise.all([sectionTextChanged(qc, v.bookId, v.sectionId), invalidate(qc, ...keys)]);
    },
    onError: (_e, v) => invalidate(qc, queryKeys.section.suggestionsAll(v.sectionId)),
  });
}

export function useRejectSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { sectionId: string; suggestionId: string }) => manuscriptApi.rejectSuggestion(v.suggestionId),
    onSuccess: (_r, v) => invalidate(qc, queryKeys.section.suggestionsAll(v.sectionId)),
  });
}

export function useClaims(bookId: string | undefined, filter: { status?: ClaimStatus; sectionId?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.book.claims(bookId ?? "", filter),
    queryFn: ({ signal }) => manuscriptApi.claims(need(bookId, "Book id"), filter, { signal }),
    enabled: !!bookId,
    select: (r) => r.items,
  });
}

export type ClaimAction =
  | { action: "verify"; input?: ClaimVerifyInput }
  | { action: "soften"; input: { replacement?: string; note?: string } }
  | { action: "remove"; input?: { note?: string } };

/** Verify, soften or remove a claim. Soften and remove save a new section version. */
export function useResolveClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; claimId: string } & ClaimAction) => {
      if (v.action === "verify") return manuscriptApi.verifyClaim(v.claimId, v.input ?? {});
      if (v.action === "soften") return manuscriptApi.softenClaim(v.claimId, v.input);
      return manuscriptApi.removeClaim(v.claimId, v.input ?? {});
    },
    onSuccess: (r, v) => {
      const keys: QueryKey[] = [queryKeys.book.claimsAll(v.bookId), queryKeys.book.preflight(v.bookId)];
      if (r.version) keys.push(queryKeys.section.all(r.version.sectionId), queryKeys.book.sections(v.bookId));
      return invalidate(qc, ...keys);
    },
  });
}

/* ---------- Cover ---------- */

export function useCover(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.cover(bookId ?? ""),
    queryFn: ({ signal }) => productionApi.cover(need(bookId, "Book id"), { signal }),
    enabled: !!bookId,
    select: (r) => r.cover,
  });
}

export function usePutCoverBrief() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; brief: Record<string, unknown> }) => productionApi.putCoverBrief(v.bookId, v.brief),
    onSuccess: (r, v) => qc.setQueryData(queryKeys.book.cover(v.bookId), r),
  });
}

export function useCoverConcepts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; regenerateBrief?: boolean }) =>
      productionApi.coverConcepts(v.bookId, v.regenerateBrief === undefined ? {} : { regenerateBrief: v.regenerateBrief }),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

export function useChooseCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; assetId: string; typography?: Record<string, unknown> }) =>
      productionApi.chooseCover(v.bookId, v.typography === undefined ? { assetId: v.assetId } : { assetId: v.assetId, typography: v.typography }),
    onSuccess: (r, v) => qc.setQueryData(queryKeys.book.cover(v.bookId), r),
  });
}

export function useBuildCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string }) => productionApi.buildCover(v.bookId),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

/* ---------- Export ---------- */

export function usePreflight(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.preflight(bookId ?? ""),
    queryFn: ({ signal }) => productionApi.preflight(need(bookId, "Book id"), { signal }),
    enabled: !!bookId,
  });
}

export function useExports(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.exports(bookId ?? ""),
    queryFn: ({ signal }) => productionApi.exports(need(bookId, "Book id"), { signal }),
    enabled: !!bookId,
    select: (r) => r.items,
  });
}

export function useStartExports() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; input?: ExportsInput }) => productionApi.startExports(v.bookId, v.input ?? {}),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

/* ---------- Marketing ---------- */

export function useMarketing(bookId: string | undefined, q: MarketingListQuery = {}) {
  return useQuery({
    queryKey: queryKeys.book.marketing(bookId ?? "", q),
    queryFn: ({ signal }) => productionApi.marketing(need(bookId, "Book id"), q, { signal }),
    enabled: !!bookId,
    select: (r) => r.items,
  });
}

export function useGenerateMarketing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; kinds?: MarketingKind[] }) => productionApi.generateMarketing(v.bookId, v.kinds === undefined ? {} : { kinds: v.kinds }),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

export function usePatchMarketing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; itemId: string; patch: MarketingPatch }) => productionApi.patchMarketing(v.itemId, v.patch),
    onSuccess: (_m, v) => invalidate(qc, queryKeys.book.marketingAll(v.bookId)),
  });
}

export function useMarketingStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; itemId: string; action: "archive" | "restore" }) =>
      v.action === "archive" ? productionApi.archiveMarketing(v.itemId) : productionApi.restoreMarketing(v.itemId),
    onSuccess: (_m, v) => invalidate(qc, queryKeys.book.marketingAll(v.bookId)),
  });
}

/* ---------- Jobs ---------- */

export function useBookJobs(bookId: string | undefined, q: { status?: string; limit?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.book.jobs(bookId ?? "", q),
    queryFn: ({ signal }) => jobsApi.forBook(need(bookId, "Book id"), q, { signal }),
    enabled: !!bookId,
    select: (r) => r.items,
  });
}

/** One job. SSE keeps it fresh; a slow poll covers the gap while the event stream reconnects. */
export function useJob(jobId: string | undefined, options: { pollMs?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.job(jobId ?? ""),
    queryFn: ({ signal }) => jobsApi.get(need(jobId, "Job id"), { signal }),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isTerminalJob(status) ? false : (options.pollMs ?? 10_000);
    },
  });
}

export function useJobControl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { jobId: string; action: "cancel" | "pause" | "resume" }) =>
      v.action === "cancel" ? jobsApi.cancel(v.jobId) : v.action === "pause" ? jobsApi.pause(v.jobId) : jobsApi.resume(v.jobId),
    onSuccess: (job: ApiJob) => {
      qc.setQueryData<ApiJobDetail>(queryKeys.job(job.id), (old) => ({ ...job, children: old?.children ?? [] }));
      if (job.projectId) return invalidate(qc, queryKeys.book.jobsAll(job.projectId), queryKeys.book.detail(job.projectId));
      return undefined;
    },
  });
}

/* ---------- Assets ---------- */
