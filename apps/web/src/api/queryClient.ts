/* The one QueryClient for the app (main.tsx wraps the app in its provider). */
import { QueryClient } from "@tanstack/react-query";
import { isApiError } from "./client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Do not retry what will fail again: 4xx answers and a stopped server.
      retry: (failureCount, error) => {
        if (isApiError(error) && (error.status === 0 || (error.status >= 400 && error.status < 500))) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});
