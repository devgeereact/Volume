import { WifiOff } from "lucide-react";
import { Tooltip } from "../components/ui/Tooltip";
import { cn } from "../lib/cn";
import { useWireMode } from "../api/wire-a";
import { useDataSourceState } from "../api/source";
import { hostedSignIn } from "../auth/HostedAuth";

/**
 * The single small Demo badge (D-016): everything on screen is sample data. Shown only while the app runs on
 * its demo data because this page has never reached the server (D-061); hidden when the screens read the Volume server.
 */
export function DemoBadge({ className }: { className?: string | undefined }) {
  const mode = useWireMode();
  const { down, everConnected } = useDataSourceState();
  // After the API has answered once, sample data is never shown (D-061): a dead server gives the Not connected badge.
  if (down && (hostedSignIn || everConnected)) return <NotConnectedBadge className={className} />;
  if (mode !== "mock") return null;
  return (
    <Tooltip
      content="Everything here is sample data. Nothing is saved, and nothing is sent to OpenRouter."
      side="bottom"
      className={cn("inline-flex", className)}
    >
      <span
        tabIndex={0}
        className="inline-flex shrink-0 items-center rounded-pill bg-amber-wash px-[9px] py-1 text-[11px] leading-[1.35] font-semibold whitespace-nowrap text-amber"
      >
        Demo data
        <span className="sr-only">. Everything here is sample data. Nothing is saved, and nothing is sent to OpenRouter.</span>
      </span>
    </Tooltip>
  );
}

/** The server did not answer its last health check after it had answered, or on the hosted app. Screens keep their last real data. */
function NotConnectedBadge({ className }: { className?: string | undefined }) {
  return (
    <Tooltip
      content="Volume could not reach its server. Your work is safe. Check your connection; this clears by itself when it answers."
      side="bottom"
      className={cn("inline-flex", className)}
    >
      <span
        tabIndex={0}
        role="status"
        className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-red-wash px-[9px] py-1 text-[11px] leading-[1.35] font-semibold whitespace-nowrap text-red"
      >
        <WifiOff size={12} strokeWidth={2} aria-hidden />
        Not connected
        <span className="sr-only">. Volume could not reach its server. Your work is safe. Check your connection.</span>
      </span>
    </Tooltip>
  );
}
