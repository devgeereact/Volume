/* What a preflight item's fix does on the Export screen: run the section checks again here, or open
   the screen (and panel) that fixes it. */

import type { PreflightFix } from "../../api/types";

export type FixAction = { kind: "rerun-checks"; sectionId: string; label: string } | { kind: "link"; to: string; label: string } | null;

export function fixAction(fix: PreflightFix | undefined, bookId: string): FixAction {
  if (!fix) return null;
  if (fix.action === "rerun-checks") return fix.sectionId ? { kind: "rerun-checks", sectionId: fix.sectionId, label: "Run checks again" } : null;
  if (!fix.route) return null;
  const path = fix.route.startsWith("/") ? fix.route : `/books/${bookId}/${fix.route}`;
  return { kind: "link", to: fix.anchor ? `${path}#${fix.anchor}` : path, label: fix.label };
}
