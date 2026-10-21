/**
 * Reconnection edge detection.
 *
 * The bug this closes: NetInfo had exactly one subscriber in the whole app —
 * `OfflineNotice` — and it only showed and hid a banner. Reads are one-shot
 * `getDocs`, so the SDK has nothing to re-deliver, and `retryOperation` gives up
 * after roughly seven seconds. Coming out of a tunnel left the screen on its
 * error card indefinitely, under a banner that had just disappeared.
 *
 * Most of what matters here is *not* firing. A detector that triggers on mount,
 * on NetInfo's probing state, or on a transport switch turns one missing refetch
 * into a duplicated fetch on every screen.
 */
import { createReconnectDetector } from '../useRefetchOnReconnect.helpers';

describe('createReconnectDetector', () => {
  it('fires on an offline → online edge', () => {
    const detector = createReconnectDetector();

    expect(detector.observe(false)).toBe(false);
    expect(detector.observe(true)).toBe(true);
  });

  it('does not fire on the first definite reading, even when online', () => {
    // Mounting while connected is not a reconnection; treating it as one makes
    // every screen fetch twice on cold start.
    const detector = createReconnectDetector();

    expect(detector.observe(true)).toBe(false);
  });

  it('ignores the probing state entirely', () => {
    const detector = createReconnectDetector();

    expect(detector.observe(null)).toBe(false);
    expect(detector.observe(undefined)).toBe(false);
    expect(detector.observe(true)).toBe(false);
  });

  it('does not let a probing reading erase a known-offline state', () => {
    // NetInfo can interleave `null` while re-probing; the pending reconnection
    // must survive it.
    const detector = createReconnectDetector();

    detector.observe(false);
    expect(detector.observe(null)).toBe(false);
    expect(detector.observe(true)).toBe(true);
  });

  it('does not fire on a transport change that kept reachability', () => {
    // Wi-Fi → cellular mid-screen: connected throughout, nothing to recover.
    const detector = createReconnectDetector();

    detector.observe(true);
    expect(detector.observe(true)).toBe(false);
    expect(detector.observe(true)).toBe(false);
  });

  it('does not fire when going offline', () => {
    const detector = createReconnectDetector();

    detector.observe(true);
    expect(detector.observe(false)).toBe(false);
  });

  it('fires again on every subsequent round trip', () => {
    const detector = createReconnectDetector();
    const edges = [false, true, false, true, false, true].map((r) => detector.observe(r));

    expect(edges).toEqual([false, true, false, true, false, true]);
  });

  it('fires once per edge, not once per online reading', () => {
    const detector = createReconnectDetector();

    detector.observe(false);
    expect(detector.observe(true)).toBe(true);
    expect(detector.observe(true)).toBe(false);
    expect(detector.observe(true)).toBe(false);
  });

  it('keeps two detectors independent', () => {
    // Each subscription owns its state; a shared module-level flag would make one
    // screen's reconnection swallow another's.
    const a = createReconnectDetector();
    const b = createReconnectDetector();

    a.observe(false);
    expect(b.observe(true)).toBe(false);
    expect(a.observe(true)).toBe(true);
  });
});
