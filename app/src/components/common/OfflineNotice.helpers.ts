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
