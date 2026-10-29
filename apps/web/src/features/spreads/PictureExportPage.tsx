import { useMemo, useState } from "react";
import { BookStatusActions } from "../published/BookStatusActions";
import { canMarkPublished } from "../published/publishDate";
import { useQueryClient } from "@tanstack/react-query";
import { sizeLabel } from "../../api/adapters";
import { queryKeys, useBookJobs, useExports } from "../../api/hooks";
import { useExportPictureBook, usePictureBook, type PictureBookView } from "../../api/picture";
import { productionApi } from "../../api/production";
import { isTerminalJob, type ApiBookDetail, type ApiExportRecord } from "../../api/types";
import { errorText, useJobWatch } from "../../api/wire-c";
import { demoPicturePreflight } from "../../demo/pictureBook";
import type { Book } from "../../demo/types";
import { useCanWrite } from "../../lib/access";
import { formatRelative } from "../../lib/format";
import { PageHeader } from "../../components/ui";
import { bookStepPath } from "../../screens";
import { ErrorPanel, LoadingBlock, useScreenState } from "../writing/screenState";
import { demoBuildExport, useDemoPictureBook } from "./demoStore";
import { bleedPageSize, demoPlan } from "./geometry";
import { pageCountFor, preflightItems } from "./model";
import { PictureExportScreen, type ExportFileRow } from "./PictureExportScreen";

/* The Export step for picture books (P7-6). API books build through POST /books/:id/picture-book/export and read
   the files and their preflight from GET /books/:id/exports; demo books simulate the build. */

export default function PictureExportPage({ book, apiBook }: { book: Book; apiBook: ApiBookDetail | undefined }) {
  if (apiBook) return <ApiPictureExport key={book.id} book={book} apiBook={apiBook} />;
  return <DemoPictureExport key={book.id} book={book} />;
}

function Loading() {
  return (
    <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <LoadingBlock label="Loading the export" rows={8} className="max-w-[960px]" />
    </div>
  );
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid gap-5 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <PageHeader title="Export" />
      <ErrorPanel className="max-w-[720px]" title="Could not load the export" body={message} onRetry={onRetry} />
    </div>
  );
}

const latest = (items: ApiExportRecord[], kind: string) =>
  items.filter((r) => r.kind === kind && r.status === "done").sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;

function ApiPictureExport({ book, apiBook }: { book: Book; apiBook: ApiBookDetail }) {
  const bookId = book.id;
  const qc = useQueryClient();
  const canWrite = useCanWrite();
  const viewQ = usePictureBook(bookId);
  const exportsQ = useExports(bookId);
  const jobs = useBookJobs(bookId, { limit: 50 });
  const build = useExportPictureBook();
  const [startedId, setStartedId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const running = (jobs.data ?? []).find((j) => j.kind === "picture_export" && !isTerminalJob(j.status));
  const jobId = startedId ?? running?.id ?? null;
  const [doneError, setDoneError] = useState<string | null>(null);
  const watch = useJobWatch(bookId, jobId, (w) => {
    setStartedId(null);
    setDoneError(w.ok ? null : (w.error ?? "The build stopped before the PDF was finished."));
    void qc.invalidateQueries({ queryKey: queryKeys.book.exports(bookId) });
    void qc.invalidateQueries({ queryKey: queryKeys.book.detail(bookId) });
  });

  const items = useMemo(() => exportsQ.data ?? [], [exportsQ.data]);
  const pdf = latest(items, "pdf_print");
  const pack = latest(items, "pack");

  if (viewQ.isPending || exportsQ.isPending) return <Loading />;
  if (viewQ.isError || !viewQ.data)
    return (
      <ErrorView
        message={`${errorText(viewQ.error)} Your files are safe.`}
        onRetry={() => {
          void viewQ.refetch();
          void exportsQ.refetch();
        }}
      />
    );

  const files: ExportFileRow[] = [];
  if (pdf)
    files.push({
      id: pdf.id,
      kind: "pdf",
      label: "Print interior PDF",
      detail: [
        `${pdf.pageCount ?? "?"} pages`,
        sizeLabel(pdf.bytes),
        `built ${formatRelative(new Date(pdf.createdAt).toISOString(), new Date().toISOString())}`,
        pdf.mock ? "mock build" : null,
      ]
        .filter(Boolean)
        .join(", "),
      href: productionApi.exportDownloadUrl(pdf.id),
    });
  if (pack)
    files.push({
      id: pack.id,
      kind: "pack",
      label: "KDP pack (zip)",
      detail: [sizeLabel(pack.bytes), pack.mock ? "mock build" : null].filter(Boolean).join(", ") || "Zip",
      href: productionApi.exportDownloadUrl(pack.id),
    });

  return (
    <PictureExportScreen
      view={viewQ.data}
      writingPath={bookStepPath(bookId, "writing")}
      disclosure={{ text: apiBook.aiDisclosure.text, images: apiBook.aiDisclosure.images }}
      preflight={preflightItems(pdf?.preflight)}
      files={files}
      building={watch.running ? watch.progress : null}
      buildMessage={watch.message}
      buildError={startError ?? (watch.running ? null : doneError)}
      canWrite={canWrite}
      stale={!!pdf?.stale}
      demo={false}
      statusActions={canWrite ? <BookStatusActions bookId={bookId} title={book.title} showPublish={canMarkPublished(book)} /> : undefined}
      onBuild={() => {
        setStartError(null);
        setDoneError(null);
        build.mutate(
          { bookId },
          {
            onSuccess: (r) => setStartedId(r.jobId),
            onError: (e) => setStartError(errorText(e)),
          },
        );
      }}
    />
  );
}

const DEMO_MATTER = { front: 3, back: 1 };

function DemoPictureExport({ book }: { book: Book }) {
  const { state, retry } = useScreenState();
  const s = useDemoPictureBook(book.id);
  const canWrite = useCanWrite();
  const plan = useMemo(() => demoPlan("premium", DEMO_MATTER.front, DEMO_MATTER.back), []);
  if (state === "loading") return <Loading />;
  if (state === "error") return <ErrorView message="The export service did not answer. Your files and settings are unchanged." onRetry={retry} />;
  const view: PictureBookView | null =
    state !== "empty" && s.view
      ? { ...s.view, pageSizeIn: bleedPageSize(), plan, pageCount: pageCountFor(DEMO_MATTER.front, s.view.spreads.length, DEMO_MATTER.back) }
      : null;
  const built = s.exportStatus === "done" && view;
  const files: ExportFileRow[] = built
    ? [
        { id: "demo-pdf", kind: "pdf", label: "Print interior PDF", detail: `${view.pageCount} pages, demo build`, href: null },
        { id: "demo-pack", kind: "pack", label: "KDP pack (zip)", detail: "Demo build", href: null },
      ]
    : [];
  return (
    <PictureExportScreen
      view={view}
      writingPath={bookStepPath(book.id, "writing")}
      disclosure={{ text: "ai_generated", images: view ? "ai_generated" : "none" }}
      preflight={built ? demoPicturePreflight : []}
      files={files}
      building={s.exportStatus === "running" ? s.exportProgress : null}
      buildMessage={s.exportStatus === "running" ? "Building the picture-book PDF" : null}
      buildError={null}
      canWrite={canWrite}
      stale={false}
      demo
      onBuild={() => void demoBuildExport(book.id)}
    />
  );
}
