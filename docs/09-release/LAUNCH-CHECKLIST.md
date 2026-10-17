# Release gate

Record evidence for each item before release: the post-deploy checks in [deployment](../07-operations/DEPLOYMENT.md), clean macOS/Linux restore, runtime/dependency checks, typecheck/lint/format/coverage, server/web builds, mock end-to-end tests, visual/keyboard checks, fixture backup/restore, approved PDF reference treatment, external/live acceptance where applicable, owner review and exact retirement/rollback plan.

Current decision: NO-GO for public release. Owner-only hosting at volume.gakinz.com behind Clerk is a separate, approved step (D-038, D-039). See [release report](../../../reports/volume/docs/09-release/RELEASE-REPORT.md). No unchecked item is a PASS.
