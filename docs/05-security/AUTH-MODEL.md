# Authentication model

Two modes, chosen by `AUTH_MODE` (D-039).

## Hosted: Clerk (`AUTH_MODE=clerk`, required in production)

- The web app is built with `VITE_CLERK_PUBLISHABLE_KEY` and wraps every screen in Clerk's `ClerkProvider` (`apps/web/src/auth/HostedAuth.tsx`). Signed out, it shows Clerk's sign-in. Signed in, it asks the server once (`GET /api/v1/health`) and shows "This account is not allowed" on 403. The account menu (`UserButton`) sits in the top bar.
- Every API call carries the session token as `Authorization: Bearer` (`setAuthTokenGetter` in `apps/web/src/api/client.ts`). Same-origin requests also send Clerk's `__session` cookie, which SSE streams, images and download links rely on.
- The server checks the session on every `/api` request except `GET /api/health` (`apps/server/src/auth/clerk.ts`), with `@clerk/backend` `authenticateRequest`, `authorizedParties` = `APP_ORIGIN`, and `CLERK_JWT_KEY` for networkless checks when set. `CLERK_SECRET_KEY` is required.
- Allowlist: `CLERK_ALLOWED_USER_IDS` (Clerk user ids) and/or `OWNER_EMAILS` (verified addresses, looked up through the Clerk Backend API and cached for 10 minutes). No session: 401. Anyone else: 403. Signing in never grants access by itself.
- Mapping: the first allowed sign-in binds the existing owner user (`users.clerk_user_id`, migration 0005), so the owner's library stays theirs. A further allowed account gets its own user with an owner membership in the same workspace. The allowlist names the owner's own accounts only; everyone else comes in through an invitation (below).
- Sign-up, password rules, MFA and sessions are Clerk's (configured in the Clerk dashboard by the lead). Volume stores no passwords.

## Accounts and roles (D-047)

Clerk proves who someone is. What they may do lives in Volume, in `memberships.role`. Clerk Organizations and Clerk roles are not used.

### `ACCOUNTS_MODE`

- `owner-only` (the default, and the value when the setting is missing): only allowlisted accounts get in. Invitations cannot be created, and a pending invitation admits nobody.
- `invite`: the owner can also invite an email address with a role. Any other value stops the server at start-up.

The setting is a name in `.env.example` and the host's settings file (`docs/07-operations/DEPLOYMENT.md`). Leaving it at `owner-only` undoes the whole feature.

### Roles

| Role | Can do |
|---|---|
| owner | Everything in the workspace: books, settings, models, budgets, pen name bios and members. |
| editor | Write books, research, blueprints, manuscripts, covers, jobs and exports. Not settings, budgets, members or pen name bios. |
| viewer | Read only. Every write route answers 403. |

Some actions reach past one workspace: whole-database backups and the OpenRouter key test. Only an owner of the instance owner's own workspace can use them, never the owner of another self-publisher's workspace (`assertInstanceOwner` in `apps/server/src/auth/context.ts`). All AI runs on the instance owner's OpenRouter key within each workspace's budgets. Keys per account are deferred.

### AI spending by other workspaces

Every workspace other than the instance owner's spends the instance owner's OpenRouter key, so the instance owner holds one more cap over them:

- `budget.guest_workspaces_monthly_cap_usd` is stored on the instance owner's workspace. It is the monthly AI spend allowed to each other workspace, in US dollars. The default is 0, which refuses every AI and image call from those workspaces: their jobs fail with error code `guest_ai_disabled` until the instance owner sets a cap.
- The job runner checks it before every AI and image call (the same reservation path as the book budget and the workspace's monthly cap), counting that workspace's spend this month and its calls in flight. A call that would pass it pauses the job with `budget_exceeded`, like the other caps.
- Only the instance owner sees it (`budgets.guestWorkspacesMonthlyCapUsd` in `GET /api/v1/settings`) or sets it (`PATCH /api/v1/settings`). Anyone else gets 403 when they try. A self-publisher's own caps still apply on top, but can never lift this one.
- `GET /api/v1/settings` returns backup status to the instance owner only (`backups` is null for everyone else), because backups hold the whole database.

### Invitations

- The owner sends `POST /api/v1/invitations` with an email and a role. Emails are stored in lower case (table `invitations`, migration 0009). Status is `pending`, `accepted` or `revoked`.
- An `editor` or `viewer` invitation joins the inviting workspace with that role. An `owner` invitation is for a separate self-publisher, who gets a new workspace of their own on first sign-in. Only the instance owner can send an `owner` invitation.
- One pending invitation per address per workspace: inviting the same address again changes the role of the pending one. A unique index on `(workspace_id, pending_email)` backs this up when two invitations race.
- On sign-in, an account that is not on the allowlist is matched against pending invitations by its verified Clerk email addresses. The instance owner's workspace wins when several workspaces invited the same address, then the oldest invitation. The match is accepted once, so two parallel requests cannot both use it. No match: 403.
- One Volume account has one membership. An invitation is only accepted for an account with no membership yet; other workspaces' pending invitations for the same address stay pending and admit nothing while the account has its membership.
- An invited account never becomes an owner of the instance owner's workspace.
- `DELETE /api/v1/invitations/:id` withdraws a pending invitation.

### Members

- `GET /api/v1/members` lists members and pending invitations. `PATCH /api/v1/members/:userId` changes a role to `editor` or `viewer`. `DELETE /api/v1/members/:userId` removes a member and revokes the invitation that admitted them, so it cannot admit them again.
- The owner cannot change or remove their own membership or another owner's. Owner accounts are set by the allowlist.
- An invited member's membership is read on every request and never cached, so a role change or a removal takes effect on the next request. An open event stream (`/api/v1/events`, `/api/v1/books/:id/events`) re-checks the membership every 60 seconds and closes for a removed member.
- `GET /api/v1/me` tells any signed-in account its own role, whether it is the instance owner and the accounts mode, so the web app can hide controls the role cannot use. It returns no other account's details.

Members routes are owner only. Every other route is scoped to the caller's workspace.

## Local: owner stub (`AUTH_MODE=local`, development default)

The stub in `apps/server/src/auth/context.ts` attaches the single owner to every request. It is not a login system. It is refused when `NODE_ENV=production`. The server binds to 127.0.0.1 and the Host and Origin checks still apply.

Tests: `apps/server/test/hosting.test.ts` (401, 403, 200, binding, production refusals), `apps/server/test/roles.test.ts` (accounts modes, invitations, each role against owner-only and write routes, removal on the next request) and `apps/server/test/isolation.test.ts` (every registered route called as another workspace). See [security](SECURITY.md) and [permissions](PERMISSIONS.md).
