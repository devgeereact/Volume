# Privacy inventory

Written 17 October 2026 from the code, the migrations and read-only checks of https://volume.gakinz.com. Nothing here is legal advice and nothing here says Volume is compliant. Items marked REQUIRES OWNER INPUT or REQUIRES LEGAL REVIEW are open.

## Scope and facts

- Operator: Gideon Akinlotan, sole trader trading as Gakinz, London (owner answer, 17 October 2026). Postal address and privacy contact address: REQUIRES OWNER INPUT.
- Users today: the owner only, through the Clerk allowlist. Planned: a few invited people, then public sign-ups (owner answer, 17 October 2026). Each stage needs more; see "What each stage needs" below.
- Jurisdiction: UK (UK GDPR, Data Protection Act 2018, PECR). Users outside the UK: REQUIRES OWNER INPUT before public sign-ups.
- Data subjects: the owner and invited users (account data); people named or described in books, profiles and research (third-party data the owner types in).

## Data map

| Data | Fields | Collected at | Purpose | Stored in | Recipients | Retention | Deletion | Evidence |
|---|---|---|---|---|---|---|---|---|
| Account link | Clerk user id, display name, `last_seen_at` | First allowed sign-in | Map a Clerk account to the owner's workspace | `users`, `memberships` | None | Indefinite | No route; database only | `apps/server/src/db/migrations/0001_initial.ts`, `0005`, `apps/server/src/auth/clerk.ts` |
| Sign-in data | Email, password or social login, MFA, session | Clerk sign-in screen | Authentication | Clerk (processor) | Clerk | Clerk's terms | Clerk dashboard | `apps/web/src/auth/HostedAuth.tsx` |
| Allowed emails | Owner email addresses | `OWNER_EMAILS` setting | Allowlist | Host `.env`, 10-minute in-memory cache | Clerk Backend API lookup | Until changed | Edit the setting | `apps/server/src/auth/clerk.ts` |
| Author profiles | Pen name, legal name, location, bios, links, credentials, real-person flag, voice notes, photos, writing samples | Profile editor | Book metadata and author voice | `author_profiles`, `profile_samples`, `profile_memory`, `assets` | OpenRouter (voice and bio text in prompts) | Indefinite | Archive, then confirmed delete when no books use it | `apps/server/src/repos/profiles.ts` |
| Books | Manuscript, research, blueprint, claims, covers, marketing text | Book screens | The product | `projects` and child tables, `assets` | OpenRouter (packed context per stage) | Indefinite | Archive, then typed-title delete with cascade | `apps/server/src/repos/books.ts` |
| AI audit | Raw model output, errors, cost | Every AI call | Audit and spend | `prompt_runs` | None | Indefinite | Not deleted when a book is deleted (only unlinked) | `apps/server/src/repos/books.ts`, `apps/server/src/jobs/runner.ts` |
| Job progress | Job payloads, results, events | Jobs | Progress stream | `jobs`, `job_events` | None | Indefinite; `EventBus.prune` has no caller | With the book | `apps/server/src/sse/bus.ts` |
| Request logs | Method, URL (including query text such as manuscript search), visitor IP, status | Every request | Operations | Passenger log on the host | Host provider | Host-defined | Host-defined | `apps/server/src/app.ts` |
| Backups | Everything above | Nightly (SQLite only) | Recovery | `data/backups`, 14 kept, mode 0600; MySQL uses cPanel backups | Host provider | 14 SQLite copies; cPanel: REQUIRES OWNER INPUT | Rotation | `apps/server/src/backups/backup.ts` |

Not present (checked): payments, newsletters, marketing email, SMS, push, analytics, advertising, session replay, error monitoring service, CRM, live chat, social embeds, maps, video, CAPTCHA other than Clerk's Cloudflare Turnstile on sign-in, contact forms, precise location, children's features.

## Vendors

| Vendor | Role | Data | Location and transfer | Evidence |
|---|---|---|---|---|
| OpenRouter and the model provider it routes to | Processor | Prompt text: manuscript, profile voice, research, samples | Outside the UK; mechanism REQUIRES LEGAL REVIEW | `packages/ai/src/provider/openrouter.ts` |
| Clerk | Processor | Sign-in identity, sessions, device data | Outside the UK; mechanism REQUIRES LEGAL REVIEW | `apps/server/src/auth/clerk.ts` |
| Cloudflare | Processor (proxy, Turnstile) | IP, request metadata | Global network; REQUIRES LEGAL REVIEW | Live `server: cloudflare` and `cf-ray` headers |
| cPanel host (premium17.web-hosting.com) | Processor (hosting, database, backups) | Everything | Location REQUIRES OWNER INPUT | `.agent/PROJECT.yml` |

OpenRouter provider data policy: [security](SECURITY.md) intends Volume to avoid providers that keep or train on data. The code does not do this yet (`buildBody` sends only `provider.ignore`). Owner decision needed, because `data_collection: "deny"` can remove some free models from routing.

## Cookies and browser storage

| Name | Provider | Purpose | Category | Duration | Consent needed | Evidence |
|---|---|---|---|---|---|---|
| `__session` | Clerk, set on volume.gakinz.com | Short-lived session token for API calls | Strictly necessary (sign-in) | About 60 seconds, refreshed | Likely exempt, provisional | Clerk docs, XSS leak protection |
| `__client_uat` | Clerk | Checks the session is still current | Strictly necessary | Clerk-defined | Likely exempt, provisional | Clerk docs, SDK terminology |
| `__client` | Clerk Frontend API (clerk.volume.gakinz.com), HttpOnly | Issues session tokens | Strictly necessary | Long-lived, Clerk-defined | Likely exempt, provisional | Clerk docs, SDK terminology |
| `__clerk_handshake` and other short internal cookies | Clerk | Session handshakes | Strictly necessary | Session | Likely exempt, provisional | Clerk docs |
| Cloudflare and Turnstile cookies | Cloudflare | Bot protection on sign-in and proxy | Strictly necessary (security) | Cloudflare-defined | Likely exempt, provisional | CSP allows `challenges.cloudflare.com`; names NOT TESTED at runtime |
| `volume.theme` (localStorage) | Volume | Light or dark choice | Preference | Until cleared | Likely exempt as interface customisation, provisional | `apps/web/src/lib/theme.tsx` |
| `volume.library.view` (localStorage) | Volume | Library view choice | Preference | Until cleared | Likely exempt, provisional | `apps/web/src/features/library/LibraryPage.tsx` |

No analytics or advertising tags exist, so no consent banner is built. A short cookie section in the privacy notice covers this while it stays true. If any optional tag is ever added, a consent control must come first. The live cookie list in a signed-in browser was not captured: NOT TESTED.

## Retention schedule (proposed, none confirmed)

| Data | Proposed | Trigger | Method | Status |
|---|---|---|---|---|
| Books, profiles | Keep until the owner deletes | Owner action | Existing archive then delete | Implemented; period REQUIRES OWNER INPUT |
| `prompt_runs.output` | Clear raw output when its book is deleted; keep cost rows | Book delete | Set output to null | Not implemented; REQUIRES OWNER INPUT |
| `job_events` | 30 days | Event age | Nightly `EventBus.prune` | Not implemented; REQUIRES OWNER INPUT |
| Request logs | 30 days | Log age | Host log rotation | Host setting, NOT TESTED |
| SQLite backups | 14 nightly copies | Rotation | Existing | Implemented |
| cPanel backups | Host default | Host | Host | REQUIRES OWNER INPUT |
| Departed user accounts | 30 days after access ends | Removal from allowlist | Delete the `users` row and the Clerk user | Not implemented; REQUIRES LEGAL REVIEW |

## Rights and deletion today

- Owner only: the owner holds all data and can delete books and profiles in the app. Account data lives in Clerk and in one `users` row.
- No self-service account deletion, no whole-workspace export (only the per-book project zip), no data request route. Workable for owner-only use. Not workable before invited users or public sign-ups: see below.
- The per-book project zip carries the profile's `legal_name`, location and real-person flag (`apps/server/src/repos/transfer.ts`), while [the data model](../02-architecture/DATA-MODEL.md) says the legal name is never exported. Owner to decide which is right.

## What each stage needs

| Stage | Needed before it starts |
|---|---|
| Owner only (now) | This inventory, noindex (done 17 October 2026), the OpenRouter data policy decision |
| Invited people | Published privacy notice linked from the sign-in screen; operator contact; a note of what invitees can see (they share the owner's workspace with the owner role today, `apps/server/src/auth/clerk.ts`); a way to remove their account and data; lawful basis confirmed |
| Public sign-ups | Everything above, plus terms of use, one workspace per account, self-service deletion and export, a data request route, retention jobs, budgets and keys per account, legal review of transfers |

## Sources consulted (17 October 2026)

| Source | Issuer | Supports |
|---|---|---|
| [Cookies and similar technologies, Guide to PECR](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/cookies-and-similar-technologies/) | ICO | Consent rule and the strictly necessary exemption; the page says revised guidance is under consultation |
| [What privacy information should we provide?](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/what-privacy-information-should-we-provide/) | ICO | Article 13 and 14 contents for the draft notice; the page says it is under review after the Data (Use and Access) Act |
| [Clerk SDK terminology](https://github.com/clerk/clerk-docs/blob/main/docs/guides/development/sdk-development/terminology.mdx) and [XSS leak protection](https://github.com/clerk/clerk-docs/blob/main/docs/guides/secure/best-practices/xss-leak-protection.mdx) | Clerk | Cookie names and purposes |

Draft notice: [legal/PRIVACY-NOTICE.draft.md](legal/PRIVACY-NOTICE.draft.md). Terms of use: BLOCKED, no commercial rules exist yet.
