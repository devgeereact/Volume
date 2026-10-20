import { Eye } from "lucide-react";
import { Banner } from "../components/ui";
import { READ_ONLY_NOTE, roleLabels, useVolumeMe } from "../api/wire-d";
import { cn } from "./cn";

/* What the caller's role may do on a screen (D-047), from GET /me in API mode and ?role= in demo mode.
   Owner and editor write; a viewer reads only, so screens hide their write buttons and show one
   read-only note instead. The server refuses viewer writes anyway (assertCanWrite); this only keeps
   buttons that would fail off the screen. Until the role is known the screen reads as a viewer's. */

/** True when the caller may change books, profiles and other work. */
export function useCanWrite(): boolean {
  return useVolumeMe().canWrite;
}

/** True when the caller may change settings, budgets and members (owner only). */
export function useCanManage(): boolean {
  return useVolumeMe().canManage;
}

/** The one note a viewer sees where the write buttons would be. Nothing for owners and editors. */
export function ReadOnlyBanner({ className }: { className?: string | undefined }) {
  const me = useVolumeMe();
  if (me.state !== "ready" || me.canWrite) return null;
  return (
    <Banner tone="info" title={`Read only: you are a ${roleLabels[me.role].toLowerCase()}`} className={cn(className)}>
      <span className="inline-flex items-center gap-1.5">
        <Eye size={14} aria-hidden />
        {READ_ONLY_NOTE}
      </span>
    </Banner>
  );
}
