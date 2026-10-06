/* Public surface of the API layer. Screens import from "../../api" (or a module directly). */
export * from "./client";
export * from "./types";
export { systemApi } from "./system";
export { catalogueApi } from "./catalogue";
export { profilesApi } from "./profiles";
export { booksApi } from "./books";
export { planningApi } from "./planning";
export { manuscriptApi } from "./manuscript";
export { productionApi } from "./production";
export { jobsApi } from "./jobs";
export { assetsApi } from "./assets";
export * from "./hooks";
export * from "./events";
export * from "./source";
export * from "./adapters";
export { queryClient } from "./queryClient";
