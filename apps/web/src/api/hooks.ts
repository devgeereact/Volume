/* TanStack Query hooks for every server area. Screens import from here (or from "./index").

   Query keys
   - Book-scoped data lives under ["book", bookId, ...], so invalidating ["book", bookId] refreshes
     everything for one book. Section-scoped data lives under ["section", sectionId, ...].
   - Lists that span books (library, profiles) have their own roots: ["books"], ["profiles"].
   Mutations invalidate the narrowest keys that the server call changes. Calls that start a job
   (202) put the job into the cache under ["job", jobId] and refresh the book's job list; the
   finished result arrives through useBookEvents (events.ts), which invalidates the area. */

import { useCallback } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { booksApi } from "./books";
import { jobsApi } from "./jobs";
import { manuscriptApi } from "./manuscript";
import { planningApi } from "./planning";
import { productionApi } from "./production";
import { profilesApi } from "./profiles";
import { systemApi } from "./system";
import { volumeApi } from "./volume";
import {
  isTerminalJob,
  type AcceptedJob,
  type ApiBlueprintVersion,
  type ApiJob,
  type ApiJobDetail,
  type ApiArchiveItem,
  type ApiListPrices,
  type ApiPreflightReport,
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
  type AutosaveInput,
  type ClaimApplyInput,
  type ClaimOverviewFilter,
  type SettingValues,
  type SuggestionStatus,
  type BatchInput,
  type BatchPatch,
  type InvitationInput,
  type MemberRole,
  type SlotInput,
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
    rebuilds: (bookId: string) => ["book", bookId, "rebuilds"] as const,
    notes: (bookId: string, status?: NoteStatus) => ["book", bookId, "notes", status ?? "all"] as const,
    notesAll: (bookId: string) => ["book", bookId, "notes"] as const,
    claims: (bookId: string, f: { status?: ClaimStatus; sectionId?: string } = {}) => ["book", bookId, "claims", f] as const,
    claimsAll: (bookId: string) => ["book", bookId, "claims"] as const,
    storyLedger: (bookId: string, kind: string | null) => ["book", bookId, "story-ledger", kind] as const,
    cover: (bookId: string) => ["book", bookId, "cover"] as const,
    preflight: (bookId: string) => ["book", bookId, "preflight"] as const,
    exports: (bookId: string) => ["book", bookId, "exports"] as const,
    /** Picture books (api/picture.ts): the spreads view and the character sheets. */
    spreads: (bookId: string) => ["book", bookId, "spreads"] as const,
    characters: (bookId: string) => ["book", bookId, "characters"] as const,
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
  /** Volume mode: the caller's role, members (owner only), batches and the title schedule. */
  volume: {
    all: ["volume"] as const,
    me: () => ["volume", "me"] as const,
    members: () => ["volume", "members"] as const,
    batchesAll: ["volume", "batches"] as const,
    batches: () => ["volume", "batches", "list"] as const,
    batch: (id: string) => ["volume", "batches", "detail", id] as const,
    gates: (id: string) => ["volume", "batches", "gates", id] as const,
    scheduleAll: ["volume", "schedule"] as const,
    schedule: (q: { from?: number; to?: number }) => ["volume", "schedule", q] as const,
  },
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

/** Everything a status change (publish, archive, restore) shows on: the lists, the shelf, the archive and the book. */
export function refreshBookStatus(qc: QueryClient, bookId: string): Promise<void> {
  return invalidate(qc, queryKeys.books.all, queryKeys.book.detail(bookId), queryKeys.workspace.archive(), queryKeys.workspace.activityAll);
}

/** Marks a book published on a date (YYYY-MM-DD, not after today). The Published shelf reads the book lists. */
export function usePublishBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; publishedAt?: string | undefined }) => booksApi.publish(v.bookId, { publishedAt: v.publishedAt }),
    onSuccess: (_b, v) => refreshBookStatus(qc, v.bookId),
  });
}

/** Archive or restore a book (POST /books/:id/archive or /restore). */
export function useBookStatusAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; action: "archive" | "restore" | "unpublish" }) => booksApi.action(v.bookId, v.action),
    onSuccess: (_b, v) => refreshBookStatus(qc, v.bookId),
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

/* ---------- Whole-book rebuild ---------- */

export function useRebuilds(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.rebuilds(bookId ?? ""),
    queryFn: ({ signal }) => manuscriptApi.rebuilds(need(bookId, "Book id"), { signal }),
    enabled: !!bookId,
  });
}

/** Starts a rebuild of the whole book, with a new title when one is given. */
export function useRebuildBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; title?: string }) => manuscriptApi.rebuildBook(v.bookId, v.title === undefined ? {} : { title: v.title }),
    onSuccess: (r, v) => {
      rememberJob(qc, r);
      return Promise.all([invalidate(qc, queryKeys.book.rebuilds(v.bookId)), bookChanged(qc, v.bookId)]);
    },
  });
}

/** Puts the whole book back as it was before a rebuild (title, blueprint, every section). */
export function useUndoRebuild() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; jobId: string }) => manuscriptApi.undoRebuild(v.bookId, v.jobId),
    onSuccess: (_r, v) =>
      Promise.all([
        invalidate(qc, queryKeys.book.rebuilds(v.bookId), queryKeys.book.blueprint(v.bookId), queryKeys.book.sections(v.bookId), ["section"]),
        bookChanged(qc, v.bookId),
      ]),
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

/** The whole list response, with previousVersionId (the version before the current edit session). */
export function useSectionVersionList(sectionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.section.versions(sectionId ?? ""),
    queryFn: ({ signal }) => manuscriptApi.versions(need(sectionId, "Section id"), { signal }),
    enabled: !!sectionId,
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

/** Autosave the editor text (coalesced on the server). A stale baseVersionId fails with code "conflict". */
export function useAutosaveSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string; input: AutosaveInput }) => manuscriptApi.autosave(v.bookId, v.sectionId, v.input),
    onSuccess: (_ver, v) => sectionTextChanged(qc, v.bookId, v.sectionId),
  });
}

/** What rerunning a section's missing checks would do and cost (no charge). */
export function useRecheckPreview(sectionId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.section.all(sectionId ?? ""), "recheck"] as const,
    queryFn: ({ signal }) => manuscriptApi.recheckPreview(need(sectionId, "Section id"), { signal }),
    enabled: !!sectionId,
  });
}

/** Run a section's missing checks again (a job). */
export function useRerunChecks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string }) => manuscriptApi.rerunChecks(v.sectionId),
    onSuccess: (r) => rememberJob(qc, r),
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

/** Runs a section's summary again (write_section job with summaryOnly). The text stays as it is. */
export function useRunSummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string }) => manuscriptApi.summarise(v.sectionId),
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

/** The story ledger (characters and settings for fiction). Off until a book id is given. */
export function useStoryLedger(bookId: string | undefined, kind?: "character" | "setting") {
  return useQuery({
    queryKey: queryKeys.book.storyLedger(bookId ?? "", kind ?? null),
    queryFn: ({ signal }) => manuscriptApi.storyLedger(need(bookId, "Book id"), kind, { signal }),
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

/** Clears the claims whose sentence is no longer in the book (after a rewrite). Refreshes the claims and preflight. */
export function useClearGoneClaims(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => manuscriptApi.clearGoneClaims(bookId),
    onSuccess: () => invalidate(qc, queryKeys.book.claimsAll(bookId), queryKeys.book.preflight(bookId)),
  });
}

/** The book's claims overview; under the claims key, so every claim change refreshes it. */
export function useClaimsOverview(bookId: string | undefined, status: ClaimOverviewFilter) {
  return useQuery({
    queryKey: [...queryKeys.book.claimsAll(bookId ?? ""), "overview", status] as const,
    queryFn: ({ signal }) => manuscriptApi.claimsOverview(need(bookId, "Book id"), status, { signal }),
    enabled: !!bookId,
  });
}

/** Ask for three stronger replacements for a claim (a job). */
export function useSuggestClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; claimId: string; instruction?: string }) =>
      manuscriptApi.suggestClaim(v.bookId, v.claimId, v.instruction ? { instruction: v.instruction } : {}),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

/** Apply a replacement: a new version, and the claim resolved. 409 when the sentence changed. */
export function useApplyClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; claimId: string; input: ClaimApplyInput }) => manuscriptApi.applyClaim(v.bookId, v.claimId, v.input),
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

/**
 * The page a cover build would render for these settings, so the studio can show exactly it. Keeps the last page on
 * screen while the next one loads, and asks again only when the settings change.
 */
export function useCoverPreview(
  bookId: string | undefined,
  kind: "ebook" | "wrap",
  typography: Record<string, unknown>,
  pages: number | undefined,
  assetId: string | undefined,
  enabled: boolean,
) {
  const key = JSON.stringify([kind, typography, pages ?? null, assetId ?? null]);
  return useQuery({
    queryKey: [...queryKeys.book.cover(bookId ?? ""), "preview", key] as QueryKey,
    queryFn: ({ signal }) =>
      productionApi.coverPreview(
        bookId ?? "",
        { kind, typography, ...(pages === undefined ? {} : { pages }), ...(assetId === undefined ? {} : { assetId }) },
        { signal },
      ),
    enabled: enabled && !!bookId,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useBuildCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string }) => productionApi.buildCover(v.bookId),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

/** "Use my own cover": attach (asset id) or take out (null) the owner's eBook cover and wrap. */
export function useOwnCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; ebookAssetId?: string | null; wrapAssetId?: string | null }) => {
      const { bookId, ...input } = v;
      return productionApi.ownCover(bookId, input);
    },
    onSuccess: (r, v) => {
      qc.setQueryData(queryKeys.book.cover(v.bookId), r);
      void invalidate(qc, queryKeys.book.preflight(v.bookId));
    },
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

/** Saves the "I have checked this" tick on a preflight warning. The tick shows at once and rolls back if the save fails. */
export function useAcknowledgePreflight(bookId: string) {
  const qc = useQueryClient();
  const mutationKey = ["preflight-ack", bookId] as const;
  return useMutation({
    mutationKey,
    mutationFn: (v: { itemId: string; on: boolean }) => productionApi.acknowledgePreflight(bookId, v),
    onMutate: async (v) => {
      const key = queryKeys.book.preflight(bookId);
      await qc.cancelQueries({ queryKey: key });
      const before = qc.getQueryData<ApiPreflightReport>(key);
      if (before) qc.setQueryData(key, { ...before, items: before.items.map((i) => (i.id === v.itemId ? { ...i, acknowledged: v.on } : i)) });
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(queryKeys.book.preflight(bookId), ctx.before);
    },
    // Answers can arrive out of order when several boxes are ticked quickly, so the page takes the server's report only
    // once the last tick has settled, and shows the ticks it already knows about until then.
    onSettled: () => {
      if (qc.isMutating({ mutationKey }) <= 1) void qc.invalidateQueries({ queryKey: queryKeys.book.preflight(bookId) });
    },
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

/* ---------- Volume mode (P8-2, P8-3) ---------- */

/** GET /me. Kept fresh for a minute: a role change by the owner shows on the next refetch. */
export function useMe(options: QueryOptions = {}) {
  return useQuery({ queryKey: queryKeys.volume.me(), queryFn: ({ signal }) => volumeApi.me({ signal }), enabled: options.enabled ?? true, staleTime: 60_000 });
}

export function useMembers(options: QueryOptions = {}) {
  return useQuery({ queryKey: queryKeys.volume.members(), queryFn: ({ signal }) => volumeApi.members({ signal }), enabled: options.enabled ?? true });
}

export function useInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: InvitationInput) => volumeApi.invite(body),
    onSuccess: () => invalidate(qc, queryKeys.volume.members()),
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => volumeApi.revokeInvitation(id),
    onSuccess: () => invalidate(qc, queryKeys.volume.members()),
  });
}

export function useSetMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; role: MemberRole }) => volumeApi.setMemberRole(v.userId, v.role),
    onSuccess: () => invalidate(qc, queryKeys.volume.members()),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; confirm: string }) => volumeApi.removeMember(v.userId, v.confirm),
    onSuccess: () => invalidate(qc, queryKeys.volume.members()),
  });
}

/** POST /me/leave. Nothing to refresh: the caller no longer belongs here, so the screen shows its own end state. */
export function useLeaveWorkspace() {
  return useMutation({ mutationFn: (confirm: string) => volumeApi.leave(confirm) });
}

/** DELETE /workspace. Nothing to refresh: the workspace is gone, so the screen shows its own end state. */
export function useDeleteWorkspace() {
  return useMutation({ mutationFn: (confirm: string) => volumeApi.deleteWorkspace(confirm) });
}

export function useBatches(options: QueryOptions = {}) {
  return useQuery({ queryKey: queryKeys.volume.batches(), queryFn: ({ signal }) => volumeApi.batches({ signal }), enabled: options.enabled ?? true });
}

/** One batch. SSE refreshes it (events.ts applyVolumeEvent); a slow poll covers a reconnecting stream while it runs. */
export function useBatch(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.volume.batch(id ?? ""),
    queryFn: ({ signal }) => volumeApi.batch(need(id, "Batch id"), { signal }),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && status !== "draft" && !isTerminalJob(status) ? 15_000 : false;
    },
  });
}

export function useBatchGates(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.volume.gates(id ?? ""), queryFn: ({ signal }) => volumeApi.gates(need(id, "Batch id"), { signal }), enabled: !!id });
}

export function useCreateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BatchInput) => volumeApi.createBatch(body),
    onSuccess: (b) => {
      qc.setQueryData(queryKeys.volume.batch(b.id), b);
      return invalidate(qc, queryKeys.volume.batches());
    },
  });
}

export function usePatchBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: BatchPatch }) => volumeApi.patchBatch(v.id, v.patch),
    onSuccess: (b) => {
      qc.setQueryData(queryKeys.volume.batch(b.id), b);
      return invalidate(qc, queryKeys.volume.batches(), queryKeys.volume.gates(b.id));
    },
  });
}

export function useDeleteBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => volumeApi.deleteBatch(id),
    onSuccess: (_r, id) => {
      qc.removeQueries({ queryKey: queryKeys.volume.batch(id) });
      return invalidate(qc, queryKeys.volume.batches(), queryKeys.volume.scheduleAll);
    },
  });
}

export function useStartBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; chapterCount?: number }) => volumeApi.startBatch(v.id, v.chapterCount === undefined ? {} : { chapterCount: v.chapterCount }),
    onSuccess: (r) => {
      rememberJob(qc, r);
      qc.setQueryData(queryKeys.volume.batch(r.batch.id), r.batch);
      return invalidate(qc, queryKeys.volume.batches(), queryKeys.books.all);
    },
  });
}

export function useMarkBatchItemReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { batchId: string; itemId: string }) => volumeApi.markReady(v.batchId, v.itemId),
    onSuccess: (_r, v) => invalidate(qc, queryKeys.volume.batch(v.batchId), queryKeys.volume.batches(), queryKeys.volume.gates(v.batchId)),
  });
}

export function useSchedule(q: { from?: number; to?: number }, options: QueryOptions = {}) {
  return useQuery({ queryKey: queryKeys.volume.schedule(q), queryFn: ({ signal }) => volumeApi.schedule(q, { signal }), enabled: options.enabled ?? true });
}

/** Slots show on the schedule and on their batch, so both refresh. */
function slotsChanged(qc: QueryClient): Promise<void> {
  return invalidate(qc, queryKeys.volume.scheduleAll, queryKeys.volume.batchesAll);
}

export function useAddSlot() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: SlotInput) => volumeApi.addSlot(body), onSuccess: () => slotsChanged(qc) });
}

export function useConfirmSlot() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => volumeApi.confirmSlot(id), onSuccess: () => slotsChanged(qc) });
}

export function useRemoveSlot() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => volumeApi.removeSlot(id), onSuccess: () => slotsChanged(qc) });
}
