import { Info, WifiOff } from "lucide-react";
import { Tooltip } from "../components/ui/Tooltip";
import { useWireMode } from "../api/wire-a";
import { useDataSourceState } from "../api/source";
import { hostedSignIn } from "../auth/HostedAuth";

/**
 * The single small Demo badge (D-016): everything on screen is sample data. Shown whenever the app runs
 * on its demo data (the server did not answer); hidden when the screens read the Volume server.
 */
export function DemoBadge() {
  const mode = useWireMode();
  const { down } = useDataSourceState();
  if (hostedSignIn && down) return <NotConnectedBadge />;
  if (mode !== "mock") return null;
  return (
    <Tooltip content="Everything here is sample data. Nothing is saved, and nothing is sent to OpenRouter." side="bottom">
      <span
        tabIndex={0}
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-pill border border-border-strong px-2 text-caption leading-none whitespace-nowrap text-ink-secondary"
      >
        <Info size={13} strokeWidth={2} aria-hidden />
        Demo
        <span className="sr-only"> data. Everything here is sample data. Nothing is saved, and nothing is sent to OpenRouter.</span>
      </span>
    </Tooltip>
  );
}

/** Hosted only: the server did not answer its last health check. Screens keep real data and show their own errors. */
function NotConnectedBadge() {
  return (
    <Tooltip content="Volume could not reach its server. Your work is safe. Check your connection; this clears by itself when it answers." side="bottom">
      <span
        tabIndex={0}
        role="status"
        className="inline-flex h-6 shrink-0 items-center gap-1 rounded-pill border border-border-strong px-2 text-caption leading-none whitespace-nowrap text-ink-secondary"
      >
        <WifiOff size={13} strokeWidth={2} aria-hidden />
        Not connected
        <span className="sr-only">. Volume could not reach its server. Your work is safe. Check your connection.</span>
      </span>
    </Tooltip>
  );
}
