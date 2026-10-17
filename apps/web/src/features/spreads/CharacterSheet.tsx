import { UserRound } from "lucide-react";
import type { CharacterView } from "../../api/picture";
import { Skeleton } from "../../components/ui";

interface CharacterSheetProps {
  characters: CharacterView[];
  loading?: boolean | undefined;
  error?: string | null | undefined;
}

/**
 * The character sheet (D-045): each character's description, repeated word for word in every scene prompt, and the
 * reference picture of each main character that every spread picture is painted from.
 */
export function CharacterSheet({ characters, loading = false, error = null }: CharacterSheetProps) {
  if (loading)
    return (
      <div role="status" aria-label="Loading the character sheet" className="grid gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  if (error) return <p className="text-small text-claim">{error}</p>;
  if (characters.length === 0) return <p className="text-small text-ink-secondary">The characters appear here once the story is written.</p>;
  return (
    <ul className="grid gap-4">
      {characters.map((c) => (
        <li key={c.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
          {c.referenceUrl ? (
            <img
              src={c.referenceUrl}
              alt={`Reference picture of ${c.name}`}
              className="size-18 rounded-sm border border-border bg-sunken object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="grid size-18 place-items-center rounded-sm border border-dashed border-border-strong text-ink-tertiary">
              <UserRound size={18} aria-hidden />
              <span className="sr-only">No reference picture for {c.name}</span>
            </span>
          )}
          <div className="min-w-0">
            <p className="flex flex-wrap items-baseline gap-x-2 text-label text-ink">
              {c.name}
              <span className="text-caption text-ink-tertiary">{c.main ? "Main character, has a reference" : "Appears once"}</span>
            </p>
            <p className="mt-1 font-book text-small text-ink-secondary">{c.sheet}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
