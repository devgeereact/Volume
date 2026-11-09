/** What the editor tells the owner after a claim action, from what the server really did (`textChanged`). */
export function claimResultMessage(action: "verify" | "soften" | "remove", textChanged: boolean | undefined): string {
  if (action === "verify") return "Claim marked verified.";
  // A reply without the flag comes from a server that always saved a version.
  const changed = textChanged !== false;
  if (action === "soften") return changed ? "Softer wording saved as a new version." : "Claim closed, but the text did not change.";
  return changed ? "Sentence removed and saved as a new version." : "Claim closed. The sentence was already gone, so the text did not change.";
}
