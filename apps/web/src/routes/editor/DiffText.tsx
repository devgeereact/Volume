import { diffWords } from "./textTools";

/**
 * Blue pencil diff in one line of text: removed words struck through, added words underlined in pencil
 * on the select wash. Screen readers hear "removed" and "added".
 */
export function DiffText({ before, after, show = "both" }: { before: string; after: string; show?: "both" | "before" | "after" }) {
  const parts = diffWords(before, after);
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "same") return <span key={i}>{part.text}</span>;
        if (part.type === "del") {
          if (show === "after") return null;
          return (
            <span key={i}>
              <del className="text-ink-secondary decoration-select decoration-2">
                <span className="sr-only">removed: </span>
                {part.text}
              </del>
              {show === "both" && parts[i + 1]?.type === "add" ? " " : null}
            </span>
          );
        }
        if (show === "before") return null;
        return (
          <ins key={i} className="rounded-xs bg-select-wash text-ink underline decoration-select decoration-2 underline-offset-4">
            <span className="sr-only">added: </span>
            {part.text}
          </ins>
        );
      })}
    </>
  );
}
