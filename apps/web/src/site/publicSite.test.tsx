import { renderToStaticMarkup } from "react-dom/server";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real sign-in page needs Clerk; the landing and how-it-works pages need the animation libraries. The test is
// about which screen the public site chooses, so each is a small marker.
vi.mock("./SignInPage", () => ({ default: () => <p>SIGN-IN SCREEN</p> }));
vi.mock("./LandingPage", () => ({ default: () => <p>LANDING SCREEN</p> }));
vi.mock("./HowItWorksPage", () => ({ default: () => <p>HOW IT WORKS SCREEN</p> }));

/**
 * A browser keeps showing the OLD address until the next screen has finished loading, and only then moves it to the
 * new one (React Router pushes the new URL when a navigation completes). The test stands in for that: window.location
 * stays on the landing page while the visitor "clicks" a link inside the app.
 *
 * Reported on 8 November 2026: clicking "Sign in" on the landing page showed "Page not found" at /sign-in, because the
 * public site read window.location.pathname (still "/") to decide, instead of the address being opened.
 */
async function openThenClick(from: string, to: string): Promise<string> {
  vi.stubGlobal("window", { location: { pathname: from, search: "" } });
  const { publicRoutes } = await import("./PublicSite");
  const router = createMemoryRouter(publicRoutes, { initialEntries: [from] });
  await router.navigate(to); // house-style: ignore
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("public site: moving between screens inside the app", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("shows sign-in when a visitor clicks Sign in on the landing page", async () => {
    const html = await openThenClick("/", "/sign-in");
    expect(html).not.toContain("Page not found");
    expect(html).toContain("SIGN-IN SCREEN");
  });

  it("shows sign-in when a visitor clicks Sign in on How it works", async () => {
    const html = await openThenClick("/how-it-works", "/sign-in");
    expect(html).toContain("SIGN-IN SCREEN");
    expect(html).not.toContain("Page not found");
  });

  it("sends a visitor who follows an app link such as the library to sign-in", async () => {
    const html = await openThenClick("/", "/library");
    expect(html).toContain("SIGN-IN SCREEN");
    expect(html).not.toContain("Page not found");
  });

  it("still shows Page not found for an address that is not part of the app", async () => {
    const html = await openThenClick("/", "/nothing-here");
    expect(html).toContain("Page not found");
    expect(html).not.toContain("SIGN-IN SCREEN");
  });

  it("decides again on every click, not once for the whole visit", async () => {
    vi.stubGlobal("window", { location: { pathname: "/", search: "" } });
    const { publicRoutes } = await import("./PublicSite");
    const router = createMemoryRouter(publicRoutes, { initialEntries: ["/"] });
    await router.navigate("/nothing-here"); // house-style: ignore
    expect(renderToStaticMarkup(<RouterProvider router={router} />)).toContain("Page not found");
    await router.navigate("/sign-in"); // house-style: ignore
    const html = renderToStaticMarkup(<RouterProvider router={router} />);
    expect(html).toContain("SIGN-IN SCREEN");
    expect(html).not.toContain("Page not found");
  });
});
