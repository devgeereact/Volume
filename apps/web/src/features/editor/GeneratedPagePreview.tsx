import { Link } from "react-router";
import { Banner } from "../../components/ui";
import type { ApiGeneratedPage, ApiOwnerPrompt, ApiPageEdit } from "../../api/types";
import { cn } from "../../lib/cn";

/* The Editor's view of a page the app builds (title page, copyright, contents, About the author, Also by, part dividers) and
   of a page only the owner can write. The text is what the exporters print, sent by the server; nothing here is editable. */

/** Where each edit target lives in the app. */
export function editHref(edit: ApiPageEdit, bookId: string, penNameId: string): string {
  switch (edit.target) {
    case "titles":
      return `/books/${bookId}/titles`;
    case "blueprint":
      return `/books/${bookId}/blueprint`;
    case "profile":
      return `/profiles/${penNameId}`;
    case "published":
      return "/published";
  }
}

interface PreviewProps {
  page: ApiGeneratedPage;
  bookId: string;
  penNameId: string;
  className?: string;
}

/** A read-only preview of a built page, labelled as built from the book, with a link to where it is edited. */
export function GeneratedPagePreview({ page, bookId, penNameId, className }: PreviewProps) {
  return (
    <div className={className}>
      <Banner tone="info" title="Read-only preview">
        {page.note}
        {page.edit && (
          <>
            {" "}
            <Link to={editHref(page.edit, bookId, penNameId)} className="font-semibold text-ink underline underline-offset-2 hover:text-accent-text">
              {page.edit.label}
            </Link>
            .
          </>
        )}
      </Banner>
      {!page.leftOut && (
        <div
          role="group"
          aria-label="Preview of the page as exported"
          className="mt-6 rounded-sm border border-dashed border-border-strong px-5 py-6 font-book text-prose text-ink sm:px-8"
        >
          {page.lines.length === 0 ? (
            <p className="text-ink-secondary">Nothing to show yet.</p>
          ) : (
            page.lines.map((l, i) => (
              <p key={`${i}-${l.text}`} className={cn("mb-2 last:mb-0", l.level === 1 && "pl-6 text-[0.95em] text-ink-secondary")}>
                {l.text}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** A kind prompt for an owner page that is empty (or only the app's placeholder), and what the exported book holds for it. */
export function OwnerPagePrompt({ prompt, className }: { prompt: ApiOwnerPrompt; className?: string }) {
  return (
    <div className={className}>
      <Banner tone="attention" title="This page needs your input">
        {prompt.message}
      </Banner>
      <p className="mt-4 text-small text-ink-secondary">
        {prompt.leftOut ? "In the exported book: " : "In the exported book for now: "}
        <span className="font-book text-ink italic">{prompt.placeholder}</span>
      </p>
    </div>
  );
}
