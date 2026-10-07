import type { PenName } from "./types";
import { profiles, type AuthorProfile } from "./config";
import { stageDefaults } from "./models";

/* Profiles for the prototype, built from config/profiles/*.json (D-018) so the app and the server read
   one source. Two real people (Gideon Akinlotan, Harni Muharami) whose bios are marked "owner to
   confirm", and three pen names (Elena Marsh, Tobi Rhymes, J. R. Kade). The `PenName` shape is kept for
   the screens; the full record is on `profile`. */

const defaultWriter = stageDefaults.find((s) => s.stage === "writing")?.defaultModel ?? "~anthropic/claude-sonnet-latest";

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toneLine(tone: string[]): string {
  if (tone.length <= 1) return sentence(tone[0] ?? "");
  return sentence(`${tone.slice(0, -1).join(", ")} and ${tone[tone.length - 1]}`);
}

function toPenName(p: AuthorProfile): PenName {
  return {
    id: p.id,
    name: p.name,
    initials: p.initials,
    imprint: p.imprint,
    realPerson: p.realPerson,
    bio: p.bio,
    shortBio: p.shortBio,
    bioStatus: p.status.bio === "owner-to-confirm" ? "sample-owner-to-confirm" : p.status.bio,
    bioNote: p.status.note,
    credentials: p.credentials,
    links: p.links,
    voice: [toneLine(p.voice.tone), p.voice.pov, p.voice.rhythm, p.voice.vocabulary],
    defaultWriterModel: p.models.writing ?? defaultWriter,
    genres: p.genres,
    isDemo: false,
    createdAt: p.createdAt,
    profile: p,
  };
}

export const penNames: PenName[] = profiles.map(toPenName);

export function getPenName(id: string): PenName | undefined {
  return penNames.find((p) => p.id === id);
}
