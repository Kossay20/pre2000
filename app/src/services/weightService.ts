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

    // Weight gain is minimal in T1 (0-13 weeks): about 0.5-2kg total
    // Main gain in T2-T3 (14-40 weeks)

    let minGain: number;
    let maxGain: number;

    if (currentWeek <= 13) {
        // First trimester: minimal gain (0.5-2kg total by week 13)
        const progress = currentWeek / 13;
        minGain = 0.5 * progress;
        maxGain = 2 * progress;
    } else {
        // Second and third trimester - REFINED FORMULA
        const t1GainMin = 0.5; // Minimum T1 gain
        const t1GainMax = 2.0; // Maximum T1 gain
        const weeksInT2T3 = currentWeek - 13;

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
 * Delete a weight entry
 */
export const deleteWeightEntry = async (userId: string, entryId: string): Promise<void> => {
    try {
        if (userId.startsWith('guest')) {
            const existing = await getWeightHistory(userId);
            const filtered = existing.filter(e => e.id !== entryId);
            await AsyncStorage.setItem(getStorageKey(userId), JSON.stringify(filtered));
        } else {
            await deleteDoc(doc(db, WEIGHT_COLLECTION, entryId));
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
