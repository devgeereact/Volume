/* Connection state for this page session (D-061).

   Demo sample data is for a local build that has NEVER reached the API in this page session. Once the
   API has answered the health check at least once, a later failure keeps the last real data on screen
   (the TanStack Query cache), shows the "Not connected" banner, refuses writes with a plain reason, polls
   again with backoff, and refetches everything when the API answers.

   How the cache is kept: when the health check fails after a real connection, TanStack's online manager is set
   to offline. Queries then pause instead of failing, so they keep their data and their success status, and
   every screen keeps showing it with no change of its own. When the health check answers again the online
   manager is set back and the paused queries run. This module holds only that state; the health query
   itself is in source.ts. */

import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { ApiError } from "./client";

export interface ConnectionSnapshot {
  /** True once the API has answered the health check in this page session. Never goes back to false. */
  everConnected: boolean;
  /** True from a failed health check (or a failed call) after a real connection until the API answers again. */
  offline: boolean;
  /** Failed health checks in a row, for the backoff. */
  failures: number;
}

const HEALTH_POLL_MS = 30_000;
const BACKOFF_FIRST_MS = 2_000;

let state: ConnectionSnapshot = { everConnected: false, offline: false, failures: 0 };
const listeners = new Set<() => void>();
let reconnectHandler: (() => void) | null = null;

function set(next: ConnectionSnapshot): void {
  if (next.everConnected === state.everConnected && next.offline === state.offline && next.failures === state.failures) return;
  state = next;
  for (const l of listeners) l();
}

export const connection = {
  /** For useSyncExternalStore. */
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot: (): ConnectionSnapshot => state,
  /** The API answered. Clears the offline state; the first answer is what switches demo data off for good. */
  markConnected(): void {
    const wasOffline = state.offline;
    set({ everConnected: true, offline: false, failures: 0 });
    if (wasOffline) {
      onlineManager.setOnline(true);
      reconnectHandler?.();
    }
  },
  /** The health check failed. Before any real connection this changes nothing but the failure count. */
  markFailed(): void {
    const offline = state.everConnected;
    set({ ...state, offline, failures: state.failures + 1 });
    if (offline) onlineManager.setOnline(false);
  },
  /** A data call failed with no answer at all (fetch threw). Only meaningful after a real connection. */
  reportNetworkFailure(): void {
    if (state.everConnected && !state.offline) connection.markFailed();
  },
  /** Called once when the API answers after being offline: refetch what the screens show. */
  onReconnect(handler: (() => void) | null): void {
    reconnectHandler = handler;
  },
  /** Tests only: forget everything, as a fresh page load does. */
  reset(): void {
    onlineManager.setOnline(true);
    reconnectHandler = null;
    set({ everConnected: false, offline: false, failures: 0 });
  },
};

/** How long to wait before the next health check: every 30 s while fine, 2 s doubling up to 30 s while offline. */
export function healthRefetchMs(snap: ConnectionSnapshot = state): number {
  if (!snap.everConnected || snap.failures === 0) return HEALTH_POLL_MS;
  return Math.min(HEALTH_POLL_MS, BACKOFF_FIRST_MS * 2 ** (snap.failures - 1));
}

/** Refetch everything the screens show once the API is back, and refresh the health check itself. */
export function refetchOnReconnect(qc: QueryClient): void {
  connection.onReconnect(() => void qc.invalidateQueries());
}

/** What a write gets while the API is not answering. */
export const NOT_CONNECTED_WRITE_MESSAGE = "Not connected, so this change was not saved. Volume keeps trying and you can try again when the banner clears.";

export function notConnectedWriteError(): ApiError {
  return new ApiError(0, "not_connected", NOT_CONNECTED_WRITE_MESSAGE);
}

/** Throws the plain error for a write when the API is not answering after a real connection. */
export function assertConnectedForWrite(): void {
  if (state.offline) throw notConnectedWriteError();
}
