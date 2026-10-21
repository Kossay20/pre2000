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
    getAllWeightEntries,
    latestWeighingPerDay,
    weighingsOnDay,
    gaugeDotPercent,
    GAUGE_BAND_START_PCT,
    GAUGE_BAND_END_PCT,
    saveWeightSetup,
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

    it('past the due date (a weigh-in filed under week 41 or 42) keeps the term range', () => {
        expect(getRecommendedWeightRange(60, 165, 41)).toEqual(getRecommendedWeightRange(60, 165, 40));
        expect(getRecommendedWeightRange(60, 165, 42)).toEqual(getRecommendedWeightRange(60, 165, 40));
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
// getAllWeightEntries — one weight history for the tracker and the dashboard
// ==========================================================================

describe('getAllWeightEntries', () => {
    const snapshotFor = (name: string) =>
        name === 'weight_entries'
            ? makeSnapshot([
                { id: 'w1', user_id: 'u1', weight: 68.4, date: '2026-09-30T10:00:00.000Z', week_of_pregnancy: 32 },
            ])
            : ({
                docs: [
                    { id: 'h1', data: () => ({ user_id: 'u1', type: 'weight', value: 69, date: '2026-09-30T12:00:00.000Z', week: 32 }) },
                    { id: 'h2', data: () => ({ user_id: 'u1', type: 'weight', value: 'corrupt', date: '2026-09-29T12:00:00.000Z' }) },
                ],
            });

    it('includes the weighings logged from the Health dashboard, newest first', async () => {
        // A weight entered on Health (healthMetrics) never reached "Mon Poids", so the two
        // screens disagreed on her latest weight.
        mockGetDocs.mockImplementation(((q: any) => Promise.resolve(snapshotFor(q.__query[0].__collection))) as never);
        const all = await getAllWeightEntries('u1');
        expect(all.map((e) => [e.id, e.weight, e.source])).toEqual([
            ['h1', 69, 'healthMetrics'],
            ['w1', 68.4, 'weight_entries'],
        ]);
        expect(all[0].week_of_pregnancy).toBe(32);
        mockGetDocs.mockReset();
    });

    it('a guest has only the device copy', async () => {
        memStore['@weight_entries_guest_x'] = JSON.stringify([
            { id: 'g1', user_id: 'guest_x', weight: 60, date: '2026-01-01T00:00:00.000Z', week_of_pregnancy: 5 },
        ]);
        expect((await getAllWeightEntries('guest_x')).map((e) => e.id)).toEqual(['g1']);
        expect(mockGetDocs).not.toHaveBeenCalled();
    });

    it('deletes a dashboard weighing from its own collection', async () => {
        mockDeleteDoc.mockResolvedValueOnce(undefined as never);
        await deleteWeightEntry('u1', 'h1', 'healthMetrics');
        expect(doc).toHaveBeenCalledWith({}, 'healthMetrics', 'h1');
    });
});

// ==========================================================================
// latestWeighingPerDay — one weighing a day across the tracker and the dashboard
// ==========================================================================

describe('latestWeighingPerDay', () => {
    const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute).toISOString();
    const entry = (id: string, weight: number, date: string, source: WeightEntry['source']): WeightEntry => ({
        id, user_id: 'u1', weight, date, week_of_pregnancy: 32, source,
    });

    it('keeps the later weighing of a day, whichever screen logged it (wave B: 68.4 tracker + 69 Health)', () => {
        const tracker = entry('w1', 68.4, at(30, 10), 'weight_entries');
        const health = entry('h1', 69, at(30, 12), 'healthMetrics');
        const yesterday = entry('w0', 68, at(29, 9), 'weight_entries');
        expect(latestWeighingPerDay([tracker, yesterday, health]).map((e) => [e.id, e.weight])).toEqual([
            ['h1', 69],
            ['w0', 68],
        ]);
        // The later one wins when it is the tracker's too.
        const laterTracker = entry('w2', 68.8, at(30, 18), 'weight_entries');
        expect(latestWeighingPerDay([health, laterTracker]).map((e) => e.id)).toEqual(['w2']);
    });

    it('is deterministic at the same instant: the tracker entry, then the id, regardless of read order', () => {
        const same = at(30, 10);
        const a = entry('hb', 69, same, 'healthMetrics');
        const b = entry('wb', 68.4, same, 'weight_entries');
        const c = entry('wa', 68.5, same, 'weight_entries');
        for (const order of [[a, b, c], [c, b, a], [b, a, c]]) {
            expect(latestWeighingPerDay(order).map((e) => e.id)).toEqual(['wa']);
        }
    });

    it('groups by her local day and does not touch the input list', () => {
        const late = entry('late', 70, at(30, 23, 30), 'weight_entries');
        const early = entry('early', 69, at(1, 0, 15), 'healthMetrics'); // 1 Sept, another day
        const input = [late, early];
        expect(latestWeighingPerDay(input).map((e) => e.id)).toEqual(['late', 'early']);
        expect(input).toEqual([late, early]);
    });

    it('the tracker and the PDF apply it; reset still deletes every weighing', () => {
        const fs = require('fs');
        const path = require('path');
        const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
        const tracker = read('src/screens/WeightTrackerScreen.tsx');
        expect(tracker).toMatch(/const history = latestWeighingPerDay\(await getAllWeightEntries\(userId\)\);/);
        // handleResetData deletes from the unfiltered list.
        expect(tracker).toMatch(/const history = await getAllWeightEntries\(userId\);\s*for \(const e of history\) await deleteWeightEntry/);
        expect(read('src/screens/SettingsScreen.tsx')).toMatch(/latestWeighingPerDay\(await getAllWeightEntries\(userId\)\)/);
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

// ==========================================================================
// saveWeightSetup — the setup must reach where the profile lives
// ==========================================================================

describe('saveWeightSetup', () => {
    const contacts = [{ id: 'c1', name: 'Sami', phone: '+216 20 000 000' }];

    it('signed in: writes height and pre-pregnancy weight to the account profile', async () => {
        const updateAccountProfile = jest.fn().mockResolvedValue({ ok: true });
        const setLocalProfile = jest.fn();
        const result = await saveWeightSetup({
            profile: { firstName: 'Amira', country: 'France' },
            prePregnancyWeight: 60,
            height: 165,
            signedIn: true,
            updateAccountProfile,
            setLocalProfile,
        });
        expect(result).toEqual({ ok: true });
        expect(updateAccountProfile).toHaveBeenCalledWith({ prePregnancyWeight: 60, height: 165 });
        // PregnancyContext.setProfile only updates memory for an account.
        expect(setLocalProfile).not.toHaveBeenCalled();
    });

    it('signed in: reports a refused write instead of claiming success', async () => {
        const result = await saveWeightSetup({
            profile: null,
            prePregnancyWeight: 60,
            height: 165,
            signedIn: true,
            updateAccountProfile: jest.fn().mockResolvedValue({ ok: false, error: 'permission-denied' }),
            setLocalProfile: jest.fn(),
        });
        expect(result).toEqual({ ok: false, error: 'permission-denied' });
    });

    it("guest: saves on the device and keeps the profile's other fields", async () => {
        const setLocalProfile = jest.fn().mockResolvedValue(undefined);
        const result = await saveWeightSetup({
            profile: { firstName: 'Amira', country: 'Tunisie', lmp: '2026-02-10', emergencyContacts: contacts },
            prePregnancyWeight: 58.5,
            height: 160,
            signedIn: false,
            updateAccountProfile: jest.fn(),
            setLocalProfile,
        });
        expect(result).toEqual({ ok: true });
        expect(setLocalProfile).toHaveBeenCalledWith({
            firstName: 'Amira',
            country: 'Tunisie',
            lmp: '2026-02-10',
            emergencyContacts: contacts,
            prePregnancyWeight: 58.5,
            height: 160,
        });
    });

    it('guest: a failed device write is a failure', async () => {
        const result = await saveWeightSetup({
            profile: null,
            prePregnancyWeight: 60,
            height: 165,
            signedIn: false,
            updateAccountProfile: jest.fn(),
            setLocalProfile: jest.fn().mockRejectedValue(new Error('disk full')),
        });
        expect(result).toEqual({ ok: false, error: 'disk full' });
    });
});

// ===========================================================================
// weighingsOnDay — the "replace today's weighing?" list, shared by both entry forms (B-001)
// ===========================================================================

describe('weighingsOnDay', () => {
    const at = (y: number, m: number, d: number, h: number) => new Date(y, m, d, h).toISOString();
    const entry = (id: string, weight: number, date: string, source: WeightEntry['source']): WeightEntry =>
        ({ id, user_id: 'u1', weight, date, week_of_pregnancy: 32, source });

    it("returns the day's weighings from both sources, newest first, and nothing from other days", () => {
        const tracker = entry('w1', 68.4, at(2026, 9, 1, 8), 'weight_entries');
        const health = entry('h1', 69, at(2026, 9, 1, 19), 'healthMetrics');
        const yesterday = entry('w0', 68, at(2026, 8, 30, 23), 'weight_entries');
        expect(weighingsOnDay([tracker, yesterday, health], '2026-10-01').map((e) => e.id)).toEqual(['h1', 'w1']);
        expect(weighingsOnDay([yesterday], '2026-10-01')).toEqual([]);
    });

    it('the day is the local day: 23:30 the evening before is not today', () => {
        const lateYesterday = entry('w0', 68, new Date(2026, 8, 30, 23, 30).toISOString(), 'weight_entries');
        const earlyToday = entry('w1', 68.2, new Date(2026, 9, 1, 0, 30).toISOString(), 'weight_entries');
        expect(weighingsOnDay([lateYesterday, earlyToday], '2026-10-01').map((e) => e.id)).toEqual(['w1']);
    });
});

// ===========================================================================
// gaugeDotPercent — an in-range weight is drawn inside the green band (B-028)
// ===========================================================================

describe('gaugeDotPercent', () => {
    it('the band edges are the range bounds', () => {
        expect(gaugeDotPercent(68.2, 68.2, 71.9)).toBeCloseTo(GAUGE_BAND_START_PCT, 5);
        expect(gaugeDotPercent(71.9, 68.2, 71.9)).toBeCloseTo(GAUGE_BAND_END_PCT, 5);
    });

    it('68.4 kg in a 68.2–71.9 range sits inside the band (it was drawn at 5 %, left of it)', () => {
        const pct = gaugeDotPercent(68.4, 68.2, 71.9);
        expect(pct).toBeGreaterThanOrEqual(GAUGE_BAND_START_PCT);
        expect(pct).toBeLessThanOrEqual(GAUGE_BAND_END_PCT);
        expect(pct).toBeCloseTo(10 + 80 * (0.2 / 3.7), 5);
    });

    it('every weight inside the range is inside the band, every weight outside is outside', () => {
        for (let w = 68.2; w <= 71.9; w += 0.1) {
            const pct = gaugeDotPercent(w, 68.2, 71.9);
            expect(pct).toBeGreaterThanOrEqual(GAUGE_BAND_START_PCT - 1e-9);
            expect(pct).toBeLessThanOrEqual(GAUGE_BAND_END_PCT + 1e-9);
        }
        expect(gaugeDotPercent(68.1, 68.2, 71.9)).toBeLessThan(GAUGE_BAND_START_PCT);
        expect(gaugeDotPercent(72, 68.2, 71.9)).toBeGreaterThan(GAUGE_BAND_END_PCT);
    });

    it('stays on the bar far outside the range, and centres on a degenerate range', () => {
        expect(gaugeDotPercent(40, 68.2, 71.9)).toBe(0);
        expect(gaugeDotPercent(120, 68.2, 71.9)).toBe(100);
        expect(gaugeDotPercent(60, 0, 0)).toBe(50);
        expect(gaugeDotPercent(Number.NaN, 68.2, 71.9)).toBe(50);
    });

    it('the band the dot is mapped onto is the one the stylesheet draws', () => {
        const fs = require('fs');
        const path = require('path');
        const css = fs.readFileSync(path.join(__dirname, '../../screens/WeightTrackerScreen.styles.ts'), 'utf8');
        const band = css.slice(css.indexOf('gaugeRange: {'), css.indexOf('gaugeDot: {'));
        expect(band).toContain(`left: '${GAUGE_BAND_START_PCT}%'`);
        expect(band).toContain(`right: '${100 - GAUGE_BAND_END_PCT}%'`);
    });
});
