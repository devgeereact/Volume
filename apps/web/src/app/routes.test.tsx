import { renderToStaticMarkup } from "react-dom/server";
import { Outlet, StaticRouterProvider, createStaticHandler, createStaticRouter, type RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
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

describe("route errors", () => {
  it("gives every layout route an error boundary for its screens, so the shell stays", () => {
    expect(layoutsWithoutBoundary(routes)).toEqual([]);
    const shell = routes[0];
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
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Go to Library<\/a>/);
    expect(html).not.toContain("internal detail");
    expect(html).not.toContain("Never shown");
  });
});
