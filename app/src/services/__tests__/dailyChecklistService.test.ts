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
// TEST: getHistoricalData hydration tracking
// Regression guard for the 'hydration' vs 'hyd' id/category mismatch
// (saved hydration item id is 'reminder-rem_hyd_water').
// ============================================

describe('getHistoricalData hydration', () => {
    const KEY_PREFIX = '@daily_checklist_v2_';

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('reflects saved hydration current (>0) for reminder-rem_hyd_water', async () => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const key = `${KEY_PREFIX}${todayStr}`;

        // Saved daily blob: hydration item with current liters consumed > 0
        const savedBlob = [
            { id: 'reminder-rem_hyd_water', completed: false, current: 1.5 },
            { id: 'reminder-test-essential-slot-0', completed: true },
        ];

        jest.mocked(AsyncStorage.getAllKeys).mockResolvedValueOnce([key]);
        jest.mocked(AsyncStorage.getItem).mockImplementation(async (k: string) =>
            k === key ? JSON.stringify(savedBlob) : null
        );

        const stats = await getHistoricalData(30);

        expect(stats.dates).toContain(todayStr);
        const idx = stats.dates.indexOf(todayStr);
        expect(stats.hydration[idx]).toBe(1.5);
        expect(stats.hydration[idx]).toBeGreaterThan(0);
    });
});
