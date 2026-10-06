import type { ReactNode } from "react";

interface ClaimMarkProps {
  children: ReactNode;
  /** id of the margin note that explains the claim. */
  noteId?: string | undefined;
}

/** Inline proof red wavy underline on a sentence that needs a source. Screen readers hear "claim to verify". */
export function ClaimMark({ children, noteId }: ClaimMarkProps) {
  return (
    <span className="vol-claim-mark" aria-describedby={noteId}>
      {children}
      <span className="sr-only"> (claim to verify)</span>
    </span>
  );
}
