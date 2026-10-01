/**
 * Weight Tracking Service
 * 
 * Tracks maternal weight during pregnancy with:
 * - Weight entries storage (Firestore + AsyncStorage)
 * - Recommended weight gain calculation based on pre-pregnancy BMI
 * - Status evaluation (normal/low/high)
 * 
 * Medical References: IOM (National Academies) 2009, ACOG, recommandations cliniques
 * Note: Les fourchettes sont indicatives - chaque grossesse est unique.
 */

import { db } from '../config/firebase';
import { collection, addDoc, query, where, getDocs, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../utils/logger';
import { isOnLocalDay, toLocalDateKey } from '../utils/localDate';

const log = createLogger('WeightService');

// ============================================
// TYPES
// ============================================

export interface WeightEntry {
    id?: string;
    user_id: string;
    weight: number; // kg
    date: string; // ISO
    week_of_pregnancy: number;
    notes?: string;
    // Which collection holds it: the tracker's own `weight_entries` (the default), or a
    // weighing logged from the Health dashboard in `healthMetrics`. Deleting needs it.
    source?: 'weight_entries' | 'healthMetrics';
}

export interface BMICategory {
    category: 'underweight' | 'normal' | 'overweight' | 'obese';
    minGain: number; // kg total
    maxGain: number; // kg total
    weeklyGainT2T3: number; // kg per week in T2-T3
}

export type WeightStatus = 'normal' | 'low' | 'high' | 'unknown';

// ============================================
// BMI RECOMMENDATIONS (OMS/ACOG)
// ============================================

const BMI_CATEGORIES: Record<string, BMICategory> = {
    underweight: { category: 'underweight', minGain: 12.5, maxGain: 18, weeklyGainT2T3: 0.5 },
    normal: { category: 'normal', minGain: 11.5, maxGain: 16, weeklyGainT2T3: 0.4 },
    overweight: { category: 'overweight', minGain: 7, maxGain: 11.5, weeklyGainT2T3: 0.3 },
    obese: { category: 'obese', minGain: 5, maxGain: 9, weeklyGainT2T3: 0.2 },
};

/**
 * Calculate BMI category from pre-pregnancy weight and height
 */
export const calculateBMICategory = (weightKg: number, heightCm: number): BMICategory => {
    const heightM = heightCm / 100;
    const bmi = weightKg / (heightM * heightM);

    if (bmi < 18.5) return BMI_CATEGORIES.underweight;
    if (bmi < 25) return BMI_CATEGORIES.normal;
    if (bmi < 30) return BMI_CATEGORIES.overweight;
    return BMI_CATEGORIES.obese;
};

/**
 * Calculate recommended weight range for a given week
 * Returns { min, max } in kg (total weight, not just gain)
 */
export const getRecommendedWeightRange = (
    prePregnancyWeight: number,
    heightCm: number,
    currentWeek: number
): { min: number; max: number; targetGain: { min: number; max: number } } => {
    const category = calculateBMICategory(prePregnancyWeight, heightCm);
    // The gain targets are totals at term (week 40). A weigh-in filed under week 41 or 42
    // (past the due date) is held to the term range, not to a range extrapolated beyond it.
    const week = Math.min(currentWeek, 40);

    // Weight gain is minimal in T1 (0-13 weeks): about 0.5-2kg total
    // Main gain in T2-T3 (14-40 weeks)

    let minGain: number;
    let maxGain: number;

    if (week <= 13) {
        // First trimester: minimal gain (0.5-2kg total by week 13)
        const progress = week / 13;
        minGain = 0.5 * progress;
        maxGain = 2 * progress;
    } else {
        // Second and third trimester - REFINED FORMULA
        const t1GainMin = 0.5; // Minimum T1 gain
        const t1GainMax = 2.0; // Maximum T1 gain
        const weeksInT2T3 = week - 13;

        // Calculate remaining gain to reach category targets
        const remainingMinGain = category.minGain - t1GainMin;
        const remainingMaxGain = category.maxGain - t1GainMax;

        // Distribute over remaining 27 weeks (14-40)
        const additionalMinGain = weeksInT2T3 * remainingMinGain / 27;
        const additionalMaxGain = weeksInT2T3 * remainingMaxGain / 27;

        minGain = t1GainMin + additionalMinGain;
        maxGain = t1GainMax + additionalMaxGain;
    }

    return {
        min: prePregnancyWeight + minGain,
        max: prePregnancyWeight + maxGain,
        targetGain: { min: minGain, max: maxGain }
    };
};

/**
 * Evaluate weight status compared to recommended range
 * Returns an i18n key so the caller can display a localized message via t(messageKey)
 */
export const evaluateWeightStatus = (
    currentWeight: number,
    prePregnancyWeight: number,
    heightCm: number,
    currentWeek: number
): { status: WeightStatus; messageKey: string; gain: number } => {
    const range = getRecommendedWeightRange(prePregnancyWeight, heightCm, currentWeek);
    const gain = currentWeight - prePregnancyWeight;

    // Calculate deviation from range
    const belowMin = range.min - currentWeight;
    const aboveMax = currentWeight - range.max;

    // NEW (T1 Nausea filter):
    // If the loss is slight (e.g., > -3kg) in Trimester 1, classify as normal.
    if (currentWeek <= 14 && gain < 0 && gain > -3) {
        return { status: 'normal', messageKey: 'weight.status.t1Nausea', gain };
    }

    // Slight deviation (< 2kg) vs significant deviation
    if (belowMin > 2) {
        return { status: 'low', messageKey: 'weight.status.lowSignificant', gain };
    } else if (belowMin > 0) {
        return { status: 'low', messageKey: 'weight.status.lowSlight', gain };
    } else if (aboveMax > 2) {
        return { status: 'high', messageKey: 'weight.status.highSignificant', gain };
    } else if (aboveMax > 0) {
        return { status: 'high', messageKey: 'weight.status.highSlight', gain };
    } else {
        return { status: 'normal', messageKey: 'weight.status.normal', gain };
    }
};

// ============================================
// FIRESTORE OPERATIONS
// ============================================

const WEIGHT_COLLECTION = 'weight_entries';

/**
 * P0.3: Generate unique storage key per userId (not shared across guests)
 */
const getStorageKey = (userId: string): string => {
    return `@weight_entries_${userId}`;
};

/**
 * Save a weight entry
 */
export const saveWeightEntry = async (entry: Omit<WeightEntry, 'id'>): Promise<string> => {
    try {
        if (entry.user_id.startsWith('guest')) {
            // Guest mode: save to AsyncStorage
            const existing = await getWeightHistory(entry.user_id);
            const id = `weight_${Date.now()}`;
            const newEntry = { ...entry, id };
            existing.push(newEntry);
            await AsyncStorage.setItem(getStorageKey(entry.user_id), JSON.stringify(existing));
            log.info('Weight entry saved (guest):', id);
            return id;
        } else {
            // Authenticated: save to Firestore
            const docRef = await addDoc(collection(db, WEIGHT_COLLECTION), {
                ...entry,
                created_at: new Date().toISOString()
            });
            log.info('Weight entry saved:', docRef.id);
            return docRef.id;
        }
    } catch (error) {
        log.error('Error saving weight entry:', error);
        throw error;
    }
};

/**
 * Get weight history for a user
 */
export const getWeightHistory = async (userId: string): Promise<WeightEntry[]> => {
    try {
        if (userId.startsWith('guest')) {
            const stored = await AsyncStorage.getItem(getStorageKey(userId));
            const entries = stored ? JSON.parse(stored) : [];
            // Sort by date descending
            return entries.sort((a: WeightEntry, b: WeightEntry) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );
        } else {
            // Query without orderBy to avoid requiring composite index
            const q = query(
                collection(db, WEIGHT_COLLECTION),
                where('user_id', '==', userId)
            );
            const snapshot = await getDocs(q);
            const entries = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as WeightEntry));

            // Sort client-side by date descending
            return entries.sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );
        }
    } catch (error) {
        log.error('Error getting weight history:', error);
        return [];
    }
};

/**
 * Weighings logged from the Health dashboard, which writes them to `healthMetrics`.
 */
const getDashboardWeights = async (userId: string): Promise<WeightEntry[]> => {
    try {
        const q = query(
            collection(db, 'healthMetrics'),
            where('user_id', '==', userId),
            where('type', '==', 'weight')
        );
        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(d => ({ id: d.id, data: d.data() as Record<string, unknown> }))
            .filter(({ data }) => typeof data.value === 'number' && typeof data.date === 'string')
            .map(({ id, data }) => ({
                id,
                user_id: userId,
                weight: data.value as number,
                date: data.date as string,
                week_of_pregnancy: typeof data.week === 'number' ? data.week : 0,
                notes: typeof data.notes === 'string' ? data.notes : undefined,
                source: 'healthMetrics' as const,
            }));
    } catch (error) {
        log.error('Error getting dashboard weights:', error);
        return [];
    }
};

/**
 * Every weighing she logged, newest first: the tracker's own entries and the ones added
 * from the Health dashboard. The dashboard already showed both, but the tracker read only
 * its own collection, so a weight entered on Health never appeared in "Mon Poids" and the
 * two screens disagreed on her latest weight. The tracker, its gain and the PDF read this.
 */
export const getAllWeightEntries = async (userId: string): Promise<WeightEntry[]> => {
    if (userId.startsWith('guest')) return getWeightHistory(userId);
    const [own, dashboard] = await Promise.all([getWeightHistory(userId), getDashboardWeights(userId)]);
    return [...own.map(e => ({ ...e, source: 'weight_entries' as const })), ...dashboard].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
};

/**
 * One weighing per day, the latest of that day, newest day first.
 *
 * The tracker keeps one weighing a day ("you already logged 68.4 kg today — replace
 * it?"), but the Health dashboard writes its own collection, so the merged history could
 * list 68.4 kg and 69 kg on the same day and the gain read off whichever sorted first.
 * The rule applies across both sources: the later weighing of the day wins; at the same
 * instant the tracker's own entry wins, then the id, so the pick never depends on read
 * order. For display and the PDF only — deleting or resetting uses the full list.
 */
export const latestWeighingPerDay = (entries: WeightEntry[]): WeightEntry[] => {
    const rank = (e: WeightEntry) => (e.source === 'healthMetrics' ? 1 : 0);
    const ordered = [...entries].sort(
        (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime() ||
            rank(a) - rank(b) ||
            String(a.id ?? '').localeCompare(String(b.id ?? '')),
    );
    const seen = new Set<string>();
    return ordered.filter(e => {
        const day = toLocalDateKey(new Date(e.date));
        if (seen.has(day)) return false;
        seen.add(day);
        return true;
    });
};

/**
 * Every weighing logged on the local day `dayKey` (today by default), newest first, from
 * both sources. Both entry forms ask "replace today's weighing?" off this list: the
 * tracker asked, the Health dashboard saved a second weighing of the day without a word.
 */
export const weighingsOnDay = (entries: WeightEntry[], dayKey: string = toLocalDateKey()): WeightEntry[] =>
    entries
        .filter(e => isOnLocalDay(e.date, dayKey))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

// The gauge draws the recommended range as a band from 10 % to 90 % of the bar.
export const GAUGE_BAND_START_PCT = 10;
export const GAUGE_BAND_END_PCT = 90;

/**
 * Where the gauge dot sits, in % of the bar, for a weight against the recommended range.
 * min maps to the band's left edge and max to its right edge, so a weight inside the range
 * is drawn inside the green band; it used to map min→0 % and max→100 % while the band was
 * drawn 10–90 %, which put 68.4 kg (range 68.2–71.9) left of the band. Clamped to the bar.
 */
export const gaugeDotPercent = (weight: number, min: number, max: number): number => {
    const mid = (GAUGE_BAND_START_PCT + GAUGE_BAND_END_PCT) / 2;
    if (!Number.isFinite(weight) || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return mid;
    const pct = GAUGE_BAND_START_PCT + ((weight - min) / (max - min)) * (GAUGE_BAND_END_PCT - GAUGE_BAND_START_PCT);
    return Math.min(Math.max(pct, 0), 100);
};

/**
 * Delete a weight entry. `source` routes a dashboard weighing (from getAllWeightEntries)
 * to its own collection.
 */
export const deleteWeightEntry = async (
    userId: string,
    entryId: string,
    source: WeightEntry['source'] = 'weight_entries',
): Promise<void> => {
    try {
        if (userId.startsWith('guest')) {
            const existing = await getWeightHistory(userId);
            const filtered = existing.filter(e => e.id !== entryId);
            await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(filtered));
        } else {
            await deleteDoc(doc(db, source === 'healthMetrics' ? 'healthMetrics' : WEIGHT_COLLECTION, entryId));
        }
        log.info('Weight entry deleted:', entryId);
    } catch (error) {
        log.error('Error deleting weight entry:', error);
        throw error;
    }
};

/**
 * Get the latest weight entry
 */
export const getLatestWeight = async (userId: string): Promise<WeightEntry | null> => {
    const history = await getWeightHistory(userId);
    return history.length > 0 ? history[0] : null;
};

/**
 * Check if weight was entered this week
 */
export const hasWeightThisWeek = async (userId: string): Promise<boolean> => {
    const history = await getWeightHistory(userId);
    if (history.length === 0) return false;

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
    startOfWeek.setHours(0, 0, 0, 0);

    return history.some(entry => new Date(entry.date) >= startOfWeek);
};

// ============================================
// SETUP (pre-pregnancy weight + height)
// ============================================

export type WeightSetupResult = { ok: true } | { ok: false; error: string };

/**
 * Save the WeightTracker setup where the profile lives.
 *
 * For an account that is the server profile. The screen used to hand the values to
 * PregnancyContext.setProfile, which for a signed-in user only updates memory (it forwards
 * emergency contacts and nothing else), and then said "Configuration enregistrée": after a
 * reload, or on another phone, the setup card came back and hid her weight history. The
 * account profile is written through AuthContext.updateProfile, and PregnancyContext picks
 * the new values up from it.
 *
 * A guest's profile is the device copy. Her other fields — emergency contacts included —
 * are kept; the previous code rebuilt the profile from five fields and dropped them.
 */
export const saveWeightSetup = async <P extends object>({
    profile,
    prePregnancyWeight,
    height,
    signedIn,
    updateAccountProfile,
    setLocalProfile,
}: {
    profile: P | null;
    prePregnancyWeight: number;
    height: number;
    signedIn: boolean;
    updateAccountProfile: (data: { prePregnancyWeight: number; height: number }) => Promise<WeightSetupResult>;
    setLocalProfile: (profile: P & { prePregnancyWeight: number; height: number }) => Promise<void>;
}): Promise<WeightSetupResult> => {
    if (signedIn) {
        return updateAccountProfile({ prePregnancyWeight, height });
    }
    const merged = { firstName: '', country: '', ...(profile ?? {}), prePregnancyWeight, height };
    const clean = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined));
    try {
        await setLocalProfile(clean as P & { prePregnancyWeight: number; height: number });
        return { ok: true };
    } catch (error: any) {
        return { ok: false, error: error?.message || 'Local save failed' };
    }
};
