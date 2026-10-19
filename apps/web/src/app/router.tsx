import { createBrowserRouter } from "react-router";
import { routes } from "./routes";

export function createAppRouter() {
  return createBrowserRouter(routes);
}
