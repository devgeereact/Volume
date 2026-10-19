/**
 * Typed Database interface for Kysely. Keys are camelCase; the CamelCasePlugin
 * maps them to the snake_case columns created by the migrations.
 *
 * Conventions (portable across SQLite and MySQL):
 * - ids are ULIDs (varchar 26)
 * - times are BIGINT milliseconds since the epoch
 * - booleans are integers 0 or 1
 * - JSON columns are TEXT holding JSON, parsed with zod in the repositories
 * - money is a double in US dollars (AI costs)
 */

export type Ms = number;
/** 0 or 1 (see above); typed as number because the drivers return plain numbers. */
export type Bool = number;
export type JsonText = string;

interface Base {
  id: string;
  createdAt: Ms;
  updatedAt: Ms;
}

interface Tenant extends Base {
  workspaceId: string;
}

export interface WorkspacesTable extends Base {
  name: string;
  slug: string;
}

export interface UsersTable extends Base {
  email: string | null;
  displayName: string;
  authProvider: string;
  passwordHash: string | null;
  lastSeenAt: Ms | null;
  /** Clerk user id (user_...) once that user has signed in; null for local-only users. */
  clerkUserId: string | null;
}

export interface MembershipsTable extends Tenant {
  userId: string;
  role: string;
}

/** P8-3 (D-047). role editor or viewer joins workspace_id; owner means a new workspace for a separate self-publisher. */
export interface InvitationsTable extends Tenant {
  /** Lower case. */
  email: string;
  role: string;
  /** pending, accepted or revoked. */
  status: string;
  /** The email while the invitation is pending, else null; unique per workspace, so one pending invitation per address. */
  pendingEmail: string | null;
  invitedBy: string | null;
  acceptedUserId: string | null;
  acceptedAt: Ms | null;
}

/** P8-2 (D-046). A named group of books run one at a time by a batch_run job (job_id: the latest run). */
export interface BatchesTable extends Tenant {
  name: string;
  notes: string | null;
  jobId: string | null;
  createdBy: string | null;
  startedAt: Ms | null;
}

/** P8-2. One book in a batch. status planned or ready (ready only after the quality gate). */
export interface BatchItemsTable extends Tenant {
  batchId: string;
  projectId: string;
  position: number;
  status: string;
  /** The latest batch_book job for this book. */
  jobId: string | null;
  readyAt: Ms | null;
}

/** P8-2 (D-046). A planned release per book and format, checked against KDP's title creation limit. */
export interface TitleSlotsTable extends Tenant {
  projectId: string;
  batchId: string | null;
  /** ebook, paperback or hardcover. */
  format: string;
  plannedAt: Ms;
  /** planned or confirmed (confirmed only after the quality gate). */
  status: string;
  confirmedAt: Ms | null;
  createdBy: string | null;
}

export interface SettingsTable extends Tenant {
  settingKey: string;
  value: JsonText;
}

export interface AuthorProfilesTable extends Tenant {
  sourceKey: string | null;
  penName: string;
  legalName: string | null;
  imprintName: string | null;
  isRealPerson: Bool;
  illustrativeLineDefault: Bool;
  location: string | null;
  language: string;
  bioThirdPerson: string;
  bioHash: string;
  shortBio: string | null;
  credentials: JsonText;
  links: JsonText;
  voice: JsonText;
  brand: JsonText;
  templates: JsonText;
  publishing: JsonText;
  models: JsonText;
  defaultBookTypeId: string | null;
  status: string;
  archivedAt: Ms | null;
  /** confirmed or to_confirm (migration 0002). */
  bioStatus: string | null;
}

export interface ProfileSamplesTable extends Tenant {
  profileId: string;
  kind: string;
  title: string | null;
  text: string;
  wordCount: number;
}

export interface ProfileMemoryTable extends Tenant {
  profileId: string;
  kind: string;
  content: string;
  origin: string;
  sourceSuggestionId: string | null;
  weight: number;
  active: Bool;
}

export interface ProjectsTable extends Tenant {
  profileId: string;
  bookTypeId: string | null;
  interiorThemeId: string | null;
  coverStyleId: string | null;
  template: string;
  idea: string | null;
  notes: string | null;
  title: string | null;
  subtitle: string | null;
  status: string;
  stage: string;
  trim: string;
  paper: string;
  isbnPaperback: string | null;
  isbnEbook: string | null;
  edition: string | null;
  publicationYear: number | null;
  illustrativeLine: Bool;
  aiDisclosure: JsonText;
  wordTarget: number | null;
  settings: JsonText;
  budgetUsd: number;
  costToDateUsd: number;
  approvedBlueprintId: string | null;
  publishedAt: Ms | null;
  archivedAt: Ms | null;
  /** Owner-entered list prices in pounds, JSON {ebook?, paperback?, hardcover?} (migration 0002). */
  listPrices: JsonText | null;
  /** Amazon marketplace, null means amazon.co.uk (migration 0002). */
  marketplace: string | null;
  /** When the book first joined a Volume mode batch; never cleared, so the quality gate keeps applying (migration 0008). */
  batchedAt: Ms | null;
}

export interface ResearchRunsTable extends Tenant {
  projectId: string;
  jobId: string | null;
  promptRunId: string | null;
  status: string;
  input: JsonText;
  output: JsonText | null;
}

export interface ResearchSourcesTable extends Tenant {
  researchRunId: string;
  projectId: string;
  url: string;
  urlHash: string;
  title: string | null;
  domain: string | null;
  excerpt: string | null;
  startIndex: number | null;
  endIndex: number | null;
  useInBook: Bool;
  linkStatus: string;
  checkedAt: Ms | null;
  /** The search grounding redirect link the URL was resolved from (migration 0002). */
  redirectUrl: string | null;
  /** The URL is still a redirect link that could not be resolved (migration 0002). */
  unresolved: Bool;
}

export interface TitleSetsTable extends Tenant {
  projectId: string;
  jobId: string | null;
  promptRunId: string | null;
  directions: JsonText;
  options: JsonText;
  chosenIndex: number | null;
}

export interface BlueprintsTable extends Tenant {
  projectId: string;
  version: number;
  status: string;
  data: JsonText;
  source: string;
  note: string | null;
  parentVersionId: string | null;
  approvedAt: Ms | null;
  approvedBy: string | null;
  promptRunId: string | null;
}

export interface SectionsTable extends Tenant {
  projectId: string;
  kind: string;
  area: string;
  position: number;
  enabled: Bool;
  partId: string | null;
  number: number | null;
  title: string | null;
  wordTarget: number | null;
  plan: JsonText;
  currentVersionId: string | null;
  status: string;
  blueprintChanged: Bool;
  /** Spreads only: text-left, text-right, text-top or text-bottom (migration 0006). Null for other kinds. */
  layout: string | null;
  /** Spreads only: the 2:1 picture, an asset of kind spread_image (migration 0006). */
  imageAssetId: string | null;
}

/** One character sheet of a picture book (migration 0006, D-045). */
export interface PictureCharactersTable extends Tenant {
  projectId: string;
  name: string;
  position: number;
  /** The character sheet, repeated word for word in every scene prompt. */
  sheet: string;
  /** 1 when the character appears in more than one spread: only main characters get a reference picture. */
  main: Bool;
  referencePrompt: string | null;
  /** The neutral full-body reference picture (asset kind character_reference), sent with every spread showing the character. */
  referenceAssetId: string | null;
}

export interface SectionVersionsTable extends Tenant {
  sectionId: string;
  projectId: string;
  version: number;
  content: JsonText;
  bodyMd: string;
  plaintext: string;
  wordCount: number;
  source: string;
  parentVersionId: string | null;
  promptRunId: string | null;
  summary: string | null;
  note: string | null;
  /** The code guardrail report for this version's text, as JSON (migration 0004). Null on older rows. */
  guardrails: JsonText | null;
  /** The user who saved an owner version (migration 0011). Null for AI, app and older rows. */
  createdBy: string | null;
}

export interface SuggestionsTable extends Tenant {
  projectId: string;
  sectionId: string;
  baseVersionId: string | null;
  pass: string;
  startOffset: number | null;
  endOffset: number | null;
  original: string;
  proposed: string;
  reason: string | null;
  status: string;
  decidedAt: Ms | null;
  promptRunId: string | null;
}

export interface AuthorNotesTable extends Tenant {
  projectId: string;
  sectionId: string;
  position: number | null;
  anchorText: string | null;
  note: string;
  status: string;
  jobId: string | null;
  wovenVersionId: string | null;
}

export interface StoryLedgerTable extends Tenant {
  projectId: string;
  sectionId: string | null;
  kind: string;
  ledgerKey: string;
  detail: string | null;
  versionId: string | null;
}

export interface CheckResultsTable extends Tenant {
  projectId: string;
  sectionId: string | null;
  versionId: string | null;
  checker: string;
  severity: string;
  message: string;
  location: JsonText;
  autoFixed: Bool;
  status: string;
}

export interface ClaimsTable extends Tenant {
  projectId: string;
  sectionId: string | null;
  versionId: string | null;
  category: string;
  sentence: string;
  location: JsonText;
  checkNeeded: string | null;
  status: string;
  ownerNote: string | null;
  sourceUrl: string | null;
  resolvedAt: Ms | null;
  /** A softer wording from the checks stage (migration 0003). */
  suggestedSoftening: string | null;
}

export interface AssetsTable extends Tenant {
  projectId: string | null;
  profileId: string | null;
  kind: string;
  filename: string;
  mime: string;
  bytes: number;
  chunkSize: number;
  chunkCount: number;
  sha256: string | null;
  width: number | null;
  height: number | null;
  dpi: number | null;
  aiGenerated: Bool;
  promptRunId: string | null;
  status: string;
}

export interface AssetChunksTable {
  assetId: string;
  chunkIndex: number;
  workspaceId: string;
  bytes: number;
  data: Uint8Array;
  createdAt: Ms;
}

export interface CoversTable extends Tenant {
  projectId: string;
  brief: JsonText;
  concepts: JsonText;
  chosenAssetId: string | null;
  typography: JsonText;
  ebookAssetId: string | null;
  wrapAssetId: string | null;
  wrapSpec: JsonText;
  status: string;
}

export interface ListingsTable extends Tenant {
  projectId: string;
  descriptionHtml: string | null;
  backBlurb: string | null;
  shortBio: string | null;
  categories: JsonText;
  keywords: JsonText;
  aiDisclosureNote: string | null;
  pricing: JsonText;
  kdpRulesVersion: string | null;
  /** Who wrote the text: `ai:matter` (the listing job), or null for rows from before 0010. */
  source: string | null;
}

export interface MarketingItemsTable extends Tenant {
  projectId: string;
  profileId: string | null;
  kind: string;
  title: string | null;
  hook: string | null;
  body: string;
  cta: string | null;
  hashtags: JsonText;
  durationS: number | null;
  status: string;
  archivedAt: Ms | null;
  jobId: string | null;
  promptRunId: string | null;
  /** Kind-specific fields as JSON: subjectLines (email), imageIdea (Instagram) (migration 0003). */
  extras: JsonText | null;
}

export interface ExportsTable extends Tenant {
  projectId: string;
  kind: string;
  trim: string | null;
  paper: string | null;
  status: string;
  assetId: string | null;
  bytes: number | null;
  pageCount: number | null;
  sha256: string | null;
  manuscriptHash: string | null;
  preflight: JsonText;
  jobId: string | null;
  mock: Bool;
  error: string | null;
}

export interface PromptRunsTable extends Tenant {
  projectId: string | null;
  jobId: string | null;
  stage: string;
  promptId: string | null;
  promptVersion: number | null;
  promptHash: string | null;
  provider: string;
  modelSlug: string;
  generationId: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  status: string;
  error: string | null;
  output: string | null;
  /** The stage's guardrail report as JSON (migration 0002). */
  guardrails: JsonText | null;
}

export interface JobsTable extends Tenant {
  projectId: string | null;
  parentId: string | null;
  dependsOnJobId: string | null;
  kind: string;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAfter: Ms;
  lockedAt: Ms | null;
  lockToken: string | null;
  cancelRequested: Bool;
  pauseRequested: Bool;
  payload: JsonText;
  result: JsonText | null;
  progress: number;
  costUsd: number;
  error: string | null;
  errorCode: string | null;
  startedAt: Ms | null;
  finishedAt: Ms | null;
}

export interface JobEventsTable {
  id: string;
  workspaceId: string;
  jobId: string | null;
  projectId: string | null;
  type: string;
  data: JsonText;
  createdAt: Ms;
}

export interface Database {
  workspaces: WorkspacesTable;
  users: UsersTable;
  memberships: MembershipsTable;
  invitations: InvitationsTable;
  batches: BatchesTable;
  batchItems: BatchItemsTable;
  titleSlots: TitleSlotsTable;
  settings: SettingsTable;
  authorProfiles: AuthorProfilesTable;
  profileSamples: ProfileSamplesTable;
  profileMemory: ProfileMemoryTable;
  projects: ProjectsTable;
  researchRuns: ResearchRunsTable;
  researchSources: ResearchSourcesTable;
  titleSets: TitleSetsTable;
  blueprints: BlueprintsTable;
  sections: SectionsTable;
  pictureCharacters: PictureCharactersTable;
  sectionVersions: SectionVersionsTable;
  suggestions: SuggestionsTable;
  authorNotes: AuthorNotesTable;
  storyLedger: StoryLedgerTable;
  checkResults: CheckResultsTable;
  claims: ClaimsTable;
  assets: AssetsTable;
  assetChunks: AssetChunksTable;
  covers: CoversTable;
  listings: ListingsTable;
  marketingItems: MarketingItemsTable;
  exports: ExportsTable;
  promptRuns: PromptRunsTable;
  jobs: JobsTable;
  jobEvents: JobEventsTable;
}
