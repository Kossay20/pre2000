/**
 * @fileoverview Health Service
 * Manages health metrics tracking including:
 * - Weight tracking with history
 * - Blood pressure monitoring
 * - Health statistics aggregation
 * 
 * @module services/healthService
 */

import { db } from '../config/firebase';
import { collection, addDoc, doc, getDocs, query, setDoc, where, orderBy, Timestamp } from 'firebase/firestore';
import { HealthMetric, HealthStats } from '../types';
import { loadUserEvents } from './calendarService';
import { loadTaskStatusesAuth } from './reminderPersistence';
import { getWeightHistory as getWeightHistoryV2 } from './weightService';
import { createLogger } from '../utils/logger';
import { toLocalDateKey } from '../utils/localDate';

// Create scoped logger for this service
const log = createLogger('HealthService');

// ========================================
// WEIGHT TRACKING
// ========================================

export const saveWeightEntry = async (
    userId: string,
    weight: number,
    date: Date,
    week: number,
    notes?: string
): Promise<string> => {
    // P0 FIX: Block Firestore writes for guest users
    if (!userId || userId.startsWith('guest_')) {
        log.warn('[HealthService] Guest user blocked from Firestore write');
        return 'guest_blocked';
    }
    try {
        const docRef = await addDoc(collection(db, 'healthMetrics'), {
            user_id: userId,
            type: 'weight',
            value: weight,
            date: date.toISOString(),
            week,
            notes: notes || '',
            created_at: Timestamp.now().toDate().toISOString(),
        });
        return docRef.id;
    } catch (error) {
        log.error('Error saving weight entry:', error);
        throw error;
    }
};

export const getWeightHistory = async (userId: string): Promise<HealthMetric[]> => {
    // P0 FIX: Block Firestore reads for guest users
    if (!userId || userId.startsWith('guest_')) {
        log.warn('[HealthService] Guest user blocked from Firestore read (weight)');
        return [];
    }
    try {
        const q = query(
            collection(db, 'healthMetrics'),
            where('user_id', '==', userId),
            where('type', '==', 'weight')
        );
        const snapshot = await getDocs(q);
        const metrics = snapshot.docs.map(doc => ({
            metric_id: doc.id,
            ...doc.data(),
        } as HealthMetric));

        // Sort client-side to avoid Firestore composite index requirement
        return metrics.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    } catch (error) {
        log.error('Error fetching weight history:', error);
        return [];
    }
};

// ========================================
// BLOOD PRESSURE TRACKING
// ========================================

export const saveBloodPressureEntry = async (
    userId: string,
    systolic: number,
    diastolic: number,
    date: Date,
    week: number,
    notes?: string
): Promise<string> => {
    // P0 FIX: Block Firestore writes for guest users
    if (!userId || userId.startsWith('guest_')) {
        log.warn('[HealthService] Guest user blocked from Firestore write (BP)');
        return 'guest_blocked';
    }
    try {
        const docRef = await addDoc(collection(db, 'healthMetrics'), {
            user_id: userId,
            type: 'blood_pressure',
            value: { systolic, diastolic },
            date: date.toISOString(),
            week,
            notes: notes || '',
            created_at: Timestamp.now().toDate().toISOString(),
        });
        return docRef.id;
    } catch (error) {
        log.error('Error saving BP entry:', error);
        throw error;
    }
};

export const getBloodPressureHistory = async (userId: string): Promise<HealthMetric[]> => {
    // P0 FIX: Block Firestore reads for guest users
    if (!userId || userId.startsWith('guest_')) {
        log.warn('[HealthService] Guest user blocked from Firestore read (BP)');
        return [];
    }
    try {
        const q = query(
            collection(db, 'healthMetrics'),
            where('user_id', '==', userId),
            where('type', '==', 'blood_pressure')
        );
        const snapshot = await getDocs(q);
        const metrics = snapshot.docs.map(doc => ({
            metric_id: doc.id,
            ...doc.data(),
        } as HealthMetric));

        // Sort client-side to avoid Firestore composite index requirement (descending)
        return metrics.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
        log.error('Error fetching BP history:', error);
        return [];
    }
};

// ========================================
// GLUCOSE TRACKING
// ========================================

/** Glucose metric stored in Firestore */
export interface GlucoseEntry {
    id?: string;
    user_id: string;
    value: number;           // mmol/L
    meal_context: 'fasting' | 'post_meal' | 'random';
    date: string;
    week: number;
    notes?: string;
}

export const saveGlucoseEntry = async (
    userId: string,
    entry: Omit<GlucoseEntry, 'id' | 'user_id'>
): Promise<string> => {
    if (!userId || userId.startsWith('guest_')) {
        log.warn('[HealthService] Guest user blocked from glucose write');
        return 'guest_blocked';
    }
    try {
        const docRef = await addDoc(collection(db, 'glucoseMetrics'), {
            user_id: userId,
            ...entry,
            created_at: Timestamp.now().toDate().toISOString(),
        });
        return docRef.id;
    } catch (error) {
        log.error('Error saving glucose entry:', error);
        throw error;
    }
};

export const getGlucoseHistory = async (userId: string): Promise<GlucoseEntry[]> => {
    if (!userId || userId.startsWith('guest_')) {
        return [];
    }
    try {
        const q = query(
            collection(db, 'glucoseMetrics'),
            where('user_id', '==', userId)
        );
        const snapshot = await getDocs(q);
        const entries = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        } as GlucoseEntry));
        return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } catch (error) {
        log.error('Error fetching glucose history:', error);
        return [];
    }
};

// ========================================
// SYMPTOMS TRACKING
// ========================================

export type SymptomKey =
    | 'nausea' | 'fatigue' | 'backPain' | 'headache' | 'swelling' | 'insomnia'
    | 'heartburn' | 'cramps' | 'breathlessness';

export interface DailySymptoms {
    id?: string;
    user_id: string;
    date: string;           // ISO date string (day only: YYYY-MM-DD)
    week: number;
    symptoms: SymptomKey[]; // List of symptom keys reported
    notes?: string;
}

export const saveDailySymptoms = async (
    userId: string,
    week: number,
    symptoms: SymptomKey[],
    notes?: string
): Promise<string> => {
    if (!userId || userId.startsWith('guest_')) {
        log.warn('[HealthService] Guest user blocked from symptoms write');
        return 'guest_blocked';
    }
    // The LOCAL day the user is logging for. The UTC day filed an evening entry in New York
    // (or a morning one east of UTC+12) under the wrong date.
    const today = toLocalDateKey(); // YYYY-MM-DD
    // C10/F13: deterministic doc ID eliminates the query→addDoc race window
    // (two concurrent writes for the same day previously could produce 2 docs).
    // Firestore rule constrains logId to `${auth.uid}_YYYY-MM-DD` to prevent
    // cross-user namespace squatting.
    const docId = `${userId}_${today}`;
    try {
        const ref = doc(db, 'symptomsLog', docId);
        await setDoc(ref, {
            user_id: userId,
            date: today,
            week,
            symptoms,
            notes: notes || '',
            updated_at: Timestamp.now().toDate().toISOString(),
        }, { merge: true });
        return docId;
    } catch (error) {
        log.error('Error saving symptoms:', error);
        throw error;
    }
};

export const getDailySymptoms = async (userId: string, dateStr?: string): Promise<DailySymptoms | null> => {
    if (!userId || userId.startsWith('guest_')) {
        return null;
    }
    const targetDate = dateStr || toLocalDateKey();
    try {
        const q = query(
            collection(db, 'symptomsLog'),
            where('user_id', '==', userId),
            where('date', '==', targetDate)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return null;
        const docData = snapshot.docs[0];
        return { id: docData.id, ...docData.data() } as DailySymptoms;
    } catch (error) {
        log.error('Error fetching symptoms:', error);
        return null;
    }
};

export const getSymptomsHistory = async (userId: string, limitDays = 30): Promise<DailySymptoms[]> => {
    if (!userId || userId.startsWith('guest_')) {
        return [];
    }
    try {
        const since = new Date();
        since.setDate(since.getDate() - limitDays);
        const sinceStr = toLocalDateKey(since);
        const q = query(
            collection(db, 'symptomsLog'),
            where('user_id', '==', userId),
            where('date', '>=', sinceStr)
        );
        const snapshot = await getDocs(q);
        const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailySymptoms));
        return entries.sort((a, b) => b.date.localeCompare(a.date));
    } catch (error) {
        log.error('Error fetching symptoms history:', error);
        return [];
    }
};


/**
 * F-HS-05 FIX: Deduplicate weight entries by calendar day.
 * The legacy `healthMetrics` and V2 `weight_entries` collections can both hold an
 * entry for the same date (e.g. user logged on the dashboard then re-logged in the
 * WeightTracker). A plain concat double-counted those days, inflating the graph and
 * skewing initial/current/gain stats. We group by ISO date (YYYY-MM-DD) and keep the
 * most recently created entry per day, then sort ascending by date.
 */
const dedupeWeightByDate = (entries: HealthMetric[]): HealthMetric[] => {
    const byDay = new Map<string, HealthMetric>();
    const createdAtMs = (m: HealthMetric): number => {
        const t = m.created_at ? new Date(m.created_at).getTime() : NaN;
        // Fallback to the entry date when created_at is missing/invalid so we still
        // compare deterministically rather than treating it as 0 (epoch).
        return Number.isNaN(t) ? new Date(m.date).getTime() : t;
    };

    for (const entry of entries) {
        const dayKey = entry.date.slice(0, 10); // ISO date → YYYY-MM-DD
        const existing = byDay.get(dayKey);
        if (!existing || createdAtMs(entry) >= createdAtMs(existing)) {
            // On ties (equal created_at) the later iterated entry wins; V2 entries are
            // concatenated after legacy ones, so the newer source is preferred.
            byDay.set(dayKey, entry);
        }
    }

    return Array.from(byDay.values()).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
};

/**
 * P3.7 FIX: Single source of truth for weight history.
 * Merges entries from `healthMetrics` (legacy / dashboard inputs) and `weight_entries`
 * (WeightTrackerScreen inputs) into a unified HealthMetric[] sorted by date.
 *
 * Use this helper anywhere a complete weight view is needed (graphs, stats, exports).
 * Avoids the bug where the dashboard graph showed only one half of the user's data.
 *
 * F-HS-05: same-date entries are deduplicated (most-recent created_at wins per day).
 */
export const getMergedWeightHistory = async (userId: string): Promise<HealthMetric[]> => {
    if (!userId || userId.startsWith('guest_')) {
        return [];
    }
    const [oldEntries, v2Entries] = await Promise.all([
        getWeightHistory(userId),
        getWeightHistoryV2(userId),
    ]);

    const v2AsHealthMetric: HealthMetric[] = v2Entries.map(w => ({
        metric_id: w.id || '',
        user_id: w.user_id,
        type: 'weight' as const,
        value: w.weight,
        date: w.date,
        week: w.week_of_pregnancy,
        notes: w.notes || '',
        created_at: w.date,
    }));

    return dedupeWeightByDate([...oldEntries, ...v2AsHealthMetric]);
};

export const getHealthStats = async (
    userId: string,
    currentWeek: number,
    prePregnancyWeight?: number,
): Promise<HealthStats> => {
    // P0 FIX: Block Firestore reads for guest users
    if (!userId || userId.startsWith('guest_')) {
        log.warn('[HealthService] Guest user blocked from health stats (guest mode)');
        return {
            upcomingAppointments: 0,
            pastAppointments: 0,
            remindersCompletedThisWeek: 0,
            remindersTotalThisWeek: 0,
        };
    }
    try {
        // P2 FIX: All independent Firestore calls run in parallel.
        // Previously BP, appointments, and reminders were fetched sequentially after weight.
        // P2 FIX: Also removed dead `loadReminderSettingsAuth` fetch — result was never used.
        const [
            weightHistoryOld,
            weightHistoryNew,
            bpHistory,
            appointments,
            taskStatuses,
        ] = await Promise.all([
            getWeightHistory(userId),
            getWeightHistoryV2(userId),
            getBloodPressureHistory(userId),
            loadUserEvents(userId),
            loadTaskStatusesAuth(userId, currentWeek),
        ]);

        // Convert weightService entries to HealthMetric-compatible format and merge
        const weightFromV2: HealthMetric[] = weightHistoryNew.map(w => ({
            metric_id: w.id || '',
            user_id: w.user_id,
            type: 'weight' as const,
            value: w.weight,
            date: w.date,
            week: w.week_of_pregnancy,
            notes: w.notes || '',
            created_at: w.date,
        }));

        // F-HS-05 FIX: real deduplication by calendar day (was a plain concat despite the
        // comment claiming dedup → same-date entries double-counted). Most-recent created_at
        // wins per day. Result is sorted ascending by date.
        const allWeights = dedupeWeightByDate([...weightHistoryOld, ...weightFromV2]);

        const weightCurrent = allWeights.length > 0 ? (allWeights[allWeights.length - 1].value as number) : undefined;
        // F-HS-04 FIX: the weight-gain baseline must be the user's pre-pregnancy weight
        // (clinical reference, matches WeightTrackerScreen), NOT the first LOGGED entry —
        // which is typically recorded mid-pregnancy and understates the real gain.
        // Fall back to the earliest logged entry only when prePregnancyWeight is unknown.
        const weightInitial =
            prePregnancyWeight && prePregnancyWeight > 0
                ? prePregnancyWeight
                : allWeights.length > 0
                    ? (allWeights[0].value as number)
                    : undefined;
        const weightGain = weightCurrent !== undefined && weightInitial !== undefined
            ? weightCurrent - weightInitial
            : 0;

        const lastBP = bpHistory.length > 0
            ? {
                systolic: (bpHistory[0].value as { systolic: number; diastolic: number }).systolic,
                diastolic: (bpHistory[0].value as { systolic: number; diastolic: number }).diastolic,
                date: bpHistory[0].date,
            }
            : undefined;

        const now = new Date();
        const upcomingAppointments = appointments.filter(a => new Date(a.date) >= now).length;
        const pastAppointments = appointments.filter(a => new Date(a.date) < now).length;

        const remindersCompletedThisWeek = Object.values(taskStatuses).filter(t => t.completed).length;
        const remindersTotalThisWeek = Object.keys(taskStatuses).length;

        return {
            weightCurrent,
            weightInitial,
            weightGain,
            lastBP,
            upcomingAppointments,
            pastAppointments,
            remindersCompletedThisWeek,
            remindersTotalThisWeek,
        };
    } catch (error) {
        log.error('Error fetching health stats:', error);
        return {
            upcomingAppointments: 0,
            pastAppointments: 0,
            remindersCompletedThisWeek: 0,
            remindersTotalThisWeek: 0,
        };
    }
};
