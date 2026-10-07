import type { QueryClient } from "@tanstack/react-query";
import { toPenName } from "../../api/adapters";
import { queryKeys } from "../../api/hooks";
import { profilesApi } from "../../api/profiles";
import type { ApiProfile, ProfileInput, ProfileMemoryItem, ProfileSample, SampleKind } from "../../api/types";
import { fromPenName, initialsFor, type MemoryItem, type ProfileDraft, type VoiceSample } from "./profileStore";

/* The profile editor's draft to and from the server (apps/server/src/features/profiles.ts). Voice samples
   and memory live in their own server lists, so a save sends the profile, then the sample and memory
   changes: new samples are added, edited ones patched, removed ones deleted; memory items switched on
   or off are patched and removed ones deleted. */

const MEMORY_KIND_LABELS: Record<string, string> = {
  preference: "Preference",
  avoid_phrase: "Phrase to avoid",
  keep_phrase: "Phrase to keep",
  style_rule: "Style rule",
  fact: "Fact",
};

function sampleKind(kind: string): VoiceSample["kind"] {
  return kind === "not_like" ? "not-like" : "sounds-like";
}

function serverSampleKind(kind: VoiceSample["kind"]): SampleKind {
  return kind === "not-like" ? "not_like" : "sounds_like";
}

export function toVoiceSample(s: ProfileSample): VoiceSample {
  return { id: s.id, kind: sampleKind(s.kind), text: s.text };
}

export function toMemoryItem(m: ProfileMemoryItem): MemoryItem {
  return {
    id: m.id,
    verdict: m.kind === "avoid_phrase" ? "rejected" : "accepted",
    before: "",
    after: m.content,
    reason: MEMORY_KIND_LABELS[m.kind] ?? m.kind,
    source: m.origin === "owner" ? "Added by you" : "From an edit you accepted",
    on: m.active,
  };
}

/** Server profile, its samples and memory, as the editor's draft. */
export function draftFromApi(p: ApiProfile, samples: ProfileSample[] = [], memory: ProfileMemoryItem[] = []): ProfileDraft {
  const d = fromPenName(toPenName(p), samples.map(toVoiceSample), memory.map(toMemoryItem));
  return {
    ...d,
    photoAssetId: typeof p.brand["photoAssetId"] === "string" ? p.brand["photoAssetId"] : null,
    publishing: { ...d.publishing, illustrative: p.illustrativeLineDefault },
    archived: p.status === "archived",
  };
}

function obj(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** The draft as the server's profile body. Keys the editor does not show (heat level, audience, notes) are kept. */
export function inputFromDraft(d: ProfileDraft, base?: ApiProfile | null): ProfileInput {
  const v = d.voice;
  return {
    penName: d.name.trim(),
    legalName: d.legalName.trim() || null,
    imprintName: d.publishing.imprint.trim() || null,
    isRealPerson: d.realPerson,
    illustrativeLineDefault: d.publishing.illustrative,
    location: d.location.trim() || null,
    bioThirdPerson: d.bio,
    shortBio: d.shortBio.trim() || null,
    credentials: d.credentials,
    links: d.links.map((l) => ({ label: l.label, value: l.value })),
    voice: {
      ...obj(base?.voice),
      tone: v.tone,
      pov: v.pov,
      rhythm: v.rhythm,
      vocabulary: v.vocabulary,
      readingLevel: v.readingLevel,
      dialogueStyle: v.dialogueStyle,
      locale: v.locale,
      bannedPhrases: v.bannedPhrases,
      sampleParagraph: v.sampleParagraph,
    },
    brand: { ...obj(base?.brand), photoAssetId: d.photoAssetId ?? null, initials: initialsFor(d.name) || d.initials, genres: d.genres, bookTypes: d.bookTypes },
    publishing: {
      ...obj(base?.publishing),
      copyrightTemplate: d.publishing.copyright,
      copyrightName: d.publishing.copyrightName,
      disclaimer: d.publishing.disclaimer,
      illustrativeLine: d.publishing.illustrativeLine,
      defaultBookType: d.publishing.defaultBookType,
      defaultWordTarget: d.publishing.defaultWordTarget,
      defaultTrim: d.publishing.trim,
      defaultInteriorTheme: d.publishing.defaultInteriorTheme,
      defaultCoverStyle: d.publishing.defaultCoverStyle,
      modelNotes: d.modelNotes,
    },
    models: d.models,
    defaultBookTypeId: d.publishing.defaultBookType || null,
  };
}

/**
 * Saves the draft: creates or updates the profile, then applies sample and memory changes against what
 * the server had when the editor opened. Returns the saved profile id. Throws the first ApiError.
 */
export async function saveDraftToServer(
  qc: QueryClient,
  draft: ProfileDraft,
  base: { profile: ApiProfile | null; samples: ProfileSample[]; memory: ProfileMemoryItem[] },
): Promise<string> {
  const body = inputFromDraft(draft, base.profile);
  const saved = base.profile ? await profilesApi.update(base.profile.id, body) : await profilesApi.create(body);
  const id = saved.id;
  qc.setQueryData(queryKeys.profiles.detail(id), saved);

  const now = new Map(draft.voice.samples.map((s) => [s.id, s]));
  for (const old of base.samples) {
    const cur = now.get(old.id);
    if (!cur || !cur.text.trim()) await profilesApi.deleteSample(id, old.id);
    else if (cur.text !== old.text || cur.kind !== sampleKind(old.kind))
      await profilesApi.updateSample(id, old.id, { kind: serverSampleKind(cur.kind), text: cur.text });
  }
  const before = new Map(base.samples.map((s) => [s.id, s]));
  for (const s of draft.voice.samples) {
    if (!before.has(s.id) && s.text.trim()) await profilesApi.addSample(id, { kind: serverSampleKind(s.kind), text: s.text });
  }

  const kept = new Map(draft.memory.map((m) => [m.id, m]));
  for (const m of base.memory) {
    const cur = kept.get(m.id);
    if (!cur) await profilesApi.deleteMemory(id, m.id);
    else if (cur.on !== m.active) await profilesApi.updateMemory(id, m.id, { active: cur.on });
  }

  await Promise.all([qc.invalidateQueries({ queryKey: queryKeys.profiles.all }), qc.invalidateQueries({ queryKey: queryKeys.books.all })]);
  return id;
}
