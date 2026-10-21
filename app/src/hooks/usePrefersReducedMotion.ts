import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * DS-3: Respect the OS "reduce motion" accessibility setting.
 *
 * This is the primitive that later waves consume to gate animations
 * (e.g. skip fade/slide transitions when the user prefers reduced motion).
 *
 * Two consumption paths:
 *   - `usePrefersReducedMotion()` — React hook, re-renders on OS setting change.
 *   - `getReducedMotionSync()` — module-level cached snapshot for non-hook
 *     callers (e.g. animation builders that can't use hooks). The cache is
 *     primed lazily on first hook mount and kept fresh by the same listener.
 *
 * Cross-platform: on web `react-native` resolves to `react-native-web`, whose
 * `AccessibilityInfo` proxies `window.matchMedia('(prefers-reduced-motion: reduce)')`.
 * The `reduceMotionChanged` event + `isReduceMotionEnabled()` Promise API is the
 * same shape on RN 0.81 and react-native-web, so no platform branch is needed.
 */

// Module-level cache for non-hook callers. Defaults to false (motion allowed)
// until the async query resolves — the safe default that matches RN behaviour.
let reducedMotionCache = false;

/**
 * Synchronous snapshot of the last-known reduce-motion setting, for callers
 * that cannot use the hook. Returns `false` until a `usePrefersReducedMotion`
 * consumer has mounted at least once and the initial query has resolved.
 */
export const getReducedMotionSync = (): boolean => reducedMotionCache;

export const usePrefersReducedMotion = (): boolean => {
    const [reducedMotion, setReducedMotion] = useState<boolean>(reducedMotionCache);

    useEffect(() => {
        let isMounted = true;

        const update = (value: boolean) => {
            reducedMotionCache = value;
            if (isMounted) setReducedMotion(value);
        };

        // Prime with the current OS value on mount.
        AccessibilityInfo.isReduceMotionEnabled()
            .then(update)
            .catch(() => {
                // Querying the setting can reject on some platforms; fall back to
                // the safe default (motion allowed) rather than throwing.
                update(false);
            });

        // Subscribe to live changes. RN 0.65+ / react-native-web return a
        // subscription with `.remove()`; the handler receives the new boolean.
        const subscription = AccessibilityInfo.addEventListener(
            'reduceMotionChanged',
            update
        );

        return () => {
            isMounted = false;
            subscription.remove();
        };
    }, []);

    return reducedMotion;
};
