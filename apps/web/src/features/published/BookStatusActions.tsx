import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Archive, BookCheck } from "lucide-react";
import { Banner, Button, Input, Modal } from "../../components/ui";
import { isApiError } from "../../api/client";
import { refreshBookStatus, useBookStatusAction, usePublishBook } from "../../api/hooks";
import { booksApi } from "../../api/books";
import { useQueryClient } from "@tanstack/react-query";
import { apiErrorText } from "../../api/wire-a";
import { cn } from "../../lib/cn";
import { useToast } from "../../lib/toast";
import { localToday, publishDateError } from "./publishDate";
import { archiveWithUndo } from "./statusFlow";

/* Mark as published and Archive for a server book (POST /books/:id/publish and /archive). Both confirm in
   a dialog first. The publish date is a local date, today or earlier; the server checks it again and may
   hold the book at the batch quality gate (409), whose message is shown as it comes. */

function publishErrorText(e: unknown): string {
  if (isApiError(e) && e.code === "invalid_published_at") return "The server did not accept that date. Pick today or an earlier day.";
  return apiErrorText(e);
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  bookId: string;
  title: string;
}

export function MarkPublishedDialog({ open, onClose, bookId, title }: DialogProps) {
  const today = localToday();
  const [date, setDate] = useState(today);
  const publish = usePublishBook();
  const toast = useToast();
  const navigate = useNavigate();
  const dateRef = useRef<HTMLInputElement>(null);
  const error = publishDateError(date, today);

  function close() {
    publish.reset();
    onClose();
  }

  function submit() {
    if (error) return;
    // mutateAsync, not per-call callbacks: the refresh moves a Library card to the Published column, which
    // unmounts this dialog, and TanStack Query drops per-call callbacks of an unmounted observer.
    publish.mutateAsync({ bookId, publishedAt: date }).then(
      () => {
        toast.show({
          tone: "success",
          title: `${title} is published`,
          body: "It is on the Published shelf now.",
          action: { label: "Open the shelf", onClick: () => void navigate("/published") },
        });
        close();
      },
      () => undefined, // shown by the banner from publish.error
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      initialFocus={dateRef}
      title="Mark as published"
      description={`Record the day ${title} went live on Amazon. Volume does not publish anything on KDP.`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={BookCheck}
            loading={publish.isPending}
            loadingLabel="Saving"
            disabledReason={error ? "Fix the date first." : undefined}
            onClick={submit}
          >
            Mark as published
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          ref={dateRef}
          label="Date published"
          type="date"
          max={today}
          required
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            publish.reset();
          }}
          error={error}
          hint="Today or an earlier day."
        />
        {publish.isError && (
          <Banner tone="error" title="Not marked as published">
            {publishErrorText(publish.error)}
          </Banner>
        )}
      </form>
    </Modal>
  );
}

export function ArchiveBookDialog({ open, onClose, bookId, title }: DialogProps) {
  const act = useBookStatusAction();
  const qc = useQueryClient();
  const toast = useToast();

  function close() {
    act.reset();
    onClose();
  }

  function submit() {
    // Archiving refreshes the Library, which unmounts the card and this dialog; see statusFlow.ts.
    archiveWithUndo({
      title,
      archive: () => act.mutateAsync({ bookId, action: "archive" }),
      restore: () => booksApi.action(bookId, "restore").then(() => refreshBookStatus(qc, bookId)),
      show: toast.show,
      errorText: apiErrorText,
    }).then(close, () => undefined); // a failed archive shows in the banner from act.error
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="sm"
      closeOnScrim={false}
      title={`Archive ${title}?`}
      description="The book leaves the Library and the Published shelf. Its files stay, and you can restore it from the Archive."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" icon={Archive} loading={act.isPending} loadingLabel="Archiving" onClick={submit}>
            Archive book
          </Button>
        </>
      }
    >
      {act.isError && (
        <Banner tone="error" title="Not archived">
          {apiErrorText(act.error)}
        </Banner>
      )}
    </Modal>
  );
}

interface ActionsProps {
  bookId: string;
  title: string;
  /** Offer Mark as published. Use canMarkPublished (not published, not archived). */
  showPublish: boolean;
  /** "buttons" for a screen header, "links" for the small text actions under a Library card. */
  look?: "buttons" | "links" | undefined;
  className?: string | undefined;
}

/** Mark as published and Archive, each with its own confirm dialog. Only for server books the owner can change. */
export function BookStatusActions({ bookId, title, showPublish, look = "buttons", className }: ActionsProps) {
  const [open, setOpen] = useState<"publish" | "archive" | null>(null);
  const close = () => setOpen(null);
  const link = "hit-44 relative rounded-xs text-small font-semibold text-select underline underline-offset-2";

  return (
    <div className={cn("flex flex-wrap items-center", look === "links" ? "gap-x-3 gap-y-1" : "gap-2", className)}>
      {showPublish &&
        (look === "links" ? (
          <button type="button" className={link} onClick={() => setOpen("publish")} aria-label={`Mark as published: ${title}`}>
            Mark as published
          </button>
        ) : (
          <Button variant="secondary" icon={BookCheck} onClick={() => setOpen("publish")}>
            Mark as published
          </Button>
        ))}
      {look === "links" ? (
        <button type="button" className={link} onClick={() => setOpen("archive")} aria-label={`Archive ${title}`}>
          Archive
        </button>
      ) : (
        <Button variant="ghost" icon={Archive} onClick={() => setOpen("archive")}>
          Archive
        </Button>
      )}
      {open === "publish" && <MarkPublishedDialog open onClose={close} bookId={bookId} title={title} />}
      {open === "archive" && <ArchiveBookDialog open onClose={close} bookId={bookId} title={title} />}
    </div>
  );
}
