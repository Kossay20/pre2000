import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
    getNotificationPermissionState,
    NotificationPermissionState,
} from '../services/notificationService';

/**
 * The current notification permission, kept fresh.
 *
 * Permission changes outside the screen that shows it: in the system settings,
 * or from another screen of the app. Read once on mount, a banner kept asking
 * after she had said yes in Settings, and stayed hidden after she revoked it in
 * the OS. It is read again every time the app comes back to the foreground;
 * screens that stay mounted behind a tab also call `refresh` on focus.
 *
 * `state` is null until the first read answers, so nothing flashes in.
 */
export const useNotificationPermissionState = (): {
    state: NotificationPermissionState | null;
    refresh: () => Promise<NotificationPermissionState>;
} => {
    const [state, setState] = useState<NotificationPermissionState | null>(null);
    const mounted = useRef(true);

    const refresh = useCallback(async () => {
        const next = await getNotificationPermissionState();
        if (mounted.current) setState(next);
        return next;
    }, []);

    useEffect(() => {
        mounted.current = true;
        refresh();
        const sub = AppState.addEventListener('change', (appState) => {
            if (appState === 'active') refresh();
        });
        return () => {
            mounted.current = false;
            sub.remove();
        };
    }, [refresh]);

    return { state, refresh };
};
