import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileArchive } from "lucide-react";
import { Banner, Button, Loader, Modal, Select } from "../../components/ui";
import { booksApi } from "../../api/books";
import { queryKeys } from "../../api/hooks";
import type { PenName } from "../../demo/types";
import { useToast } from "../../lib/toast";
import { initialProfileId, originNoteOf, projectImportErrorText, projectImportProblem } from "./projectMove";

/**
 * Import project (D-051): a project zip from another Volume becomes a new book under the chosen pen name.
 * Nothing existing changes. While the upload runs the dialog stays open, so the move cannot be left half seen.
 */
export function ImportProjectDialog({ profiles, filterId, onClose }: { profiles: PenName[]; filterId: string | null; onClose: () => void }) {
  const profileIds = profiles.map((p) => p.id);
  const [profileId, setProfileId] = useState(() => initialProfileId(filterId, profileIds));
  const [file, setFile] = useState<File | null>(null);
  const [touched, setTouched] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const fileId = useId();
  const fileHintId = useId();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const formProblem = projectImportProblem({ file, profileId, profileIds });
  const importer = useMutation({
    mutationFn: (input: { file: File; profileId: string }) => booksApi.importProjectFile(input.file, input.profileId),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: queryKeys.books.all });
      const note = originNoteOf(result.book.settings);
      toast.show({ tone: "success", title: `${result.book.title ?? "The book"} is in your library`, body: note ?? "Moved from another Volume." });
      onClose();
      void navigate(`/books/${encodeURIComponent(result.bookId)}/export`);
    },
    onError: (error) => setProblem(projectImportErrorText(error)),
  });
  const busy = importer.isPending;
  const close = () => {
    if (!busy) onClose();
  };
  const submit = () => {
    setTouched(true);
    setProblem(null);
    if (formProblem || !file) return;
    importer.mutate({ file, profileId });
  };
  const fileProblem = touched && profiles.length > 0 ? formProblem : null;

  return (
    <Modal
      open
      onClose={close}
      closeOnScrim={!busy}
      title="Import a project"
      description="Choose the project zip from another Volume and the pen name it goes under. Volume makes a new book and changes nothing else."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" icon={FileArchive} loading={busy} loadingLabel="Importing" disabled={busy || profiles.length === 0} onClick={submit}>
            Import project
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="grid gap-2">
          <label htmlFor={fileId} className="text-small font-semibold text-ink">
            Project zip
          </label>
          <input
            id={fileId}
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            aria-describedby={fileHintId}
            aria-invalid={fileProblem ? true : undefined}
            className="rounded-sm text-small text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-select"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setProblem(null);
            }}
          />
          <p id={fileHintId} className={fileProblem ? "text-small text-claim" : "text-small text-ink-secondary"}>
            {fileProblem ?? "Made by Download project on the book's Export screen."}
          </p>
        </div>
        {profiles.length > 0 ? (
          <Select
            label="Pen name"
            value={profileId}
            onChange={(v) => {
              setProfileId(v);
              setProblem(null);
            }}
            disabled={busy}
            options={profiles.map((p) => ({ value: p.id, label: p.name }))}
          />
        ) : (
          <Banner tone="attention" title="No active pen name">
            Add or restore a pen name in Profiles first. The book needs one to live under.
          </Banner>
        )}
        <p role="status" aria-live="polite" className="flex min-h-5 items-center gap-2 text-small text-ink-secondary">
          {busy && (
            <>
              <Loader />
              Importing the project. Keep this open until it finishes.
            </>
          )}
        </p>
        {problem && (
          <Banner tone="error" title="Project was not imported">
            {problem}
          </Banner>
        )}
      </div>
    </Modal>
  );
}
