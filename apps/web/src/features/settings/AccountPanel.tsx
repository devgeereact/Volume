import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Download, LogOut, Trash2 } from "lucide-react";
import { Banner, Button, Input, Modal } from "../../components/ui";
import { useBooks, useDeleteWorkspace, useLeaveWorkspace } from "../../api/hooks";
import { volumeApi } from "../../api/volume";
import { apiErrorText, saveBlob, useWireMode } from "../../api/wire-a";
import { CONFIRM_WORDS, isTyped, type VolumeMe } from "../../api/wire-d";
import { useFocusTrap } from "../../lib/useFocusTrap";
import { hostedSignIn } from "../../auth/HostedAuth";
import { SignOutButton } from "../../auth/SignOutButton";
import { accountActions, deleteBlockedReason, deleteErrorText, exportErrorText } from "./account";
import { InlineStatus, PanelHeader } from "./PanelHeader";

const DEMO_REASON = "This needs the Volume server. The demo has no account to change.";

type Dialog = "leave" | "delete";
type Done = "left" | "deleted";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3 rounded-md border border-border bg-sheet p-5">
      <h3 id={id} className="text-subhead text-ink">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Covers the app once the caller no longer belongs to this workspace: nothing behind it works for them now. */
function AccountClosed({ done }: { done: Done }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  const left = done === "left";
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-center bg-canvas px-4 py-10">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-closed-title"
        aria-describedby="account-closed-body"
        className="w-full max-w-[420px] rounded-md border border-border bg-sheet p-6 shadow-sheet"
      >
        <h2 id="account-closed-title" className="font-book text-heading text-ink">
          {left ? "You left this workspace" : "The workspace is deleted"}
        </h2>
        <p id="account-closed-body" className="mt-2 text-body text-ink-secondary">
          {left
            ? "You no longer have access to its books. If you belong to no other workspace, your account is gone too."
            : "Every book, profile and file in it is gone, with the accounts that belonged only to it."}
        </p>
        {hostedSignIn && <p className="mt-2 text-body text-ink-secondary">Sign out to finish.</p>}
        <div className="mt-5">
          <SignOutButton />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Settings, Your account (D-050). The owner downloads a zip of the whole workspace. An editor or viewer can
 * leave. The owner of a guest workspace can delete it; the instance owner's workspace never can. Leaving and
 * deleting ask for a typed word, and the server checks it again.
 */
export function AccountPanel({ me }: { me: VolumeMe }) {
  const mode = useWireMode();
  const api = mode === "api";
  const actions = accountActions(me.me);
  const qc = useQueryClient();

  // Delete waits for running jobs. The book list says which books have one; the server has the last word (409).
  const books = useBooks({}, { enabled: api && actions.deleteWorkspace });
  const jobRunning = (books.data ?? []).some((b) => b.jobRunning);

  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [dialog, setDialogState] = useState<Dialog | null>(null);
  const [typed, setTyped] = useState("");
  const typedRef = useRef<HTMLInputElement>(null);
  const leave = useLeaveWorkspace();
  const remove = useDeleteWorkspace();
  const [done, setDone] = useState<Done | null>(null);

  function openDialog(next: Dialog | null) {
    setTyped("");
    leave.reset();
    remove.reset();
    setDialogState(next);
  }

  function download() {
    setExporting(true);
    setExportError(null);
    setExportStatus(null);
    volumeApi.exportWorkspace().then(
      ({ blob, filename }) => {
        setExporting(false);
        const name = saveBlob(blob, filename ?? "volume-workspace.zip");
        setExportStatus(`${name} is in your downloads.`);
      },
      (e: unknown) => {
        setExporting(false);
        setExportError(exportErrorText(e));
      },
    );
  }

  const word = dialog === "delete" ? CONFIRM_WORDS.deleteWorkspace : CONFIRM_WORDS.leave;
  const wordTyped = dialog !== null && isTyped(typed, word);
  const pending = leave.isPending || remove.isPending;
  const failure =
    dialog === "leave" && leave.isError ? apiErrorText(leave.error) : dialog === "delete" && remove.isError ? deleteErrorText(remove.error) : null;

  function confirmDialog() {
    if (!dialog || !wordTyped || pending) return;
    const finish = (next: Done) => {
      // Nothing here is theirs any more: stop requests in flight before the end state covers the app.
      void qc.cancelQueries();
      setDialogState(null);
      setDone(next);
    };
    if (dialog === "leave") leave.mutate(typed, { onSuccess: () => finish("left") });
    else remove.mutate(typed, { onSuccess: () => finish("deleted") });
  }

  const blocked = api ? deleteBlockedReason(jobRunning) : DEMO_REASON;

  return (
    <div className="grid gap-6">
      <PanelHeader title="Your account" body="Take a copy of your data, or leave or close this workspace." />

      {me.state === "error" && (
        <Banner
          tone="error"
          title="Could not check your account"
          action={
            <Button size="sm" onClick={me.retry}>
              Retry
            </Button>
          }
        >
          {me.error}
        </Banner>
      )}

      {actions.download && (
        <Section id="account-download" title="Download all my data">
          <p className="max-w-[62ch] text-body text-ink-secondary">
            A zip of every book, profile, setting and file in this workspace. It includes private profile details such as legal names, so keep it somewhere
            safe.
          </p>
          <div>
            <Button icon={Download} loading={exporting} loadingLabel="Preparing the zip" disabledReason={api ? undefined : DEMO_REASON} onClick={download}>
              Download all my data
            </Button>
          </div>
          {exporting && <InlineStatus tone="neutral">Preparing the zip. A large workspace can take a few minutes, so keep this page open.</InlineStatus>}
          {exportStatus && <InlineStatus>{exportStatus}</InlineStatus>}
          {exportError && (
            <Banner tone="error" title="The download did not start">
              {exportError}
            </Banner>
          )}
        </Section>
      )}

      {actions.leave && (
        <Section id="account-leave" title="Leave this workspace">
          <p className="max-w-[62ch] text-body text-ink-secondary">
            You lose access to every book here at once. Your past work stays in the books. If you belong to no other workspace, your account is deleted too.
          </p>
          <div>
            <Button icon={LogOut} disabledReason={api ? undefined : DEMO_REASON} onClick={() => openDialog("leave")}>
              Leave this workspace
            </Button>
          </div>
        </Section>
      )}

      {actions.deleteWorkspace && (
        <Section id="account-delete" title="Delete this workspace">
          <p className="max-w-[62ch] text-body text-ink-secondary">
            Deletes every book, profile, cover and file in this workspace, and the accounts of members who belong nowhere else. This cannot be undone. Download
            your data first if you want a copy.
          </p>
          <div>
            <Button icon={Trash2} disabledReason={blocked} onClick={() => openDialog("delete")}>
              Delete this workspace
            </Button>
          </div>
          {api && blocked && <p className="text-small text-ink-secondary">{blocked}</p>}
        </Section>
      )}

      {actions.mainWorkspace && (
        <p className="max-w-[62ch] text-small text-ink-secondary">
          This is the main workspace of this Volume, so it cannot be deleted from here. Separate self-publishers can delete their own workspaces.
        </p>
      )}

      <Modal
        open={dialog !== null}
        onClose={() => openDialog(null)}
        size="sm"
        closeOnScrim={false}
        initialFocus={typedRef}
        title={dialog === "delete" ? "Delete this workspace?" : "Leave this workspace?"}
        description={
          dialog === "delete"
            ? "Every book, profile, cover and file in it is removed for good. This cannot be undone."
            : "You lose access straight away. Only the owner can invite you back."
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => openDialog(null)}>
              {dialog === "delete" ? "Keep the workspace" : "Keep my access"}
            </Button>
            <Button
              variant="danger"
              icon={dialog === "delete" ? Trash2 : LogOut}
              loading={pending}
              loadingLabel={dialog === "delete" ? "Deleting" : "Leaving"}
              disabledReason={wordTyped ? undefined : `Type ${word} first.`}
              onClick={confirmDialog}
            >
              {dialog === "delete" ? "Delete workspace" : "Leave workspace"}
            </Button>
          </>
        }
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            confirmDialog();
          }}
        >
          <Input
            ref={typedRef}
            label={`Type ${word} to confirm`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          {failure && (
            <Banner tone="error" title={dialog === "delete" ? "Not deleted" : "You are still a member"}>
              {failure}
            </Banner>
          )}
        </form>
      </Modal>

      {done && <AccountClosed done={done} />}
    </div>
  );
}
