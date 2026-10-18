import type { ToastInput } from "../../lib/toast";

/* Archive with an Undo toast. The steps run outside any component: archiving refreshes the Library, which
   unmounts the card (and its dialog) that started it, so nothing here may depend on that card staying
   mounted. The toast lives in the app-wide ToastProvider; Undo calls the server and refreshes the lists itself. */

export interface ArchiveFlow {
  title: string;
  /** POST /books/:id/archive. Rejects with the server's error, which the dialog shows. */
  archive: () => Promise<unknown>;
  /** POST /books/:id/restore, then refresh the book lists, the shelf and the archive. */
  restore: () => Promise<unknown>;
  show: (t: ToastInput) => number;
  errorText: (e: unknown) => string;
}

/** Archives the book, then shows a toast whose Undo restores it. Rejects when the archive fails, before any toast. */
export async function archiveWithUndo(f: ArchiveFlow): Promise<void> {
  await f.archive();
  f.show({
    tone: "success",
    title: `${f.title} archived`,
    body: "Restore it from the Archive at any time.",
    action: {
      label: "Undo",
      onClick: () => {
        f.restore().then(
          () => f.show({ tone: "success", title: `${f.title} restored` }),
          (e: unknown) => f.show({ tone: "error", title: "Could not restore the book", body: f.errorText(e) }),
        );
      },
    },
  });
}
