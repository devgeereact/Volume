/* System: health, settings, model defaults, OpenRouter key test, backups (apps/server/src/routes/system.ts). */
import { api, type RequestOptions } from "./client";
import type {
  ApiBackupFile,
  BackupsResponse,
  HealthResponse,
  ModelSettingsPut,
  ModelSettingsPutResponse,
  ModelSettingsResponse,
  OpenRouterTestResult,
  SettingsPatchResponse,
  SettingsResponse,
  SettingValues,
} from "./types";

type Opts = Pick<RequestOptions, "signal">;

export const systemApi = {
  health: (o?: Opts) => api.get<HealthResponse>("/health", o),
  settings: (o?: Opts) => api.get<SettingsResponse>("/settings", o),
  patchSettings: (patch: SettingValues, o?: Opts) => api.patch<SettingsPatchResponse>("/settings", patch, o),
  models: (o?: Opts) => api.get<ModelSettingsResponse>("/settings/models", o),
  putModels: (body: ModelSettingsPut, o?: Opts) => api.put<ModelSettingsPutResponse>("/settings/models", body, o),
  /** Checks the key with OpenRouter. Answers 200 whether or not the key works. */
  testOpenRouter: (o?: Opts) => api.post<OpenRouterTestResult>("/settings/openrouter/test", undefined, o),
  backups: (o?: Opts) => api.get<BackupsResponse>("/backups", o),
  /** Makes a backup now (SQLite only; MySQL answers 501). */
  makeBackup: (o?: Opts) => api.post<ApiBackupFile>("/backups", undefined, o),
};
