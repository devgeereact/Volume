import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banner, Button, Checkbox, Modal, ProgressBar, Select } from "../../components/ui";
import { booksApi } from "../../api/books";
import { queryKeys } from "../../api/hooks";
import { apiErrorText } from "../../api/wire-a";
import type { PenName } from "../../demo/types";

/** One file's outcome in a multi-file import. */
interface Imported {
  name: string;
  bookId: string | null;
  error: string | null;
}

/**
 * Imports one or more Volume Markdown files under a pen name. Books that are already on sale (an author's backlist)
 * can be marked published as they come in, so they show on the Published shelf and in "Also by".
 */
export function ImportManuscriptDialog({ profiles, onClose }: { profiles: PenName[]; onClose: () => void }) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [published, setPublished] = useState(false);
  const [done, setDone] = useState<Imported[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const importer = useMutation({
    mutationFn: async () => {
      if (files.length === 0 || !profileId) throw new Error("Choose a pen name and at least one Markdown file.");
      const bad = files.find((f) => f.size > 1500000 || !/\.md$/i.test(f.name));
      if (bad) throw new Error(`${bad.name}: choose Markdown (.md) files smaller than 1.5 MB.`);
      const results: Imported[] = [];
      setDone([]);
      for (const file of files) {
        try {
          const r = await booksApi.importManuscript({ profileId, markdown: await file.text() });
          if (published) await booksApi.publish(r.bookId);
          results.push({ name: file.name, bookId: r.bookId, error: null });
        } catch (e) {
          results.push({ name: file.name, bookId: null, error: apiErrorText(e) });
        }
        setDone([...results]);
      }
      return results;
    },
    onSuccess: (results) => {
      void qc.invalidateQueries({ queryKey: queryKeys.books.all });
      const failed = results.filter((r) => r.error);
      const only = results[0];
      // One book in, nothing failed: open it, as before. Otherwise stay and show what happened to each file.
      if (results.length === 1 && only?.bookId && !failed.length) {
        onClose();
        void navigate(`/books/${only.bookId}/editor`);
      } else if (failed.length) setProblem(`${failed.length} of ${results.length} files were not imported. The others are in the Library.`);
    },
    onError: (error) => setProblem(apiErrorText(error)),
  });
  const finished = !importer.isPending && done.length > 0 && done.length === files.length;
  return (
    <Modal
      open
      onClose={onClose}
      title="Import manuscripts"
      description="Choose a pen name and one or more files in the Volume Markdown format. Your original files stay unchanged."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {finished ? "Close" : "Cancel"}
          </Button>
          {!finished && (
            <Button variant="primary" disabled={files.length === 0 || !profileId} loading={importer.isPending} onClick={() => importer.mutate()}>
              {files.length > 1 ? `Import ${files.length} manuscripts` : "Import manuscript"}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-5">
        <Select label="Pen name" value={profileId} onChange={setProfileId} options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))} />
        <label className="grid gap-2 text-small font-semibold">
          Markdown files
          <input
            type="file"
            multiple
            accept=".md,text/markdown"
            onChange={(event) => {
              setFiles(Array.from(event.target.files ?? []));
              setDone([]);
              setProblem(null);
            }}
          />
        </label>
        <Checkbox
          label="These books are already published"
          description="Marks each one published as it comes in, so it shows on the Published shelf and in the pen name's Also by list."
          checked={published}
          onChange={setPublished}
        />
        {(importer.isPending || done.length > 0) && (
          <div className="grid gap-2" role="status">
            <ProgressBar
              value={done.length}
              max={Math.max(1, files.length)}
              live={importer.isPending}
              label="Import progress"
              valueText={`${done.length} of ${files.length}`}
            />
            <ul className="grid gap-1 text-small">
              {done.map((d) => (
                <li key={d.name} className={d.error ? "text-claim" : "text-ink-secondary"}>
                  {d.error ? `${d.name}: ${d.error}` : `${d.name}: imported${published ? " and marked published" : ""}`}
                </li>
              ))}
            </ul>
          </div>
        )}
        {problem && (
          <Banner tone="error" title="Not everything was imported">
            {problem}
          </Banner>
        )}
      </div>
    </Modal>
  );
}
