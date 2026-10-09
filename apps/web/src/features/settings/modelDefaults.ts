import { useEffect, useSyncExternalStore } from "react";
import { useApiModelSettings } from "../../api/wire-a";
import { getModel, models, stageDefaults } from "../../demo/models";
import type { ModelInfo } from "../../demo/types";

/* Workspace model choices for this visit. They start from stageDefaults (config/models.defaults.json);
   Settings, Models changes them and the Profile editor shows them as "workspace default". */

export interface StageChoice {
  model: string;
  fallbacks: string[];
}

function fromDefaults(): Record<string, StageChoice> {
  return Object.fromEntries(stageDefaults.map((s) => [s.stage, { model: s.defaultModel, fallbacks: [...s.fallbacks] }]));
}

let choices: Record<string, StageChoice> = fromDefaults();
const listeners = new Set<() => void>();

export function useWorkspaceModels(): Record<string, StageChoice> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => choices,
  );
}

export function saveWorkspaceModels(next: Record<string, StageChoice>): void {
  choices = next;
  for (const l of listeners) l();
}

export function configDefaults(): Record<string, StageChoice> {
  return fromDefaults();
}

/** Models that can run a stage: image models for cover images, text models for everything else. */
export function modelsForStage(stage: string): ModelInfo[] {
  const image = stage === "cover_image";
  return models.filter((m) => m.capabilities.includes("Images") === image);
}

export function modelLabel(slug: string): string {
  const m = getModel(slug);
  return m ? `${m.provider}, ${m.label.toLowerCase()}` : "Not in the model list";
}

/**
 * With the server running, keeps the workspace choices above in step with GET /settings/models, so the
 * profile editor's "workspace default" is the server's. Does nothing in demo mode.
 */
export function useSyncWorkspaceModels(enabled: boolean): void {
  const q = useApiModelSettings(enabled);
  const data = q.data;
  useEffect(() => {
    if (!enabled || !data) return;
    const fromServer = Object.fromEntries(data.stages.map((s) => [s.stage, { model: s.effectiveModel, fallbacks: [...s.fallbacks] }]));
    saveWorkspaceModels({ ...fromDefaults(), ...fromServer });
  }, [enabled, data]);
}
