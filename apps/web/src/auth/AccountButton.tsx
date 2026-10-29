import { UserButton, useUser } from "@clerk/react";
import { hostedSignIn } from "./HostedAuth";

/** The signed-in account menu (sign out, manage account). Shown only when the build uses hosted sign-in. */
export function AccountButton() {
  if (!hostedSignIn) return null;
  return <UserButton />;
}

/** The signed-in person's name from Clerk, or null until it loads. Call only when hostedSignIn is true. */
export function useHostedName(): string | null {
  const { user } = useUser();
  if (!user) return null;
  return user.fullName ?? user.primaryEmailAddress?.emailAddress ?? null;
}
