import { isDefinitelyOffline } from '../OfflineNotice.helpers';

describe('isDefinitelyOffline', () => {
  it('stays hidden while NetInfo is still probing', () => {
    expect(isDefinitelyOffline({ isConnected: null, isInternetReachable: null })).toBe(false);
    expect(isDefinitelyOffline({ isConnected: undefined, isInternetReachable: undefined })).toBe(false);
  });

  it('stays hidden when online', () => {
    expect(isDefinitelyOffline({ isConnected: true, isInternetReachable: true })).toBe(false);
    expect(isDefinitelyOffline({ isConnected: true, isInternetReachable: null })).toBe(false);
  });

  it('shows when the device has no connection, whatever the transport type', () => {
    // Web: type stays "unknown" offline; isConnected is the only definite signal.
    expect(isDefinitelyOffline({ isConnected: false, isInternetReachable: null })).toBe(true);
  });

  it('shows on a connection that cannot reach the internet (captive portal)', () => {
    expect(isDefinitelyOffline({ isConnected: true, isInternetReachable: false })).toBe(true);
  });
});
