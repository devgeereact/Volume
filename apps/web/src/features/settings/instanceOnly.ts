import type { SettingsResponse } from "../../api/types";

/* Settings that only the owner of this Volume sees (D-047). The server leaves them out for every other
   workspace, so their presence in GET /settings is the signal: no extra request needed. */

/** The server's upper bound for the cap on other workspaces (apps/server/src/repos/settings.ts). */
export const GUEST_CAP_MAX_USD = 100000;

/** The monthly cap for other workspaces, or null when this workspace is not the instance owner's. */
export function guestCapOf(settings: Pick<SettingsResponse, "budgets">): number | null {
  const cap = settings.budgets.guestWorkspacesMonthlyCapUsd;
  return typeof cap === "number" ? cap : null;
}

/** Parse the guest cap field: dollars, 0 allowed. Null when the text is not a usable amount. */
export function parseGuestCap(text: string): number | null {
  if (text.trim() === "") return null;
  const n = Number(text.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= GUEST_CAP_MAX_USD ? n : null;
}

/** The field error for the guest cap, or undefined when it is fine. */
export function guestCapError(text: string): string | undefined {
  if (parseGuestCap(text) !== null) return undefined;
  return `Enter an amount from $0 to $${GUEST_CAP_MAX_USD.toLocaleString("en-GB")}, for example 20. 0 stops their AI runs.`;
}

/** Whether this workspace may see backups. False when the server sends backups as null. */
export function canSeeBackups(settings: Pick<SettingsResponse, "backups"> | undefined): boolean | undefined {
  if (!settings) return undefined;
  return settings.backups !== null;
}
