/* Job errors in plain words. The server sends a job's `error` text with an `errorCode`; a few codes
   get a message that says what happened and what to do next. Applied where job records enter the
   app (jobs.ts fetchers, the SSE job.status handler in events.ts), so every screen shows the same words. */

const PLAIN_BY_CODE: Readonly<Record<string, string>> = {
  ai_credits: "OpenRouter has no credit left. Top up at openrouter.ai, then retry.",
  guest_ai_disabled:
    "AI runs are not switched on for this workspace. The owner of this Volume sets a monthly cap for other workspaces in Settings. Ask them to set one, then retry.",
  output_truncated:
    "The AI's answer was cut off before it finished, so it was not used. Raise max tokens for this step in Settings, or pick another model, then retry.",
};

/** The plain message for a known error code, otherwise the error text unchanged (null stays null). */
export function plainJobError(error: string | null | undefined, code: string | null | undefined): string | null {
  const plain = code ? PLAIN_BY_CODE[code] : undefined;
  if (plain !== undefined) return plain;
  return error ?? null;
}

/** A job record with its error replaced by plainJobError. Records without an error come back as they are. */
export function withPlainJobError<T extends { error: string | null; errorCode?: string | null }>(job: T): T {
  const error = plainJobError(job.error, job.errorCode);
  return error === job.error ? job : { ...job, error };
}

/** The job already working on it, from a 409 conflict's details (recheck, claim suggest). */
export function runningJob(details: unknown): string | null {
  const id = details && typeof details === "object" ? (details as { jobId?: unknown }).jobId : undefined;
  return typeof id === "string" ? id : null;
}
