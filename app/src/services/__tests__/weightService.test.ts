/**
 * Unit tests for weightService.
 *
 * Covers the 8 exported functions:
 *   Pure logic (no I/O):
 *     - calculateBMICategory       (BMI boundaries 18.5 / 25 / 30, strict <)
 *     - getRecommendedWeightRange  (T1 week<=13 vs T2-T3 formula)
 *     - evaluateWeightStatus       (nausea filter first, then below/above bands)
 *   Async (guest = AsyncStorage, auth = Firestore, error handling):
 *     - saveWeightEntry, getWeightHistory, deleteWeightEntry
 *     - getLatestWeight, hasWeightThisWeek
 *
 * NOTE on the task hint ("validation kg bounds, guest/empty-uid blocked"):
 * the source does NOT validate kg bounds and does NOT block empty uids.
 * An empty user_id ('') does not start with 'guest', so it flows to the
 * Firestore branch. Tests assert the ACTUAL behavior, per Rule 1.
 */

// --- Mocks (declared before importing the module under test) --------------

// In-memory AsyncStorage. Only getItem / setItem are exercised by the source.
const memStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn((k: string) => Promise.resolve(memStore[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => {
        memStore[k] = v;
        return Promise.resolve();
    }),
    removeItem: jest.fn((k: string) => {
        delete memStore[k];
        return Promise.resolve();
    }),
    multiRemove: jest.fn(() => Promise.resolve()),
    getAllKeys: jest.fn(() => Promise.resolve(Object.keys(memStore))),
}));

// Firestore primitives. orderBy is imported by the source (even if unused on
// the active query path) so we keep it defined to avoid an undefined symbol.
jest.mock('firebase/firestore', () => ({
    collection: jest.fn((_db: unknown, name: string) => ({ __collection: name })),
    addDoc: jest.fn(),
    query: jest.fn((...args: unknown[]) => ({ __query: args })),
    where: jest.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
    getDocs: jest.fn(),
    orderBy: jest.fn(),
    doc: jest.fn((_db: unknown, coll: string, id: string) => ({ __doc: { coll, id } })),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
}));

jest.mock('../../config/firebase', () => ({ db: {} }));

const mockLog = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
};
jest.mock('../../utils/logger', () => ({
    createLogger: () => mockLog,
}));

// --- Imports (after mocks) ------------------------------------------------

import {
    calculateBMICategory,
    getRecommendedWeightRange,
    evaluateWeightStatus,
    saveWeightEntry,
    getWeightHistory,
    deleteWeightEntry,
    getLatestWeight,
    hasWeightThisWeek,
    WeightEntry,
} from '../weightService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDoc, getDocs, deleteDoc, doc, collection } from 'firebase/firestore';

const mockAddDoc = addDoc as jest.MockedFunction<typeof addDoc>;
const mockGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;
const mockDeleteDoc = deleteDoc as jest.MockedFunction<typeof deleteDoc>;
const mockSetItem = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>;

beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(memStore)) delete memStore[k];
});

// Helper: build a Firestore-style snapshot from plain entry objects.
const makeSnapshot = (rows: Array<{ id: string } & Partial<WeightEntry>>) => ({
    docs: rows.map((r) => {
        const { id, ...rest } = r;
        return { id, data: () => rest };
    }),
});

// ==========================================================================
// calculateBMICategory
// ==========================================================================

describe('calculateBMICategory', () => {
    it('classifies underweight when BMI < 18.5', () => {
        // 45kg @ 170cm -> BMI 15.57
        const cat = calculateBMICategory(45, 170);
        expect(cat.category).toBe('underweight');
        expect(cat.minGain).toBe(12.5);
        expect(cat.maxGain).toBe(18);
        expect(cat.weeklyGainT2T3).toBe(0.5);
    });

    it('classifies normal in [18.5, 25)', () => {
        // 60kg @ 165cm -> BMI 22.04
        const cat = calculateBMICategory(60, 165);
        expect(cat.category).toBe('normal');
        expect(cat.minGain).toBe(11.5);
        expect(cat.maxGain).toBe(16);
    });

    it('treats BMI exactly 18.5 as normal (strict < boundary)', () => {
        // 53.41kg @ 170cm -> BMI 18.4810... pick a weight giving exactly 18.5
        // height 200cm (2m) -> BMI = weight / 4 ; weight 74 -> BMI 18.5
        const cat = calculateBMICategory(74, 200);
        expect(cat.category).toBe('normal');
    });

    it('classifies overweight in [25, 30)', () => {
        // 80kg @ 175cm -> BMI 26.12
        const cat = calculateBMICategory(80, 175);
        expect(cat.category).toBe('overweight');
        expect(cat.minGain).toBe(7);
        expect(cat.maxGain).toBe(11.5);
    });

    it('treats BMI exactly 25 as overweight (strict < boundary)', () => {
        // height 2m -> BMI = weight/4 ; weight 100 -> BMI 25
        const cat = calculateBMICategory(100, 200);
        expect(cat.category).toBe('overweight');
    });

    it('classifies obese when BMI >= 30', () => {
        // 100kg @ 165cm -> BMI 36.7
        const cat = calculateBMICategory(100, 165);
        expect(cat.category).toBe('obese');
        expect(cat.minGain).toBe(5);
        expect(cat.maxGain).toBe(9);
        expect(cat.weeklyGainT2T3).toBe(0.2);
    });

    it('treats BMI exactly 30 as obese (strict < boundary)', () => {
        // height 2m -> weight 120 -> BMI 30
        const cat = calculateBMICategory(120, 200);
        expect(cat.category).toBe('obese');
    });

    it('does not crash and returns obese for height 0 (BMI Infinity)', () => {
        const cat = calculateBMICategory(60, 0);
        expect(cat.category).toBe('obese');
    });
});

// ==========================================================================
// getRecommendedWeightRange
// ==========================================================================

describe('getRecommendedWeightRange', () => {
    it('week 0 yields zero gain (T1 progress = 0)', () => {
        const r = getRecommendedWeightRange(60, 165, 0);
        expect(r.targetGain.min).toBeCloseTo(0, 5);
        expect(r.targetGain.max).toBeCloseTo(0, 5);
        expect(r.min).toBeCloseTo(60, 5);
        expect(r.max).toBeCloseTo(60, 5);
    });

    it('week 13 is the top of the T1 branch (full 0.5-2kg gain)', () => {
        const r = getRecommendedWeightRange(60, 165, 13);
        // progress = 13/13 = 1 -> minGain 0.5, maxGain 2
        expect(r.targetGain.min).toBeCloseTo(0.5, 5);
        expect(r.targetGain.max).toBeCloseTo(2, 5);
        expect(r.min).toBeCloseTo(60.5, 5);
        expect(r.max).toBeCloseTo(62, 5);
    });

    it('week 7 is mid-T1 (linear progress)', () => {
        const r = getRecommendedWeightRange(60, 165, 7);
        const progress = 7 / 13;
        expect(r.targetGain.min).toBeCloseTo(0.5 * progress, 5);
        expect(r.targetGain.max).toBeCloseTo(2 * progress, 5);
    });

    it('week 14 enters the T2-T3 branch (one week of additional gain)', () => {
        const r = getRecommendedWeightRange(60, 165, 14);
        // normal: remainingMin = 11.5-0.5=11, remainingMax = 16-2=14
        // weeksInT2T3 = 1 -> add 11/27 and 14/27
        expect(r.targetGain.min).toBeCloseTo(0.5 + 11 / 27, 5);
        expect(r.targetGain.max).toBeCloseTo(2 + 14 / 27, 5);
    });

    it('week 40 collapses exactly to category total bounds (normal)', () => {
        const r = getRecommendedWeightRange(60, 165, 40);
        // weeksInT2T3 = 27 -> additional = full remaining; total = category bounds
        expect(r.targetGain.min).toBeCloseTo(11.5, 5);
        expect(r.targetGain.max).toBeCloseTo(16, 5);
        expect(r.min).toBeCloseTo(71.5, 5);
        expect(r.max).toBeCloseTo(76, 5);
    });

    it('uses the correct category bounds for an obese mother at week 40', () => {
        // 100kg @ 165cm -> obese (minGain 5, maxGain 9)
        const r = getRecommendedWeightRange(100, 165, 40);
        expect(r.targetGain.min).toBeCloseTo(5, 5);
        expect(r.targetGain.max).toBeCloseTo(9, 5);
        expect(r.min).toBeCloseTo(105, 5);
        expect(r.max).toBeCloseTo(109, 5);
    });
});

// ==========================================================================
// evaluateWeightStatus
// ==========================================================================

describe('evaluateWeightStatus', () => {
    // Anchor most cases at week 40, prePreg 60, height 165 -> range [71.5, 76]
    it('returns normal when weight is inside the recommended range', () => {
        const res = evaluateWeightStatus(73, 60, 165, 40);
        expect(res.status).toBe('normal');
        expect(res.messageKey).toBe('weight.status.normal');
        expect(res.gain).toBeCloseTo(13, 5);
    });

    it('returns lowSlight when below min by <= 2kg', () => {
        // current 70, min 71.5 -> belowMin 1.5
        const res = evaluateWeightStatus(70, 60, 165, 40);
        expect(res.status).toBe('low');
        expect(res.messageKey).toBe('weight.status.lowSlight');
        expect(res.gain).toBeCloseTo(10, 5);
    });

    it('returns lowSignificant when below min by > 2kg', () => {
        // current 68, min 71.5 -> belowMin 3.5
        const res = evaluateWeightStatus(68, 60, 165, 40);
        expect(res.status).toBe('low');
        expect(res.messageKey).toBe('weight.status.lowSignificant');
        expect(res.gain).toBeCloseTo(8, 5);
    });

    it('returns highSlight when above max by <= 2kg', () => {
        // current 77, max 76 -> aboveMax 1
        const res = evaluateWeightStatus(77, 60, 165, 40);
        expect(res.status).toBe('high');
        expect(res.messageKey).toBe('weight.status.highSlight');
        expect(res.gain).toBeCloseTo(17, 5);
    });

    it('returns highSignificant when above max by > 2kg', () => {
        // current 79, max 76 -> aboveMax 3
        const res = evaluateWeightStatus(79, 60, 165, 40);
        expect(res.status).toBe('high');
        expect(res.messageKey).toBe('weight.status.highSignificant');
        expect(res.gain).toBeCloseTo(19, 5);
    });

    it('applies the T1 nausea filter: slight loss in early pregnancy is normal', () => {
        // week 10, gain -2 (between -3 and 0) -> nausea/normal even though below range
        const res = evaluateWeightStatus(58, 60, 165, 10);
        expect(res.status).toBe('normal');
        expect(res.messageKey).toBe('weight.status.t1Nausea');
        expect(res.gain).toBeCloseTo(-2, 5);
    });

    it('nausea filter does NOT apply when loss is >= 3kg (falls through to low)', () => {
        // week 10, gain -4 -> beyond the nausea tolerance, normal band logic applies
        const res = evaluateWeightStatus(56, 60, 165, 10);
        expect(res.status).toBe('low');
        expect(res.messageKey).toBe('weight.status.lowSignificant');
        expect(res.gain).toBeCloseTo(-4, 5);
    });

    it('nausea filter applies up to and including week 14', () => {
        const res = evaluateWeightStatus(58.5, 60, 165, 14);
        expect(res.messageKey).toBe('weight.status.t1Nausea');
        expect(res.status).toBe('normal');
    });

    it('nausea filter does NOT apply past week 14', () => {
        // week 15, gain -2 -> no nausea exemption; below the (still tiny) range -> low
        const res = evaluateWeightStatus(58, 60, 165, 15);
        expect(res.status).toBe('low');
        expect(res.messageKey).not.toBe('weight.status.t1Nausea');
    });

    it('does not apply nausea filter when gain >= 0 in T1', () => {
        // week 10, current == prePreg -> gain 0. Nausea requires gain < 0, so it
        // is skipped. At week 10 the recommended range is tiny (min ~60.385), so
        // a flat 60kg sits just below min -> classified as low/lowSlight.
        const res = evaluateWeightStatus(60, 60, 165, 10);
        expect(res.messageKey).not.toBe('weight.status.t1Nausea');
        expect(res.status).toBe('low');
        expect(res.messageKey).toBe('weight.status.lowSlight');
        expect(res.gain).toBeCloseTo(0, 5);
    });

    it('exactly at min boundary (belowMin == 0) is treated as normal', () => {
        // week 40 range min = 71.5
        const res = evaluateWeightStatus(71.5, 60, 165, 40);
        expect(res.status).toBe('normal');
        expect(res.messageKey).toBe('weight.status.normal');
    });

    it('exactly at max boundary (aboveMax == 0) is treated as normal', () => {
        const res = evaluateWeightStatus(76, 60, 165, 40);
        expect(res.status).toBe('normal');
        expect(res.messageKey).toBe('weight.status.normal');
    });
});

// ==========================================================================
// saveWeightEntry
// ==========================================================================

describe('saveWeightEntry', () => {
    const baseEntry: Omit<WeightEntry, 'id'> = {
        user_id: 'guest_abc',
        weight: 65,
        date: '2026-05-01T00:00:00.000Z',
        week_of_pregnancy: 20,
    };

    it('guest mode: persists to AsyncStorage and returns a weight_<ts> id', async () => {
        const id = await saveWeightEntry(baseEntry);
        expect(id).toMatch(/^weight_\d+$/);
        // Stored under per-user key
        expect(mockSetItem).toHaveBeenCalledTimes(1);
        const [key, raw] = mockSetItem.mock.calls[0];
        expect(key).toBe('@weight_entries_guest_abc');
        const stored = JSON.parse(raw as string);
        expect(stored).toHaveLength(1);
        expect(stored[0].id).toBe(id);
        expect(stored[0].weight).toBe(65);
        // Firestore must NOT be touched in guest mode
        expect(mockAddDoc).not.toHaveBeenCalled();
    });

    it('guest mode: appends to existing entries', async () => {
        memStore['@weight_entries_guest_abc'] = JSON.stringify([
            { id: 'weight_1', user_id: 'guest_abc', weight: 60, date: '2026-04-01T00:00:00.000Z', week_of_pregnancy: 16 },
        ]);
        await saveWeightEntry(baseEntry);
        const stored = JSON.parse(memStore['@weight_entries_guest_abc']);
        expect(stored).toHaveLength(2);
    });

    it('authenticated mode: calls addDoc and returns the Firestore doc id', async () => {
        mockAddDoc.mockResolvedValueOnce({ id: 'fs_doc_42' } as never);
        const id = await saveWeightEntry({ ...baseEntry, user_id: 'user_123' });
        expect(id).toBe('fs_doc_42');
        expect(mockAddDoc).toHaveBeenCalledTimes(1);
        // payload includes the original entry fields plus a created_at timestamp
        const payload = mockAddDoc.mock.calls[0][1] as Record<string, unknown>;
        expect(payload.weight).toBe(65);
        expect(payload.user_id).toBe('user_123');
        expect(typeof payload.created_at).toBe('string');
        expect(mockSetItem).not.toHaveBeenCalled();
    });

    it('empty user_id is NOT blocked and routes to Firestore (no guest prefix)', async () => {
        // Documents actual behavior: '' does not start with 'guest'.
        mockAddDoc.mockResolvedValueOnce({ id: 'fs_empty' } as never);
        const id = await saveWeightEntry({ ...baseEntry, user_id: '' });
        expect(id).toBe('fs_empty');
        expect(mockAddDoc).toHaveBeenCalledTimes(1);
    });

    it('rethrows and logs when Firestore addDoc fails', async () => {
        const err = new Error('firestore down');
        mockAddDoc.mockRejectedValueOnce(err);
        await expect(saveWeightEntry({ ...baseEntry, user_id: 'user_x' })).rejects.toThrow('firestore down');
        expect(mockLog.error).toHaveBeenCalled();
    });
});

// ==========================================================================
// getWeightHistory
// ==========================================================================

describe('getWeightHistory', () => {
    it('guest mode: returns [] when nothing stored', async () => {
        const history = await getWeightHistory('guest_none');
        expect(history).toEqual([]);
    });

    it('guest mode: parses and sorts entries by date descending', async () => {
        memStore['@weight_entries_guest_x'] = JSON.stringify([
            { id: 'a', user_id: 'guest_x', weight: 60, date: '2026-01-01T00:00:00.000Z', week_of_pregnancy: 5 },
            { id: 'b', user_id: 'guest_x', weight: 62, date: '2026-03-01T00:00:00.000Z', week_of_pregnancy: 12 },
            { id: 'c', user_id: 'guest_x', weight: 61, date: '2026-02-01T00:00:00.000Z', week_of_pregnancy: 9 },
        ]);
        const history = await getWeightHistory('guest_x');
        expect(history.map((e) => e.id)).toEqual(['b', 'c', 'a']);
    });

    it('authenticated mode: maps snapshot docs and sorts by date descending', async () => {
        mockGetDocs.mockResolvedValueOnce(
            makeSnapshot([
                { id: 'd1', user_id: 'u1', weight: 70, date: '2026-02-10T00:00:00.000Z', week_of_pregnancy: 22 },
                { id: 'd2', user_id: 'u1', weight: 71, date: '2026-04-10T00:00:00.000Z', week_of_pregnancy: 30 },
            ]) as never
        );
        const history = await getWeightHistory('u1');
        expect(history).toHaveLength(2);
        expect(history[0].id).toBe('d2');
        expect(history[1].id).toBe('d1');
        // doc id is merged into the entry
        expect(history[0].weight).toBe(71);
    });

    it('authenticated mode: returns [] (swallows) when getDocs throws', async () => {
        mockGetDocs.mockRejectedValueOnce(new Error('index error'));
        const history = await getWeightHistory('u_fail');
        expect(history).toEqual([]);
        expect(mockLog.error).toHaveBeenCalled();
    });

    it('guest mode: returns [] (swallows) when stored JSON is corrupt', async () => {
        memStore['@weight_entries_guest_bad'] = 'not-json{';
        const history = await getWeightHistory('guest_bad');
        expect(history).toEqual([]);
        expect(mockLog.error).toHaveBeenCalled();
    });
});

// ==========================================================================
// deleteWeightEntry
// ==========================================================================

describe('deleteWeightEntry', () => {
    it('guest mode: removes the matching entry and persists the rest', async () => {
        memStore['@weight_entries_guest_d'] = JSON.stringify([
            { id: 'keep', user_id: 'guest_d', weight: 60, date: '2026-01-01T00:00:00.000Z', week_of_pregnancy: 5 },
            { id: 'drop', user_id: 'guest_d', weight: 61, date: '2026-02-01T00:00:00.000Z', week_of_pregnancy: 9 },
        ]);
        await deleteWeightEntry('guest_d', 'drop');
        const stored = JSON.parse(memStore['@weight_entries_guest_d']);
        expect(stored.map((e: WeightEntry) => e.id)).toEqual(['keep']);
        expect(mockDeleteDoc).not.toHaveBeenCalled();
    });

    it('guest mode: deleting an unknown id is a no-op that keeps all entries', async () => {
        memStore['@weight_entries_guest_d2'] = JSON.stringify([
            { id: 'a', user_id: 'guest_d2', weight: 60, date: '2026-01-01T00:00:00.000Z', week_of_pregnancy: 5 },
        ]);
        await deleteWeightEntry('guest_d2', 'does_not_exist');
        const stored = JSON.parse(memStore['@weight_entries_guest_d2']);
        expect(stored).toHaveLength(1);
    });

    it('authenticated mode: calls deleteDoc with the entry id', async () => {
        mockDeleteDoc.mockResolvedValueOnce(undefined as never);
        await deleteWeightEntry('user_z', 'fs_id_9');
        expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
        expect(doc).toHaveBeenCalledWith({}, 'weight_entries', 'fs_id_9');
    });

    it('rethrows and logs when deleteDoc fails', async () => {
        mockDeleteDoc.mockRejectedValueOnce(new Error('delete failed'));
        await expect(deleteWeightEntry('user_z', 'fs_id_9')).rejects.toThrow('delete failed');
        expect(mockLog.error).toHaveBeenCalled();
    });
});

// ==========================================================================
// getLatestWeight
// ==========================================================================

describe('getLatestWeight', () => {
    it('returns null when there is no history', async () => {
        const latest = await getLatestWeight('guest_empty');
        expect(latest).toBeNull();
    });

    it('returns the most recent entry (first after date-desc sort)', async () => {
        memStore['@weight_entries_guest_l'] = JSON.stringify([
            { id: 'old', user_id: 'guest_l', weight: 60, date: '2026-01-01T00:00:00.000Z', week_of_pregnancy: 5 },
            { id: 'new', user_id: 'guest_l', weight: 64, date: '2026-05-01T00:00:00.000Z', week_of_pregnancy: 20 },
        ]);
        const latest = await getLatestWeight('guest_l');
        expect(latest?.id).toBe('new');
        expect(latest?.weight).toBe(64);
    });
});

// ==========================================================================
// hasWeightThisWeek
// ==========================================================================

describe('hasWeightThisWeek', () => {
    it('returns false when there is no history', async () => {
        const has = await hasWeightThisWeek('guest_empty');
        expect(has).toBe(false);
    });

    it('returns true when an entry was logged just now (this week)', async () => {
        memStore['@weight_entries_guest_w'] = JSON.stringify([
            { id: 'now', user_id: 'guest_w', weight: 65, date: new Date().toISOString(), week_of_pregnancy: 20 },
        ]);
        const has = await hasWeightThisWeek('guest_w');
        expect(has).toBe(true);
    });

    it('returns false when the only entry is over a year old', async () => {
        const old = new Date();
        old.setFullYear(old.getFullYear() - 1);
        memStore['@weight_entries_guest_old'] = JSON.stringify([
            { id: 'old', user_id: 'guest_old', weight: 65, date: old.toISOString(), week_of_pregnancy: 20 },
        ]);
        const has = await hasWeightThisWeek('guest_old');
        expect(has).toBe(false);
    });
});
