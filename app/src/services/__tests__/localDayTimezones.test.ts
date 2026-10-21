/**
 * @jest-environment ./testing/timezoneEnvironment.js
 *
 * Every "day" the planning features derive must be the user's LOCAL day. Run under the two
 * kinds of zone where the UTC day differs from the local one — New York in the evening
 * (local behind UTC) and Kiritimati, UTC+14 (local ahead) — with the clock frozen at a
 * moment where they part:
 *   - MA JOURNÉE lists today's appointment (dailyChecklistService compared the UTC ISO
 *     string's first ten characters with the local day and dropped it);
 *   - the symptom log is filed under the local day (healthService used the UTC day);
 *   - a reminder completion counts for the local day, and the streak reads it back;
 *   - a task completed today shows up in the statistics;
 *   - "this week" (Calendar count and Home pill) runs local midnight to local midnight.
 */

declare const setTestTimezone: (tz: string) => void;

jest.mock('../../config/firebase', () => ({ db: {}, auth: {}, analytics: Promise.resolve(null) }));

jest.mock('firebase/firestore', () => ({
    collection: jest.fn(),
    addDoc: jest.fn(),
    getDocs: jest.fn(async () => ({ docs: [], empty: true })),
    getDoc: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    setDoc: jest.fn(async () => undefined),
    doc: jest.fn((_db: unknown, coll: string, id: string) => ({ coll, id })),
    deleteDoc: jest.fn(),
    deleteField: jest.fn(),
    updateDoc: jest.fn(),
    Timestamp: { now: () => ({ toDate: () => new Date() }) },
}));

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    getAllKeys: jest.fn(async () => Object.keys(mockStore)),
    multiRemove: jest.fn(async (keys: string[]) => { keys.forEach((k) => delete mockStore[k]); }),
    removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
}));

jest.mock('../hydrationService', () => ({
    loadHydrationData: jest.fn(async () => ({ currentIntake: 0, dailyGoal: 3000 })),
}));
jest.mock('../rdvNotificationService', () => ({ cancelRDVReminders: jest.fn() }));
jest.mock('../weightService', () => ({ getWeightHistory: jest.fn(async () => []) }));
jest.mock('../reminderPersistence', () => ({ loadTaskStatusesAuth: jest.fn(async () => []) }));
jest.mock('../../utils/logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));

import { setDoc } from 'firebase/firestore';
import { generateDailyChecklist, getHistoricalData } from '../dailyChecklistService';
import { saveDailySymptoms } from '../healthService';
import { calculateStreak, getReminderCompletions, markReminderAsCompleted } from '../remindersV2Service';
import { countEventsInRange, getCurrentPregnancyWeekRange } from '../calendarService';
import { UserEvent, UserTask } from '../../types';
import { toLocalDateKey } from '../../utils/localDate';

const event = (id: string, date: string): UserEvent => ({
    event_id: id,
    user_id: 'u1',
    title: `RDV ${id}`,
    date,
    week: 32,
    type: 'appointment',
    created_at: date,
});

describe.each([
    // 20:30 on 30 Sept in New York = 00:30 on 1 Oct UTC.
    { tz: 'America/New_York', now: '2026-10-01T00:30:00.000Z', localDay: '2026-09-30', utcDay: '2026-10-01' },
    // 11:06 on 1 Oct in Kiritimati = 21:06 on 30 Sept UTC.
    { tz: 'Pacific/Kiritimati', now: '2026-09-30T21:06:00.000Z', localDay: '2026-10-01', utcDay: '2026-09-30' },
])('$tz', ({ tz, now, localDay, utcDay }) => {
    beforeAll(() => {
        setTestTimezone(tz);
    });

    beforeEach(() => {
        jest.useFakeTimers({ now: new Date(now), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
        Object.keys(mockStore).forEach((k) => delete mockStore[k]);
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('the clock is on the local day, which is not the UTC day', () => {
        expect(toLocalDateKey(new Date())).toBe(localDay);
        expect(new Date().toISOString().slice(0, 10)).toBe(utcDay);
    });

    it("MA JOURNÉE lists today's appointment even when its UTC date is another day", async () => {
        const inOneHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const items = await generateDailyChecklist([event('today', inOneHour), event('tomorrow', tomorrow)], 32);
        expect(items.filter((i) => i.type === 'appointment').map((i) => i.id)).toEqual(['apt-today']);
    });

    it('the symptom log is filed under the local day', async () => {
        const id = await saveDailySymptoms('u1', 32, ['nausea']);
        expect(id).toBe(`u1_${localDay}`);
        const written = (setDoc as jest.Mock).mock.calls[0][1];
        expect(written.date).toBe(localDay);
    });

    it('a reminder completion counts for the local day and keeps the streak', async () => {
        await markReminderAsCompleted('rem_med_prenatal_vitamins', true, 'u1');
        const dates = await getReminderCompletions('rem_med_prenatal_vitamins', 'u1');
        expect(dates).toEqual([localDay]);
        expect(calculateStreak(dates)).toBe(1);
    });

    it('a task completed today counts in the statistics — no "Pas encore de données"', async () => {
        const task: UserTask = {
            task_id: 't1',
            user_id: 'u1',
            title: 'Vitamines',
            priority: 'medium',
            completed: true,
            created_at: new Date(),
            updated_at: new Date(),
            completed_at: new Date(),
        };
        const stats = await getHistoricalData(7, [task]);
        expect(stats.dates).toEqual([localDay]);
        expect(stats.completionRates).toEqual([100]);
    });

    it('"this week" runs from local midnight to local midnight', () => {
        const lmp = new Date(Date.now() - 31 * 7 * 24 * 60 * 60 * 1000);
        const { start, end } = getCurrentPregnancyWeekRange(lmp);
        expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
        expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
        expect(countEventsInRange([{ date: new Date(Date.now() + 60 * 60 * 1000).toISOString() }], { start, end })).toBe(1);
    });
});
