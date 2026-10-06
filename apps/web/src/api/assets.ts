/* Assets: raw upload into database chunks, metadata, download by id (apps/server/src/routes/assets.ts).
   The upload is the one call that does not send JSON: the server takes the file bytes as the body. */
import { api, apiRequest, apiUrl, seg, type RequestOptions } from "./client";
import type { ApiAssetMeta, UploadQuery } from "./types";

type Opts = Pick<RequestOptions, "signal">;

export const assetsApi = {
  get: (assetId: string, o?: Opts) => api.get<ApiAssetMeta>(`/assets/${seg(assetId)}`, o),
  /** URL for <img src> (inline images only) or an <a download> link. */
  downloadUrl: (assetId: string, inline = false) => apiUrl(`/assets/${seg(assetId)}/download`, inline ? { inline: "1" } : undefined),
  upload: (file: Blob, q: UploadQuery, o?: Opts) =>
    apiRequest<ApiAssetMeta>("POST", "/assets", file, {
      ...o,
      query: { kind: q.kind, filename: q.filename, mime: q.mime ?? (file.type || undefined), projectId: q.projectId, profileId: q.profileId },
    }),
};
