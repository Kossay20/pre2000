/**
 * Non-regression tests for healthService.getMergedWeightHistory (P3.7)
 *
 * Garde-fou: la fusion `healthMetrics` (legacy) + `weight_entries` (V2) doit
 * rester une seule source de vérité, triée par date ASC, avec conversion
 * des `WeightEntry` (champ `weight`) vers `HealthMetric` (champ `value`).
 *
 * Couvre aussi les chemins guest / userId vide pour bloquer toute régression
 * du contournement Firestore.
 */

import { getDocs } from 'firebase/firestore';
import { getMergedWeightHistory, getHealthStats } from '../healthService';
import { getWeightHistory as getWeightHistoryV2 } from '../weightService';
import { loadUserEvents } from '../calendarService';
import { loadTaskStatusesAuth } from '../reminderPersistence';

jest.mock('../../config/firebase', () => ({ db: {} }));

jest.mock('firebase/firestore', () => ({
    collection: jest.fn(),
    addDoc: jest.fn(),
    getDocs: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    setDoc: jest.fn(),
    doc: jest.fn(),
    deleteDoc: jest.fn(),
    updateDoc: jest.fn(),
    Timestamp: { now: () => ({ toDate: () => new Date('2025-01-01T00:00:00Z') }) },
}));

jest.mock('../weightService', () => ({
    getWeightHistory: jest.fn(),
}));

jest.mock('../calendarService', () => ({
    loadUserEvents: jest.fn(),
}));

jest.mock('../reminderPersistence', () => ({
    loadTaskStatusesAuth: jest.fn(),
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

describe('healthService.getMergedWeightHistory (P3.7)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('guest / invalid userId guards', () => {
        it('returns [] for guest userId without touching Firestore or weightService', async () => {
            const result = await getMergedWeightHistory('guest_abc');

            expect(result).toEqual([]);
            expect(getDocs).not.toHaveBeenCalled();
            expect(getWeightHistoryV2).not.toHaveBeenCalled();
        });

        it('returns [] for empty string userId', async () => {
            const result = await getMergedWeightHistory('');

            expect(result).toEqual([]);
            expect(getDocs).not.toHaveBeenCalled();
            expect(getWeightHistoryV2).not.toHaveBeenCalled();
        });

        it('returns [] for undefined userId without crashing', async () => {
            const result = await getMergedWeightHistory(undefined as unknown as string);

            expect(result).toEqual([]);
            expect(getDocs).not.toHaveBeenCalled();
        });
    });

    describe('merge logic', () => {
        it('merges legacy healthMetrics + V2 weight_entries sorted by date ascending', async () => {
            (getDocs as jest.Mock).mockResolvedValueOnce({
                docs: [
                    {
                        id: 'm1',
                        data: () => ({
                            user_id: 'u1',
                            type: 'weight',
                            value: 60,
                            date: '2025-01-15T00:00:00Z',
                            week: 14,
                            notes: '',
                            created_at: '2025-01-15T00:00:00Z',
                        }),
                    },
                    {
                        id: 'm2',
                        data: () => ({
                            user_id: 'u1',
                            type: 'weight',
                            value: 61,
                            date: '2025-02-01T00:00:00Z',
                            week: 17,
                            notes: '',
                            created_at: '2025-02-01T00:00:00Z',
                        }),
                    },
                ],
            });

            (getWeightHistoryV2 as jest.Mock).mockResolvedValueOnce([
                {
                    id: 'w1',
                    user_id: 'u1',
                    weight: 62,
                    date: '2025-01-25T00:00:00Z',
                    week_of_pregnancy: 16,
                    notes: '',
                },
                {
                    id: 'w2',
                    user_id: 'u1',
                    weight: 63,
                    date: '2025-03-01T00:00:00Z',
                    week_of_pregnancy: 21,
                    notes: 'note',
                },
            ]);

            const result = await getMergedWeightHistory('u1');

            expect(result).toHaveLength(4);
            expect(result.map(r => r.date)).toEqual([
                '2025-01-15T00:00:00Z',
                '2025-01-25T00:00:00Z',
                '2025-02-01T00:00:00Z',
                '2025-03-01T00:00:00Z',
            ]);
        });

        it('converts V2 WeightEntry into HealthMetric shape (weight → value, week_of_pregnancy → week)', async () => {
            (getDocs as jest.Mock).mockResolvedValueOnce({ docs: [] });
            (getWeightHistoryV2 as jest.Mock).mockResolvedValueOnce([
                {
                    id: 'w1',
                    user_id: 'u1',
                    weight: 62.5,
                    date: '2025-04-15T10:00:00Z',
                    week_of_pregnancy: 27,
                    notes: 'after lunch',
                },
            ]);

            const result = await getMergedWeightHistory('u1');

            expect(result).toHaveLength(1);
            const converted = result[0];
            expect(converted.metric_id).toBe('w1');
            expect(converted.user_id).toBe('u1');
            expect(converted.type).toBe('weight');
            expect(converted.value).toBe(62.5);
            expect(converted.week).toBe(27);
            expect(converted.notes).toBe('after lunch');
        });

        it('returns only legacy entries when V2 source is empty', async () => {
            (getDocs as jest.Mock).mockResolvedValueOnce({
                docs: [
                    {
                        id: 'm1',
                        data: () => ({
                            user_id: 'u1',
                            type: 'weight',
                            value: 70,
                            date: '2025-04-01T00:00:00Z',
                            week: 25,
                        }),
                    },
                ],
            });
            (getWeightHistoryV2 as jest.Mock).mockResolvedValueOnce([]);

            const result = await getMergedWeightHistory('u1');

            expect(result).toHaveLength(1);
            expect(result[0].metric_id).toBe('m1');
            expect(result[0].value).toBe(70);
        });

        it('returns only V2 entries when legacy source is empty', async () => {
            (getDocs as jest.Mock).mockResolvedValueOnce({ docs: [] });
            (getWeightHistoryV2 as jest.Mock).mockResolvedValueOnce([
                {
                    id: 'w1',
                    user_id: 'u1',
                    weight: 65,
                    date: '2025-04-15T00:00:00Z',
                    week_of_pregnancy: 27,
                },
            ]);

            const result = await getMergedWeightHistory('u1');

            expect(result).toHaveLength(1);
            expect(result[0].metric_id).toBe('w1');
            expect(result[0].value).toBe(65);
        });

        // F-HS-05: same-date entries across the two sources must NOT double-count.
        it('deduplicates same-date entries, keeping the most recent created_at per day', async () => {
            // Legacy entry for 2025-02-10 created early; V2 entry for the SAME day created later.
            (getDocs as jest.Mock).mockResolvedValueOnce({
                docs: [
                    {
                        id: 'm1',
                        data: () => ({
                            user_id: 'u1',
                            type: 'weight',
                            value: 60,
                            date: '2025-02-10T08:00:00Z',
                            week: 16,
                            created_at: '2025-02-10T08:00:00Z',
                        }),
                    },
                    {
                        id: 'm2',
                        data: () => ({
                            user_id: 'u1',
                            type: 'weight',
                            value: 65,
                            date: '2025-03-01T08:00:00Z',
                            week: 19,
                            created_at: '2025-03-01T08:00:00Z',
                        }),
                    },
                ],
            });
            // V2 entry shares the calendar day 2025-02-10 but has a later created_at (date field).
            (getWeightHistoryV2 as jest.Mock).mockResolvedValueOnce([
                {
                    id: 'w1',
                    user_id: 'u1',
                    weight: 62,
                    date: '2025-02-10T20:00:00Z',
                    week_of_pregnancy: 16,
                },
            ]);

            const result = await getMergedWeightHistory('u1');

            // 3 raw entries → 2 distinct days.
            expect(result).toHaveLength(2);
            expect(result.map(r => r.date.slice(0, 10))).toEqual(['2025-02-10', '2025-03-01']);
            // For the duplicated day, the later (V2) entry wins → value 62, not 60.
            const feb10 = result.find(r => r.date.slice(0, 10) === '2025-02-10');
            expect(feb10?.value).toBe(62);
        });

        it('every entry has the HealthMetric required fields after merge', async () => {
            (getDocs as jest.Mock).mockResolvedValueOnce({
                docs: [
                    {
                        id: 'm1',
                        data: () => ({
                            user_id: 'u1',
                            type: 'weight',
                            value: 60,
                            date: '2025-01-01T00:00:00Z',
                            week: 12,
                        }),
                    },
                ],
            });
            (getWeightHistoryV2 as jest.Mock).mockResolvedValueOnce([
                {
                    id: 'w1',
                    user_id: 'u1',
                    weight: 61,
                    date: '2025-02-01T00:00:00Z',
                    week_of_pregnancy: 17,
                },
            ]);

            const result = await getMergedWeightHistory('u1');

            for (const m of result) {
                expect(m.metric_id).toBeDefined();
                expect(m.user_id).toBe('u1');
                expect(m.type).toBe('weight');
                expect(typeof m.value).toBe('number');
                expect(m.date).toBeDefined();
                expect(typeof m.week).toBe('number');
            }
        });
    });
});

/**
 * F-HS-04 + F-HS-05 — getHealthStats weight baseline & gain.
 *
 * Weight values are driven through the V2 source (independently mocked) so they are
 * deterministic regardless of Promise.all ordering; getDocs (legacy weight + BP) is
 * stubbed to return no docs.
 */
describe('healthService.getHealthStats — weight baseline (F-HS-04 / F-HS-05)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // No legacy healthMetrics weight rows and no BP rows.
        (getDocs as jest.Mock).mockResolvedValue({ docs: [] });
        (loadUserEvents as jest.Mock).mockResolvedValue([]);
        (loadTaskStatusesAuth as jest.Mock).mockResolvedValue({});
    });

    it('uses prePregnancyWeight as the gain baseline, not the first logged entry', async () => {
        // First logged entry is 70kg mid-pregnancy; pre-pregnancy was 60kg, latest is 72kg.
        (getWeightHistoryV2 as jest.Mock).mockResolvedValueOnce([
            { id: 'w1', user_id: 'u1', weight: 70, date: '2025-02-01T00:00:00Z', week_of_pregnancy: 18 },
            { id: 'w2', user_id: 'u1', weight: 72, date: '2025-03-01T00:00:00Z', week_of_pregnancy: 22 },
        ]);

        const stats = await getHealthStats('u1', 22, 60);

        expect(stats.weightInitial).toBe(60);   // clinical baseline, NOT 70
        expect(stats.weightCurrent).toBe(72);
        expect(stats.weightGain).toBe(12);       // 72 - 60, not 72 - 70
    });

    it('falls back to the earliest logged entry when prePregnancyWeight is missing', async () => {
        (getWeightHistoryV2 as jest.Mock).mockResolvedValueOnce([
            { id: 'w1', user_id: 'u1', weight: 68, date: '2025-02-01T00:00:00Z', week_of_pregnancy: 18 },
            { id: 'w2', user_id: 'u1', weight: 71, date: '2025-03-01T00:00:00Z', week_of_pregnancy: 22 },
        ]);

        const stats = await getHealthStats('u1', 22); // no prePregnancyWeight

        expect(stats.weightInitial).toBe(68);
        expect(stats.weightCurrent).toBe(71);
        expect(stats.weightGain).toBe(3);
    });

    it('ignores a non-positive prePregnancyWeight and falls back to logged data', async () => {
        (getWeightHistoryV2 as jest.Mock).mockResolvedValueOnce([
            { id: 'w1', user_id: 'u1', weight: 64, date: '2025-02-01T00:00:00Z', week_of_pregnancy: 18 },
        ]);

        const stats = await getHealthStats('u1', 18, 0);

        expect(stats.weightInitial).toBe(64);
        expect(stats.weightGain).toBe(0); // single entry → current === initial
    });

    it('deduplicates same-date weights so gain is computed on distinct days (F-HS-05)', async () => {
        // Two V2 entries for the same calendar day; later one (70.5) should win.
        (getWeightHistoryV2 as jest.Mock).mockResolvedValueOnce([
            { id: 'w1', user_id: 'u1', weight: 70.0, date: '2025-03-10T08:00:00Z', week_of_pregnancy: 24 },
            { id: 'w2', user_id: 'u1', weight: 70.5, date: '2025-03-10T19:00:00Z', week_of_pregnancy: 24 },
        ]);

        const stats = await getHealthStats('u1', 24, 60);

        // Latest distinct-day weight is 70.5 (dedup kept the most-recent same-day entry).
        expect(stats.weightCurrent).toBe(70.5);
        expect(stats.weightInitial).toBe(60);
        expect(stats.weightGain).toBeCloseTo(10.5, 5);
    });

    it('returns guest stats without weight fields for guest userId', async () => {
        const stats = await getHealthStats('guest_x', 20, 60);
        expect(stats.weightInitial).toBeUndefined();
        expect(stats.weightGain).toBeUndefined();
        expect(getDocs).not.toHaveBeenCalled();
    });
});
