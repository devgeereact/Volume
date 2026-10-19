import { useRef, useState } from "react";
import { MailPlus, Trash2, UserRound, X } from "lucide-react";
import { Banner, Button, IconButton, Input, Modal, Select, Skeleton } from "../../components/ui";
import type { ApiInvitation, ApiMember, InviteRole, MemberRole } from "../../api/types";
import { isApiError } from "../../api/client";
import { apiErrorText, useWireMode } from "../../api/wire-a";
import { CONFIRM_WORDS, isTyped, roleHints, roleLabels, useWiredMembers, type VolumeMe } from "../../api/wire-d";
import { formatDate } from "../../lib/format";
import { InlineStatus, PanelHeader } from "./PanelHeader";

const iso = (ms: number) => new Date(ms).toISOString();

const roleNouns: Record<InviteRole, string> = { owner: "a self-publisher with their own workspace", editor: "an editor", viewer: "a viewer" };

type Pending = { kind: "member"; member: ApiMember } | { kind: "invitation"; invitation: ApiInvitation };

function MembersSkeleton() {
  return (
    <div role="status" aria-label="Loading members" className="grid gap-3 rounded-md border border-border bg-sheet p-5">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/5" />
    </div>
  );
}

/**
 * Settings, Members (phase 8, P8-3 and P8-4, D-047). Owner only, and shown only when the server runs with
 * ACCOUNTS_MODE=invite. The owner adds an address with a role; the person then signs in with that address.
 * Volume sends no email. Editors write books but not settings, budgets or members; viewers read only.
 */
export function MembersPanel({ me }: { me: VolumeMe }) {
  const mode = useWireMode();
  const data = useWiredMembers(mode, me.membersVisible);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
  const [inviting, setInviting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [confirm, setConfirmState] = useState<Pending | null>(null);
  const [typed, setTyped] = useState("");
  const typedRef = useRef<HTMLInputElement>(null);
  function setConfirm(next: Pending | null) {
    setTyped("");
    setConfirmState(next);
  }
  // Removing a member asks for a typed word (D-050); withdrawing an invitation does not.
  const needsWord = confirm?.kind === "member";
  const wordTyped = !needsWord || isTyped(typed, CONFIRM_WORDS.removeMember);

  const roleOptions = [
    { value: "editor", label: roleLabels.editor, hint: "Writes books" },
    { value: "viewer", label: roleLabels.viewer, hint: "Reads only" },
    ...(me.me?.instanceOwner ? [{ value: "owner", label: "Separate self-publisher", hint: "Own workspace" }] : []),
  ];

  function invite() {
    const value = email.trim();
    if (!value) {
      setEmailError("Enter the email address they sign in with.");
      return;
    }
    setInviting(true);
    setEmailError(null);
    setError(null);
    setStatus(null);
    data.invite({ email: value, role }).then(
      () => {
        setInviting(false);
        setEmail("");
        setStatus(`${value.toLowerCase()} can now sign in as ${roleNouns[role]}. Volume does not send an email, so tell them yourself.`);
      },
      (e: unknown) => {
        setInviting(false);
        const field = isApiError(e) ? e.fieldIssues.find((i) => i.path === "email") : undefined;
        if (field) setEmailError(field.message.startsWith("Invalid") ? "Enter an email address, like name@example.com." : field.message);
        else setError(apiErrorText(e));
      },
    );
  }

  function changeRole(m: ApiMember, next: MemberRole) {
    if (next === m.role) return;
    setBusyRow(m.userId);
    setError(null);
    setStatus(null);
    data.setRole(m.userId, next).then(
      () => {
        setBusyRow(null);
        setStatus(`${m.displayName} is now ${roleNouns[next]}. It applies from their next request.`);
      },
      (e: unknown) => {
        setBusyRow(null);
        setError(apiErrorText(e));
      },
    );
  }

  function doConfirm() {
    if (!confirm || !wordTyped) return;
    const c = confirm;
    const key = c.kind === "member" ? c.member.userId : c.invitation.id;
    setBusyRow(key);
    setError(null);
    setStatus(null);
    const work = c.kind === "member" ? data.remove(c.member.userId, typed) : data.revoke(c.invitation.id);
    work.then(
      () => {
        setBusyRow(null);
        setConfirm(null);
        setStatus(c.kind === "member" ? `${c.member.displayName} no longer has access.` : `The invitation for ${c.invitation.email} is withdrawn.`);
      },
      (e: unknown) => {
        setBusyRow(null);
        setConfirm(null);
        setError(apiErrorText(e));
      },
    );
  }

  return (
    <div className="grid gap-6">
      <PanelHeader
        title="Members"
        body="People who can use this workspace and what each may do. Nobody can sign up on their own: only addresses you add here can sign in."
      />

      {data.state === "loading" && <MembersSkeleton />}
      {data.state === "error" && (
        <Banner
          tone="error"
          title="Could not load the members"
          action={
            <Button size="sm" onClick={data.retry}>
              Retry
            </Button>
          }
        >
          {data.error}
        </Banner>
      )}

      {data.state === "ready" && (
        <>
          <section aria-labelledby="invite-heading" className="grid gap-4 rounded-md border border-border bg-sheet p-5">
            <h3 id="invite-heading" className="text-subhead text-ink">
              Invite someone
            </h3>
            <form
              className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-start"
              onSubmit={(e) => {
                e.preventDefault();
                invite();
              }}
            >
              <Input
                label="Email address"
                type="email"
                autoComplete="off"
                spellCheck={false}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                error={emailError ?? undefined}
                hint="They sign in with this address."
              />
              <Select label="Role" value={role} onChange={(v) => setRole(v as InviteRole)} options={roleOptions} hint={roleHints[role]} />
              <div className="md:pt-7">
                <Button type="submit" icon={MailPlus} loading={inviting} loadingLabel="Inviting">
                  Invite
                </Button>
              </div>
            </form>
          </section>

          {status && <InlineStatus>{status}</InlineStatus>}
          {error && (
            <Banner tone="error" title="That did not finish">
              {error}
            </Banner>
          )}

          <section aria-labelledby="members-heading" className="grid gap-3">
            <h3 id="members-heading" className="text-subhead text-ink">
              Members <span className="num font-normal text-ink-secondary">({data.members.length})</span>
            </h3>
            <ul className="grid overflow-hidden rounded-md border border-border bg-sheet">
              {data.members.map((m) => {
                const fixed = m.isYou || m.role === "owner";
                return (
                  <li key={m.userId} className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border px-4 py-3.5 first:border-t-0">
                    <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-pill bg-sunken text-ink-secondary">
                      <UserRound size={16} />
                    </span>
                    <span className="grid min-w-0 flex-1 basis-48 gap-0.5">
                      <span className="text-label font-semibold text-ink">
                        {m.displayName}
                        {m.isYou && <span className="ml-2 text-small font-normal text-ink-secondary">(you)</span>}
                      </span>
                      <span className="text-small text-ink-secondary">
                        {m.email ?? "Owner account"}
                        {m.signedIn ? "" : ". Has not signed in yet"}. Joined {formatDate(iso(m.joinedAt))}
                      </span>
                    </span>
                    {fixed ? (
                      <span className="text-small font-semibold text-ink-secondary">{roleLabels[m.role]}</span>
                    ) : (
                      <span className="flex items-end gap-1">
                        <Select
                          label={<span className="sr-only">Role for {m.displayName}</span>}
                          value={m.role}
                          onChange={(v) => changeRole(m, v as MemberRole)}
                          disabled={busyRow === m.userId}
                          options={[
                            { value: "editor", label: roleLabels.editor },
                            { value: "viewer", label: roleLabels.viewer },
                          ]}
                          className="w-[150px]"
                        />
                        <IconButton icon={Trash2} label={`Remove ${m.displayName}`} onClick={() => setConfirm({ kind: "member", member: m })} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="invites-heading" className="grid gap-3">
            <h3 id="invites-heading" className="text-subhead text-ink">
              Waiting to sign in <span className="num font-normal text-ink-secondary">({data.invitations.length})</span>
            </h3>
            {data.invitations.length === 0 ? (
              <p className="text-small text-ink-secondary">No invitations are waiting.</p>
            ) : (
              <ul className="grid overflow-hidden rounded-md border border-border bg-sheet">
                {data.invitations.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 first:border-t-0">
                    <span className="grid min-w-0 flex-1 basis-48 gap-0.5">
                      <span className="text-label font-semibold break-all text-ink">{i.email}</span>
                      <span className="text-small text-ink-secondary">
                        {i.role === "owner" ? "Separate self-publisher" : roleLabels[i.role]}. Invited {formatDate(iso(i.createdAt))}
                      </span>
                    </span>
                    <Button size="sm" variant="ghost" icon={X} onClick={() => setConfirm({ kind: "invitation", invitation: i })}>
                      Withdraw<span className="sr-only"> the invitation for {i.email}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        size="sm"
        closeOnScrim={false}
        initialFocus={needsWord ? typedRef : undefined}
        title={confirm?.kind === "member" ? `Remove ${confirm.member.displayName}?` : "Withdraw this invitation?"}
        description={
          confirm?.kind === "member"
            ? "They lose access on their next request. Their past work stays in the books."
            : confirm?.kind === "invitation"
              ? `${confirm.invitation.email} will not be able to sign in. You can invite them again later.`
              : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Keep
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              loading={busyRow !== null}
              loadingLabel="Removing"
              disabledReason={wordTyped ? undefined : `Type ${CONFIRM_WORDS.removeMember} first.`}
              onClick={doConfirm}
            >
              {confirm?.kind === "member" ? "Remove member" : "Withdraw invitation"}
            </Button>
          </>
        }
      >
        {needsWord && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doConfirm();
            }}
          >
            <Input
              ref={typedRef}
              label={`Type ${CONFIRM_WORDS.removeMember} to confirm`}
              hint="If they belong to no other workspace, their account is deleted too."
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
          </form>
        )}
      </Modal>
    </div>
  );
}
