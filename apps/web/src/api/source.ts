/* Data source switch: "api" when the Volume server answers GET /api/v1/health, "mock" otherwise.
   The hosted build (Clerk sign-in) is always "api"; only local development falls back to demo data.
   Screens keep their mock data as the fallback, so the prototype still works with the server off:

     const source = useDataSource();
     const books = useBooks();
     const list = source === "api" && books.data ? books.data.map((b) => toPrototypeBook(b)) : mockBooks;

   The health check runs once on load, then every 30 seconds, so starting or stopping the server
   switches the screens over without a reload. */

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./hooks";
import { systemApi } from "./system";
import type { HealthResponse } from "./types";
import { hostedSignIn } from "../auth/HostedAuth";

export type DataSource = "api" | "mock";

export interface DataSourceState {
  source: DataSource;
  /** True until the first health check has answered or failed. */
  checking: boolean;
  /** True when the last health check failed. On the hosted app the screens stay on real data and say so. */
  down: boolean;
  health: HealthResponse | null;
}

const HEALTH_POLL_MS = 30_000;

export function useDataSourceState(): DataSourceState {
  const q = useQuery({
    queryKey: queryKeys.system.health(),
    queryFn: ({ signal }) => systemApi.health({ signal }),
    retry: false,
    // A new health observer must not restart an errored initial request. A mode switch
    // mounts/unmounts feature consumers; retrying on each mount creates a request loop.
    retryOnMount: false,
    refetchInterval: HEALTH_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
  const up = q.isSuccess && !q.isError && q.data.database.status === "ok";
  // The hosted app never falls back to sample data: a failed check there means the server or the
  // connection is down, and sample books shown as if they were real would mislead the owner.
  const source: DataSource = up || hostedSignIn ? "api" : "mock";
  return { source, checking: q.isPending, down: !q.isPending && !up, health: q.data ?? null };
}

/** "api" when the server answers its health check, "mock" otherwise (including while checking). */
export function useDataSource(): DataSource {
  return useDataSourceState().source;
}
