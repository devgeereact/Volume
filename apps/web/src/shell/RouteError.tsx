import { isRouteErrorResponse, useRouteError } from "react-router";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";

/** Error boundary for routes: what happened in plain words and a way to try again. Never a stack trace. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : "Something on this screen stopped working.";
  return (
    <div className="mx-auto grid w-full max-w-[760px] gap-4 px-4 py-10">
      <Banner
        tone="error"
        title="This screen could not load"
        action={
          <Button size="sm" onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      >
        {message} Reload to try again. Your books are not affected.
      </Banner>
    </div>
  );
}
