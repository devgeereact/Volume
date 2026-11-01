import { createBrowserRouter, createHashRouter } from "react-router";
import { routes } from "./routes";

/**
 * Browser history in every real build. VITE_HASH_ROUTER=1 is only for the design preview build, which runs inside
 * a sandboxed frame where the page path cannot change; it never ships to the host.
 */
export function createAppRouter() {
  return import.meta.env.VITE_HASH_ROUTER === "1" ? createHashRouter(routes) : createBrowserRouter(routes);
}
