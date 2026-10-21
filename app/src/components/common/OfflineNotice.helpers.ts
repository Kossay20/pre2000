/**
 * When the offline banner should show — kept pure so it can be tested without
 * a React renderer (same split as useRefetchOnReconnect.helpers).
 *
 * Only a definite `false` counts: NetInfo reports `null` while it is still
 * probing, and a banner that flashes on every cold start is its own bug. The
 * connection `type` is not consulted — on web it stays "unknown" even when the
 * browser is offline, which used to keep the banner hidden there for good.
 */
export interface NetReading {
  isConnected: boolean | null | undefined;
  isInternetReachable: boolean | null | undefined;
}

export const isDefinitelyOffline = ({ isConnected, isInternetReachable }: NetReading): boolean =>
  isConnected === false || isInternetReachable === false;

/** The two members of `window` the bridge needs; lets tests pass a fake. */
export interface ConnectivityEventTarget {
  addEventListener: (type: 'online' | 'offline', listener: () => void) => void;
  removeEventListener: (type: 'online' | 'offline', listener: () => void) => void;
}

/**
 * Web only: re-read connectivity whenever the browser fires `online` / `offline`.
 *
 * NetInfo's web module listens to those two events only when the browser has no
 * NetworkInformation API. Where it has one (Chromium), it listens to that object's
 * `change` event instead — which is not guaranteed to fire when the connection
 * drops, and did not in the release capture: the banner never appeared and
 * `useRefetchOnReconnect` never saw the return. `refresh` is `NetInfo.refresh`,
 * which re-reads `navigator.onLine` and notifies every NetInfo subscriber, so the
 * banner and the refetch hook keep a single source of truth.
 *
 * Without a target (native, SSR) this does nothing. Returns the unsubscribe.
 */
export const bridgeBrowserConnectivity = (
  target: ConnectivityEventTarget | null | undefined,
  refresh: () => unknown,
): (() => void) => {
  if (!target || typeof target.addEventListener !== 'function') {
    return () => {};
  }
  const onChange = () => { refresh(); };
  target.addEventListener('online', onChange);
  target.addEventListener('offline', onChange);
  return () => {
    target.removeEventListener('online', onChange);
    target.removeEventListener('offline', onChange);
  };
};
