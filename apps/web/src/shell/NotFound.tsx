import { Link } from "react-router";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";

/** Unknown route or unknown book id. */
export function NotFound({ what = "page" }: { what?: "page" | "book" | "profile" }) {
  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-8 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <PageHeader title={what === "book" ? "Book not found" : what === "profile" ? "Profile not found" : "Page not found"} />
      <EmptyState
        drawing="search"
        title={
          what === "book" ? "There is no book at this address" : what === "profile" ? "There is no profile at this address" : "There is nothing at this address"
        }
        body="It may have been archived, or the link is out of date."
        action={
          <Link
            to="/"
            className="inline-flex h-10 items-center rounded-sm bg-accent px-4 text-label font-semibold text-on-accent shadow-button hover:bg-accent-hover"
          >
            Go to Library
          </Link>
        }
      />
    </div>
  );
}
