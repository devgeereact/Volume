# Permissions

The server resolves who is calling on every `/api` request (Clerk session on the host, owner stub locally) and attaches a request context: workspace, user and role (`apps/server/src/auth/`). Every repository query is scoped to that workspace, including imports, assets, project versions, jobs and exports. Client-side visibility is not authorisation: the web app hides controls a role cannot use (`GET /api/v1/me`), but the server decides.

- Roles rank owner, then editor, then viewer (`hasRole`, `assertRole`, `assertCanWrite` in `apps/server/src/auth/context.ts`). Write routes need editor; settings, spending, members and pen name bios need owner; a viewer gets 403 on every write.
- Instance-wide actions (whole-database backups, the OpenRouter key test, the cap for other workspaces) need an owner of the instance owner's own workspace (`assertInstanceOwner`).
- Cross-workspace access is denied. `apps/server/test/isolation.test.ts` calls every registered route as another workspace; `apps/server/test/roles.test.ts` checks each role against owner-only and write routes.

Roles live in Volume (`memberships.role`), not in Clerk. Details: [authentication model](AUTH-MODEL.md) (D-047).
