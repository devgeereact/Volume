import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banner, Button, Modal, Select } from "../../components/ui";
import { booksApi } from "../../api/books";
import { queryKeys } from "../../api/hooks";
import { apiErrorText } from "../../api/wire-a";
import type { PenName } from "../../demo/types";

export function ImportManuscriptDialog({ profiles, onClose }: { profiles: PenName[]; onClose: () => void }) {
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const importer = useMutation({
    mutationFn: async () => {
      if (!file || !profileId) throw new Error("Choose a pen name and a Markdown file.");
      if (file.size > 1500000 || !/\.md$/i.test(file.name)) throw new Error("Choose a Markdown (.md) file smaller than 1.5 MB.");
      return booksApi.importManuscript({ profileId, markdown: await file.text() });
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: queryKeys.books.all });
      onClose();
      void navigate(`/books/${result.bookId}/editor`);
    },
    onError: (error) => setProblem(apiErrorText(error)),
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Import a manuscript"
      description="Choose a pen name and a file in the Volume Markdown format. Your original file stays unchanged."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!file || !profileId} loading={importer.isPending} onClick={() => importer.mutate()}>
            Import manuscript
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <Select label="Pen name" value={profileId} onChange={setProfileId} options={profiles.map((profile) => ({ value: profile.id, label: profile.name }))} />
        <label className="grid gap-2 text-small font-semibold">
          Markdown file
          <input
            type="file"
            accept=".md,text/markdown"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setProblem(null);
            }}
          />
        </label>
        {problem && (
          <Banner tone="error" title="Manuscript was not imported">
            {problem}
          </Banner>
        )}
      </div>
    </Modal>
  );
}
