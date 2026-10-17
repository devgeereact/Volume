/* People the owner wants to thank in the acknowledgements: book settings `acknowledgements` on the server
   (repos/books.ts BookSettingsSchema). With no names, the writer saves a placeholder (version source
   app:placeholder) and preflight blocks the pack until names are added and the section is written again. */

/** Version source of a page the app saved for the owner to fill (server jobs/book-data.ts OWNER_PLACEHOLDER_SOURCE). */
export const OWNER_PLACEHOLDER_SOURCE = "app:placeholder";

/** Most names the server accepts (an array of up to 100, each up to 300 characters). */
const MAX_NAMES = 100;
const MAX_NAME = 300;

/** One name per line (semicolons split too, as on the server), trimmed, blanks and repeats dropped. */
export function parseThanks(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\n|;/)) {
    const name = raw.trim().slice(0, MAX_NAME);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length === MAX_NAMES) break;
  }
  return out;
}

/** The saved names as the field shows them, one per line. */
export function thanksText(settings: Record<string, unknown>): string {
  const v = settings["acknowledgements"];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").join("\n");
  return typeof v === "string" ? parseThanks(v).join("\n") : "";
}

/** The book settings with the new names, keeping every other key (PATCH replaces settings as a whole). */
export function withThanks(settings: Record<string, unknown>, names: string[]): Record<string, unknown> {
  return { ...settings, acknowledgements: names.length ? names : null };
}
