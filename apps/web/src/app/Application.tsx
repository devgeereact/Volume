import { RouterProvider } from "react-router/dom";
import { ApplicationProviders } from "./Providers";
import { router } from "./router";

export function Application() {
  return (
    <ApplicationProviders>
      <RouterProvider router={router} />
    </ApplicationProviders>
  );
}
