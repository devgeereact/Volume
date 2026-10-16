import { UserButton } from "@clerk/react";
import { hostedSignIn } from "./HostedAuth";

/** The signed-in account menu (sign out, manage account). Shown only when the build uses hosted sign-in. */
export function AccountButton() {
  if (!hostedSignIn) return null;
  return <UserButton />;
}
