import { useEffect, useState, type ReactNode } from "react";
import { ClerkProvider, SignIn, useAuth, useClerk } from "@clerk/react";
import { apiRequest, isApiError, setAuthTokenGetter } from "../api/client";
import { Button } from "../components/ui/Button";
import { Loader } from "../components/ui/Loader";

/* Hosted sign-in (Clerk). The publishable key is public and is set when the web app is built
   (VITE_CLERK_PUBLISHABLE_KEY). Without it, as in local development (AUTH_MODE=local), the app opens straight away. */
const PUBLISHABLE_KEY: string = (import.meta.env["VITE_CLERK_PUBLISHABLE_KEY"] as string | undefined)?.trim() ?? "";

/** True when the build has a Clerk key, so every screen sits behind sign-in. */
export const hostedSignIn = PUBLISHABLE_KEY.length > 0;

function Centre({ children }: { children: ReactNode }) {
  return <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-10">{children}</main>;
}

function Notice({ title, body, onSignOut }: { title: string; body: string; onSignOut: () => void }) {
  return (
    <Centre>
      <div className="w-full max-w-[420px] rounded-md border border-border bg-sheet p-6 shadow-sheet">
        <h1 className="text-title font-semibold text-ink">{title}</h1>
        <p className="mt-2 text-body text-ink-secondary">{body}</p>
        <Button className="mt-5" variant="primary" onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </Centre>
  );
}

type Access = "checking" | "ok" | "denied" | "expired";

/** Asks the server once whether this account may use Volume (the server keeps the allowlist). */
function AccessCheck({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  const [access, setAccess] = useState<Access>("checking");
  useEffect(() => {
    const ctrl = new AbortController();
    apiRequest("GET", "/health", undefined, { signal: ctrl.signal })
      .then(() => setAccess("ok"))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        // Anything other than 401 and 403 (server down, say) lets the app show its own message.
        setAccess(isApiError(e) && e.status === 403 ? "denied" : isApiError(e) && e.status === 401 ? "expired" : "ok");
      });
    return () => ctrl.abort();
  }, []);
  const out = () => void signOut();
  if (access === "checking")
    return (
      <Centre>
        <Loader label="Checking your account" />
      </Centre>
    );
  if (access === "denied")
    return <Notice title="This account is not allowed" body="Volume is private. Sign out and use the owner's account." onSignOut={out} />;
  if (access === "expired") return <Notice title="Sign in again" body="Your session could not be checked. Sign out, then sign in again." onSignOut={out} />;
  return <>{children}</>;
}

function Gate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  // Set during render, before any child query runs: every API call then carries a fresh session token.
  setAuthTokenGetter(isSignedIn ? () => getToken() : null);
  if (!isLoaded)
    return (
      <Centre>
        <Loader label="Opening Volume" />
      </Centre>
    );
  if (!isSignedIn)
    return (
      <Centre>
        <div className="flex flex-col items-center gap-6">
          <h1 className="font-book text-display text-ink">Volume</h1>
          <SignIn routing="hash" />
        </div>
      </Centre>
    );
  return <AccessCheck>{children}</AccessCheck>;
}

/** Wraps the whole app. Local builds (no key) render the app directly. */
export function HostedAuth({ children }: { children: ReactNode }) {
  if (!hostedSignIn) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <Gate>{children}</Gate>
    </ClerkProvider>
  );
}
