/* Data source switch: "api" when the Volume server answers GET /api/v1/health, "mock" otherwise.
   The hosted build (Clerk sign-in) is always "api"; only local development falls back to demo data.
   Screens keep their mock data as the fallback, so the prototype still works with the server off:

     const source = useDataSource();
     const books = useBooks();
     const list = source === "api" && books.data ? books.data.map((b) => toPrototypeBook(b)) : mockBooks;

   The health check runs once on load, then every 30 seconds, so starting the server switches the screens over
   without a reload. Sample data is only for a page that has never reached the API (D-061): after one real
   answer the screens stay on the API source and a later failure is handled by the offline state in connection.ts. */

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { connection, healthRefetchMs, type ConnectionSnapshot } from "./connection";
import { queryKeys } from "./hooks";
import { systemApi } from "./system";
import type { HealthResponse } from "./types";
import { hostedSignIn } from "../auth/HostedAuth";

export type DataSource = "api" | "mock";

export interface DataSourceState {
  source: DataSource;
  /** True until the first health check has answered or failed. */
  checking: boolean;
  /** True when the last health check failed. The screens keep the last real data once the API has answered (D-061). */
  down: boolean;
  /** True once the API has answered in this page session. Sample data is never shown after that. */
  everConnected: boolean;
  health: HealthResponse | null;
}

/** The health check, with the connection state kept up to date from its result. */
export function healthQueryOptions() {
  return {
    queryKey: queryKeys.system.health(),
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<HealthResponse> => {
      try {
        const health = await systemApi.health({ signal });
        if (health.database.status === "ok") connection.markConnected();
        else connection.markFailed();
        return health;
      } catch (err) {
        if (!signal.aborted) connection.markFailed();
        throw err;
      }
    },
    // The check itself must run while the rest of the app is paused as offline.
    networkMode: "always" as const,
    retry: false as const,
    // A new health observer must not restart an errored initial request. A mode switch
    // mounts/unmounts feature consumers; retrying on each mount creates a request loop.
    retryOnMount: false,
    // Every 30 s while fine; after a real connection drops, 2 s doubling up to 30 s (backoff).
    refetchInterval: () => healthRefetchMs(),
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  };
}

/** Which source the screens read, from the last health result and the connection state (D-061). Pure, for tests. */
export function deriveDataSource(
  q: { isPending: boolean; isSuccess: boolean; isError: boolean; data: HealthResponse | undefined },
  conn: ConnectionSnapshot,
  hosted: boolean,
): Omit<DataSourceState, "health"> {
  const up = q.isSuccess && !q.isError && q.data !== undefined && q.data.database.status === "ok";
  // Sample data only while this page has never reached the API. After one real answer the source stays "api",
  // so a dead server cannot swap real books for invented ones. The hosted app never shows sample data at all.
  const source: DataSource = up || conn.everConnected || hosted ? "api" : "mock";
  return { source, checking: q.isPending, down: !q.isPending && !up, everConnected: conn.everConnected };
}

export function useDataSourceState(): DataSourceState {
  const q = useQuery(healthQueryOptions());
  const conn = useSyncExternalStore(connection.subscribe, connection.snapshot, connection.snapshot);
  return { ...deriveDataSource(q, conn, hostedSignIn), health: q.data ?? null };
}

/** "api" when the server answers its health check, "mock" otherwise (including while checking). */
export function useDataSource(): DataSource {
  return useDataSourceState().source;
}
