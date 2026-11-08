import { useState } from "react";
import { Navigate, createBrowserRouter, type RouteObject } from "react-router";
import { RouterProvider } from "react-router/dom";
import { RouteError } from "../shell/RouteError";
import { ThemeProvider } from "../lib/theme";
import { APP_PATH_PREFIXES } from "./seo";
import { SiteLayout } from "./SiteLayout";

/* What a signed-out visitor sees on a hosted build: the landing hero at /, how it works, and sign-in.
   A path that belongs to the app (a deep link such as /books/abc) shows sign-in at that address, so after
   signing in the app opens where the link pointed. Any other path is a "page not found" (the server
   answers it with status 404). */

async function lazySignIn() {
  const { default: SignInPage } = await import("./SignInPage");
  return { Component: () => <SignInPage mode="clerk" /> };
}

async function lazyNotFound() {
  const { default: NotFoundPage } = await import("./NotFoundPage");
  return {
    Component: () => (
      <SiteLayout home="/" signedIn={false}>
        <NotFoundPage />
      </SiteLayout>
    ),
  };
}

/* The screen is chosen by the router from the address it is going to, never from window.location: a browser keeps the
   old address until the next screen has loaded, so a click on "Sign in" at "/" used to be judged as "/" and showed
   "Page not found" (8 November 2026). One route per app path, taken from the same list as the server's, loads sign-in. */
const appRoutes: RouteObject[] = APP_PATH_PREFIXES.map((prefix) => ({
  path: `/${prefix}/*`,
  hydrateFallbackElement: <div className="min-h-dvh bg-canvas" />,
  errorElement: <RouteError />,
  lazy: lazySignIn,
}));

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
  ...appRoutes,
  {
    path: "*",
    hydrateFallbackElement: <div className="min-h-dvh bg-canvas" />,
    errorElement: <RouteError />,
    lazy: lazyNotFound,
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
