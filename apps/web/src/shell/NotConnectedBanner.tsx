import { WifiOff } from "lucide-react";
import { Banner } from "../components/ui";
import { useDataSourceState } from "../api/source";
import { hostedSignIn } from "../auth/HostedAuth";

/** The words on the banner. With a real connection behind it the screens still show the last real data (D-061). */
export function notConnectedTitle(everConnected: boolean): string {
  return everConnected ? "Not connected. Showing your last saved view. Reconnecting..." : "Not connected. Reconnecting...";
}

export const NOT_CONNECTED_DETAIL =
  "Saving, writing and building are switched off until Volume reconnects, so nothing is lost or half done. This clears by itself when the server answers.";

/** Presentational part, so it can be rendered on its own. */
export function NotConnectedMessage({ everConnected, className }: { everConnected: boolean; className?: string }) {
  return (
    <div data-testid="not-connected-banner" className={className}>
      <Banner tone="attention" title={notConnectedTitle(everConnected)}>
        <span className="inline-flex items-start gap-2">
          <WifiOff size={14} className="mt-[3px] shrink-0" aria-hidden />
          <span>{NOT_CONNECTED_DETAIL}</span>
        </span>
      </Banner>
    </div>
  );
}

/**
 * Shown when the server stopped answering after it had answered once (any build), and on the hosted app
 * whenever its server does not answer. A local build that never reached the API shows sample data under
 * the Demo badge instead and no banner (D-016, refined by D-061).
 */
export function NotConnectedBanner({ className }: { className?: string }) {
  const { down, everConnected } = useDataSourceState();
  if (!down || (!everConnected && !hostedSignIn)) return null;
  return <NotConnectedMessage everConnected={everConnected} {...(className ? { className } : {})} />;
}
