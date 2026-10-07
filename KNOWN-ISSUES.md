# Known issues and open questions

Updated 6 October 2026 after the local correction pass. Evidence and original findings: [project review](qa/reports/PROJECT-REVIEW-2026-10-06.md).

| Item | Remaining work | Status |
|---|---|---|
| Humanizer live acceptance | New versions of all 32 prompts pass mock integration, server and browser checks. Actual prose quality needs a fresh authorised live run after the owner reloads/restarts the existing server. Earlier free-route errors remain unresolved. | NOT TESTED live |
| Live AI acceptance | Owner approved free-only testing. Live titles and three-chapter blueprint pass on Nvidia; full writing failed on summary truncation with both tested Nvidia summary models. Both requested Gemma routes returned upstream invalid-key errors. Recorded cost zero. Production-model quality, research citations and AI covers remain unverified. [Free validation](qa/reports/FREE-AI-VALIDATION-2026-10-06.md). | PARTIAL |
| MySQL on cPanel | Deferred by owner. When resumed, supply a disposable test environment and verify TLS, complete migrations, jobs/files and restore before production migration. | NOT TESTED, deferred |
| Publishing acceptance | Sampled Windowsill Herbs DOCX layouts pass in Word. Kindle installer verification passes outside the sandbox; licence approval pending. Browser surfaces unavailable for template/draft interaction. Owner-book and KDP acceptance remain unverified. [Free validation](qa/reports/FREE-AI-VALIDATION-2026-10-06.md). | PARTIAL |
| Barcode placement | Dimensions and supplied-barcode clearance are checked; automatic position still needs the generated cover template. Dated rules retain a partial warning. | PARTIAL |
| KDP wording | Spine text at 79 pages and the printing-cost overlap at 110 remain ambiguous in official guidance. Safe defaults and warnings remain. | PARTIAL |
| GitHub checks | CI workflow included in the owner-authorised push. Remote execution/results still require verification. | NOT TESTED remotely |
| Visual direction, D-014 | Fused direction is implemented, but the recorded decision remains proposed. Owner confirmation is still required; documentation refresh does not approve it. | Owner decision |
| Profile facts | Owner confirms Gideon's imprint/credentials and Harni's personal details. Do not invent or silently amend them. | Owner decision |
| Redirect lookups, D-020 | Default is now off. Explicit approval is still needed before enabling non-OpenRouter lookups for book research. | Owner decision |
| Environment examples | The current task reserves .env.example for owner edits. Configuration defaults are documented in server source; no environment files were read or edited. | Owner task |
| TypeScript lint compatibility, D-023 | Root TypeScript 6 alias remains necessary for the current ESLint parser. Workspaces use TypeScript 7. | Existing workaround |

Fiction/workbooks, picture books, batch scheduling and accounts remain later roadmap phases. They are not part of the v1 correction pass.

Closed locally: atomic project imports, row/ZIP validation, internal AI budget checks and concurrent reservations, Markdown import, API blueprint comparison/restoration, TipTap editor, photo upload/export, writing cost confirmation, prices before publication, stale project metadata, migration any alias, backup documentation, EPUBCheck, the long-book benchmark and measured coverage targets. See the review's correction ledger for exact checks and limitations.

## GEE OS rebuild candidate, 7 October 2026

- FAIL: Linux PDF reference parity. All-page diagnostic finds title 1.268090 (PASS), contents 2.943523, chapter opener 8.613240 and body 11.101959 (FAIL against unchanged 1.5). Font-hinting experiments improve differences but none pass all pages. Exact cause unresolved; references/render settings/tolerance unchanged. Run npm run compare:pdf --workspace @volume/export. Evidence: qa/reports/PDF-INVESTIGATION-2026-10-07.md.
- NOT TESTED: macOS execution and remote matrix CI. A workflow file is not execution evidence.
- PARTIAL: structural rebuild candidate is isolated, pending validation/review and cutover. Existing publishing and live AI issues above remain open.
- PASS locally: offline profile entry health-request loop and design generation in paths with spaces are corrected; browser recovery acceptance is recorded in the rebuild report.
- PASS: previously ignored frontend demo source is restored under src/demo; private root /data/ stays ignored. Fresh install and Linux typecheck/lint/build succeed.
- NOT APPLICABLE: direct LAN exposure in this candidate. Existing owner-only authentication and origin guards require loopback binding.
