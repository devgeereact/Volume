# 10 Security and privacy

Volume holds unpublished books, author identities, possibly real people's stories, and one paid API key. It runs on the owner's cPanel host behind Cloudflare and Clerk sign-in (D-038, D-039), and locally on the Mac for development. The aim is simple: the key never leaves the server process, only allowed accounts reach the data, and book content goes nowhere except OpenRouter.

## What we protect

| Asset | Why it matters |
|---|---|
| `OPENROUTER_API_KEY` | Anyone holding it can spend the owner's money |
| Manuscripts, blueprints, covers | Unpublished work, commercial value |
| Profiles | Legal names, real-person details, links |
| Real people's stories | Healthcare topics can touch patient confidentiality |
| Backups | Full copies of all of the above |

## Threats and controls

| Threat | Control |
|---|---|
| Key leaks into the browser, logs, prompts or git | Key read only by `apps/server` from `.env`; never sent to the web app (not even partly masked); a test scans the built web bundle for key patterns (`sk-or-`) and the variable name; the logger redacts `Authorization` headers and any value matching key patterns; `.env` and `data/` are git-ignored; Claude Code hooks block AI tools from reading `.env` and `data/`, and other AI tools follow the same rule from `AGENTS.md` |
| A stranger reaches the hosted app | Clerk session required on every `/api` request (401 without one), checked on the decoded path and again inside the `/api/v1` scope so percent-encoded paths cannot skip it; allowlist by user id or verified email (403 otherwise); only `GET /api/health` is public and returns `{"status":"ok"}` only; the origin `.htaccess` refuses requests that did not come through Cloudflare; the server binds to `127.0.0.1` behind Passenger |
| Brute force or flooding | Rate limit per visitor IP (`CF-Connecting-IP`): reads, writes and the health check have separate allowances per minute; JSON and upload body limits |
| Error details leak | One JSON error shape; 500 answers carry a fixed message, never the stack or the error text; logs redact `Authorization` and cookies, replace query strings with `?[redacted]`, record a salted hash of the visitor IP instead of the address, and log errors by name, code and stack frames only (D-050) |
| A web page in the owner's browser calls the API (DNS rebinding, CSRF) | Host header must be an allowed host (`ALLOWED_HOSTS`, default the `APP_ORIGIN` host; loopback in development); Origin must match on every non-GET request; Clerk's `authorizedParties` is `APP_ORIGIN`; CORS disabled; JSON-only bodies; SSE is read-only; pages carry a Content Security Policy, `X-Frame-Options: DENY` and HSTS with `includeSubDomains`; event streams carry the same security headers as other answers (D-050) |
| Prompt injection from research pages or pasted text | Outside text goes into labelled data blocks; prompts state that data is not instructions; outputs are schema-validated; models have no tools that act on the system; sources come only from `url_citation` annotations |
| Malicious import file (zip slip, huge files, disguised images) | PNG, JPEG and WebP uploads must start with their type's magic bytes or are refused with 415 (D-050). Markdown import validates sections and saves atomically. Project ZIP imports validate rows/references before mutation, reject unsafe/duplicate paths and limit expansion to 128 MiB per entry, 256 MiB total and 10,000 entries; upload limits also apply |
| Path traversal in file downloads | Files are served by asset or export id, never by a path from the request; content comes from workspace-scoped database BLOB chunks, not a caller-supplied filesystem path |
| HTML injection in descriptions or manuscript | Markdown renders to HTML through an allowlist; Amazon descriptions limited to KDP's allowed tags (FACTS 10.14); TipTap content stored as Markdown, not raw HTML |
| Runaway spending | Book budget, monthly cap, cost estimate before each call, pause on limit; owner sets a spending limit on the OpenRouter account too |
| Data loss | Nightly backups with retention (`docs/02-architecture/ARCHITECTURE.md`), versions for every section change, archive instead of delete |
| Supply chain | Only packages named in the docs; anything else needs the owner's OK; lockfile committed; CI runs typecheck, lint, formatting, coverage, web build and mock browser checks; no npm audit step currently runs |

## Key handling

- Stored in `.env` as `OPENROUTER_API_KEY`. `.env.example` lists the name with no value.
- No verify-env helper exists. Check key presence/status through Settings without reading or printing secret values.
- Settings shows key status from a server call: present, valid, credit or limit when OpenRouter returns them. No characters of the key are shown.
- The key is sent only in the `Authorization` header to `https://openrouter.ai/api/v1`. No other host ever receives it.
- If the key is suspected leaked: revoke it on openrouter.ai, create a new one, update `.env`, restart. Never copy the old key into an issue, log or handoff.

## Network policy

- Outbound from the server: OpenRouter, plus Clerk (JWKS or user lookups) when hosted.
- Research link checking (opening cited URLs to see if they still work) would contact other sites, so it is off by default and needs a `docs/08-change-management/DECISIONS.md` entry and the owner's OK before it is built (`KNOWN-ISSUES.md`).
- Fonts, icons and the app's own scripts are bundled. The hosted build also loads Clerk's sign-in script and Cloudflare Turnstile on sign-in (allowed in the CSP). No analytics, no telemetry, no error reporting service. Pages and API answers carry `X-Robots-Tag: noindex, nofollow` and `robots.txt` disallows everything.
- Links to sources open in the system browser, outside the app.

## Privacy of book content

- Text sent to OpenRouter is processed by the chosen model provider. Settings shows a short notice on the Models tab: what is sent (the packed context for that stage) and that provider data policies apply.
- Intended: where OpenRouter offers provider routing preferences that exclude providers who keep or train on data, Volume sets them by default. Not implemented yet: the client sends only `provider.ignore` (checked 17 October 2026, `packages/ai/src/provider/openrouter.ts`). Owner decision open, see [privacy inventory](PRIVACY-INVENTORY.md).
- Nothing is sent for deterministic checks, exports or KDP maths; those run locally.
- Prompt runs store the raw response for audit in the database. Deleting a book clears their output and error text and keeps only the cost rows; job events go with the book and are pruned after 90 days (D-050). See [privacy inventory](PRIVACY-INVENTORY.md).

## Real people and sensitive topics

- The real-person flag (`docs/01-product/PRODUCT-SPEC.md`, M1) turns on the "stories are illustrative" line by default for new books.
- Writing prompts for real-person profiles require composite, non-identifying stories: no names, dates, places or details that could identify a patient, client, colleague or employer.
- The claims report lists medical, clinical, legal, safety, financial and statistical statements for the owner to verify, soften or remove before export. Preflight warns while any stay open.
- The app never claims that a book was written without AI. KDP's AI disclosure is set automatically (FACTS 5.5).

## Files and permissions

- `data/` is created with mode `0700`; the database and files inside with `0600`.
- Server logging goes to the configured logger output. No data/logs file sink is implemented. Redaction rules cover sensitive fields; do not add keys or manuscript text to logs.
- Backups inherit the same permissions. Copying backups off the Mac (for example to an external drive) is the owner's choice and is not automated.

## Multi-user (phase 8)

Not built in v1, but the design keeps the door open:
- Every query is scoped by `workspace_id` through repositories; a test tries cross-workspace reads and expects `not_found`.
- Clerk sign-in replaced the auth stub for hosting (D-039); Clerk holds passwords and sessions.
- Roles from `memberships` gate writes.
- The app is hosted for the owner only (D-038). Before a second self-publisher is added, give each account its own workspace and decide how OpenRouter keys and budgets are split.

## Checks that prove this

Listed in `docs/06-quality/TEST-STRATEGY.md`: bundle key scan, Host and Origin rejection tests, path traversal tests, workspace isolation tests, logger redaction test, hook tests for `.env` and `data/` guards.
