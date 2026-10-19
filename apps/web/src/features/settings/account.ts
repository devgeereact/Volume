import type { ApiMe } from "../../api/types";
import { isApiError } from "../../api/client";
import { apiErrorText } from "../../api/wire-a";

/* Settings, Your account (D-050): the owner's copy of the workspace, leaving it, and deleting a guest workspace.
   The server decides who may do what; these rules only keep buttons that would fail off the screen. */

export interface AccountActions {
  /** The owner downloads a zip of the whole workspace. */
  download: boolean;
  /** An editor or viewer leaves. The owner cannot leave their own workspace. */
  leave: boolean;
  /** The owner of a guest (self-publisher) workspace deletes it. Never the instance owner's own workspace. */
  deleteWorkspace: boolean;
  /** The instance owner sees a line saying why there is no delete. */
  mainWorkspace: boolean;
}

export function accountActions(me: Pick<ApiMe, "role" | "instanceOwner"> | null | undefined): AccountActions {
  if (!me) return { download: false, leave: false, deleteWorkspace: false, mainWorkspace: false };
  const owner = me.role === "owner";
  return { download: owner, leave: !owner, deleteWorkspace: owner && !me.instanceOwner, mainWorkspace: owner && me.instanceOwner };
}

/** Why Delete is held back, or undefined when it may go ahead. The server checks again (409 while a job runs). */
export function deleteBlockedReason(jobRunning: boolean): string | undefined {
  return jobRunning ? "A book still has a job running. Let it finish or cancel it, then delete the workspace." : undefined;
}

/** Plain words for a failed workspace download. */
export function exportErrorText(e: unknown): string {
  if (isApiError(e)) {
    if (e.status === 409) return "A download of this workspace is already being prepared. Wait for it to finish, then try again.";
    if (e.status === 429) return "Too many downloads in a short time. Wait a minute, then try again.";
    if (e.status === 403) return "Only the owner of this workspace can download all of its data.";
  }
  return apiErrorText(e);
}

/** Plain words for a failed workspace delete. A running job (409) and a wrong word already come back in plain words. */
export function deleteErrorText(e: unknown): string {
  if (isApiError(e) && e.status === 403) return "This is the main workspace of this Volume, so it cannot be deleted.";
  return apiErrorText(e);
}
