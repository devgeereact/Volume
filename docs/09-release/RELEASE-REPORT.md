# Release report

Candidate: GEE OS rebuild, local isolated checkout. Decision: **NO-GO for release**. Local implementation is authorised; release is not.

| Gate | Status | Evidence/limit |
| --- | --- | --- |
| Original Linux runtime | PASS | Earlier dated restoration checks; not a rebuilt-candidate claim. |
| Rebuild Linux acceptance | PARTIAL | Clean restore, typecheck/lint/build, tooling and existing browser checks pass; export visual gate fails. See ../../qa/reports/GEE-REBUILD-2026-10-07.md. |
| macOS execution | NOT TESTED | Workflow/local Mac execution still required. |
| PDF reference parity | FAIL | Existing contents-page mismatch, mean 2.9435 versus 1.5. |
| Live writing/publishing | PARTIAL | Existing known issues, no new live acceptance. |
| MySQL/cPanel | NOT TESTED | Deferred by owner. |
| Destructive retirement | NOT APPLICABLE | No approved delete list. |

Rollback: return to the original checkout, not a database reset. Source moves, tests and fixtures must not change owner data. Owner remains release decision maker. See [known issues](../../KNOWN-ISSUES.md).

## Fresh follow-up, 7 October 2026

See ../../qa/reports/FOLLOW-UP-2026-10-07.md. Restart recovery passes after test-startup correction; PDF visual acceptance remains FAIL. Release decision stays NO-GO.


## 7 October 2026: running-header correction

Corrected suppressed small capitals in PDF running headers and added a rendered-PDF regression. Full visual parity remains FAIL; reference images and tolerance remain unchanged. Ornament rendering is intact, correcting the initial diagnostic suspicion. See qa/reports/PDF-SMALLCAPS-2026-10-07.md. Release remains PARTIAL/NO-GO; actual Mac execution is NOT TESTED.
