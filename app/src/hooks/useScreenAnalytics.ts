import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { analyticsService } from '../services/analyticsService';

/**
 * useScreenAnalytics — drop-in hook for Firebase screen tracking.
 *
 * Uses useFocusEffect so the view is re-logged every time the screen
 * comes back into focus (tabs, back navigation, modal dismissal).
 *
 * Usage:
 *   useScreenAnalytics('HomeScreen');
 *
 * @param screenName  Exact screen name logged to Firebase Analytics.
 * @param params      Optional extra params sent with the screen_view event.
 */
export const useScreenAnalytics = (
    screenName: string,
    params?: Record<string, string | number | boolean>
): void => {
    const hasFiredRef = useRef(false);

    // PERF FIX (W2-003): useFocusEffect re-runs whenever its callback IDENTITY changes.
    // A bare inline callback is recreated every render, so on screens that re-render in a
    // loop (e.g. ArticleDetail's per-paragraph onLayout cascade) screen_view fired 300-600×
    // in 3s. Memoizing on [screenName] gives a stable callback → it fires once per focus.
    // `params` is intentionally excluded from deps (logged once, guarded by hasFiredRef).
    const onFocus = useCallback(() => {
        analyticsService.logScreenView(screenName, screenName);

        if (!hasFiredRef.current && params) {
            analyticsService.logEvent('screen_params', { screen: screenName, ...params });
            hasFiredRef.current = true;
        }
    }, [screenName]); // eslint-disable-line react-hooks/exhaustive-deps

    useFocusEffect(onFocus);
};
