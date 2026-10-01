import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { usePregnancy } from '../context/PregnancyContext';
import { Week } from '../types';
import { getLocalWeek } from '../services/localContentFallback';
import { FIRESTORE_GUEST_TIMEOUT_MS, withTimeout } from '../utils/withTimeout';
import { createLogger } from '../utils/logger';
import { displayedAgeOf } from '../utils/pregnancyCalculator';
const log = createLogger('useCurrentWeek');

export const useCurrentWeek = (weekNumber?: number) => {
    const { pregnancyInfo, loading: contextLoading } = usePregnancy();
    const [weekData, setWeekData] = useState<Week | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // T7-FIX-F63 : nonce permet de retrigger le fetch via refetch() sans démonter le composant
    const [nonce, setNonce] = useState(0);

    const targetWeek = weekNumber || pregnancyInfo?.week || 1;
    const currentDay = pregnancyInfo?.dayInWeek || 1;
    // Her real age as printed — never the previewed `weekNumber`, never capped at the
    // last content week: past the due date `targetWeek` stays on 40 for the content
    // while the label reads 41, 42 (see displayedPregnancyAge).
    const displayed = displayedAgeOf(pregnancyInfo);

    const refetch = useCallback(() => {
        setError(null);
        setLoading(true);
        setNonce(n => n + 1);
    }, []);

    useEffect(() => {
        let isMounted = true;
        const fetchWeekData = async () => {
            if (contextLoading && !weekNumber) return;

            // If fetching specific week, we don't need to wait for pregnancyInfo unless we need it for default
            if (!weekNumber && !pregnancyInfo) {
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const weekDocRef = doc(db, 'weeks', String(targetWeek));
                const weekDoc = await withTimeout(getDoc(weekDocRef), FIRESTORE_GUEST_TIMEOUT_MS);

                if (!isMounted) return; // Race condition protection

                if (weekDoc.exists()) {
                    setWeekData(weekDoc.data() as Week);
                    setError(null);
                } else {
                    // CLUSTER-2: Firestore returned no doc (empty collection / missing
                    // week). Fall back to bundled local data so guests see content.
                    const local = getLocalWeek(targetWeek);
                    if (local) {
                        setWeekData(local);
                        setError(null);
                    } else {
                        setError('common.errors.weekDataNotFound');
                    }
                }
            } catch (err: any) {
                if (!isMounted) return;
                // Ignore AbortError and network errors to prevent console spam
                if (err.name !== 'AbortError' && err.code !== 'unavailable') {
                    log.warn('Error fetching week data:', err.message);
                }
                // CLUSTER-2: Firestore read failed (permission-denied for guests when
                // Anonymous Auth is off, or offline). Fall back to bundled local data
                // and clear the error so Home renders content instead of "Oups".
                const local = getLocalWeek(targetWeek);
                if (local) {
                    setWeekData(local);
                    setError(null);
                } else {
                    setError('common.errors.loadingFailed');
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchWeekData();

        return () => { isMounted = false; };
    }, [pregnancyInfo, contextLoading, targetWeek, nonce]);

    return {
        weekData,
        loading: loading || (contextLoading && !weekNumber),
        error,
        currentWeekNumber: targetWeek,
        currentDay,
        displayWeek: displayed.week,
        dayOfPregnancy: displayed.dayOfPregnancy,
        isInvalid: pregnancyInfo?.isInvalid || false,
        isPostTerm: pregnancyInfo?.isPostTerm || false,
        completedWeeks: pregnancyInfo?.completedWeeks,
        completedDays: pregnancyInfo?.completedDays,
        refetch,
    };
};
