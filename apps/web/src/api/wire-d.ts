/* Screen glue for Volume mode and accounts (phase 8): the caller's role, what that role may do, and the
   members and invitations list in both modes. Every endpoint call lives in volume.ts and every hook in
   hooks.ts; this file only combines them with the demo data. Queries stay switched off unless the server
   answered its health check, so demo mode never calls the server.

   Demo mode: the visitor is the owner with invitations on. Add ?role=editor or ?role=viewer to a Volume
   mode or Settings URL to see that role's read-only view. */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";
import { demoInvitations, demoMembers } from "../demo/volume";
import { ApiError, isApiError } from "./client";
import { useInvite, useMe, useMembers, useRemoveMember, useRevokeInvitation, useSetMemberRole } from "./hooks";
import type { AccountsMode, ApiInvitation, ApiMe, ApiMember, InvitationInput, MemberRole, Role } from "./types";
import { apiErrorText, useWireMode, type WireMode } from "./wire-a";

/* ---------- What a role may do (D-047) ---------- */

/** Owner and editor plan and run books, batches and releases. A viewer reads only. */
export function canWrite(role: Role | null | undefined): boolean {
  return role === "owner" || role === "editor";
}

/** Only the owner manages members, invitations, settings and budgets. */
export function canManage(role: Role | null | undefined): boolean {
  return role === "owner";
}

/** The Members section shows only to the owner, and only when the server runs with ACCOUNTS_MODE=invite. */
export function membersVisible(me: Pick<ApiMe, "role" | "accountsMode"> | null | undefined): boolean {
  return !!me && me.role === "owner" && me.accountsMode === "invite";
}

export const roleLabels: Record<Role, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

/** One line on what each role can do, for the invite form and the members list. */
export const roleHints: Record<Role, string> = {
  owner: "A separate self-publisher with a workspace of their own.",
  editor: "Writes and edits books, batches and releases. No settings, budgets or members.",
  viewer: "Reads everything. Cannot change anything.",
};

/** The sentence a viewer sees where the write buttons would be. */
export const READ_ONLY_NOTE = "You can view this, but your role cannot change it. Ask the owner if you need editor access.";

/* ---------- The caller ---------- */

export interface VolumeMe {
  state: "loading" | "error" | "ready";
  me: ApiMe | null;
  role: Role;
  canWrite: boolean;
  canManage: boolean;
  membersVisible: boolean;
  error: string | null;
  retry: () => void;
}

function demoRole(raw: string | null): Role {
  return raw === "editor" || raw === "viewer" ? raw : "owner";
}

function readyMe(me: ApiMe, retry: () => void): VolumeMe {
  return {
    state: "ready",
    me,
    role: me.role,
    canWrite: canWrite(me.role),
    canManage: canManage(me.role),
    membersVisible: membersVisible(me),
    error: null,
    retry,
  };
}

/** The caller's role in both modes. Until it is known the screens act as read-only (role viewer). */
export function useVolumeMe(): VolumeMe {
  const mode = useWireMode();
  const [params] = useSearchParams();
  const q = useMe({ enabled: mode === "api" });
  const refetch = q.refetch;
  const retry = useCallback(() => void refetch(), [refetch]);
  const roleParam = params.get("role");
  return useMemo(() => {
    if (mode === "mock") {
      const role = demoRole(roleParam);
      return readyMe({ userId: "u-owner", workspaceId: "demo", role, instanceOwner: role === "owner", accountsMode: "invite" }, retry);
    }
    const pending: VolumeMe = { state: "loading", me: null, role: "viewer", canWrite: false, canManage: false, membersVisible: false, error: null, retry };
    if (mode === "checking" || q.isPending) return pending;
    if (q.isError) {
      // A server from before phase 8 has no /me: there everyone signed in is the owner, with no other accounts.
      if (isApiError(q.error) && q.error.status === 404) {
        return readyMe({ userId: "", workspaceId: "", role: "owner", instanceOwner: true, accountsMode: "owner-only" }, retry);
      }
      return { ...pending, state: "error", error: apiErrorText(q.error) };
    }
    return readyMe(q.data, retry);
  }, [mode, roleParam, q.isPending, q.isError, q.error, q.data, retry]);
}

/* ---------- Members in demo mode: a small in-memory store ---------- */

export interface DemoMembersState {
  members: ApiMember[];
  invitations: ApiInvitation[];
}

let demoState: DemoMembersState = { members: demoMembers(), invitations: demoInvitations() };
const listeners = new Set<() => void>();
function setDemo(next: DemoMembersState): void {
  demoState = next;
  for (const l of listeners) l();
}
function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

let nextId = 2;

/** The demo version of POST /invitations: one pending invitation per address, so inviting again changes its role. */
export function demoInvite(input: InvitationInput, state: DemoMembersState = demoState): DemoMembersState {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "validation_failed", "Some fields are missing or not valid.", [
      { path: "email", message: "Enter an email address, like name@example.com." },
    ]);
  }
  const pending = state.invitations.find((i) => i.email === email && i.status === "pending");
  if (pending) return { ...state, invitations: state.invitations.map((i) => (i.id === pending.id ? { ...i, role: input.role } : i)) };
  const inv: ApiInvitation = { id: `inv-${nextId++}`, email, role: input.role, status: "pending", createdAt: Date.now(), acceptedAt: null };
  return { ...state, invitations: [inv, ...state.invitations] };
}

/* ---------- Members for the current mode ---------- */

export interface WiredMembers {
  state: "loading" | "error" | "ready";
  accountsMode: AccountsMode;
  members: ApiMember[];
  invitations: ApiInvitation[];
  error: string | null;
  retry: () => void;
  invite: (input: InvitationInput) => Promise<void>;
  revoke: (id: string) => Promise<void>;
  setRole: (userId: string, role: MemberRole) => Promise<void>;
  remove: (userId: string) => Promise<void>;
}

/** GET /members in API mode (owner only), the demo store otherwise. Actions return a promise that rejects with an ApiError. */
export function useWiredMembers(mode: WireMode, enabled: boolean): WiredMembers {
  const api = mode === "api";
  const q = useMembers({ enabled: api && enabled });
  const demo = useSyncExternalStore(subscribe, () => demoState);
  const { mutateAsync: invite } = useInvite();
  const { mutateAsync: revoke } = useRevokeInvitation();
  const { mutateAsync: setRole } = useSetMemberRole();
  const { mutateAsync: remove } = useRemoveMember();
  const refetch = q.refetch;
  const retry = useCallback(() => void refetch(), [refetch]);

  const actions = useMemo(
    () =>
      api
        ? {
            invite: (input: InvitationInput) => invite(input).then(() => undefined),
            revoke: (id: string) => revoke(id).then(() => undefined),
            setRole: (userId: string, role: MemberRole) => setRole({ userId, role }).then(() => undefined),
            remove: (userId: string) => remove(userId).then(() => undefined),
          }
        : {
            invite: (input: InvitationInput) => Promise.resolve().then(() => setDemo(demoInvite(input))),
            revoke: (id: string) => Promise.resolve().then(() => setDemo({ ...demoState, invitations: demoState.invitations.filter((i) => i.id !== id) })),
            setRole: (userId: string, role: MemberRole) =>
              Promise.resolve().then(() => setDemo({ ...demoState, members: demoState.members.map((m) => (m.userId === userId ? { ...m, role } : m)) })),
            remove: (userId: string) => Promise.resolve().then(() => setDemo({ ...demoState, members: demoState.members.filter((m) => m.userId !== userId) })),
          },
    [api, invite, revoke, setRole, remove],
  );

  if (mode === "mock") return { state: "ready", accountsMode: "invite", members: demo.members, invitations: demo.invitations, error: null, retry, ...actions };
  const empty = { accountsMode: "owner-only" as AccountsMode, members: [], invitations: [], retry, ...actions };
  if (mode === "checking" || q.isPending) return { ...empty, state: "loading", error: null };
  if (q.isError) return { ...empty, state: "error", error: apiErrorText(q.error) };
  return { state: "ready", accountsMode: q.data.accountsMode, members: q.data.items, invitations: q.data.invitations, error: null, ...actions, retry };
}
