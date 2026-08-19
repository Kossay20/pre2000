/**
 * The transition logic behind `useRefetchOnReconnect`, kept pure so it can be
 * tested without a React renderer (same split as Badge.helpers / Button.helpers).
 *
 * Deciding "did we just come back online" is the whole difficulty. NetInfo emits
 * on every change, including transport switches and its own probing state, and a
 * hook that refetches on the wrong edge is its own bug — a spurious refetch on
 * cold start doubles every screen's first load.
 */

/** NetInfo reports `null` while it is still probing reachability. */
export type Reachability = boolean | null | undefined;

export interface ReconnectDetector {
  /**
   * Feed one NetInfo reading. Returns true exactly on an offline → online edge.
   */
  observe: (reachable: Reachability) => boolean;
}

export const createReconnectDetector = (): ReconnectDetector => {
  // `null` means "no definite reading yet", which is not the same as "was
  // offline" — otherwise the first definite `true` after mount reads as a
  // reconnection and every screen fetches twice on cold start.
  let previous: boolean | null = null;

  return {
    observe(reachable: Reachability): boolean {
      if (reachable === null || reachable === undefined) return false;

      const cameBack = previous === false && reachable === true;
      previous = reachable;
      return cameBack;
    },
  };
};

/**
 * `isInternetReachable` is the right signal, not `isConnected`: a phone attached
 * to a captive-portal Wi-Fi is connected and cannot reach Firestore.
 */
export const REACHABILITY_FIELD = 'isInternetReachable' as const;
