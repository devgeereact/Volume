/* Response and request types for the Volume server (/api/v1). Plain TypeScript, no zod.

   Source of truth: apps/server/src/routes/*.ts and apps/server/src/repos/*.ts. Times are epoch
   milliseconds (numbers), money is US dollars, ids are ULID strings. When the server changes a
   shape, change it here and in adapters.ts. Names start with "Api" where the prototype already has
   a type of the same name (apps/web/src/demo/types.ts). */

export type EpochMs = number;

/** Any string the server may add later. In `"a" | "b" | OpenString` the known values stay as editor
    hints, which a plain `| string` would swallow. */
export type OpenString = string & Record<never, never>;

/* ---------- Common ---------- */

export interface ListResponse<T> {
  items: T[];
}

/** 202 response for long work (AI calls, covers, exports). Progress arrives over SSE. */
export interface AcceptedJob {
  jobId: string;
  job: ApiJob;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/* ---------- System ---------- */

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  uptimeS: number;
  database: { client: "sqlite" | "mysql" | OpenString; status: "ok" | "error" };
  ai: { provider: string };
  exporter: { name: string };
}

/** Known setting keys and value shapes (apps/server/src/repos/settings.ts). */
export interface SettingValues {
  "budget.book_default_usd"?: number;
  /** null clears the cap. */
  "budget.monthly_cap_usd"?: number | null;
  "budget.warn_ratio"?: number;
  /** Instance owner only: the monthly cap for each other workspace on this Volume. 0 stops their AI runs. */
  "budget.guest_workspaces_monthly_cap_usd"?: number;
  "backup.enabled"?: boolean;
  "backup.time"?: string;
  "links.check_enabled"?: boolean;
  "ui.theme"?: "light" | "dark" | "system";
  default_profile_id?: string | null;
  "models.overrides"?: Record<string, ModelOverride>;
  /** Defaults for new books; a field the create request gives wins. */
  "book.defaults"?: BookDefaultsSetting;
}

/** The "book.defaults" workspace setting (apps/server/src/repos/settings.ts). */
export interface BookDefaultsSetting {
  bookTypeId?: string | null;
  trim?: Trim;
  paper?: "white" | "cream";
  interiorThemeId?: string | null;
  coverStyleId?: string | null;
  wordTarget?: number | null;
  chapterCount?: number | null;
}

export interface ModelOverride {
  model: string;
  fallbacks?: string[];
}

export interface Budgets {
  bookDefaultUsd: number;
  monthlyCapUsd: number | null;
  warnRatio: number;
  monthSpendUsd: number;
  /** Sent only to the owner of this Volume: the monthly cap for each other workspace. 0 stops their AI runs. */
  guestWorkspacesMonthlyCapUsd?: number;
}

export interface SettingsResponse {
  /** Presence only. The key value never leaves the server. */
  openRouterKey: { present: boolean };
  /** Anthropic key in use (D-058), and when it last said its balance was empty (null while it is fine). */
  anthropic?: { configured: boolean; outOfFundsAt: number | null };
  aiProvider: string;
  exporter: string;
  database: { client: string };
  budgets: Budgets;
  values: SettingValues;
  /* Read-only workspace status for the Settings screen. */
  /** OpenRouter's key status (cached 5 minutes on the server), or null with no key or no answer. */
  openRouterCredit: ApiCredit | null;
  /** Null for everyone but the owner of this Volume: backups hold every workspace's data. */
  backups: ApiBackupStatus | null;
  houseStyleVersion: number | null;
  /** Newest config/kdp-rules file. */
  kdpRulesVersion: string | null;
  houseStyle: ApiHouseStyleInfo | null;
  kdpRules: ApiKdpRulesInfo | null;
  exportProvider: "volume" | "mock" | OpenString;
}

export interface ApiCredit {
  /** USD left before the key's limit; null when the key has no limit. */
  limitRemainingUsd: number | null;
  limitUsd: number | null;
  usageUsd: number | null;
  isFreeTier: boolean | null;
}

export interface ApiHouseStyleInfo {
  version: number | null;
  updatedOn: string | null;
  bannedCount: number;
  spellingPairs: number;
}

export interface ApiKdpRulesInfo {
  version: string;
  checkedAt: string | null;
  /** The checked date plus the rules' recheck interval. */
  recheckDueAt: string | null;
  rules: number;
}

export interface ApiBackupStatus {
  lastAt: EpochMs | null;
  count: number;
  /** local_folder: files under DATA_DIR/backups. cpanel: the host's own backups (MySQL). */
  locationKind: "local_folder" | "cpanel" | OpenString;
  keep: number;
  /** Nightly backups switched on (setting backup.enabled). */
  enabled: boolean;
  supported: boolean;
}

export interface ApiBackupFile {
  name: string;
  bytes: number;
  createdAt: EpochMs;
}

/** GET /backups. */
export interface BackupsResponse {
  items: ApiBackupFile[];
  status: ApiBackupStatus;
}

/** POST /settings/openrouter/test answers 200 with this whether or not the key works. */
export interface OpenRouterTestResult {
  ok: boolean;
  /** OpenRouter's limit left; null when the key has no limit or there is no key. */
  creditUsd: number | null;
  message: string;
}

/** GET /activity: the library's live panel, newest first. */
export interface ApiActivityItem {
  id: string;
  kind: "book_created" | "stage_changed" | "job_finished" | "job_failed" | "export_built" | "published" | OpenString;
  at: EpochMs;
  projectId: string | null;
  jobId: string | null;
  title: string;
  detail: string;
  /** True for the last 5 minutes. */
  live: boolean;
  /** For job_failed: the job's error code, for plain wording (jobErrors.ts). */
  errorCode?: string | null;
}

/** GET /archive: archived books, profiles and marketing items, newest first. */
export interface ApiArchiveItem {
  kind: "book" | "profile" | "marketing";
  id: string;
  title: string;
  detail: string;
  archivedAt: EpochMs;
  projectId: string | null;
  /** POST here to restore the item. */
  restorePath: string;
}

export interface SettingsPatchResponse {
  values: SettingValues;
  budgets: Budgets;
}

export interface ModelStageSetting {
  stage: string;
  tier: string | null;
  defaultModel: string;
  fallbacks: string[];
  override: string | null;
  effectiveModel: string;
  webSearch: boolean;
}

export interface ModelSettingsResponse {
  checkedOn: string | null;
  version: string | number | null;
  stages: ModelStageSetting[];
}

/** PUT /settings/models: a stage set to null goes back to the default. */
export interface ModelSettingsPut {
  stages: Record<string, ModelOverride | null>;
}

export interface ModelSettingsPutResponse {
  overrides: Record<string, ModelOverride>;
}

/* ---------- Catalogues (read-only files in config/) ---------- */

export type CatalogueName = "book-types" | "interior-themes" | "cover-styles";

export interface CatalogueResponse {
  /** False when the file is missing. */
  available: boolean;
  source: string;
  /** Items as written in the config file; the prototype types them in data/config.ts. */
  items: unknown[];
  meta: Record<string, unknown>;
}

/* ---------- Profiles ---------- */

export interface ProfileLink {
  label: string;
  value?: string;
  url?: string;
}

export interface ApiProfile {
  id: string;
  /** config/profiles/<sourceKey>.json for seeded profiles; null for profiles made in the app. */
  sourceKey: string | null;
  penName: string;
  legalName: string | null;
  imprintName: string | null;
  isRealPerson: boolean;
  illustrativeLineDefault: boolean;
  location: string | null;
  language: string;
  bioThirdPerson: string;
  bioHash: string;
  shortBio: string | null;
  credentials: string[];
  links: ProfileLink[];
  voice: Record<string, unknown>;
  /** Seeded profiles carry { initials, genres, bookTypes } here. */
  brand: Record<string, unknown>;
  templates: Record<string, unknown>;
  /** Seeded profiles also carry { sourceStatus, modelNotes } here. */
  publishing: Record<string, unknown>;
  models: Record<string, unknown>;
  defaultBookTypeId: string | null;
  /** confirmed, or to_confirm while the owner has not confirmed the bio. */
  bioStatus?: "confirmed" | "to_confirm" | OpenString;
  status: "active" | "archived" | OpenString;
  archivedAt: EpochMs | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
  /** GET /profiles rows only: books under this profile (archived ones included). */
  bookCount?: number;
}

export interface ProfileInput {
  penName: string;
  legalName?: string | null;
  imprintName?: string | null;
  isRealPerson?: boolean;
  illustrativeLineDefault?: boolean;
  location?: string | null;
  language?: string;
  bioThirdPerson?: string;
  shortBio?: string | null;
  credentials?: string[];
  links?: ProfileLink[];
  voice?: Record<string, unknown>;
  brand?: Record<string, unknown>;
  templates?: Record<string, unknown>;
  publishing?: Record<string, unknown>;
  models?: Record<string, unknown>;
  defaultBookTypeId?: string | null;
}

export type ProfilePatch = Partial<ProfileInput>;

export interface ProfileListQuery {
  status?: "active" | "archived";
  includeArchived?: boolean;
}

export type SampleKind = "sounds_like" | "not_like" | "writing_sample";

export interface ProfileSample {
  id: string;
  profileId: string;
  kind: SampleKind | OpenString;
  title: string | null;
  text: string;
  wordCount: number;
  createdAt: EpochMs;
}

export interface SampleInput {
  kind: SampleKind;
  title?: string | null;
  text: string;
}

export type MemoryKind = "preference" | "avoid_phrase" | "keep_phrase" | "style_rule" | "fact";

export interface ProfileMemoryItem {
  id: string;
  profileId: string;
  kind: MemoryKind | OpenString;
  content: string;
  origin: "accepted_edit" | "owner" | OpenString;
  sourceSuggestionId: string | null;
  weight: number;
  active: boolean;
  createdAt: EpochMs;
}

export interface MemoryInput {
  kind: MemoryKind;
  content: string;
  origin?: "accepted_edit" | "owner";
  sourceSuggestionId?: string | null;
  weight?: number;
}

export interface MemoryPatch {
  content?: string;
  active?: boolean;
  weight?: number;
}

/* ---------- Books ---------- */

/** Book stepper stages (server D-016). The prototype's StageId differs; see adapters.ts. */
export type ApiStage = "idea" | "research" | "titles" | "blueprint" | "writing" | "editor" | "cover" | "export" | "marketing";
export type ApiBookStatus = "active" | "published" | "archived";
export type Trim = "5x8" | "5.25x8" | "5.5x8.5" | "6x9" | "7x10" | "8.5x11" | "8x10" | "8.5x8.5";

/** Trim sizes the server takes (apps/server/src/repos/books.ts TRIMS). */
export const TRIMS: readonly Trim[] = ["5x8", "5.25x8", "5.5x8.5", "6x9", "7x10", "8.5x11", "8x10", "8.5x8.5"];
export type DisclosureLevel = "ai_generated" | "ai_assisted" | "none";

export interface AiDisclosure {
  text: DisclosureLevel;
  images: DisclosureLevel;
  translation: DisclosureLevel;
}

export interface ApiBook {
  id: string;
  profileId: string;
  bookTypeId: string | null;
  interiorThemeId: string | null;
  coverStyleId: string | null;
  template: string;
  idea: string | null;
  notes: string | null;
  title: string | null;
  subtitle: string | null;
  status: ApiBookStatus | OpenString;
  stage: ApiStage | OpenString;
  trim: Trim | OpenString;
  paper: "white" | "cream" | OpenString;
  isbnPaperback: string | null;
  isbnEbook: string | null;
  edition: string | null;
  publicationYear: number | null;
  illustrativeLine: boolean;
  aiDisclosure: AiDisclosure;
  wordTarget: number | null;
  settings: Record<string, unknown>;
  budgetUsd: number;
  costToDateUsd: number;
  approvedBlueprintId: string | null;
  publishedAt: EpochMs | null;
  /** Owner-entered list prices in pounds; null where not set. */
  listPrices: ApiListPrices;
  /** Where the book is listed, for example "amazon.co.uk" (the default). */
  marketplace: string;
  archivedAt: EpochMs | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
  /** Every enabled section the AI or the owner writes has a current version (D-048). Opens marketing (D-049). Older servers omit it. */
  writingComplete?: boolean | undefined;
  /** How many TikTok scripts and Instagram posts the book's template asks for (D-049). Older servers omit it. */
  marketingCounts?: ApiMarketingCounts | undefined;
}

export interface ApiMarketingCounts {
  tiktok: number;
  instagram: number;
}

/** POST /books/:id/publish body. `publishedAt` is a local date (YYYY-MM-DD) not after today; the server uses today without it. */
export interface PublishInput {
  publishedAt?: string | undefined;
}

export interface ApiListPrices {
  ebook: number | null;
  paperback: number | null;
  hardcover: number | null;
}

/** A published format, from the latest export job. */
export interface ApiPublishedFormat {
  format: "Paperback" | "Kindle eBook" | "Hardcover" | OpenString;
  kind: "paperback" | "ebook" | "hardcover" | OpenString;
  listPriceGbp: number | null;
  pages: number | null;
  /** The export files behind this format, for example ["epub", "docx"]. */
  exportKinds: string[];
}

/** The book's newest top-level job that is not finished (queued, running, waiting, paused, paused_budget). */
export interface ApiRunningJob {
  id: string;
  kind: string;
  status: string;
  progress: number;
}

/** What the server adds to every book it returns from /books and /books/:id (apps/server/src/repos/library.ts). */
export interface ApiBookExtras {
  /** Words in the current versions of the sections switched on. */
  wordCount: number;
  sectionCount: number;
  /** A job queued, running or waiting. */
  jobRunning: boolean;
  runningJob: ApiRunningJob | null;
  /** The chosen cover concept. */
  coverAssetId: string | null;
  /** The finished eBook cover (built or uploaded), when there is one. */
  coverEbookAssetId: string | null;
  formats: ApiPublishedFormat[];
  /** Upload packs built. */
  packVersion: number;
}

/** A book as the library list, one book, create, update, the status actions and duplicate return it. */
export type ApiBookRow = ApiBook & ApiBookExtras;

export interface SectionTotals {
  sections: number;
  words: number;
  done: number;
}

/** GET /books/:id adds the manuscript totals and the last ten jobs. */
export interface ApiBookDetail extends ApiBookRow {
  totals: SectionTotals;
  recentJobs: ApiJob[];
}

export interface BookInput {
  profileId: string;
  bookTypeId?: string | null;
  interiorThemeId?: string | null;
  coverStyleId?: string | null;
  template?: string;
  idea?: string | null;
  notes?: string | null;
  title?: string | null;
  subtitle?: string | null;
  trim?: Trim;
  paper?: "white" | "cream";
  isbnPaperback?: string | null;
  isbnEbook?: string | null;
  edition?: string | null;
  publicationYear?: number | null;
  illustrativeLine?: boolean;
  wordTarget?: number | null;
  settings?: Record<string, unknown>;
  budgetUsd?: number;
}

export type BookPatch = Partial<Omit<BookInput, "profileId">> & {
  profileId?: string;
  stage?: ApiStage;
  /** Partial; null clears one price. */
  listPrices?: Partial<ApiListPrices>;
  /** amazon.*; null resets it to the default. */
  marketplace?: string | null;
};

/** POST /books/:id/estimate. */
/** A cover page as HTML at its natural pixel size: what POST /books/:id/cover/preview answers. */
export interface CoverPreviewHtml {
  html: string;
  widthPx: number;
  heightPx: number;
  warnings: string[];
}

export type EstimateStage = "research" | "titles" | "blueprint" | "blueprint_part" | "writing" | "checks" | "claim_fix";

export interface EstimateInput {
  stage: EstimateStage;
  /** Per-section stages: the sections to count (writing: every section not done when left out). */
  sectionIds?: string[];
  /** blueprint_part: the part to regenerate. */
  partTarget?: string;
}

/** What a stage would cost before it runs, with the model the settings pick. */
export interface Estimate {
  stage: string;
  model: string | null;
  lowUsd: number;
  highUsd: number;
  calls: number;
  sections: number | null;
}

/** POST /projects/import. */
export interface ImportedProject {
  bookId: string;
  profileId: string;
  profileCreated: boolean;
  rows: number;
  assets: number;
  book: ApiBook;
}

/** POST /books/import-project answers 201 with this (D-051). The book's settings carry origin.note. */
export interface ImportedBookProject {
  bookId: string;
  profileId: string;
  rows: number;
  assets: number;
  book: ApiBook;
}

export interface BookListQuery {
  profileId?: string;
  stage?: ApiStage;
  status?: ApiBookStatus;
  published?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export type BookAction = "archive" | "restore" | "publish" | "unpublish";

export interface PromptRunSummary {
  id: string;
  stage: string;
  modelSlug: string;
  provider: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  status: string;
  createdAt: EpochMs;
}

export interface BookCosts {
  budgetUsd: number;
  costToDateUsd: number;
  runs: PromptRunSummary[];
}

/* ---------- Research ---------- */

/** What the research stage writes into run.output (apps/server/src/ports/ai.ts ResearchOutputSchema). */
export interface ResearchOutput {
  audience: { who: string; situation: string; level: string };
  problems: string[];
  angles: { angle: string; why: string }[];
  competing_themes: string[];
  gaps: string[];
  keyword_ideas: string[];
  notes: string;
}

export interface ApiResearchSource {
  id: string;
  researchRunId: string;
  url: string;
  title: string | null;
  domain: string | null;
  excerpt: string | null;
  startIndex: number | null;
  endIndex: number | null;
  useInBook: boolean;
  linkStatus: string;
  /** The original search redirect link when the real page was looked up (D-020). */
  redirectUrl?: string | null;
  /** True when the real page could not be found, so `url` is still a redirect link. */
  unresolved?: boolean;
}

/** Model, cost and guardrails of the AI run behind a research run, title set or blueprint version. */
export interface ApiRunInfo {
  promptRunId?: string | null;
  model?: string | null;
  costUsd?: number | null;
  guardrails?: ApiGuardrailSummary | null;
}

export interface ApiResearchRun extends ApiRunInfo {
  id: string;
  projectId: string;
  jobId: string | null;
  status: "queued" | "done" | "failed" | OpenString;
  input: Record<string, unknown>;
  /** ResearchOutput once the run is done. Typed loosely because older runs may differ. */
  output: Record<string, unknown> | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface ApiResearchRunWithSources extends ApiResearchRun {
  sources: ApiResearchSource[];
}

export interface ResearchOverview {
  latest: ApiResearchRunWithSources | null;
  runs: ApiResearchRun[];
}

export type ResearchStarted = AcceptedJob & { runId: string };

/* ---------- Titles ---------- */

export interface ApiTitleDirection {
  key: string;
  label: string;
  angle: string;
  audience: string;
  promise: string;
}

/** Title option as the titles job stores it, with the app checks (length, em dash). */
export interface ApiTitleOption {
  title: string;
  subtitle: string;
  direction_key: string;
  chars: number;
  valid: boolean;
  issues: string[];
  /** Starred by the owner (false by default). */
  favourite: boolean;
}

/** POST /books/:id/title-sets. With directionKey the writer drafts titles for that direction only. */
export interface GenerateTitlesInput {
  instruction?: string;
  directionKey?: string;
  /** The title set the direction came from (only sent with directionKey). */
  titleSetId?: string;
}

export interface ApiTitleSet extends ApiRunInfo {
  id: string;
  projectId: string;
  jobId: string | null;
  /** ApiTitleDirection[] in practice; the server column is untyped JSON. */
  directions: unknown[];
  /** ApiTitleOption[] in practice. */
  options: unknown[];
  chosenIndex: number | null;
  createdAt: EpochMs;
}

export interface ChooseTitleInput {
  index: number;
  title?: string;
  subtitle?: string;
}

export interface ChooseTitleResponse {
  titleSet: ApiTitleSet;
  book: ApiBook;
}

/* ---------- Blueprint ---------- */

export interface BlueprintChapterData {
  number: number;
  title: string;
  part?: number | null;
  subheadings: string[];
  summary: string;
  word_target: number;
  key_points: string[];
  takeaways: boolean;
  bridge_note: string;
  [extra: string]: unknown;
}

/** One character in a fiction story bible (apps/server/src/ports/ai.ts StoryBibleSchema). */
export interface StoryCharacter {
  name: string;
  role: string;
  want: string;
  need: string;
  flaw: string;
  voiceNotes: string;
  appearance: string;
  [extra: string]: unknown;
}

/** The fiction story bible (D-043), kept in the blueprint data as `storyBible`. */
export interface StoryBible {
  logline: string;
  themes: string[];
  characters: StoryCharacter[];
  settings: { name: string; description: string; [extra: string]: unknown }[];
  timeline: string[];
  worldRules: string[];
  povPlan: string;
  ending: string;
  [extra: string]: unknown;
}

/** Row of GET /books/:id/story-ledger: what the writer recorded as each chapter was saved. */
export interface ApiLedgerItem {
  kind: string;
  key: string;
  detail: string | null;
  sectionId: string | null;
}

/** Blueprint JSON (apps/server/src/ports/ai.ts BlueprintSchema). Extra keys are kept. */
export interface BlueprintData {
  title: string;
  subtitle: string;
  summary: string;
  audience: string;
  usps: string[];
  tone_notes: string;
  hook_style: string;
  parts: { number: number; title: string }[];
  chapters: BlueprintChapterData[];
  front: Record<string, unknown>;
  back: Record<string, unknown>;
  back_blurb: string;
  description_draft: string;
  categories: string[];
  keywords: string[];
  [extra: string]: unknown;
}

export interface ApiBlueprintVersion extends ApiRunInfo {
  id: string;
  projectId: string;
  version: number;
  status: "draft" | "approved" | "superseded" | OpenString;
  source: string;
  note: string | null;
  /** BlueprintData when valid; see BlueprintResponse.validation. */
  data: Record<string, unknown>;
  parentVersionId: string | null;
  approvedAt: EpochMs | null;
  approvedBy: string | null;
  createdAt: EpochMs;
}

export interface BlueprintResponse {
  blueprint: ApiBlueprintVersion | null;
  validation: { ok: boolean; issues: ValidationIssue[] } | null;
}

export interface BlueprintCreateInput {
  instruction?: string;
  chapterCount?: number;
}

export interface BlueprintPatchInput {
  /** Top-level blueprint keys to replace (title, chapters, front, ...). */
  parts: Partial<BlueprintData>;
  note?: string;
  /** The version the edit started from; a mismatch returns 409 conflict. */
  baseVersion?: number;
}

/** "summary" | "chapters" | "front" | "back" | "listing" | "chapter:<n>" */
export type BlueprintPartKey = "summary" | "chapters" | "front" | "back" | "listing" | `chapter:${number}`;

export interface BlueprintApproveResponse {
  blueprint: ApiBlueprintVersion;
  sections: { created: number; updated: number };
  book: ApiBook;
}

/* ---------- Manuscript ---------- */

export type ApiSectionStatus = "empty" | "queued" | "writing" | "checking" | "done" | OpenString;

export interface ApiSection {
  id: string;
  projectId: string;
  kind: string;
  area: "front" | "body" | "back" | OpenString;
  position: number;
  enabled: boolean;
  partId: string | null;
  number: number | null;
  title: string | null;
  wordTarget: number | null;
  plan: Record<string, unknown>;
  currentVersionId: string | null;
  status: ApiSectionStatus;
  blueprintChanged: boolean;
  wordCount: number;
  updatedAt: EpochMs;
  /** app: built from the book details (title page, copyright, contents, about the author); owner: every version is the owner's; ai otherwise. */
  writtenBy?: WrittenBy;
  /** Guardrails of the latest writing or weave run; null when no AI run touched the section. */
  guardrails?: ApiGuardrailSummary | null;
  /** A page the app builds when the book is exported: the text the exported book holds. Null for text someone writes. */
  generated?: ApiGeneratedPage | null;
  /** A page only the owner can write, still empty or holding the app's placeholder. Null otherwise. */
  ownerPrompt?: ApiOwnerPrompt | null;
}

/** One line of a built page. Level 1 is a chapter subheading indented under its chapter in the contents. */
export interface ApiPageLine {
  text: string;
  level: 0 | 1;
}

/** Where the owner changes what a built page shows. */
export interface ApiPageEdit {
  target: "titles" | "blueprint" | "profile" | "published";
  label: string;
}

/** Server GeneratedPageView (apps/server jobs/book-data.ts). */
export interface ApiGeneratedPage {
  lines: ApiPageLine[];
  words: number;
  /** False for the pages before the contents: they print but add nothing to the manuscript's word total. */
  countsInTotal: boolean;
  note: string;
  edit: ApiPageEdit | null;
  /** The exported book leaves the page out (Also by with no published book). */
  leftOut: boolean;
}

/** Server OwnerPromptView. */
export interface ApiOwnerPrompt {
  message: string;
  /** What the exported book holds for the page until the owner writes it. */
  placeholder: string;
  leftOut: boolean;
}

/** One guardrail hit (server AiGuardrailHit). */
export type WrittenBy = "app" | "ai" | "owner";

export interface ApiGuardrailHit {
  rule: string;
  severity: string;
  message: string;
  match: string;
  path?: string;
  phrase?: string;
}

/** One rule that hit (server AiGuardrailRule). */
export interface ApiGuardrailRule {
  rule: string;
  list: string;
  count: number;
  message: string;
  matches: string[];
}

/** What sections, research runs, title sets and blueprint versions expose of a run's guardrails. */
export interface ApiGuardrailSummary {
  passed: boolean;
  /** Hits that block (an invented review, a link that is not a source...). Older servers leave it out. */
  blocking?: ApiGuardrailHit[];
  needsAttention: ApiGuardrailHit[];
  rules: ApiGuardrailRule[];
}

export interface ApiSectionNode extends ApiSection {
  children: ApiSection[];
}

export interface SectionTree {
  front: ApiSection[];
  body: ApiSectionNode[];
  back: ApiSection[];
  totals: SectionTotals;
}

export interface ApiSectionVersion {
  id: string;
  sectionId: string;
  projectId: string;
  version: number;
  /** Editor document (TipTap JSON) when the client saved one. */
  content: unknown;
  bodyMd: string;
  plaintext: string;
  wordCount: number;
  source: string;
  parentVersionId: string | null;
  /** The version before this edit session (autosave coalesces typing into one version). */
  previousVersionId?: string | null;
  promptRunId: string | null;
  summary: string | null;
  note: string | null;
  createdAt: EpochMs;
  /** Later than createdAt only for an autosave updated in place; the autosave's baseRevision. */
  updatedAt?: EpochMs;
}

/** PUT /books/:id/sections/:sectionId/autosave. */
export interface AutosaveInput {
  bodyMd: string;
  /** Editor document (TipTap JSON), when the client keeps one. */
  content?: unknown;
  baseVersionId: string | null;
  /** updatedAt of the version held; the server updates in place only when it matches (left out: always a new version). */
  baseRevision?: number;
}

/** 200 from autosave: the version (new, or the session's version updated in place) and whether it was coalesced. */
export interface AutosaveResponse extends ApiSectionVersion {
  coalesced: boolean;
}

/** Row in GET /sections/:id/versions: the list leaves out the text; read one version for it. */
export type ApiSectionVersionSummary = Omit<ApiSectionVersion, "content" | "bodyMd" | "plaintext">;

/** GET /sections/:id/versions: newest first, with the version before the current edit session. */
export interface SectionVersionList {
  items: ApiSectionVersionSummary[];
  currentVersionId?: string | null;
  previousVersionId?: string | null;
}

export interface ApiCheckResult {
  id: string;
  sectionId: string | null;
  versionId: string | null;
  checker: string;
  severity: string;
  message: string;
  location: Record<string, unknown>;
  autoFixed: boolean;
  status: string;
}

export interface SectionDetail {
  section: ApiSection;
  current: ApiSectionVersion | null;
  checks: ApiCheckResult[];
}

export interface SectionPatch {
  title?: string | null;
  enabled?: boolean;
  position?: number;
  wordTarget?: number | null;
}

export interface SaveVersionInput {
  bodyMd: string;
  content?: unknown;
  note?: string | null;
  /** Version the edit started from; a mismatch returns 409 conflict. */
  baseVersionId?: string | null;
}

export interface DiffLine {
  op: "equal" | "add" | "remove";
  text: string;
}

export interface DiffSide {
  id: string;
  version: number;
  source: string;
  createdAt: EpochMs;
  wordCount: number;
  bodyMd: string;
}

export interface SectionDiff {
  from: DiffSide;
  to: DiffSide;
  /** Null when the texts are too long to diff on the server. */
  lines: DiffLine[] | null;
}

export type EditPassKind = "structure" | "line" | "voice" | "selection";

export interface EditPassInput {
  pass: EditPassKind;
  instruction?: string;
  selection?: { start: number; end: number };
}

export type NoteStatus = "open" | "queued" | "woven" | "dismissed";

export interface ApiAuthorNote {
  id: string;
  projectId: string;
  sectionId: string;
  position: number | null;
  anchorText: string | null;
  note: string;
  status: NoteStatus | OpenString;
  jobId: string | null;
  wovenVersionId: string | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface NoteInput {
  note: string;
  position?: number | null;
  anchorText?: string | null;
}

/** Weave folds notes into the text; expand turns a note into a new passage. */
export type WeaveMode = "weave" | "expand";

export interface WeaveInput {
  noteIds?: string[];
  mode?: WeaveMode;
}

/** POST /sections/:id/rewrite-selection (offsets in the current Markdown). */
export interface RewriteSelectionInput {
  from: number;
  to: number;
  instruction?: string;
}

/** The job result of rewrite-selection. Nothing is saved until the owner accepts by saving a version. */
export interface RewriteProposal {
  sectionId: string;
  text: string;
  from: number;
  to: number;
  original: string;
  reason: string | null;
  baseVersionId: string | null;
}

/** GET /books/:id/find. */
export interface FindQuery {
  q: string;
  caseSensitive: boolean;
  word: boolean;
}

export interface FindMatch {
  start: number;
  end: number;
  before: string;
  match: string;
  after: string;
}

export interface FindSection {
  sectionId: string;
  kind: string;
  title: string | null;
  number: number | null;
  enabled: boolean;
  versionId: string;
  count: number;
  /** At most 200 per section; offsets are in the section's Markdown. */
  matches: FindMatch[];
}

export interface FindResult {
  q: string;
  caseSensitive: boolean;
  word: boolean;
  total: number;
  sections: FindSection[];
}

/** POST /books/:id/replace: one new human version per changed section. */
export interface ReplaceInput {
  q: string;
  replacement: string;
  case?: boolean;
  word?: boolean;
  sectionIds?: string[];
}

export interface ReplaceResult {
  replacements: number;
  sectionsChanged: number;
  versions: { sectionId: string; versionId: string; count: number }[];
}

export interface NotePatch {
  note?: string;
  position?: number | null;
  status?: "open" | "dismissed";
}

export type SuggestionStatus = "open" | "accepted" | "rejected" | "stale";

export interface ApiSuggestion {
  id: string;
  projectId: string;
  sectionId: string;
  baseVersionId: string | null;
  pass: string;
  start: number | null;
  end: number | null;
  original: string;
  proposed: string;
  reason: string | null;
  status: SuggestionStatus | OpenString;
  decidedAt: EpochMs | null;
  createdAt: EpochMs;
}

export interface AcceptSuggestionResponse {
  suggestion: ApiSuggestion;
  version: ApiSectionVersion;
  memory: ProfileMemoryItem | null;
}

export type ClaimStatus = "open" | "verified" | "softened" | "removed" | "author_experience";
export type ClaimCategory = "medical" | "clinical" | "legal" | "safety" | "statistical" | "financial" | "personal" | "regulatory" | "other_fact";

export interface ApiClaim {
  id: string;
  projectId: string;
  sectionId: string | null;
  versionId: string | null;
  category: ClaimCategory | OpenString;
  sentence: string;
  location: Record<string, unknown>;
  checkNeeded: string | null;
  status: ClaimStatus | OpenString;
  ownerNote: string | null;
  sourceUrl: string | null;
  resolvedAt: EpochMs | null;
  createdAt: EpochMs;
  /** Softer wording proposed by the checks stage; soften uses it when no replacement is sent. */
  suggestedSoftening?: string | null;
}

export interface ClaimVerifyInput {
  sourceUrl?: string;
  note?: string;
  authorExperience?: boolean;
}

export interface ClaimResolveResponse {
  claim: ApiClaim;
  version: ApiSectionVersion | null;
  textChanged?: boolean;
}

/** GET /books/:id/claims/overview: every claim of the book in reading order, with counts by status. */
export type ClaimOverviewFilter = ClaimStatus | "all";

export interface ClaimOverviewItem extends ApiClaim {
  section: { id: string; title: string | null; kind: string; number: number | null; enabled: boolean; position: number } | null;
  /** False when the sentence is no longer in the section's current text: suggest and apply would be 409. */
  inCurrentText: boolean;
  /** Claim tiers: true when the owner must check it, false when it is listed for the record only. */
  needsCheck?: boolean;
}

export interface ClaimsOverview {
  counts: Record<"open" | "verified" | "softened" | "removed" | "author_experience", number>;
  /** Open claims by tier: the ones that need the owner's check and the ones listed for the record. */
  tiers?: { needsCheck: number; forRecord: number };
  items: ClaimOverviewItem[];
}

export type ClaimApproach = "soften" | "generalise" | "attribute" | "reframe" | "remove";

/** One replacement from POST /books/:id/claims/:claimId/suggest (the job's result holds three). */
export interface ClaimOption {
  text: string;
  approach: ClaimApproach | OpenString;
  rationale: string;
  needsSource: boolean;
}

/** 202 for claim suggestions and check reruns: the job, with the estimate when the server gives one. */
export interface EstimatedJob extends AcceptedJob {
  estimate?: CostRange | null;
}

/** A cost range in US dollars. */
export interface CostRange {
  lowUsd: number;
  highUsd: number;
}

export interface ClaimApplyInput {
  text: string;
  approach: ClaimApproach | "own" | OpenString;
  /** The suggest job the text came from (an unchanged option is saved as ai:claim-fix). */
  jobId?: string;
  baseVersionId?: string;
  note?: string;
}

/** GET /sections/:id/recheck: what a rerun would do and cost, with no charge. */
export interface RecheckPreview {
  sectionId: string;
  steps: ("summary" | "checks" | OpenString)[];
  estimate: CostRange;
  /** A job already working on the section; follow it instead of starting another. */
  runningJobId: string | null;
  hasText: boolean;
}

/** 202 from POST /sections/:id/recheck: the job, the missing steps it reruns and their cost. */
export interface RerunChecksResponse extends EstimatedJob {
  steps: ("summary" | "checks" | OpenString)[];
}

/* ---------- Production: cover, exports, marketing ---------- */

export interface CoverConcept {
  assetId: string;
  name: string;
  prompt: string;
  why: string;
  mock: boolean;
}

export interface ApiCover {
  id: string;
  projectId: string;
  brief: Record<string, unknown>;
  concepts: CoverConcept[];
  chosenAssetId: string | null;
  typography: Record<string, unknown>;
  ebookAssetId: string | null;
  wrapAssetId: string | null;
  wrapSpec: Record<string, unknown>;
  status: "brief" | "concepts" | "chosen" | "final" | OpenString;
  updatedAt: EpochMs;
}

export interface CoverResponse {
  cover: ApiCover | null;
}

export type ApiPreflightSeverity = "pass" | "warn" | "block";

export interface ApiPreflightItem {
  id: string;
  area: string;
  severity: ApiPreflightSeverity;
  message: string;
  fix?: PreflightFix;
  /** The owner ticked "I have checked this"; saved on the book. */
  acknowledged?: boolean;
}

/** How to fix a preflight item: a screen to open (with an anchor), or an action to run here. */
export interface PreflightFix {
  route?: string;
  label: string;
  /** "rerun-checks": run the missing section checks again (POST /sections/:sectionId/recheck). */
  action?: "rerun-checks" | OpenString;
  sectionId?: string;
  anchor?: string;
}

export interface ApiPreflightReport {
  ok: boolean;
  blocks: number;
  warnings: number;
  items: ApiPreflightItem[];
  rulesVersion: string | null;
  mock: boolean;
  manuscriptHash: string;
}

export type ExportKind = "pdf_print" | "docx" | "epub" | "txt" | "md";

export interface ApiExportRecord {
  id: string;
  projectId: string;
  /** An ExportKind, "pack" for the zip, or a cover file kind. */
  kind: string;
  trim: string | null;
  paper: string | null;
  status: string;
  assetId: string | null;
  bytes: number | null;
  pageCount: number | null;
  sha256: string | null;
  manuscriptHash: string | null;
  preflight: Record<string, unknown>;
  jobId: string | null;
  mock: boolean;
  error: string | null;
  createdAt: EpochMs;
  /** The manuscript changed since this file was built. */
  stale: boolean;
}

export interface ExportsInput {
  kinds?: ExportKind[];
  pack?: boolean;
}

export type MarketingKind = "tiktok_script" | "instagram_caption" | "launch_email";

export interface ApiMarketingItem {
  id: string;
  projectId: string;
  profileId: string | null;
  kind: MarketingKind | OpenString;
  title: string | null;
  hook: string | null;
  body: string;
  cta: string | null;
  hashtags: string[];
  durationS: number | null;
  /** Launch email: every subject line the writer offered (title holds the chosen one). */
  subjectLines?: string[];
  /** Instagram: what the picture should show. */
  imageIdea?: string | null;
  status: "draft" | "used" | "archived" | OpenString;
  archivedAt: EpochMs | null;
  jobId: string | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface MarketingPatch {
  title?: string | null;
  hook?: string | null;
  body?: string;
  cta?: string | null;
  hashtags?: string[];
  durationS?: number | null;
  status?: "draft" | "used";
}

export interface MarketingListQuery {
  kind?: MarketingKind;
  includeArchived?: boolean;
}

/* ---------- Whole-book rebuild (routes/rebuild.ts) ---------- */

/** One rebuild of the whole book, newest first. undoneAt is set once the owner went back to before it. */
export interface ApiRebuild {
  jobId: string;
  number: number | null;
  /** The name every version it saved carries ("Rebuild 2 from new title: ..."). */
  note: string | null;
  status: JobStatus;
  fromTitle: string | null;
  toTitle: string | null;
  createdAt: number;
  undoneAt: number | null;
}

export interface RebuildList {
  /** The title the approved blueprint was planned for; differs from the book's title after a new choice on Titles. */
  planTitle: string | null;
  /** The book has text, so a rebuild has something to redo. */
  hasText: boolean;
  rebuilds: ApiRebuild[];
}

export interface RebuildAccepted extends AcceptedJob {
  number: number;
  note: string;
}

export interface UndoRebuildResponse {
  restored: number;
  note: string;
}

/* ---------- Jobs ---------- */

export type JobKind =
  | "research"
  | "titles"
  | "blueprint"
  | "blueprint_part"
  | "write_book"
  | "rebuild_book"
  | "write_section"
  | "weave_notes"
  | "edit_pass"
  | "cover_concepts"
  | "cover_build"
  | "marketing"
  | "export_pack"
  | "noop";

export type JobStatus = "queued" | "running" | "waiting" | "paused" | "paused_budget" | "succeeded" | "needs_attention" | "failed" | "cancelled";

export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = ["succeeded", "needs_attention", "failed", "cancelled"];

export function isTerminalJob(status: string): boolean {
  return (TERMINAL_JOB_STATUSES as readonly string[]).includes(status);
}

export interface ApiJob {
  /** Estimated time left, from finished sibling jobs (writing jobs only). */
  etaMs?: number | null;
  /** Model in use (writing jobs and their children). */
  model?: string | null;
  id: string;
  workspaceId: string;
  projectId: string | null;
  parentId: string | null;
  dependsOnJobId: string | null;
  kind: JobKind | OpenString;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAfter: EpochMs;
  lockedAt: EpochMs | null;
  cancelRequested: boolean;
  pauseRequested: boolean;
  payload: Record<string, unknown>;
  result: unknown;
  /** 0 to 1. */
  progress: number;
  costUsd: number;
  error: string | null;
  errorCode: string | null;
  startedAt: EpochMs | null;
  finishedAt: EpochMs | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface ApiJobChild {
  id: string;
  kind: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  /** Sent when the server includes it; jobsApi.get turns known codes into plain words. */
  errorCode?: string | null;
}

export interface ApiJobDetail extends ApiJob {
  children: ApiJobChild[];
}

/* ---------- Assets ---------- */

export type AssetKind = "author_photo" | "import" | "logo" | "interior_image" | "cover_concept" | "own_ebook_cover" | "own_wrap_pdf" | "other";

export interface ApiAssetMeta {
  id: string;
  kind: string;
  filename: string;
  mime: string;
  bytes: number;
  sha256: string | null;
  chunkCount: number;
  chunkSize: number;
  projectId: string | null;
  profileId: string | null;
  aiGenerated: boolean;
  width: number | null;
  height: number | null;
  status: string;
  createdAt: EpochMs;
}

export interface UploadQuery {
  kind: AssetKind;
  filename: string;
  mime?: string;
  projectId?: string;
  profileId?: string;
}

/* ---------- Server-sent events ---------- */

export type BookEventType =
  | "job.status"
  | "job.progress"
  | "section.started"
  | "section.delta"
  | "section.saved"
  | "check.result"
  | "claim.added"
  | "cost.update"
  | "budget.paused"
  | "export.ready"
  | "note.woven"
  | "cover.updated"
  | "book.updated";

export const BOOK_EVENT_TYPES: readonly BookEventType[] = [
  "job.status",
  "job.progress",
  "section.started",
  "section.delta",
  "section.saved",
  "check.result",
  "claim.added",
  "cost.update",
  "budget.paused",
  "export.ready",
  "note.woven",
  "cover.updated",
  "book.updated",
];

/** The JSON in each SSE `data:` line (apps/server/src/sse/stream.ts formatEvent). */
export interface ServerEventEnvelope<D = unknown> {
  projectId: string | null;
  jobId: string | null;
  createdAt: EpochMs;
  data: D;
}

export interface JobStatusEventData {
  jobId: string;
  kind: string;
  status: JobStatus;
  progress: number;
  attempts: number;
  error: string | null;
  errorCode: string | null;
  parentId: string | null;
  /** write_section jobs: the section they write. */
  sectionId?: string;
}

/** A writing child starts or restarts: streamed text kept for the section is now out of date. */
export interface SectionStartedEventData {
  bookId: string;
  projectId: string;
  sectionId: string;
  jobId: string;
  attempt: number;
}

/** Either a job's own progress (with kind and message) or a parent's roll-up (done of total). */
export interface JobProgressEventData {
  jobId: string;
  progress: number;
  kind?: string;
  message?: string | null;
  done?: number;
  total?: number;
}

export interface SectionDeltaEventData {
  sectionId: string;
  text: string;
}

export interface SectionSavedEventData {
  sectionId: string;
  versionId: string;
  version: number;
  wordCount: number;
  source: string;
}

export interface CheckResultEventData {
  sectionId: string;
  versionId: string;
  blocks: number;
  warnings: number;
  claims: number;
}

export interface ClaimAddedEventData {
  claimId: string;
  sectionId: string;
  category: string;
}

export interface CostUpdateEventData {
  addedUsd: number;
  costToDateUsd: number | null;
  budgetUsd: number | null;
}

export interface BudgetPausedEventData {
  jobId: string;
  message: string;
  scope?: "book" | "month" | OpenString;
  limitUsd?: number;
  [extra: string]: unknown;
}

export interface ExportReadyEventData {
  exportId: string;
  kind: string;
  assetId: string;
  mock: boolean;
}

export interface NoteWovenEventData {
  sectionId: string;
  versionId: string;
  noteIds: string[];
}

export interface CoverUpdatedEventData {
  projectId: string;
  status: string;
  concepts?: string[];
  ebookAssetId?: string;
  wrapAssetId?: string;
}

/** `part` says what changed: research, titles, blueprint, marketing, suggestions; `status` on publish or archive. */
export interface BookUpdatedEventData {
  projectId: string;
  part?: "research" | "titles" | "blueprint" | "marketing" | "suggestions" | OpenString;
  status?: string;
  [extra: string]: unknown;
}

export interface BookEventDataMap {
  "job.status": JobStatusEventData;
  "job.progress": JobProgressEventData;
  "section.started": SectionStartedEventData;
  "section.delta": SectionDeltaEventData;
  "section.saved": SectionSavedEventData;
  "check.result": CheckResultEventData;
  "claim.added": ClaimAddedEventData;
  "cost.update": CostUpdateEventData;
  "budget.paused": BudgetPausedEventData;
  "export.ready": ExportReadyEventData;
  "note.woven": NoteWovenEventData;
  "cover.updated": CoverUpdatedEventData;
  "book.updated": BookUpdatedEventData;
}

/** One parsed event, discriminated by `type`. `id` is null for events the server never stores (section.delta). */
export type BookEvent = {
  [K in BookEventType]: { id: string | null; type: K } & ServerEventEnvelope<BookEventDataMap[K]>;
}[BookEventType];

/* ---------- Volume mode: accounts, batches and the title schedule (P8-2, P8-3) ---------- */
/* Source: apps/server/src/routes/members.ts, routes/batches.ts, routes/schedule.ts, repos/members.ts,
   repos/batches.ts, repos/schedule.ts and jobs/quality-gate.ts. */

export type Role = "owner" | "editor" | "viewer";
export type AccountsMode = "owner-only" | "invite";

/** GET /me: who is calling, so the screens can hide controls the role cannot use. */
export interface ApiMe {
  userId: string;
  workspaceId: string;
  role: Role;
  /** True for the owner of this Volume (the only account that can invite another self-publisher). */
  instanceOwner: boolean;
  accountsMode: AccountsMode;
}

export interface ApiMember {
  userId: string;
  role: Role;
  displayName: string;
  email: string | null;
  signedIn: boolean;
  isYou: boolean;
  joinedAt: EpochMs;
}

export type InviteRole = "owner" | "editor" | "viewer";
export type MemberRole = "editor" | "viewer";

export interface ApiInvitation {
  id: string;
  email: string;
  role: InviteRole;
  status: "pending" | "accepted" | "revoked";
  createdAt: EpochMs;
  acceptedAt: EpochMs | null;
}

/** GET /members (owner only). Invitations are the pending ones. */
export interface MembersResponse {
  accountsMode: AccountsMode;
  items: ApiMember[];
  invitations: ApiInvitation[];
}

export interface InvitationInput {
  email: string;
  role: InviteRole;
}

export type TitleFormat = "ebook" | "paperback" | "hardcover";
export const TITLE_FORMATS: readonly TitleFormat[] = ["ebook", "paperback", "hardcover"];

/** The title limit as the server reports it, from config/kdp-rules (rule titles.creationLimit). */
export interface ApiTitleLimit {
  maxNewTitlesPerFormat: number;
  periodDays: number;
  ruleId: string;
  rulesVersion: string;
}

export interface ApiTitleSlot {
  id: string;
  bookId: string;
  batchId: string | null;
  format: TitleFormat;
  plannedAt: EpochMs;
  status: "planned" | "confirmed";
  confirmedAt: EpochMs | null;
  createdAt: EpochMs;
  book: { title: string | null; idea: string | null; profileId: string; penName: string };
}

/** GET /schedule?from&to */
export interface ScheduleResponse {
  from: EpochMs | null;
  to: EpochMs | null;
  limit: ApiTitleLimit;
  items: ApiTitleSlot[];
}

export interface SlotInput {
  bookId: string;
  format: TitleFormat;
  plannedAt: EpochMs;
  batchId?: string | null;
}

/** details of a 409 title_limit answer. */
export interface TitleLimitDetails {
  conflicts: ApiTitleSlot[];
  nextFreeAt: EpochMs;
  limit: ApiTitleLimit;
}

/** details of a 409 quality_gate answer, and one book's gate in GET /batches/:id/gates. */
export interface QualityGate {
  ok: boolean;
  blocks: { id: string; area: string; message: string }[];
  openClaims: number;
}

export interface BatchGatesResponse {
  items: { itemId: string; bookId: string; gate: QualityGate }[];
}

export type BatchStatus = "draft" | JobStatus;

export interface ApiBatch {
  id: string;
  name: string;
  notes: string | null;
  jobId: string | null;
  startedAt: EpochMs | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

export interface ApiBatchSummary extends ApiBatch {
  status: BatchStatus;
  /** 0 to 1. */
  progress: number;
  itemCount: number;
  readyCount: number;
  penNames: string[];
}

export interface ApiBatchItem {
  id: string;
  batchId: string;
  bookId: string;
  position: number;
  status: "planned" | "ready";
  jobId: string | null;
  readyAt: EpochMs | null;
  book: { title: string | null; idea: string | null; stage: string; status: string; profileId: string; penName: string };
}

export interface ApiBatchItemView extends ApiBatchItem {
  run: { status: JobStatus; progress: number; error: string | null } | null;
  slots: ApiTitleSlot[];
}

export interface ApiBatchDetail extends ApiBatchSummary {
  items: ApiBatchItemView[];
  job: ApiJob | null;
}

export interface BatchInput {
  name: string;
  notes?: string | null;
  bookIds: string[];
}

export interface BatchPatch {
  name?: string;
  notes?: string | null;
  addBookIds?: string[];
  removeBookIds?: string[];
}

/** POST /batches/:id/start answers 202 with the job and the batch. */
export type BatchStarted = AcceptedJob & { batch: ApiBatchDetail };
