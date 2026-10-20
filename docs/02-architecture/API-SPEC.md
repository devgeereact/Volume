# API specification

API version: /api/v1. Inventory extracted from route source on 7 October 2026 and rechecked on 16 October 2026 (route files live in `apps/server/src/routes/`). This table records discovered route declarations, not a claim that every operation was runtime-tested during the documentation move.

Sign-in: with `AUTH_MODE=clerk` (production) every `/api/v1` route needs a Clerk session, sent as `Authorization: Bearer <session token>` by the API client or as Clerk's same-origin `__session` cookie (SSE, images, downloads). No session: 401 `unauthorized`. Signed in but not on the allowlist: 403 `forbidden`. Too many requests: 429 `rate_limited`. With `AUTH_MODE=local` (development) the owner stub applies. See [auth model](../05-security/AUTH-MODEL.md).

Public: `GET /api/health` (outside `/api/v1`, no sign-in) answers `{"status":"ok"}` (200) or `{"status":"unavailable"}` (503) and nothing else. It is the keep-alive and uptime check. The detailed `GET /api/v1/health` stays behind sign-in.

All routes use server-resolved owner/workspace context. Requests are validated by the route schemas; error handling is centralised. Host headers are explicitly allowed and mutating requests reject unapproved Origin values. CORS remains off. SSE supports event replay and reconnect; see [architecture](ARCHITECTURE.md). Binary uploads, downloads and project import have their existing specialised limits.

| Method | Path | Source |
| --- | --- | --- |
| GET | `/api/v1/assets/:id` | `apps/server/src/routes/assets.ts` |
| GET | `/api/v1/assets/:id/download` | `apps/server/src/routes/assets.ts` |
| POST | `/api/v1/assets` | `apps/server/src/routes/assets.ts` |
| GET | `/api/v1/books` | `apps/server/src/routes/books.ts` |
| POST | `/api/v1/books` | `apps/server/src/routes/books.ts` |
| GET | `/api/v1/books/:id` | `apps/server/src/routes/books.ts` |
| PATCH | `/api/v1/books/:id` | `apps/server/src/routes/books.ts` |
| DELETE | `/api/v1/books/:id` | `apps/server/src/routes/books.ts` |
| POST | `/api/v1/books/:id/duplicate` | `apps/server/src/routes/books.ts` |
| GET | `/api/v1/books/:id/costs` | `apps/server/src/routes/books.ts` |
| GET | `/api/v1/activity` | `apps/server/src/routes/books.ts` |
| GET | `/api/v1/archive` | `apps/server/src/routes/books.ts` |
| POST | `/api/v1/books/:id/estimate` | `apps/server/src/routes/estimate.ts` |
| GET | `/api/v1/jobs/:id` | `apps/server/src/routes/jobs.ts` |
| GET | `/api/v1/books/:id/jobs` | `apps/server/src/routes/jobs.ts` |
| POST | `/api/v1/jobs/:id/cancel` | `apps/server/src/routes/jobs.ts` |
| POST | `/api/v1/jobs/:id/pause` | `apps/server/src/routes/jobs.ts` |
| POST | `/api/v1/jobs/:id/resume` | `apps/server/src/routes/jobs.ts` |
| GET | `/api/v1/books/:id/events` | `apps/server/src/routes/jobs.ts` |
| GET | `/api/v1/events` | `apps/server/src/routes/jobs.ts` |
| GET | `/api/v1/books/:id/sections` | `apps/server/src/routes/manuscript.ts` |
| GET | `/api/v1/sections/:id` | `apps/server/src/routes/manuscript.ts` |
| PATCH | `/api/v1/sections/:id` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/sections/:id/versions` | `apps/server/src/routes/manuscript.ts` |
| GET | `/api/v1/sections/:id/versions` | `apps/server/src/routes/manuscript.ts` |
| GET | `/api/v1/sections/:id/versions/:versionId` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/sections/:id/versions/:versionId/restore` | `apps/server/src/routes/manuscript.ts` |
| GET | `/api/v1/sections/:id/diff` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/books/:id/write` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/sections/:id/write` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/sections/:id/edit-pass` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/sections/:id/notes` | `apps/server/src/routes/manuscript.ts` |
| GET | `/api/v1/sections/:id/notes` | `apps/server/src/routes/manuscript.ts` |
| GET | `/api/v1/books/:id/notes` | `apps/server/src/routes/manuscript.ts` |
| PATCH | `/api/v1/notes/:id` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/sections/:id/rewrite-selection` | `apps/server/src/routes/manuscript.ts` |
| GET | `/api/v1/books/:id/find` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/books/:id/replace` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/notes/:id/reopen` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/sections/:id/notes/weave` | `apps/server/src/routes/manuscript.ts` |
| GET | `/api/v1/sections/:id/suggestions` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/suggestions/:id/accept` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/suggestions/:id/reject` | `apps/server/src/routes/manuscript.ts` |
| GET | `/api/v1/books/:id/claims` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/claims/:id/verify` | `apps/server/src/routes/manuscript.ts` |
| GET | `/api/v1/books/:id/claims/overview` | `apps/server/src/routes/fixes.ts` |
| POST | `/api/v1/books/:id/claims/:claimId/suggest` | `apps/server/src/routes/fixes.ts` |
| POST | `/api/v1/books/:id/claims/:claimId/apply` | `apps/server/src/routes/fixes.ts` |
| POST | `/api/v1/books/:id/fix-house-style` | `apps/server/src/routes/fixes.ts` |
| PUT | `/api/v1/books/:id/sections/:sectionId/autosave` | `apps/server/src/routes/fixes.ts` |
| GET | `/api/v1/sections/:id/recheck` | `apps/server/src/routes/manuscript.ts` |
| POST | `/api/v1/books/:id/research` | `apps/server/src/routes/planning.ts` |
| GET | `/api/v1/books/:id/research` | `apps/server/src/routes/planning.ts` |
| GET | `/api/v1/research-runs/:id` | `apps/server/src/routes/planning.ts` |
| PATCH | `/api/v1/research-sources/:id` | `apps/server/src/routes/planning.ts` |
| POST | `/api/v1/books/:id/title-sets` | `apps/server/src/routes/planning.ts` |
| GET | `/api/v1/books/:id/title-sets` | `apps/server/src/routes/planning.ts` |
| PATCH | `/api/v1/title-sets/:id/options/:index` | `apps/server/src/routes/planning.ts` |
| POST | `/api/v1/title-sets/:id/choose` | `apps/server/src/routes/planning.ts` |
| POST | `/api/v1/books/:id/blueprints` | `apps/server/src/routes/planning.ts` |
| GET | `/api/v1/books/:id/blueprint` | `apps/server/src/routes/planning.ts` |
| GET | `/api/v1/books/:id/blueprint/versions` | `apps/server/src/routes/planning.ts` |
| GET | `/api/v1/books/:id/blueprint/versions/:version` | `apps/server/src/routes/planning.ts` |
| PATCH | `/api/v1/books/:id/blueprint` | `apps/server/src/routes/planning.ts` |
| POST | `/api/v1/books/:id/blueprint/regenerate` | `apps/server/src/routes/planning.ts` |
| POST | `/api/v1/books/:id/blueprint/approve` | `apps/server/src/routes/planning.ts` |
| GET | `/api/v1/books/:id/cover` | `apps/server/src/routes/production.ts` |
| PUT | `/api/v1/books/:id/cover/brief` | `apps/server/src/routes/production.ts` |
| POST | `/api/v1/books/:id/cover/concepts` | `apps/server/src/routes/production.ts` |
| POST | `/api/v1/books/:id/cover/choose` | `apps/server/src/routes/production.ts` |
| POST | `/api/v1/books/:id/cover/build` | `apps/server/src/routes/production.ts` |
| POST | `/api/v1/books/:id/cover/own` | `apps/server/src/routes/production.ts` |
| GET | `/api/v1/books/:id/preflight` | `apps/server/src/routes/production.ts` |
| POST | `/api/v1/books/:id/exports` | `apps/server/src/routes/production.ts` |
| GET | `/api/v1/books/:id/exports` | `apps/server/src/routes/production.ts` |
| GET | `/api/v1/exports/:id/download` | `apps/server/src/routes/production.ts` |
| GET | `/api/v1/books/:id/listing` | `apps/server/src/routes/production.ts` |
| POST | `/api/v1/books/:id/listing` | `apps/server/src/routes/production.ts` |
| POST | `/api/v1/books/:id/marketing` | `apps/server/src/routes/production.ts` |
| GET | `/api/v1/books/:id/marketing` | `apps/server/src/routes/production.ts` |
| GET | `/api/v1/marketing` | `apps/server/src/routes/production.ts` |
| PATCH | `/api/v1/marketing/:id` | `apps/server/src/routes/production.ts` |
| POST | `/api/v1/marketing/:id/regenerate` | `apps/server/src/routes/production.ts` |
| POST | `/api/v1/marketing/:id/archive` | `apps/server/src/routes/production.ts` |
| POST | `/api/v1/marketing/:id/restore` | `apps/server/src/routes/production.ts` |
| GET | `/api/v1/profiles` | `apps/server/src/routes/profiles.ts` |
| POST | `/api/v1/profiles` | `apps/server/src/routes/profiles.ts` |
| GET | `/api/v1/profiles/:id` | `apps/server/src/routes/profiles.ts` |
| PATCH | `/api/v1/profiles/:id` | `apps/server/src/routes/profiles.ts` |
| POST | `/api/v1/profiles/:id/archive` | `apps/server/src/routes/profiles.ts` |
| POST | `/api/v1/profiles/:id/restore` | `apps/server/src/routes/profiles.ts` |
| DELETE | `/api/v1/profiles/:id` | `apps/server/src/routes/profiles.ts` |
| GET | `/api/v1/profiles/:id/samples` | `apps/server/src/routes/profiles.ts` |
| POST | `/api/v1/profiles/:id/samples` | `apps/server/src/routes/profiles.ts` |
| PATCH | `/api/v1/profiles/:id/samples/:subId` | `apps/server/src/routes/profiles.ts` |
| DELETE | `/api/v1/profiles/:id/samples/:subId` | `apps/server/src/routes/profiles.ts` |
| GET | `/api/v1/profiles/:id/memory` | `apps/server/src/routes/profiles.ts` |
| POST | `/api/v1/profiles/:id/memory` | `apps/server/src/routes/profiles.ts` |
| DELETE | `/api/v1/profiles/:id/memory/:subId` | `apps/server/src/routes/profiles.ts` |
| PATCH | `/api/v1/profiles/:id/memory/:subId` | `apps/server/src/routes/profiles.ts` |
| GET | `/api/health` (public) | `apps/server/src/app.ts` |
| GET | `/api/v1/health` | `apps/server/src/routes/system.ts` |
| GET | `/api/v1/settings` | `apps/server/src/routes/system.ts` |
| POST | `/api/v1/settings/openrouter/test` | `apps/server/src/routes/system.ts` |
| GET | `/api/v1/backups` | `apps/server/src/routes/system.ts` |
| POST | `/api/v1/backups` | `apps/server/src/routes/system.ts` |
| PATCH | `/api/v1/settings` | `apps/server/src/routes/system.ts` |
| GET | `/api/v1/settings/models` | `apps/server/src/routes/system.ts` |
| PUT | `/api/v1/settings/models` | `apps/server/src/routes/system.ts` |
| GET | `/api/v1/book-types` | `apps/server/src/routes/system.ts` |
| GET | `/api/v1/interior-themes` | `apps/server/src/routes/system.ts` |
| GET | `/api/v1/cover-styles` | `apps/server/src/routes/system.ts` |
| POST | `/api/v1/books/:id/export-project` | `apps/server/src/routes/transfer.ts` |
| POST | `/api/v1/books/import-manuscript` | `apps/server/src/routes/transfer.ts` |
| POST | `/api/v1/projects/import` | `apps/server/src/routes/transfer.ts` |
| POST | `/api/v1/books/import-project` | `apps/server/src/routes/transfer.ts` |

Moving a book (D-051): `POST /api/v1/books/:id/export-project` returns the project zip. `POST /api/v1/books/import-project` takes `multipart/form-data` with `profileId` (a pen name in the caller's workspace) and `file` (the zip). It always makes a new book, owner or editor only, and is limited to 5 imports per minute per visitor. `POST /api/v1/projects/import` takes the raw zip as `application/zip` (optional `?profileId=`) and is the older route.

## Claim fixes, autosave and rerunning checks (19 October 2026)

Owners and editors only; viewers get 403. Each route is scoped to the book in the path: a section or claim of another book is 404. Errors use the usual body `{ error: { code, message, details? } }`.

- `GET /books/:id/claims/overview?status=open|verified|softened|removed|author_experience|all` (default `open`): claims across the book, older books included, in reading order. 200 `{ counts: { open, verified, softened, removed, author_experience }, items: [{ ...claim, section: { id, title, kind, number, enabled, position } | null, inCurrentText }] }`. `inCurrentText` is false when the sentence is no longer in the section's current text (suggest and apply would then answer 409).
- `POST /books/:id/claims/:claimId/suggest`, body `{ instruction? }` (up to 2,000 characters). 202 `{ jobId, job, estimate: { lowUsd, highUsd } }`. The `claim_fix` job's result is `{ claimId, sectionId, baseVersionId, sentence, options: [{ text, approach, rationale, needsSource }], dropped? }`, with up to three options; `approach` is `soften`, `generalise`, `attribute`, `reframe` or `remove` (empty text). Options that cite an unknown source marker, carry a link, add a number found in neither the sentence nor a cited source, or add an amount in words or a house-style guardrail pattern the sentence does not have are dropped. 409 `conflict` `{ jobId }` while a fix job for the same claim is unfinished (one lock per claim). 409 `conflict` `{ currentVersionId }` when the sentence is not in the current text; 409 `invalid_state` when the claim has no section or the section no text.
- `POST /books/:id/claims/:claimId/apply`, body `{ text, approach, jobId?, baseVersionId?, note? }`; `approach` may also be `own` (the owner rewrote the sentence). Replaces the sentence as a new version: source `ai:claim-fix` when `text` is one of the job's options unchanged, else `owner:claim-fix`. Sets the claim to `removed` (remove), `verified` (only `own` with a valid `[[S<n>]]` marker; `sourceUrl` is that source; an AI `attribute` is `softened`) or `softened`, and stores the code checks on the new version. 200 `{ claim, version, checks: { blocks, warnings } }`. 400 for empty text without `remove`, an unknown approach, an unknown source marker or a `jobId` that is not this claim's fix job. 409 `conflict` `{ currentVersionId }` when `baseVersionId` is not current or the sentence is gone.
- `POST /books/:id/fix-house-style` (owner or editor, no AI): em and en dashes and US spellings fixed in every switched-on section's current text with the after-writing auto-fix rules (`jobs/house-style-fix.ts`; the profile bio is never changed). Each changed section gets a new version, source `owner:style-fix`, with its code checks. 200 `{ sections, dashes, spellings }`.
- A job that fails with `errorCode: model_unavailable` carries `result: { model, stage, nextFallback }`, so the app can offer the next fallback for that stage in one click (D-003: offered, never silent).
- `PUT /books/:id/sections/:sectionId/autosave`, body `{ bodyMd, content?, baseVersionId, baseRevision? }` (`baseVersionId` `null` for a section with no text; `baseRevision` the `updatedAt` of that version as the editor holds it). 200: the saved version (as `GET /sections/:id/versions/:versionId`) plus `coalesced`. Source `owner:autosave`. When the current version is the same user's autosave made less than 5 minutes ago and `baseRevision` matches its `updatedAt`, it is updated in place (`coalesced: true`); without `baseRevision` a new version is made. A different `baseRevision` is 409 `conflict` `{ currentVersionId, baseVersionId, currentRevision, baseRevision }`. Any other save, restore or AI version closes that window. 409 `conflict` `{ currentVersionId, baseVersionId }` on a stale base.
- `GET /sections/:id/versions` also returns `currentVersionId` and `previousVersionId` (the version before the current run of the same user's autosaves), and each item carries `createdBy` and `updatedAt`.
- `POST /sections/:id/recheck` (alias `/sections/:id/summarise`), empty body. Queues `write_section` with `rerunMissing` (summary when the text has none or an open `summary_missing` flag, checks when it has an open `checks_missing` flag). 202 `{ jobId, job, steps: ('summary'|'checks')[], estimate: { lowUsd, highUsd } }`. 409 `invalid_state` when there is no text or nothing is missing; 409 `conflict` `{ jobId }` when an unfinished job already works on the section. Check and enqueue run under one lock per section. `GET /sections/:id/recheck` answers `{ sectionId, steps, estimate, runningJobId, hasText }` without queuing anything.
- Pack preflight: `body.summary-missing.<sectionId>` and `body.checks-missing.<sectionId>` carry `fix: { route: 'writing', label, action: 'rerun-checks', sectionId }`; the action is `POST /sections/:sectionId/recheck`. `cover.files` blocks and warnings say "or upload your own cover" and carry `fix: { route: 'cover', label, anchor: 'own-cover' }`.

Schema and detailed response contracts remain in the source declarations and API client types. Relevant integration suites cover workspace isolation, uploads/imports, jobs, versions, backups and production operations. Live/external provider behaviour is not established by mock tests.
