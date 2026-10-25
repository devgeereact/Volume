import { useState } from "react";
import { Navigate, createBrowserRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { RouteError } from "../shell/RouteError";
import { ThemeProvider } from "../lib/theme";
import { isAppPath } from "./seo";
import { SiteLayout } from "./SiteLayout";

/* What a signed-out visitor sees on a hosted build: the landing hero at /, how it works, and sign-in.
   A path that belongs to the app (a deep link such as /books/abc) shows sign-in at that address, so after
   signing in the app opens where the link pointed. Any other path is a "page not found" (the server
   answers it with status 404). The router is made when this mounts, so it reads the address then. */

async function lazyFallback() {
  const { pathname } = window.location;
  if (!isAppPath(pathname)) {
    const { default: NotFoundPage } = await import("./NotFoundPage");
    return {
      Component: () => (
        <SiteLayout home="/" signedIn={false}>
          <NotFoundPage />
        </SiteLayout>
      ),
    };
  }
  const { default: SignInPage } = await import("./SignInPage");
  return { Component: () => <SignInPage mode="clerk" /> };
}

export const publicRoutes: RouteObject[] = [
  {
    element: <SiteLayout home="/" signedIn={false} />,
    // The pages are lazy chunks; this covers the first render while one loads.
    hydrateFallbackElement: <div className="min-h-dvh bg-canvas" />,
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
    lazy: lazyFallback,
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
