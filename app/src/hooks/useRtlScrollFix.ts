import { useEffect, useRef } from 'react';
import { Platform, ScrollView } from 'react-native';
import { useRtl } from './useRtl';

/**
 * W5 #4 — fix horizontal ScrollViews under RTL on the web export.
 *
 * RN-Web gives a horizontal ScrollView a NEGATIVE/clamped scrollLeft when document.dir=rtl, so chip
 * rows (filters, categories, related-content) clamp and anything past the viewport becomes unreachable
 * in ar/tn — including the safety filters. Forcing dir=ltr on the scroll node restores standard
 * scrolling; cards keep their logical paddingEnd/marginEnd so they still read correctly. Proven pattern,
 * previously inlined in HomeScreen + BabyEvolutionScreen — extracted here so every list/detail screen
 * shares one correct implementation.
 *
 * Usage: const ref = useRtlScrollFix([items.length]); <ScrollView ref={ref} horizontal …>
 */
export const useRtlScrollFix = (deps: ReadonlyArray<unknown> = []) => {
    const { isRTL } = useRtl();
    const ref = useRef<ScrollView>(null);
    useEffect(() => {
        if (Platform.OS === 'web' && isRTL) {
            const node = ref.current?.getScrollableNode?.();
            if (node && typeof node.setAttribute === 'function') {
                node.setAttribute('dir', 'ltr');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRTL, ...deps]);
    return ref;
};
