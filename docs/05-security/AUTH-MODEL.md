# Authentication model

Two modes, chosen by `AUTH_MODE` (D-039).

## Hosted: Clerk (`AUTH_MODE=clerk`, required in production)

- The web app is built with `VITE_CLERK_PUBLISHABLE_KEY` and wraps every screen in Clerk's `ClerkProvider` (`apps/web/src/auth/HostedAuth.tsx`). Signed out, it shows Clerk's sign-in. Signed in, it asks the server once (`GET /api/v1/health`) and shows "This account is not allowed" on 403. The account menu (`UserButton`) sits in the top bar.
- Every API call carries the session token as `Authorization: Bearer` (`setAuthTokenGetter` in `apps/web/src/api/client.ts`). Same-origin requests also send Clerk's `__session` cookie, which SSE streams, images and download links rely on.
- The server checks the session on every `/api` request except `GET /api/health` (`apps/server/src/auth/clerk.ts`), with `@clerk/backend` `authenticateRequest`, `authorizedParties` = `APP_ORIGIN`, and `CLERK_JWT_KEY` for networkless checks when set. `CLERK_SECRET_KEY` is required.
- Allowlist: `CLERK_ALLOWED_USER_IDS` (Clerk user ids) and/or `OWNER_EMAILS` (verified addresses, looked up through the Clerk Backend API and cached for 10 minutes). No session: 401. Anyone else: 403. Signing in never grants access by itself.
- Mapping: the first allowed sign-in binds the existing owner user (`users.clerk_user_id`, migration 0005), so the owner's library stays theirs. A further allowed account gets its own user with an owner membership in the same workspace. Workspaces, memberships and roles are unchanged, so other self-publishers can be added later with their own workspaces.
- Sign-up, password rules, MFA and sessions are Clerk's (configured in the Clerk dashboard by the lead). Volume stores no passwords.

## Local: owner stub (`AUTH_MODE=local`, development default)

The stub in `apps/server/src/auth/context.ts` attaches the single owner to every request. It is not a login system. It is refused when `NODE_ENV=production`. The server binds to 127.0.0.1 and the Host and Origin checks still apply.

Tests: `apps/server/test/hosting.test.ts` (401, 403, 200, binding, production refusals). See [security](SECURITY.md) and [permissions](PERMISSIONS.md).
