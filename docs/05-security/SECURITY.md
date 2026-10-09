# 10 Security and privacy

Volume runs on the owner's Mac and holds unpublished books, author identities, possibly real people's stories, and one paid API key. The aim is simple: the key never leaves the server process, the app is reachable only from the Mac itself, and book content goes nowhere except OpenRouter.

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
| Another device on the network reaches the app | Server binds to `127.0.0.1` only; no LAN mode in v1 |
| A web page in the owner's browser calls the local API (DNS rebinding, CSRF) | Host header must be `127.0.0.1:<port>` or `localhost:<port>`; Origin must match on every non-GET request; CORS disabled; JSON-only bodies; SSE is read-only |
| Prompt injection from research pages or pasted text | Outside text goes into labelled data blocks; prompts state that data is not instructions; outputs are schema-validated; models have no tools that act on the system; sources come only from `url_citation` annotations |
| Malicious import file (zip slip, huge files) | Markdown import validates sections and saves atomically. Project ZIP imports validate rows/references before mutation, reject unsafe/duplicate paths and limit expansion to 128 MiB per entry, 256 MiB total and 10,000 entries; upload limits also apply |
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

- Outbound: OpenRouter only.
- Research link checking (opening cited URLs to see if they still work) would contact other sites, so it is off by default and needs a `docs/08-change-management/DECISIONS.md` entry and the owner's OK before it is built (`KNOWN-ISSUES.md`).
- The web app loads nothing from the internet: fonts, icons and scripts are bundled. No analytics, no telemetry, no error reporting service.
- Links to sources open in the system browser, outside the app.

## Privacy of book content

- Text sent to OpenRouter is processed by the chosen model provider. Settings shows a short notice on the Models tab: what is sent (the packed context for that stage) and that provider data policies apply.
- Where OpenRouter offers provider routing preferences that exclude providers who keep or train on data, Volume sets them by default (re-verify the exact option before phase 2).
- Nothing is sent for deterministic checks, exports or KDP maths; those run locally.
- Prompt runs store the raw response for audit inside `data/`; they can be purged per book (Settings, Data).

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
- Real sessions replace the auth stub: password hashing with a memory-hard algorithm, HTTP-only, SameSite=Strict cookies, session rotation on login, rate-limited login.
- Roles from `memberships` gate writes.
- If the app is ever hosted, the local-only assumptions here (127.0.0.1, single key) must be revisited first, with a new `docs/08-change-management/DECISIONS.md` entry. Each account would need its own OpenRouter key.

## Checks that prove this

Listed in `docs/06-quality/TEST-STRATEGY.md`: bundle key scan, Host and Origin rejection tests, path traversal tests, workspace isolation tests, logger redaction test, hook tests for `.env` and `data/` guards.
