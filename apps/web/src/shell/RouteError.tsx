import { Link, isRouteErrorResponse, useRouteError } from "react-router";
import { Banner } from "../components/ui/Banner";
import { Button, buttonClasses } from "../components/ui/Button";

/**
 * Error boundary for routes: what happened in plain words, a way to try again and a way back to the
 * Library. Never a stack trace. Screens sit under a boundary inside their layout, so the shell stays.
 */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "Something on this screen stopped working.";
  return (
    <div className="mx-auto grid w-full max-w-[760px] gap-4 px-4 py-10">
      <Banner
        tone="error"
        title="This screen could not load"
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => window.location.reload()}>
              Reload
            </Button>
            <Link to="/" className={buttonClasses("ghost", "sm")}>
              Go to Library
            </Link>
          </div>
        }
      >
        {message} Reload to try again, or go back to the Library. Your books are not affected.
      </Banner>
    </div>
  );
}
