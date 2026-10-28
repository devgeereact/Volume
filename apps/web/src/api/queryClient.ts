/* The one QueryClient for the app (app/Providers.tsx supplies its provider). */
import { MutationCache, QueryClient } from "@tanstack/react-query";
import { isApiError } from "./client";
import { assertConnectedForWrite, connection, refetchOnReconnect } from "./connection";
import { queryKeys } from "./hooks";

/** Builds a client with the app's rules. Tests build their own; the app uses `queryClient` below. */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    // A write while the API is not answering stops here with a plain reason (D-061). The screen shows it
    // like any other failed save, and nothing is queued to run later behind the owner's back.
    mutationCache: new MutationCache({ onMutate: () => assertConnectedForWrite() }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (failureCount, error) => {
          if (isApiError(error) && error.status === 0) {
            // No answer at all after a real connection: the server dropped. Keep the data, go offline (queries
            // pause) and have the health check look again at once; this query resumes when the API is back.
            if (connection.snapshot().everConnected) {
              const first = !connection.snapshot().offline;
              connection.reportNetworkFailure();
              if (first) void client.refetchQueries({ queryKey: queryKeys.system.health() });
              return true;
            }
            return false;
          }
          // Do not retry what will fail again: 4xx answers.
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      // Writes never wait for the network to come back: they fail at once with the reason.
      mutations: { retry: false, networkMode: "always" },
    },
  });
  refetchOnReconnect(client);
  return client;
}

export const queryClient = createQueryClient();
