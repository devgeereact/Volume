# User roles

Volume is hosted at https://volume.gakinz.com for one owner, Gideon. Sign-in is Clerk (`AUTH_MODE=clerk`, D-039); local development uses the owner stub (`AUTH_MODE=local`). A pen name or author profile is book metadata, not a login.

Each signed-in account has one membership in one workspace, with one of three roles (D-047, `apps/server/src/auth/context.ts`):

| Role | Who | Can do |
|---|---|---|
| Owner | The instance owner's allowlisted accounts, or a self-publisher invited as owner of a new workspace of their own | Everything in the workspace, including settings, models, spending, pen name bios and members |
| Editor | Invited by the owner | Writes books (research, blueprints, manuscripts, covers, jobs, exports); not settings, spending, members or pen name bios |
| Viewer | Invited by the owner | Reads only |

Invitations only work with `ACCOUNTS_MODE=invite`; the default `owner-only` admits allowlisted accounts and nobody else. The owner manages members in Settings, Members (`apps/web/src/features/settings/MembersPanel.tsx`). The full rules, including the instance owner's extra rights, are in [authentication model](../05-security/AUTH-MODEL.md). Route checks are in [permissions](../05-security/PERMISSIONS.md); product modules in [product spec](PRODUCT-SPEC.md).
