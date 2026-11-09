export interface HouseStyleFixReply {
  sections: number;
  dashes: number;
  spellings: number;
  emptyItems: number;
  /** The pack check's house-style verdict after the fix (null from a server that does not send one). */
  styleAfter: { severity: string; message: string } | null;
}

/** What the owner is told after "Fix house style": what changed, and what the pack check still holds against the book. */
export function houseStyleSummary(r: HouseStyleFixReply): string {
  const blocked = r.styleAfter?.severity === "block";
  const fixed =
    r.sections === 0
      ? ""
      : `House style fixed in ${r.sections} ${r.sections === 1 ? "section" : "sections"}: ${r.dashes} dashes, ${r.spellings} US spellings` +
        (r.emptyItems ? ` and ${r.emptyItems} empty list ${r.emptyItems === 1 ? "item" : "items"} removed.` : ".");
  if (!blocked) return fixed || "House style was already clean.";
  const left = r.styleAfter?.message ?? "";
  return r.sections === 0
    ? `Nothing here could be fixed automatically. The pack check still blocks: ${left} Each one needs your own wording.`
    : `${fixed} Still blocking the pack: ${left} Each one needs your own wording.`;
}
