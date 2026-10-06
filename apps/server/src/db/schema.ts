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
}

export interface MembershipsTable extends Tenant {
  userId: string;
  role: string;
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
