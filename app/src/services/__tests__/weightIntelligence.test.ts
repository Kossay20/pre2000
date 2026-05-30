/**
 * Unit tests for weightIntelligence — pure calc service for the weight tracker.
 *
 * Covers:
 *  - detectTrend: linear-regression slope over last <=4 entries, all severity/type
 *    branches and their boundary thresholds (0.2, 1, -0.5, -0.2), sorting,
 *    slicing to last 4, null guards, messageParams formatting (toFixed(1)).
 *  - getSmartSuggestions: trimester branches (week<=13 / <=27 / else),
 *    status low/high, trend rapid_gain/stable, the always-appended "listenBody",
 *    and the 4-item cap.
 *  - getTrimesterMessage: the three week thresholds and their boundaries.
 *
 * weightIntelligence only imports the WeightEntry *type* from weightService
 * (erased at compile time), but we defensively mock firebase / AsyncStorage in
 * case any transitive module evaluation occurs under ts-jest.
 */

jest.mock('../../config/firebase', () => ({
    db: {},
    auth: {},
    analytics: Promise.resolve(null),
}));

jest.mock('@react-native-async-storage/async-storage', () => {
    const store: Record<string, string> = {};
    return {
        getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
        setItem: jest.fn((k: string, v: string) => {
            store[k] = v;
            return Promise.resolve();
        }),
        removeItem: jest.fn((k: string) => {
            delete store[k];
            return Promise.resolve();
        }),
        multiRemove: jest.fn(() => Promise.resolve()),
        getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
    };
});

jest.mock('firebase/firestore', () => ({
    collection: jest.fn(),
    doc: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    getDocs: jest.fn(),
    getDoc: jest.fn(),
    setDoc: jest.fn(),
    addDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    writeBatch: jest.fn(),
    documentId: jest.fn(),
    serverTimestamp: jest.fn(),
    Timestamp: { now: () => ({}) },
}));

jest.mock('../../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
    }),
}));

import {
    detectTrend,
    getSmartSuggestions,
    getTrimesterMessage,
    Trend,
} from '../weightIntelligence';
import type { WeightEntry } from '../weightService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _id = 0;
const entry = (weight: number, date: string, week = 20): WeightEntry => ({
    id: `e${_id++}`,
    user_id: 'u1',
    weight,
    date,
    week_of_pregnancy: week,
});

/**
 * Build a series of entries with ascending dates (1 per "week") and the given
 * weights. Because detectTrend uses index i (0..n-1) as x — NOT the actual
 * date — the spacing of dates does not affect the slope; only ordering does.
 */
const series = (weights: number[], startDay = 1): WeightEntry[] =>
    weights.map((w, i) =>
        entry(w, `2026-01-${String(startDay + i).padStart(2, '0')}`)
    );

// ===========================================================================
// detectTrend — null guards
// ===========================================================================

describe('detectTrend — null guards', () => {
    test('returns null for empty history', () => {
        expect(detectTrend([])).toBeNull();
    });

    test('returns null for a single entry', () => {
        expect(detectTrend([entry(60, '2026-01-01')])).toBeNull();
    });

    test('returns a Trend (not null) for exactly 2 entries', () => {
        const t = detectTrend(series([60, 60]));
        expect(t).not.toBeNull();
    });
});

// ===========================================================================
// detectTrend — n=2 slope == weight[1]-weight[0] (denominator is 1)
// ===========================================================================

describe('detectTrend — slope math for n=2', () => {
    test('two equal weights => slope 0 => stable', () => {
        const t = detectTrend(series([60, 60]))!;
        expect(t.weeklyRate).toBe(0);
        expect(t.type).toBe('stable');
    });

    test('two entries: slope equals the raw difference', () => {
        // weights 60 -> 60.75, n=2 => slope = 0.75
        const t = detectTrend(series([60, 60.75]))!;
        expect(t.weeklyRate).toBeCloseTo(0.75, 10);
        expect(t.type).toBe('increasing');
    });
});

// ===========================================================================
// detectTrend — type / severity branches
// ===========================================================================

describe('detectTrend — branch: stable', () => {
    test('|rate| < 0.2 is stable with normal severity and no params', () => {
        // slope 0.1 (60 -> 60.1)
        const t = detectTrend(series([60, 60.1]))!;
        expect(t.type).toBe('stable');
        expect(t.severity).toBe('normal');
        expect(t.messageKey).toBe('weight:trend.stable');
        expect(t.messageParams).toBeUndefined();
        expect(Math.abs(t.weeklyRate)).toBeLessThan(0.2);
    });

    test('small negative rate (-0.1) is also stable', () => {
        const t = detectTrend(series([60, 59.9]))!;
        expect(t.type).toBe('stable');
        expect(t.severity).toBe('normal');
    });
});

describe('detectTrend — branch: rapid_gain', () => {
    test('rate > 1 => rapid_gain, warning, rate param formatted to 1 decimal', () => {
        // slope 1.5
        const t = detectTrend(series([60, 61.5]))!;
        expect(t.type).toBe('rapid_gain');
        expect(t.severity).toBe('warning');
        expect(t.messageKey).toBe('weight:trend.rapidGain');
        expect(t.weeklyRate).toBeCloseTo(1.5, 10);
        expect(t.messageParams).toEqual({ rate: '1.5' });
    });

    test('rate of exactly 1.0 is NOT rapid_gain (uses > 1) => increasing', () => {
        const t = detectTrend(series([60, 61]))!;
        expect(t.weeklyRate).toBeCloseTo(1, 10);
        expect(t.type).toBe('increasing');
    });

    test('rate param uses toFixed(1) rounding (1.25 -> "1.2" banker? no, "1.3")', () => {
        // slope 1.25 => toFixed(1) => "1.3"
        const t = detectTrend(series([60, 61.25]))!;
        expect(t.type).toBe('rapid_gain');
        expect(t.messageParams).toEqual({ rate: (1.25).toFixed(1) });
    });
});

describe('detectTrend — branch: rapid_loss', () => {
    test('rate < -0.5 => rapid_loss, warning, negative formatted param', () => {
        // slope -0.8
        const t = detectTrend(series([60, 59.2]))!;
        expect(t.type).toBe('rapid_loss');
        expect(t.severity).toBe('warning');
        expect(t.messageKey).toBe('weight:trend.rapidLoss');
        expect(t.weeklyRate).toBeCloseTo(-0.8, 10);
        expect(t.messageParams).toEqual({ rate: '-0.8' });
    });

    test('rate of exactly -0.5 is NOT rapid_loss (uses < -0.5) => decreasing', () => {
        const t = detectTrend(series([60, 59.5]))!;
        expect(t.weeklyRate).toBeCloseTo(-0.5, 10);
        expect(t.type).toBe('decreasing');
        expect(t.severity).toBe('attention');
    });
});

describe('detectTrend — branch: increasing', () => {
    test('0.2 < rate <= 1 => increasing, normal severity, param', () => {
        // slope 0.5
        const t = detectTrend(series([60, 60.5]))!;
        expect(t.type).toBe('increasing');
        expect(t.severity).toBe('normal');
        expect(t.messageKey).toBe('weight:trend.increasing');
        expect(t.weeklyRate).toBeCloseTo(0.5, 10);
        expect(t.messageParams).toEqual({ rate: '0.5' });
    });

    test('at realistic weights, 60->60.2 yields slope slightly > 0.2 (FP) => increasing', () => {
        // NOTE: 60.2 - 60 === 0.2000000000000028 in IEEE-754, which is > 0.2,
        // so this realistic input lands in the `increasing` branch, not the
        // exact-boundary `decreasing` branch. This documents the FP reality.
        const t = detectTrend(series([60, 60.2]))!;
        expect(t.weeklyRate).toBeGreaterThan(0.2);
        expect(t.type).toBe('increasing');
    });

    test('slope of EXACTLY 0.2 (uses > 0.2) => falls through to decreasing branch', () => {
        // 0.2 - 0 === 0.2 exactly in IEEE-754. abs(0.2) not < 0.2, not > 1,
        // not < -0.5, not > 0.2 (strict) => else => decreasing.
        const t = detectTrend(series([0, 0.2]))!;
        expect(t.weeklyRate).toBe(0.2);
        expect(t.type).toBe('decreasing');
        expect(t.severity).toBe('attention');
        expect(t.messageKey).toBe('weight:trend.decreasing');
    });
});

describe('detectTrend — branch: decreasing', () => {
    test('-0.5 <= rate <= -0.2 => decreasing, attention severity, param', () => {
        // slope -0.3
        const t = detectTrend(series([60, 59.7]))!;
        expect(t.type).toBe('decreasing');
        expect(t.severity).toBe('attention');
        expect(t.messageKey).toBe('weight:trend.decreasing');
        expect(t.weeklyRate).toBeCloseTo(-0.3, 10);
        expect(t.messageParams).toEqual({ rate: '-0.3' });
    });

    test('rate near -0.2 (realistic weights) => decreasing', () => {
        const t = detectTrend(series([60, 59.8]))!;
        expect(t.weeklyRate).toBeCloseTo(-0.2, 10);
        expect(t.type).toBe('decreasing');
    });

    test('slope of EXACTLY -0.2 => decreasing (abs not < 0.2, not < -0.5)', () => {
        // sorted ascending by date: w0=0.2, w1=0 => slope = 0 - 0.2 = -0.2 exactly.
        const t = detectTrend(series([0.2, 0]))!;
        expect(t.weeklyRate).toBe(-0.2);
        expect(t.type).toBe('decreasing');
        expect(t.severity).toBe('attention');
    });
});

// ===========================================================================
// detectTrend — sorting & windowing behaviour
// ===========================================================================

describe('detectTrend — sorting and last-4 windowing', () => {
    test('sorts by date ascending before computing slope (out-of-order input)', () => {
        // Same data as series([60, 61.5]) but reversed input order.
        const reversed = [
            entry(61.5, '2026-01-02'),
            entry(60, '2026-01-01'),
        ];
        const t = detectTrend(reversed)!;
        expect(t.type).toBe('rapid_gain');
        expect(t.weeklyRate).toBeCloseTo(1.5, 10);
    });

    test('uses only the last 4 entries (older entries ignored)', () => {
        // 6 entries: first two would create a steep early slope, but they are
        // outside the last-4 window. Last 4 are all 70 => stable.
        const data = series([50, 51, 70, 70, 70, 70]);
        const t = detectTrend(data)!;
        expect(t.type).toBe('stable');
        expect(t.weeklyRate).toBe(0);
    });

    test('does not mutate the input array', () => {
        const data = [
            entry(61.5, '2026-01-02'),
            entry(60, '2026-01-01'),
        ];
        const snapshot = data.map((e) => e.date);
        detectTrend(data);
        expect(data.map((e) => e.date)).toEqual(snapshot);
    });

    test('linear regression over 4 evenly-rising points => slope 1 (increasing)', () => {
        // weights 60,61,62,63 with x=0,1,2,3 => perfect slope 1
        const t = detectTrend(series([60, 61, 62, 63]))!;
        expect(t.weeklyRate).toBeCloseTo(1, 10);
        expect(t.type).toBe('increasing');
    });

    test('linear regression over 4 steeply-rising points => rapid_gain', () => {
        // weights 60,62,64,66 => slope 2
        const t = detectTrend(series([60, 62, 64, 66]))!;
        expect(t.weeklyRate).toBeCloseTo(2, 10);
        expect(t.type).toBe('rapid_gain');
    });

    test('noisy data: regression smooths to a best-fit slope', () => {
        // 60, 60.5, 60.4, 61.2 — least-squares slope ~0.37 => increasing
        const t = detectTrend(series([60, 60.5, 60.4, 61.2]))!;
        expect(t.type).toBe('increasing');
        expect(t.weeklyRate).toBeGreaterThan(0.2);
        expect(t.weeklyRate).toBeLessThanOrEqual(1);
    });
});

// ===========================================================================
// getSmartSuggestions — trimester branches
// ===========================================================================

describe('getSmartSuggestions — trimester base suggestions', () => {
    test('T1 (week <= 13): nausea + vitamins', () => {
        const s = getSmartSuggestions(10, 'normal');
        expect(s[0]).toMatchObject({ textKey: 'weight:suggestions.t1Nausea', category: 'nutrition' });
        expect(s[1]).toMatchObject({ textKey: 'weight:suggestions.t1Vitamins', category: 'medical' });
    });

    test('week 13 is still T1 (boundary <= 13)', () => {
        const s = getSmartSuggestions(13, 'normal');
        expect(s[0].textKey).toBe('weight:suggestions.t1Nausea');
    });

    test('week 14 is T2 (boundary)', () => {
        const s = getSmartSuggestions(14, 'normal');
        expect(s[0].textKey).toBe('weight:suggestions.t2Protein');
    });

    test('T2 (14..27): protein + walk', () => {
        const s = getSmartSuggestions(20, 'normal');
        expect(s[0]).toMatchObject({ textKey: 'weight:suggestions.t2Protein', category: 'nutrition' });
        expect(s[1]).toMatchObject({ textKey: 'weight:suggestions.t2Walk', category: 'activity' });
    });

    test('week 27 is still T2 (boundary <= 27)', () => {
        const s = getSmartSuggestions(27, 'normal');
        expect(s[0].textKey).toBe('weight:suggestions.t2Protein');
    });

    test('week 28 is T3 (boundary)', () => {
        const s = getSmartSuggestions(28, 'normal');
        expect(s[0].textKey).toBe('weight:suggestions.t3Hydration');
    });

    test('T3 (>= 28): hydration + rest', () => {
        const s = getSmartSuggestions(35, 'normal');
        expect(s[0]).toMatchObject({ textKey: 'weight:suggestions.t3Hydration', category: 'hydration' });
        expect(s[1]).toMatchObject({ textKey: 'weight:suggestions.t3Rest', category: 'rest' });
    });
});

// ===========================================================================
// getSmartSuggestions — status branch
// ===========================================================================

describe('getSmartSuggestions — status modifiers', () => {
    test('status low adds statusLow suggestion', () => {
        const s = getSmartSuggestions(10, 'low');
        const keys = s.map((x) => x.textKey);
        expect(keys).toContain('weight:suggestions.statusLow');
    });

    test('status high adds statusHigh suggestion', () => {
        const s = getSmartSuggestions(10, 'high');
        const keys = s.map((x) => x.textKey);
        expect(keys).toContain('weight:suggestions.statusHigh');
    });

    test('status normal adds neither statusLow nor statusHigh', () => {
        const s = getSmartSuggestions(10, 'normal');
        const keys = s.map((x) => x.textKey);
        expect(keys).not.toContain('weight:suggestions.statusLow');
        expect(keys).not.toContain('weight:suggestions.statusHigh');
    });
});

// ===========================================================================
// getSmartSuggestions — trend branch
// ===========================================================================

describe('getSmartSuggestions — trend modifiers', () => {
    const rapidGainTrend: Trend = {
        type: 'rapid_gain',
        weeklyRate: 1.5,
        messageKey: 'weight:trend.rapidGain',
        severity: 'warning',
    };
    const stableTrend: Trend = {
        type: 'stable',
        weeklyRate: 0,
        messageKey: 'weight:trend.stable',
        severity: 'normal',
    };
    const decreasingTrend: Trend = {
        type: 'decreasing',
        weeklyRate: -0.3,
        messageKey: 'weight:trend.decreasing',
        severity: 'attention',
    };

    test('rapid_gain trend adds rapidGain medical suggestion', () => {
        const s = getSmartSuggestions(10, 'normal', rapidGainTrend);
        const match = s.find((x) => x.textKey === 'weight:suggestions.rapidGain');
        expect(match).toMatchObject({ category: 'medical', icon: '⚖️' });
    });

    test('stable trend adds stable nutrition suggestion', () => {
        const s = getSmartSuggestions(10, 'normal', stableTrend);
        const match = s.find((x) => x.textKey === 'weight:suggestions.stable');
        expect(match).toMatchObject({ category: 'nutrition' });
    });

    test('other trend types (decreasing) add no trend-specific suggestion', () => {
        const s = getSmartSuggestions(10, 'normal', decreasingTrend);
        const keys = s.map((x) => x.textKey);
        expect(keys).not.toContain('weight:suggestions.rapidGain');
        expect(keys).not.toContain('weight:suggestions.stable');
    });

    test('undefined trend is safe (optional-chaining branch) and adds no trend suggestion', () => {
        const s = getSmartSuggestions(10, 'normal', undefined);
        const keys = s.map((x) => x.textKey);
        expect(keys).not.toContain('weight:suggestions.rapidGain');
        expect(keys).not.toContain('weight:suggestions.stable');
    });
});

// ===========================================================================
// getSmartSuggestions — listenBody always-present + 4-item cap
// ===========================================================================

describe('getSmartSuggestions — invariants', () => {
    test('returns at most 4 suggestions', () => {
        // T1 (2) + status low (1) + rapid_gain trend (1) + listenBody (1) = 5 -> capped to 4
        const trend: Trend = {
            type: 'rapid_gain',
            weeklyRate: 1.5,
            messageKey: 'weight:trend.rapidGain',
            severity: 'warning',
        };
        const s = getSmartSuggestions(10, 'low', trend);
        expect(s).toHaveLength(4);
    });

    test('without enough modifiers, listenBody IS included (within cap)', () => {
        // T1 (2) + listenBody (1) = 3 -> all kept
        const s = getSmartSuggestions(10, 'normal');
        const keys = s.map((x) => x.textKey);
        expect(keys).toContain('weight:suggestions.listenBody');
        expect(s.length).toBeLessThanOrEqual(4);
    });

    test('when 5 would be generated, the 5th (listenBody) is dropped by the cap', () => {
        // T1 (2) + status high (1) + stable trend (1) + listenBody (1) = 5 -> last dropped
        const trend: Trend = {
            type: 'stable',
            weeklyRate: 0,
            messageKey: 'weight:trend.stable',
            severity: 'normal',
        };
        const s = getSmartSuggestions(10, 'high', trend);
        expect(s).toHaveLength(4);
        const keys = s.map((x) => x.textKey);
        // listenBody is appended last, so it is the one sliced off.
        expect(keys).not.toContain('weight:suggestions.listenBody');
        expect(keys).toContain('weight:suggestions.stable');
    });

    test('every suggestion has a non-empty icon and a weight:suggestions.* key', () => {
        const s = getSmartSuggestions(20, 'normal');
        for (const item of s) {
            expect(typeof item.icon).toBe('string');
            expect(item.icon.length).toBeGreaterThan(0);
            expect(item.textKey.startsWith('weight:suggestions.')).toBe(true);
            expect(['hydration', 'nutrition', 'activity', 'rest', 'medical']).toContain(item.category);
        }
    });
});

// ===========================================================================
// getTrimesterMessage
// ===========================================================================

describe('getTrimesterMessage', () => {
    test('week <= 13 => t1', () => {
        expect(getTrimesterMessage(1)).toBe('weight:trimester.t1');
        expect(getTrimesterMessage(13)).toBe('weight:trimester.t1');
    });

    test('week 14 => t2 (boundary)', () => {
        expect(getTrimesterMessage(14)).toBe('weight:trimester.t2');
    });

    test('week <= 27 => t2', () => {
        expect(getTrimesterMessage(20)).toBe('weight:trimester.t2');
        expect(getTrimesterMessage(27)).toBe('weight:trimester.t2');
    });

    test('week 28 => t3 (boundary)', () => {
        expect(getTrimesterMessage(28)).toBe('weight:trimester.t3');
    });

    test('week > 27 => t3', () => {
        expect(getTrimesterMessage(40)).toBe('weight:trimester.t3');
    });

    test('edge: week 0 / negative still maps to t1 (no lower bound guard)', () => {
        expect(getTrimesterMessage(0)).toBe('weight:trimester.t1');
        expect(getTrimesterMessage(-5)).toBe('weight:trimester.t1');
    });
});
