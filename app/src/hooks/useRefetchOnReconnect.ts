import { useEffect, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { createReconnectDetector } from './useRefetchOnReconnect.helpers';

/**
 * Re-run a fetch when connectivity comes back.
 *
 * The app knew it was offline — `OfflineNotice` subscribes to NetInfo — but that
 * was the only subscriber in the codebase, and all it did was show and hide a
 * banner. Nothing reacted to the *return* of connectivity.
 *
 * That leaves a real dead end. Reads are one-shot `getDocs` calls, not
 * subscriptions, so the Firestore SDK has nothing to re-deliver on reconnect, and
 * `retryOperation` backs off three times over roughly seven seconds and then
 * gives up for good. Go through a tunnel with the app open and you come out to a
 * screen still showing its error card — while the offline banner disappearing
 * has just told you everything is fine.
 *
 * The edge detection lives in `useRefetchOnReconnect.helpers` so it can be tested
 * without a React renderer.
 */
export const useRefetchOnReconnect = (refetch: () => void, enabled = true): void => {
  // Held in a ref so a caller passing an inline arrow does not resubscribe on
  // every render. Resubscribing would build a fresh detector and lose the
  // offline reading, swallowing the very edge this hook exists to catch.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!enabled) return;

    const detector = createReconnectDetector();
    return NetInfo.addEventListener((state: NetInfoState) => {
      if (detector.observe(state.isInternetReachable)) {
        refetchRef.current();
      }
    });
  }, [enabled]);
};
