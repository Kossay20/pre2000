import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { usePregnancy } from '../context/PregnancyContext';
import { Week } from '../types';
import { createLogger } from '../utils/logger';
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
                const weekDoc = await getDoc(weekDocRef);

                if (!isMounted) return; // Race condition protection

                if (weekDoc.exists()) {
                    setWeekData(weekDoc.data() as Week);
                } else {
                    setError('common.errors.weekDataNotFound');
                }
            } catch (err: any) {
                if (!isMounted) return;
                // Ignore AbortError and network errors to prevent console spam
                if (err.name !== 'AbortError' && err.code !== 'unavailable') {
                    log.warn('Error fetching week data:', err.message);
                }
                setError('common.errors.loadingFailed');
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
        isInvalid: pregnancyInfo?.isInvalid || false,
        refetch,
    };
};
