import { lazy, Suspense } from "react";
import { HostedAuth } from "../auth/HostedAuth";

/* The signed-in frame (providers, router, shell, Library) is a lazy chunk, so a visitor who only reads the
   public pages never downloads it. */
const SignedInApp = lazy(() => import("./SignedInApp"));

export function Application() {
  return (
    <HostedAuth>
      <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
        <SignedInApp />
      </Suspense>
    </HostedAuth>
  );
}
