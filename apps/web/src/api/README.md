# apps/web/src/api

The typed client layer between the screens and the Volume server (`apps/server`, routes under `/api/v1`). Screens can move from mock data to the API one at a time: each screen keeps its mock data as the fallback and switches when the server answers.

## Files

| File | What it holds |
|---|---|
| `client.ts` | `fetch` wrapper (`apiDownload` for the one call that answers with a file, the project zip). Base `/api/v1`, JSON only, `AbortSignal` on every call, `credentials: "omit"`, no keys. Every failure is an `ApiError` with `status`, `code`, `message`, `details` (from `{ error: { code, message, details } }`). A stopped server gives `code: "network_error"`, `status: 0`. |
| `types.ts` | Server response and request types, plain TypeScript. Times are epoch milliseconds. Types named `Api*` have a different prototype twin in `data/types.ts`. |
| `system.ts`, `catalogue.ts`, `profiles.ts`, `books.ts`, `planning.ts`, `manuscript.ts`, `production.ts`, `jobs.ts`, `assets.ts` | One plain async function per endpoint, grouped by area (`booksApi.get(id)`, `planningApi.createBlueprint(id)` and so on). Every server call the app makes is here; screens never build a URL themselves. |
| `hooks.ts` | TanStack Query hooks and `queryKeys`. Mutations invalidate the keys they change. Calls that start a job (202) cache the job under `["job", id]`. |
| `events.ts` | `useBookEvents(bookId)`, `useWorkspaceEvents()`, `useBookLive(bookId)` and `applyBookEvent()`: SSE into the query cache, with reconnect and replay. |
| `adapters.ts` | Server shapes to prototype shapes (`toPrototypeBook`, `toPenName`, `blueprintData`, `toSectionStatus` and others). |
| `wire-a.ts`, `wire-b.ts`, `wire-c.ts` | Screen glue only, no endpoint calls: API or demo mode, plain error words, pen names and books for the current mode, the job bar, step jobs with live progress, writing row states, editor blocks, job watching. A serves the shell, Library, Published, Archive, Profiles, Settings and New book; B Research, Titles, Blueprint and Writing; C Editor, Cover, Export and Marketing. |
| `source.ts` | `useDataSource()`: `"api"` when `GET /api/v1/health` answers, `"mock"` otherwise. Rechecks every 30 seconds. |
| `queryClient.ts` | The app's one `QueryClient` (4xx and network errors are not retried). `main.tsx` wraps the app in its provider. |
| `index.ts` | Re-exports everything above. |
| `__checks__/live-check.ts` | Live check against a running server (see "Checking"). Not imported by the app. |

## Using it in a screen

```tsx
import { useBook, useBookEvents, useDataSource, toPrototypeBook } from "../../api";
import { getBook } from "../../demo";

const source = useDataSource();
const { data } = useBook(source === "api" ? bookId : undefined);
useBookEvents(source === "api" ? bookId : undefined);
const book = source === "api" && data ? toPrototypeBook(data) : getBook(bookId);
```

- Pass `undefined` as the id to keep a query switched off (route params, mock mode).
- Long work returns at once with a job. Show progress from `useBookLive(bookId).data.jobs[jobId]` (status, progress, message, done of total) or `useJob(jobId)`. `useBookEvents` refreshes the right area when the job finishes.
- Streamed writing text is in `useBookLive(bookId).data.deltas[sectionId]` until the section is saved.
- A budget stop shows in `useBookLive(bookId).data.budgetPaused`; raise the budget with `useUpdateBook`, then `useJobControl` with `action: "resume"`.
- Saves that can go stale (`useSaveVersion` with `baseVersionId`, `usePatchBlueprint` with `baseVersion`, `useAcceptSuggestion`) fail with `error.code === "conflict"`; reload and ask the owner.
- Validation problems are on `error.fieldIssues` (`{ path, message }[]`).
- Mount `useBookEvents` once per book (the book layout is the natural place), and `useWorkspaceEvents` once on the library.

## Which screen uses which hook

| Screen (`routes/`) | Hooks | Adapters |
|---|---|---|
| Library (`library/`) | `useBooks`, `useProfiles`, `useWorkspaceEvents`, `useActivity` | `toPrototypeBook`, `toPenName` (`toWiredBook` in wire-a adds word totals) |
| Published (`published/`) | `useBooks({ status: "published" })`, `useSetPublishedDetails` | `toPrototypeBook` |
| Profiles (`profiles/`) | `useProfiles`, `useProfile`, `useProfileSamples`, `useProfileMemory`; saves through `profilesApi` (`features/profiles/profileApi.ts`) | `toPenName`, `toAuthorProfile` |
| New book (`new-book/`) | `useProfiles`, `useCreateBook` | |
| Research (`research/`) | `useResearch`, `useResearchRun`, `useStartResearch`, `useSetSourceUse`, `useBookLive`, `useEstimate` | `toPrototypeSource` |
| Titles (`titles/`) | `useTitleSets`, `useGenerateTitles` (with a `directionKey`), `useChooseTitle`, `useSetFavourite`, `useEstimate` | `toTitleOptions` |
| Blueprint (`blueprint/`) | `useBlueprint`, `useBlueprintVersions`, `useCreateBlueprint`, `usePatchBlueprint`, `useRegenerateBlueprintPart`, `useApproveBlueprint`, `useClaims`, `useEstimate` | `blueprintData`, `toClaimToVerify` |
| Writing (`writing/`) | `useSectionTree`, `useWriteBook`, `useWriteSection`, `useBookLive`, `useJob`, `useJobControl`, `useClaims`, `useBookCosts`, `useEstimate` | `toSectionStatus`, `flattenSections` |
| Editor (`editor/`) | `useSectionTree`, `useSection`, `useSaveVersion`, `useSectionVersions`, `useSectionVersion`, `useSectionDiff`, `useRestoreVersion`, `useEditPass`, `useSuggestions`, `useAcceptSuggestion`, `useRejectSuggestion`, `useAddNote`, `usePatchNote`, `useClaims`, `useResolveClaim`, `useBookFind`, `useTextChanged`, `useRememberJob`; `manuscriptApi.rewriteSelection`, `replace`, `reopenNote`, `weaveNotes` (weave or expand) | `toClaimToVerify` |
| Cover (`cover/`) | `useCover`, `usePutCoverBrief`, `useCoverConcepts`, `useChooseCover`, `useBuildCover`; images via `assetsApi.downloadUrl(id, true)` | |
| Export (`export/`) | `usePreflight`, `useExports`, `useStartExports`; files via `productionApi.exportDownloadUrl(id)`; royalties from `listPrices` and the print PDF page count with `@volume/core` | `toPreflightItem` |
| Marketing (`marketing/`) | `useMarketing`, `useGenerateMarketing`, `usePatchMarketing`, `useMarketingStatus`, `useRememberJob`; `productionApi.regenerateMarketing` | |
| Settings (`settings/`) | `useSettings`, `usePatchSettings` (budgets, `book.defaults`, backups), `useModelSettings`, `usePutModelSettings`, `useHealth`, `useTestOpenRouter`, `useBackups`, `useMakeBackup`, `useImportProject` | |
| Archive (`archive/`) | `useArchive`, `useRestoreArchived`, `useDeleteArchived`; project zip via `booksApi.exportProject` | |

## Gaps: server shapes that do not fill a prototype field

The adapters leave these empty, zero or null rather than make anything up. Round 3 closed most of the
earlier list (word totals, published formats and prices, model and cost on runs, source domains, image
ideas, subject lines, workspace status); what is left:

- **Book**: no typographic `cover` (the server stores cover images) and no `attentionSteps`. Stages differ: server `titles`, `editor`, `marketing` against prototype `title`, `editing`; `published` is a status on the server.
- **Titles**: checks are the server's two (length, em dash); options have no id, so the adapter uses `<titleSetId>:<index>`.
- **Blueprint**: no margin notes, claim ids per chapter or matter source; audience and tone notes are single strings.
- **Export**: list prices can be entered on Export before publication and on the Published shelf. Royalties show "Not set" until prices are supplied.
- **Marketing**: no on-screen text for TikTok scripts.

## Checking

```bash
npm run typecheck -w apps/web
npm run build -w apps/server
OPENROUTER_API_KEY= PORT=5199 SQLITE_PATH=<scratchpad>/webapi.db DATA_DIR=<scratchpad>/data AI_PROVIDER=mock node apps/server/dist/index.js   # from the repo root
VOLUME_API=http://127.0.0.1:5199/api/v1 npx tsx apps/web/src/api/__checks__/live-check.ts
```

The check prints PASS or FAIL for health, profiles list, books create, book get, a typed 404, the blueprint job (202) and three SSE events applied to a `QueryClient`. Stop the server afterwards.

## Ports

The dev server and the preview (both 127.0.0.1:5180) proxy `/api` to `http://127.0.0.1:5181`, the server's default port. `VOLUME_API_PORT` points the proxy at a test server instead.
