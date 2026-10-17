import { RouterProvider } from "react-router/dom";
import { HostedAuth } from "../auth/HostedAuth";
import { ApplicationProviders } from "./Providers";
import { router } from "./router";

export function Application() {
  return (
    <HostedAuth>
      <ApplicationProviders>
        <RouterProvider router={router} />
      </ApplicationProviders>
    </HostedAuth>
  );
}
