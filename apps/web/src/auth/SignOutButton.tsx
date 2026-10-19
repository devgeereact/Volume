import { useClerk } from "@clerk/react";
import { Button } from "../components/ui/Button";
import { hostedSignIn } from "./HostedAuth";

function HostedSignOut() {
  const { signOut } = useClerk();
  return (
    <Button variant="primary" onClick={() => void signOut()}>
      Sign out
    </Button>
  );
}

/** Signs out with hosted sign-in. Locally there is no sign-in, so it opens Volume again from the start. */
export function SignOutButton() {
  if (hostedSignIn) return <HostedSignOut />;
  return (
    <Button variant="primary" onClick={() => window.location.assign("/")}>
      Open Volume again
    </Button>
  );
}
