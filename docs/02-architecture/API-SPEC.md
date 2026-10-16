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
| GET | `/api/v1/books/:id/preflight` | `apps/server/src/routes/production.ts` |
| POST | `/api/v1/books/:id/exports` | `apps/server/src/routes/production.ts` |
| GET | `/api/v1/books/:id/exports` | `apps/server/src/routes/production.ts` |
| GET | `/api/v1/exports/:id/download` | `apps/server/src/routes/production.ts` |
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

Schema and detailed response contracts remain in the source declarations and API client types. Relevant integration suites cover workspace isolation, uploads/imports, jobs, versions, backups and production operations. Live/external provider behaviour is not established by mock tests.
