/**
 * Unit tests for hydrationService.
 *
 * Covers: loadHydrationData (default/same-day/daily-reset/error branches),
 * saveHydrationData (persist + schedule/cancel side-effects + error swallow),
 * addIntake (accumulation + persistence), cancelHydrationReminders (web guard +
 * prefix filtering), scheduleHydrationReminders (web guard + disabled/freq guards
 * + trigger math + i18n message fallback vs array branch).
 *
 * react-native is mapped to react-native-web by jest.config.js, so Platform.OS
 * defaults to 'web' — the notification functions early-return there. Tests that
 * exercise the native scheduling paths explicitly set Platform.OS = 'ios'.
 */
import { Platform } from 'react-native';
import { isSameDay } from 'date-fns';

// ---- In-memory AsyncStorage mock -------------------------------------------
const store: Record<string, string> = {};
const asyncStorageClear = () => {
    for (const k of Object.keys(store)) delete store[k];
};
jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn((key: string) =>
            Promise.resolve(Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
        ),
        setItem: jest.fn((key: string, value: string) => {
            store[key] = value;
            return Promise.resolve();
        }),
        removeItem: jest.fn((key: string) => {
            delete store[key];
            return Promise.resolve();
        }),
        multiRemove: jest.fn((keys: string[]) => {
            keys.forEach((k) => delete store[k]);
            return Promise.resolve();
        }),
        getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
    },
}));

// ---- logger ----------------------------------------------------------------
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    success: jest.fn(),
};
jest.mock('../../utils/logger', () => ({
    createLogger: () => mockLogger,
}));

// ---- i18n ------------------------------------------------------------------
// `t` is a jest.fn so individual tests can override the return value to exercise
// the "localized array" branch. Default returns the key (a string) which makes
// Array.isArray() false → hardcoded fallback message branch.
const mockT = jest.fn<any, any[]>((key: string) => key);
jest.mock('../../i18n', () => ({
    __esModule: true,
    default: {
        language: 'fr',
        t: (...args: any[]) => (mockT as any)(...args),
        changeLanguage: jest.fn(),
    },
}));

// ---- expo-notifications -----------------------------------------------------
jest.mock('expo-notifications', () => ({
    getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
    SchedulableTriggerInputTypes: { CALENDAR: 'calendar' },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
    loadHydrationData,
    saveHydrationData,
    addIntake,
    cancelHydrationReminders,
    scheduleHydrationReminders,
    HydrationData,
} from '../hydrationService';

const STORAGE_KEY = 'hydration_data_v1';

// saveHydrationData triggers scheduleHydrationReminders/cancelHydrationReminders
// without awaiting them. Flush several microtask turns so those internal
// async chains (each with multiple awaits) settle before assertions.
const flushPromises = async () => {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
};

const makeData = (overrides: Partial<HydrationData> = {}): HydrationData => ({
    currentIntake: 0,
    dailyGoal: 3000,
    lastUpdated: new Date().toISOString(),
    reminderEnabled: true,
    reminderFrequency: 8,
    reminderStartHour: 8,
    reminderEndHour: 22,
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    asyncStorageClear();
    // Default to web so save/schedule/cancel side-effects are inert unless a
    // test explicitly opts into the native path.
    Platform.OS = 'web';
    mockT.mockImplementation((key: string) => key);
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
});

// =============================================================================
// loadHydrationData
// =============================================================================
describe('loadHydrationData', () => {
    it('returns DEFAULT_DATA when storage is empty (same day → no reset, no save)', async () => {
        const data = await loadHydrationData();

        expect(data.currentIntake).toBe(0);
        expect(data.dailyGoal).toBe(3000);
        expect(data.reminderEnabled).toBe(true);
        expect(data.reminderFrequency).toBe(8);
        expect(data.reminderStartHour).toBe(8);
        expect(data.reminderEndHour).toBe(22);
        // DEFAULT_DATA.lastUpdated is "now" → same day → reset branch NOT taken
        expect(AsyncStorage.setItem).not.toHaveBeenCalled();
        expect(isSameDay(new Date(data.lastUpdated), new Date())).toBe(true);
    });

    it('returns stored data unchanged when lastUpdated is today (no reset)', async () => {
        const stored = makeData({ currentIntake: 1250, lastUpdated: new Date().toISOString() });
        store[STORAGE_KEY] = JSON.stringify(stored);

        const data = await loadHydrationData();

        expect(data.currentIntake).toBe(1250);
        expect(data.dailyGoal).toBe(3000);
        expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('resets currentIntake to 0 and persists when last update was a prior day', async () => {
        const stored = makeData({
            currentIntake: 2000,
            dailyGoal: 2500,
            lastUpdated: '2020-01-01T08:00:00.000Z',
        });
        store[STORAGE_KEY] = JSON.stringify(stored);

        const data = await loadHydrationData();

        expect(data.currentIntake).toBe(0);
        // Non-reset fields preserved
        expect(data.dailyGoal).toBe(2500);
        // lastUpdated bumped to today
        expect(isSameDay(new Date(data.lastUpdated), new Date())).toBe(true);
        // The reset path calls saveHydrationData → setItem
        expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
        const persisted = JSON.parse((AsyncStorage.setItem as jest.Mock).mock.calls[0][1]);
        expect(persisted.currentIntake).toBe(0);
        expect(persisted.dailyGoal).toBe(2500);
        expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('returns DEFAULT_DATA and logs error when getItem rejects', async () => {
        (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('storage boom'));

        const data = await loadHydrationData();

        expect(data.currentIntake).toBe(0);
        expect(data.dailyGoal).toBe(3000);
        expect(mockLogger.error).toHaveBeenCalledWith('Error loading hydration data:', expect.any(Error));
    });

    it('returns DEFAULT_DATA and logs error when stored JSON is malformed', async () => {
        store[STORAGE_KEY] = '{not valid json';

        const data = await loadHydrationData();

        expect(data.currentIntake).toBe(0);
        expect(data.dailyGoal).toBe(3000);
        expect(mockLogger.error).toHaveBeenCalledWith('Error loading hydration data:', expect.any(Error));
    });
});

// =============================================================================
// saveHydrationData
// =============================================================================
describe('saveHydrationData', () => {
    it('serializes and persists data under the storage key', async () => {
        const data = makeData({ currentIntake: 500 });

        await saveHydrationData(data);

        expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
        const [key, value] = (AsyncStorage.setItem as jest.Mock).mock.calls[0];
        expect(key).toBe(STORAGE_KEY);
        expect(JSON.parse(value).currentIntake).toBe(500);
        expect(store[STORAGE_KEY]).toBe(JSON.stringify(data));
    });

    it('schedules reminders (via leaf mock) when reminderEnabled is true on native', async () => {
        Platform.OS = 'ios';
        const data = makeData({ reminderEnabled: true });

        await saveHydrationData(data);
        // saveHydrationData calls scheduleHydrationReminders WITHOUT awaiting it
        // (fire-and-forget). Flush the pending microtask queue so the inner
        // cancel→schedule chain settles before asserting.
        await flushPromises();

        // scheduleHydrationReminders → cancel (getAll) then schedule loop
        expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    });

    it('cancels reminders and does NOT schedule when reminderEnabled is false on native', async () => {
        Platform.OS = 'ios';
        (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
            { identifier: 'hydration_reminder_0' },
        ]);
        const data = makeData({ reminderEnabled: false });

        await saveHydrationData(data);
        await flushPromises();

        expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
        expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('hydration_reminder_0');
    });

    it('swallows setItem errors, logs them, and does not reach scheduling', async () => {
        Platform.OS = 'ios';
        (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
        const data = makeData({ reminderEnabled: true });

        await expect(saveHydrationData(data)).resolves.toBeUndefined();

        expect(mockLogger.error).toHaveBeenCalledWith('Error saving hydration data:', expect.any(Error));
        expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
});

// =============================================================================
// addIntake
// =============================================================================
describe('addIntake', () => {
    it('adds the amount to a freshly-loaded default, persists, and returns new data', async () => {
        const result = await addIntake(250);

        expect(result.currentIntake).toBe(250);
        expect(isSameDay(new Date(result.lastUpdated), new Date())).toBe(true);
        expect(AsyncStorage.setItem).toHaveBeenCalled();
        // last persisted value matches returned data
        const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
        const lastPersisted = JSON.parse(calls[calls.length - 1][1]);
        expect(lastPersisted.currentIntake).toBe(250);
    });

    it('accumulates across successive calls (store persists between loads)', async () => {
        await addIntake(200);
        const second = await addIntake(300);

        expect(second.currentIntake).toBe(500);
        expect(JSON.parse(store[STORAGE_KEY]).currentIntake).toBe(500);
    });

    it('adds onto an existing stored intake', async () => {
        store[STORAGE_KEY] = JSON.stringify(makeData({ currentIntake: 1000 }));

        const result = await addIntake(150);

        expect(result.currentIntake).toBe(1150);
    });

    it('does not clamp negative amounts (current behavior subtracts)', async () => {
        store[STORAGE_KEY] = JSON.stringify(makeData({ currentIntake: 500 }));

        const result = await addIntake(-200);

        expect(result.currentIntake).toBe(300);
    });
});

// =============================================================================
// cancelHydrationReminders
// =============================================================================
describe('cancelHydrationReminders', () => {
    it('is a no-op on web (no notification API calls)', async () => {
        Platform.OS = 'web';

        await cancelHydrationReminders();

        expect(Notifications.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
        expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    });

    it('cancels only notifications whose identifier starts with the hydration prefix', async () => {
        Platform.OS = 'ios';
        (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
            { identifier: 'hydration_reminder_0' },
            { identifier: 'rdv_reminder_5' },
            { identifier: 'hydration_reminder_3' },
            { identifier: 'other' },
        ]);

        await cancelHydrationReminders();

        expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
        expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('hydration_reminder_0');
        expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('hydration_reminder_3');
        expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('rdv_reminder_5');
        expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('other');
    });

    it('makes no cancel calls when there are no scheduled notifications', async () => {
        Platform.OS = 'ios';
        (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);

        await cancelHydrationReminders();

        expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
        expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    });
});

// =============================================================================
// scheduleHydrationReminders
// =============================================================================
describe('scheduleHydrationReminders', () => {
    it('is a no-op on web (does not cancel or schedule)', async () => {
        Platform.OS = 'web';

        await scheduleHydrationReminders(makeData());

        expect(Notifications.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
        expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('cancels first, then returns without scheduling when reminderEnabled is false', async () => {
        Platform.OS = 'ios';

        await scheduleHydrationReminders(makeData({ reminderEnabled: false }));

        // cancelHydrationReminders ran (it queried the schedule)
        expect(Notifications.getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
        expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('does not schedule when reminderFrequency is 0', async () => {
        Platform.OS = 'ios';

        await scheduleHydrationReminders(makeData({ reminderFrequency: 0 }));

        expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('does not schedule when reminderFrequency is negative', async () => {
        Platform.OS = 'ios';

        await scheduleHydrationReminders(makeData({ reminderFrequency: -3 }));

        expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });

    it('schedules exactly reminderFrequency notifications with correct ids and trigger math', async () => {
        Platform.OS = 'ios';
        // default: start 8, end 22, freq 8 → interval = (22-8)/8 = 1.75h
        await scheduleHydrationReminders(makeData());

        expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(8);

        const calls = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map((c) => c[0]);

        // ids _0 .. _7
        calls.forEach((arg, i) => {
            expect(arg.identifier).toBe(`hydration_reminder_${i}`);
            expect(arg.trigger.repeats).toBe(true);
            expect(arg.trigger.type).toBe('calendar');
            expect(arg.content.sound).toBe('default');
        });

        // first reminder: hour 8 → triggerHour 8, minute 0
        expect(calls[0].trigger.hour).toBe(8);
        expect(calls[0].trigger.minute).toBe(0);

        // second reminder: hour 8 + 1.75 = 9.75 → hour 9, minute floor(0.75*60)=45
        expect(calls[1].trigger.hour).toBe(9);
        expect(calls[1].trigger.minute).toBe(45);

        // third reminder: 8 + 3.5 = 11.5 → hour 11, minute 30
        expect(calls[2].trigger.hour).toBe(11);
        expect(calls[2].trigger.minute).toBe(30);
    });

    it('uses the hardcoded fallback message when i18n returns a non-array (string key)', async () => {
        Platform.OS = 'ios';
        mockT.mockImplementation((key: string) => key); // returns 'notifications.hydration' (string)

        await scheduleHydrationReminders(makeData({ reminderFrequency: 1 }));

        const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
        expect(arg.content.title).toBe('💧 Hydration reminder');
        expect(arg.content.body).toBe('Drink a glass of water for you and baby! 👶');
    });

    it('uses a localized message from the array branch when i18n returns an array', async () => {
        Platform.OS = 'ios';
        const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0);
        mockT.mockReturnValue([
            { title: 'Bois de l’eau', body: 'Un verre pour bébé' },
            { title: 'Autre', body: 'Autre body' },
        ]);

        await scheduleHydrationReminders(makeData({ reminderFrequency: 1 }));

        const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
        // Math.random()=0 → index 0
        expect(arg.content.title).toBe('Bois de l’eau');
        expect(arg.content.body).toBe('Un verre pour bébé');

        randomSpy.mockRestore();
    });

    it('falls back to hardcoded message when i18n returns an empty array', async () => {
        Platform.OS = 'ios';
        mockT.mockReturnValue([]);

        await scheduleHydrationReminders(makeData({ reminderFrequency: 1 }));

        const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
        expect(arg.content.title).toBe('💧 Hydration reminder');
    });
});
