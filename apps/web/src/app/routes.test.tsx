import { renderToStaticMarkup } from "react-dom/server";
import { Outlet, StaticRouterProvider, createStaticHandler, createStaticRouter, type RouteObject } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routes, screenErrors } from "./routes";

/** Every layout route (an element with children) must wrap its screens in one pathless error boundary. */
function layoutsWithoutBoundary(list: RouteObject[], trail = "root"): string[] {
  const missing: string[] = [];
  for (const r of list) {
    const name = r.path ?? trail;
    if (r.element && r.children) {
      const only = r.children.length === 1 ? r.children[0] : undefined;
      const wraps = only !== undefined && only.errorElement !== undefined && only.path === undefined && only.element === undefined && !only.index;
      if (!wraps) missing.push(name);
    }
    if (r.children) missing.push(...layoutsWithoutBoundary(r.children, name));
  }
  return missing;
}

function FakeShell() {
  return (
    <div>
      <nav>Shell navigation</nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

async function render(tree: RouteObject[], path: string): Promise<string> {
  const handler = createStaticHandler(tree);
  const context = await handler.query(new Request(`http://localhost${path}`));
  if (context instanceof Response) throw new Error("Unexpected redirect");
  const router = createStaticRouter(handler.dataRoutes, context);
  return renderToStaticMarkup(<StaticRouterProvider router={router} context={context} hydrate={false} />);
}

/** Every full path the router answers, in order. Index routes take their parent's path. */
function routePaths(list: RouteObject[], parent = ""): string[] {
  const out: string[] = [];
  for (const r of list) {
    const here = r.path === undefined ? parent : r.path.startsWith("/") || parent === "" ? r.path : `${parent.replace(/\/$/, "")}/${r.path}`;
    if (r.index) out.push(`${here} (index)`);
    else if (r.path !== undefined) out.push(here);
    if (r.children) out.push(...routePaths(r.children, here));
  }
  return out;
}

const localPaths = [
  "/",
  "/welcome",
  "/how-it-works",
  "/sign-in",
  "/library",
  "/published",
  "/profiles",
  "/profiles/:profileId",
  "/books/new",
  "/new-book",
  "/books/:bookId",
  "/books/:bookId (index)",
  "/books/:bookId/research",
  "/books/:bookId/titles",
  "/books/:bookId/blueprint",
  "/books/:bookId/writing",
  "/books/:bookId/editor/:sectionId?",
  "/books/:bookId/claims",
  "/books/:bookId/cover",
  "/books/:bookId/export",
  "/books/:bookId/marketing",
  "/settings/:tab?",
  "/volume",
  "/volume/batches/:batchId",
  "/volume/schedule",
  "/archive",
  "/components",
  "*",
];

async function loadRoutes(clerkKey: string): Promise<RouteObject[]> {
  vi.resetModules();
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", clerkKey);
  return (await import("./routes")).routes;
}

describe("route list", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("answers every screen path in a local build, including the style guide", async () => {
    expect(routePaths(await loadRoutes(""))).toEqual(localPaths);
  });

  it("answers the same paths in a hosted build, without the style guide", async () => {
    const hosted = routePaths(await loadRoutes("pk_test_example"));
    expect(hosted).toEqual(localPaths.filter((p) => p !== "/components"));
    expect(hosted).not.toContain("/components");
  });

  it("gives signed-out visitors the landing hero, how it works and sign-in for any other path", async () => {
    const { publicRoutes } = await import("../site/PublicSite");
    expect(routePaths(publicRoutes)).toEqual(["/", "/how-it-works", "/welcome", "*"]);
    expect(layoutsWithoutBoundary(publicRoutes)).toEqual([]);
  });
});

describe("route errors", () => {
  it("gives every layout route an error boundary for its screens, so the shell stays", () => {
    expect(layoutsWithoutBoundary(routes)).toEqual([]);
    expect(routes.every((r) => r.errorElement !== undefined || r.element !== undefined)).toBe(true);
    const shell = routes.find((r) => r.path === undefined && r.element !== undefined);
    expect(shell?.errorElement).toBeDefined();
  });

  it("shows a screen error inside the shell with a way back to the Library", async () => {
    const tree: RouteObject[] = [
      {
        element: <FakeShell />,
        children: [
          screenErrors([
            {
              path: "/broken",
              loader: () => {
                throw new Error("internal detail");
              },
              element: <p>Never shown</p>,
            },
          ]),
        ],
      },
    ];
    const html = await render(tree, "/broken");
    expect(html).toContain("Shell navigation");
    expect(html).toContain("This screen could not load");
    expect(html).toMatch(/<a[^>]*href="\/library"[^>]*>Go to Library<\/a>/);
    expect(html).not.toContain("internal detail");
    expect(html).not.toContain("Never shown");
  });
});
