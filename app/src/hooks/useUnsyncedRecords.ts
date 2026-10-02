import { useCallback, useEffect, useRef, useState } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';
import { countUnsyncedTrackerRecords } from '../services/trackerLogout';
import { isDefinitelyOffline } from '../components/common/OfflineNotice.helpers';

/** After a connectivity change the pending sends need a moment before the count drops. */
const RECHECK_AFTER_CHANGE_MS = 4000;

/**
 * What the Profile card needs to say the truth about "synced to the cloud": whether the
 * device is offline and how many records are still waiting to go up — the same counter the
 * logout guard asks (settleTrackersBeforeLogout), so the card and the guard cannot disagree.
 * `refresh` re-reads the count (call it when the screen gains focus).
 */
export const useUnsyncedRecords = (): { pending: number; offline: boolean; refresh: () => void } => {
    const netInfo = useNetInfo();
    const offline = isDefinitelyOffline(netInfo);
    const [pending, setPending] = useState(0);
    const alive = useRef(true);

    const refresh = useCallback(() => {
        countUnsyncedTrackerRecords()
            .then((n) => { if (alive.current) setPending(n); })
            .catch(() => { /* an unreadable counter must not claim records are waiting */ });
    }, []);

    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
    }, []);

    useEffect(() => {
        refresh();
        const id = setTimeout(refresh, RECHECK_AFTER_CHANGE_MS);
        return () => clearTimeout(id);
    }, [offline, refresh]);

    return { pending, offline, refresh };
};
