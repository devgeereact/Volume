import { isApiError } from "../../api/client";
import { apiErrorText } from "../../api/wire-a";

/* Moving a book between Volumes (D-051): the form rules for Import project, a plain message for each error the
   server sends, and the origin note an imported book carries in its settings. Pure, so the tests can reach it. */

/** The one-line explanation shown next to Download project. */
export const MOVE_EXPLAINER = "Moves this book to another Volume, such as from your Mac to volume.gakinz.com.";

export interface ProjectImportForm {
  file: { name: string; size: number } | null;
  profileId: string;
  /** Ids of the active pen names the caller may choose. */
  profileIds: readonly string[];
}

/** Why Import cannot start yet, or null when the form is ready. */
export function projectImportProblem(form: ProjectImportForm): string | null {
  if (form.profileIds.length === 0) return "Add a pen name in Profiles first. The book needs one to live under.";
  if (!form.file) return "Choose the project zip.";
  if (!/\.zip$/i.test(form.file.name)) return "Choose a .zip file. Use the one Download project made on the other Volume.";
  if (form.file.size === 0) return "This file is empty. Download the project again on the other Volume.";
  if (!form.profileId || !form.profileIds.includes(form.profileId)) return "Choose a pen name for the book.";
  return null;
}

/** The pen name to preselect: the Library's profile filter when it names an active pen name, else the first one. */
export function initialProfileId(filterId: string | null, profileIds: readonly string[]): string {
  if (filterId && profileIds.includes(filterId)) return filterId;
  return profileIds[0] ?? "";
}

/** A plain message for each way the server can refuse an import. */
export function projectImportErrorText(error: unknown): string {
  if (!isApiError(error)) return apiErrorText(error);
  if (error.status === 413 || error.code === "payload_too_large")
    return "This file is larger than this Volume accepts. Ask the owner to raise the upload limit, then try again.";
  if (error.status === 415 || error.code === "unsupported_media_type") return "This file is not a zip. Choose the .zip that Download project made.";
  if (error.status === 429 || error.code === "rate_limited") return "Too many imports in the last minute. Wait a minute, then try again.";
  if (error.status === 403 || error.code === "forbidden") return "Only an owner or editor can import a project. Ask the owner for editor access.";
  if (error.status === 404 || error.code === "not_found") return "That pen name is not in this workspace. Choose another one.";
  if (error.code === "conflict") return "Another import is still running in this workspace. Wait for it to finish, then try again.";
  if (error.status === 409 || error.code === "invalid_state") return "That pen name is archived. Restore it in Profiles, or choose another one.";
  if (error.status === 400 || error.code === "validation_failed")
    return "This project file could not be read. It may be damaged or from an older Volume. Download it again on the other Volume, then try again.";
  return apiErrorText(error);
}

/** The book's origin note ("Moved from another Volume on 19 October 2026."), or null when it has none. */
export function originNoteOf(settings: Record<string, unknown> | null | undefined): string | null {
  const origin = settings?.["origin"];
  if (typeof origin !== "object" || origin === null) return null;
  const note = (origin as { note?: unknown }).note;
  return typeof note === "string" && note.trim() ? note.trim() : null;
}
