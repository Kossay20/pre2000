/**
 * Unit Tests for dailyChecklistService.ts
 * 
 * Tests the daily checklist generation and progress tracking
 */

import { generateDailyChecklist, getHistoricalData } from '../dailyChecklistService';
import { UserEvent } from '../../types';
import { format } from 'date-fns';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock the remindersV2Service
// Mock the remindersV2Service
jest.mock('../remindersV2Service', () => ({
    getRemindersForTasksTab: jest.fn(() => [
        {
            id: 'test-essential',
            category_id: 'nut',
            title: { fr: 'Test Essentiel', ar: 'Test', en: 'Test Essential' },
            description: { fr: 'Desc', ar: 'Desc', en: 'Desc' },
            default_enabled: true,
            frequency_type: 'per_day',
            intensity_options: [1, 2, 3],
            preset_times: { 2: ['09:00', '15:00'] },
            source_ui: 'both_but_single_entry',
            ui: { icon: '💊', essential_rank: 1 }
        }
    ]),
    getAvailableReminders: jest.fn(() => [
        {
            id: 'test-essential',
            category_id: 'nut',
            title: { fr: 'Test Essentiel', ar: 'Test', en: 'Test Essential' },
            description: { fr: 'Desc', ar: 'Desc', en: 'Desc' },
            default_enabled: true,
            frequency_type: 'per_day',
            intensity_options: [1, 2, 3],
            preset_times: { 2: ['09:00', '15:00'] },
            source_ui: 'both_but_single_entry',
            ui: { icon: '💊', essential_rank: 1 }
        }
    ]),
    loadUserSettings: jest.fn(async () => ({
        'test-essential': {
            reminder_id: 'test-essential',
            user_id: 'guest',
            enabled: true,
            intensity: 2,
            times: ['09:00', '15:00'],
            origin: 'preset',
            priority: 'normal',
            last_modified_at: new Date().toISOString()
        }
    }))
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    getAllKeys: jest.fn(() => Promise.resolve([])),
    multiRemove: jest.fn(() => Promise.resolve())
}));

// F-HS-02-REGR: getHistoricalData now reads today's REAL water from hydrationService
// (loadHydrationData → currentIntake in ml). Mock it so tests control the value and
// to avoid pulling the real service (notifications/i18n) into the suite.
jest.mock('../hydrationService', () => ({
    loadHydrationData: jest.fn(async () => ({ currentIntake: 0, dailyGoal: 3000 })),
}));
import { loadHydrationData } from '../hydrationService';

// Helper to create test events
const createTestEvent = (overrides: Partial<UserEvent> = {}): UserEvent => ({
    event_id: 'test-event-1',
    user_id: 'test-user',
    title: 'Test RDV',
    date: new Date().toISOString(),
    week: 20,
    type: 'appointment',
    notes: '',
    created_at: new Date().toISOString(),
    ...overrides
});

// ============================================
// TEST: generateDailyChecklist
// ============================================

describe('generateDailyChecklist', () => {
    test('should return array of checklist items', async () => {
        const items = await generateDailyChecklist([], 20);
        expect(Array.isArray(items)).toBe(true);
    });

    test('should include enabled essential reminders', async () => {
        const items = await generateDailyChecklist([], 20);

        const reminderItems = items.filter(i => i.type === 'reminder');
        expect(reminderItems.length).toBeGreaterThan(0);
    });

    test('should include today appointments', async () => {
        // FIX: Use LOCAL date (date-fns format) instead of UTC (toISOString) to align
        // with the service which uses format(today, 'yyyy-MM-dd') in LOCAL time.
        // Previous code broke between local midnight and UTC midnight.
        const today = format(new Date(), 'yyyy-MM-dd');
        const todayEvent = createTestEvent({
            event_id: 'apt-1',
            title: 'RDV médecin',
            date: `${today}T14:30:00`
        });

        const items = await generateDailyChecklist([todayEvent], 20);
        const aptItems = items.filter(i => i.type === 'appointment');
        expect(aptItems.length).toBe(1);
        expect(aptItems[0].title).toBe('RDV médecin');
    });

    test('should not include appointments from other days', async () => {
        // FIX: same as above — use LOCAL date for parity with service.
        const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
        const yesterdayEvent = createTestEvent({
            event_id: 'apt-old',
            title: 'Ancien RDV',
            date: `${yesterday}T14:30:00`
        });

        const items = await generateDailyChecklist([yesterdayEvent], 20);
        const aptItems = items.filter(i => i.type === 'appointment');
        expect(aptItems.length).toBe(0);
    });

    test('items should be sorted by priority', async () => {
        const today = new Date().toISOString().split('T')[0];
        const todayEvent = createTestEvent({
            event_id: 'apt-1',
            title: 'RDV',
            date: `${today}T14:30:00`
        });

        const items = await generateDailyChecklist([todayEvent], 20);

        for (let i = 1; i < items.length; i++) {
            expect(items[i].priority).toBeGreaterThanOrEqual(items[i - 1].priority);
        }
    });
});

// ============================================
// TEST: checklist item structure
// ============================================

describe('checklist item structure', () => {
    test('items should have required fields', async () => {
        const items = await generateDailyChecklist([], 20);

        items.forEach(item => {
            expect(item.id).toBeDefined();
            expect(item.type).toBeDefined();
            expect(item.title).toBeDefined();
            expect(typeof item.completed).toBe('boolean');
            expect(item.icon).toBeDefined();
            expect(typeof item.priority).toBe('number');
        });
    });

    test('reminder items should have reminderId link', async () => {
        const items = await generateDailyChecklist([], 20);
        const reminderItems = items.filter(i => i.type === 'reminder');

        reminderItems.forEach(item => {
            expect(item.reminderId).toBeDefined();
        });
    });
});

// ============================================
// TEST: getHistoricalData hydration tracking (F-HS-02-REGR)
// The "Hydration (L)" series must reflect the REAL water tracker
// (hydrationService.loadHydrationData → currentIntake ml) for TODAY,
// NOT the herbal-tea checklist item (rem_hyd_herbal_tea, category 'hyd').
// ============================================

describe('getHistoricalData hydration (real water source)', () => {
    const KEY_PREFIX = '@daily_checklist_v2_';

    afterEach(() => {
        jest.clearAllMocks();
    });

    test("today's hydration reads real water from hydrationService (ml → L)", async () => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const key = `${KEY_PREFIX}${todayStr}`;

        // Real water tracker: 1800ml consumed today → 1.8L expected on the chart.
        jest.mocked(loadHydrationData).mockResolvedValueOnce({ currentIntake: 1800, dailyGoal: 3000 } as any);

        // Checklist blob deliberately carries a herbal-tea 'hyd' item with a bogus
        // `current` — it must NOT leak into the water series.
        const savedBlob = [
            { id: 'reminder-rem_hyd_herbal_tea', completed: false, current: 9.9 },
            { id: 'reminder-test-essential-slot-0', completed: true },
        ];

        jest.mocked(AsyncStorage.getAllKeys).mockResolvedValueOnce([key]);
        jest.mocked(AsyncStorage.getItem).mockImplementation(async (k: string) =>
            k === key ? JSON.stringify(savedBlob) : null
        );

        const stats = await getHistoricalData(30);

        expect(stats.dates).toContain(todayStr);
        const idx = stats.dates.indexOf(todayStr);
        // Real water (1.8L), NOT the herbal-tea current (9.9).
        expect(stats.hydration[idx]).toBeCloseTo(1.8, 5);
        expect(stats.hydration[idx]).not.toBe(9.9);
    });

    test('herbal-tea checklist current does NOT feed the water series when no real water logged', async () => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const key = `${KEY_PREFIX}${todayStr}`;

        // No real water consumed today.
        jest.mocked(loadHydrationData).mockResolvedValueOnce({ currentIntake: 0, dailyGoal: 3000 } as any);

        const savedBlob = [
            { id: 'reminder-rem_hyd_herbal_tea', completed: false, current: 2.0 },
        ];

        jest.mocked(AsyncStorage.getAllKeys).mockResolvedValueOnce([key]);
        jest.mocked(AsyncStorage.getItem).mockImplementation(async (k: string) =>
            k === key ? JSON.stringify(savedBlob) : null
        );

        const stats = await getHistoricalData(30);
        const idx = stats.dates.indexOf(todayStr);
        // Tea is not water → 0, not 2.0.
        expect(stats.hydration[idx]).toBe(0);
    });

    test('past days report 0 water (no per-day real history)', async () => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const yesterdayStr = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
        const todayKey = `${KEY_PREFIX}${todayStr}`;
        const yKey = `${KEY_PREFIX}${yesterdayStr}`;

        jest.mocked(loadHydrationData).mockResolvedValueOnce({ currentIntake: 1000, dailyGoal: 3000 } as any);

        const blob = [{ id: 'reminder-rem_hyd_herbal_tea', completed: false, current: 1.25 }];

        jest.mocked(AsyncStorage.getAllKeys).mockResolvedValueOnce([yKey, todayKey]);
        jest.mocked(AsyncStorage.getItem).mockImplementation(async (k: string) =>
            (k === todayKey || k === yKey) ? JSON.stringify(blob) : null
        );

        const stats = await getHistoricalData(30);
        const todayIdx = stats.dates.indexOf(todayStr);
        const yIdx = stats.dates.indexOf(yesterdayStr);
        expect(stats.hydration[todayIdx]).toBeCloseTo(1.0, 5); // real water today
        expect(stats.hydration[yIdx]).toBe(0); // no real history for past days
    });
});

// ============================================
// TEST: getHistoricalData completion rate (F-HS-03)
// Skipped tasks must be excluded from BOTH numerator and denominator,
// matching the Tasks UI which hides skipped items.
// ============================================

describe('getHistoricalData completion rate (skipped excluded)', () => {
    const KEY_PREFIX = '@daily_checklist_v2_';

    afterEach(() => {
        jest.clearAllMocks();
    });

    const runWithBlob = async (blob: any[]) => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const key = `${KEY_PREFIX}${todayStr}`;
        jest.mocked(AsyncStorage.getAllKeys).mockResolvedValueOnce([key]);
        jest.mocked(AsyncStorage.getItem).mockImplementation(async (k: string) =>
            k === key ? JSON.stringify(blob) : null
        );
        const stats = await getHistoricalData(30);
        const idx = stats.dates.indexOf(todayStr);
        return stats.completionRates[idx];
    };

    test('excludes skipped tasks from the denominator (2/2 active = 100%, not 2/4)', async () => {
        // 2 completed, 2 skipped → UI shows only the 2 active, both done → 100%.
        const rate = await runWithBlob([
            { id: 'a', completed: true },
            { id: 'b', completed: true },
            { id: 'c', completed: false, skipped: true },
            { id: 'd', completed: false, skipped: true },
        ]);
        expect(rate).toBe(100);
    });

    test('skipped tasks are not counted as completed (1 done /2 active = 50%)', async () => {
        // A skipped item with completed:true must NOT inflate the numerator.
        const rate = await runWithBlob([
            { id: 'a', completed: true },
            { id: 'b', completed: false },
            { id: 'c', completed: true, skipped: true },
        ]);
        expect(rate).toBe(50);
    });

    test('all tasks skipped → 0% (guarded division, no NaN)', async () => {
        const rate = await runWithBlob([
            { id: 'a', completed: false, skipped: true },
            { id: 'b', completed: true, skipped: true },
        ]);
        expect(rate).toBe(0);
    });

    test('no skipped tasks → behaves as before (1/2 = 50%)', async () => {
        const rate = await runWithBlob([
            { id: 'a', completed: true },
            { id: 'b', completed: false },
        ]);
        expect(rate).toBe(50);
    });
});
