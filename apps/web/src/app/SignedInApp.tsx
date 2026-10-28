import { useState } from "react";
import { RouterProvider } from "react-router/dom";
import { ApplicationProviders } from "./Providers";
import { createAppRouter } from "./router";

/** The router is made when the app first renders behind sign-in, so it starts from the address the
    visitor reached while signed out (for example /sign-in), not the one the page loaded at. */
function AppRouter() {
  const [router] = useState(createAppRouter);
  return <RouterProvider router={router} />;
}

export default function SignedInApp() {
  return (
    <ApplicationProviders>
      <AppRouter />
    </ApplicationProviders>
  );
}
