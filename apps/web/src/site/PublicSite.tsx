import { useState } from "react";
import { Navigate, createBrowserRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { RouteError } from "../shell/RouteError";
import { ThemeProvider } from "../lib/theme";
import { SiteLayout } from "./SiteLayout";

/* What a signed-out visitor sees on a hosted build: the landing hero at /, how it works, and sign-in.
   Any other path (a deep link into the app) shows sign-in at that address, so after signing in the
   app opens where the link pointed. The router is made when this mounts, so it reads the address then. */

export const publicRoutes: RouteObject[] = [
  {
    element: <SiteLayout home="/" signedIn={false} />,
    errorElement: <RouteError />,
    children: [
      {
        errorElement: <RouteError />,
        children: [
          { path: "/", lazy: async () => ({ Component: (await import("./LandingPage")).default }) },
          { path: "/how-it-works", lazy: async () => ({ Component: (await import("./HowItWorksPage")).default }) },
          { path: "/welcome", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
  {
    path: "*",
    hydrateFallbackElement: <div className="min-h-dvh bg-canvas" />,
    errorElement: <RouteError />,
    lazy: async () => {
      const { default: SignInPage } = await import("./SignInPage");
      return { Component: () => <SignInPage mode="clerk" /> };
    },
  },
];

export default function PublicSite() {
  const [router] = useState(() => createBrowserRouter(publicRoutes));
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
