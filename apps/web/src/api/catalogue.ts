/* Read-only catalogues from the repository's config/ folder (book types, interior themes, cover styles). */
import { api, type RequestOptions } from "./client";
import type { CatalogueName, CatalogueResponse } from "./types";

type Opts = Pick<RequestOptions, "signal">;

export const catalogueApi = {
  get: (name: CatalogueName, o?: Opts) => api.get<CatalogueResponse>(`/${name}`, o),
  bookTypes: (o?: Opts) => api.get<CatalogueResponse>("/book-types", o),
  interiorThemes: (o?: Opts) => api.get<CatalogueResponse>("/interior-themes", o),
  coverStyles: (o?: Opts) => api.get<CatalogueResponse>("/cover-styles", o),
};
