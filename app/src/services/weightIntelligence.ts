/**
 * Trend Detection & Smart Suggestions for Weight Tracker
 * 
 * Returns i18n keys + params — callers must use t(key, params) to display.
 */

import { WeightEntry } from './weightService';

export interface Trend {
    type: 'stable' | 'increasing' | 'decreasing' | 'rapid_gain' | 'rapid_loss';
    weeklyRate: number; // kg/week
    messageKey: string;   // i18n key in weight.trend namespace
    messageParams?: Record<string, string | number>; // interpolation params
    severity: 'normal' | 'attention' | 'warning';
}

export interface SmartSuggestion {
    icon: string;
    textKey: string;    // i18n key in weight.suggestions namespace
    category: 'hydration' | 'nutrition' | 'activity' | 'rest' | 'medical';
}

/**
 * Detect weight trend from recent history (last 3-4 weeks)
 */
export const detectTrend = (history: WeightEntry[]): Trend | null => {
    if (history.length < 2) return null;

    const sorted = [...history].sort((a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const recent = sorted.slice(-4);
    if (recent.length < 2) return null;

    const n = recent.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    recent.forEach((entry, i) => {
        const x = i;
        const y = entry.weight;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const weeklyRate = slope;

    if (Math.abs(weeklyRate) < 0.2) {
        return { type: 'stable', weeklyRate, messageKey: 'weight.trend.stable', severity: 'normal' };
    } else if (weeklyRate > 1) {
        return {
            type: 'rapid_gain', weeklyRate,
            messageKey: 'weight.trend.rapidGain',
            messageParams: { rate: weeklyRate.toFixed(1) },
            severity: 'warning'
        };
    } else if (weeklyRate < -0.5) {
        return {
            type: 'rapid_loss', weeklyRate,
            messageKey: 'weight.trend.rapidLoss',
            messageParams: { rate: weeklyRate.toFixed(1) },
            severity: 'warning'
        };
    } else if (weeklyRate > 0.2) {
        return {
            type: 'increasing', weeklyRate,
            messageKey: 'weight.trend.increasing',
            messageParams: { rate: weeklyRate.toFixed(1) },
            severity: 'normal'
        };
    } else {
        return {
            type: 'decreasing', weeklyRate,
            messageKey: 'weight.trend.decreasing',
            messageParams: { rate: weeklyRate.toFixed(1) },
            severity: 'attention'
        };
    }
};

/**
 * Generate smart suggestions based on trimester and status
 * Returns i18n keys — callers use t(suggestion.textKey)
 */
export const getSmartSuggestions = (
    week: number,
    status: 'normal' | 'low' | 'high',
    trend?: Trend
): SmartSuggestion[] => {
    const suggestions: SmartSuggestion[] = [];

    if (week <= 13) {
        suggestions.push({ icon: '🤢', textKey: 'weight.suggestions.t1Nausea', category: 'nutrition' });
        suggestions.push({ icon: '💊', textKey: 'weight.suggestions.t1Vitamins', category: 'medical' });
    } else if (week <= 27) {
        suggestions.push({ icon: '🥗', textKey: 'weight.suggestions.t2Protein', category: 'nutrition' });
        suggestions.push({ icon: '🚶‍♀️', textKey: 'weight.suggestions.t2Walk', category: 'activity' });
    } else {
        suggestions.push({ icon: '💧', textKey: 'weight.suggestions.t3Hydration', category: 'hydration' });
        suggestions.push({ icon: '😴', textKey: 'weight.suggestions.t3Rest', category: 'rest' });
    }

    if (status === 'low') {
        suggestions.push({ icon: '🍽️', textKey: 'weight.suggestions.statusLow', category: 'nutrition' });
    } else if (status === 'high') {
        suggestions.push({ icon: '🥦', textKey: 'weight.suggestions.statusHigh', category: 'nutrition' });
    }

    if (trend?.type === 'rapid_gain') {
        suggestions.push({ icon: '⚖️', textKey: 'weight.suggestions.rapidGain', category: 'medical' });
    } else if (trend?.type === 'stable') {
        suggestions.push({ icon: '✅', textKey: 'weight.suggestions.stable', category: 'nutrition' });
    }

    suggestions.push({ icon: '💚', textKey: 'weight.suggestions.listenBody', category: 'nutrition' });

    return suggestions.slice(0, 4);
};

/**
 * Get contextual message key based on trimester
 */
export const getTrimesterMessage = (week: number): string => {
    if (week <= 13) return 'weight.trimester.t1';
    if (week <= 27) return 'weight.trimester.t2';
    return 'weight.trimester.t3';
};
