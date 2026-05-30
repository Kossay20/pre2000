/**
 * Comprehensive unit tests for `reminderPersistence` (V1.2 Reminders & Tasks
 * persistence layer — Guest=AsyncStorage / Auth=Firestore).
 *
 * Scope: the public CRUD surface (save/load reminder settings + task statuses
 * for Guest & Auth), baby-message settings, the individual V1 migration helpers,
 * and the full `migrateAllGuestDataToAuth` orchestrator (which internally drives
 * the non-exported V2 + daily-checklist migrations).
 *
 * All I/O is mocked: AsyncStorage uses an in-memory Map; firebase/firestore
 * symbols are jest.fn() markers we introspect. No network, no real Firestore.
 */

// ────────────────────────────────────────────────────────────────────────────
// MOCKS
// ────────────────────────────────────────────────────────────────────────────

const mockStorage: Map<string, string> = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn((key: string) =>
        Promise.resolve(mockStorage.has(key) ? (mockStorage.get(key) as string) : null)
    ),
    setItem: jest.fn((key: string, value: string) => {
        mockStorage.set(key, value);
        return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
        mockStorage.delete(key);
        return Promise.resolve();
    }),
    multiRemove: jest.fn((keys: string[]) => {
        keys.forEach(k => mockStorage.delete(k));
        return Promise.resolve();
    }),
    getAllKeys: jest.fn(() => Promise.resolve(Array.from(mockStorage.keys()))),
}));

jest.mock('../../config/firebase', () => ({
    db: {},
    auth: {},
    analytics: Promise.resolve(null),
}));

jest.mock('firebase/firestore', () => ({
    // doc(db, collection, id) → introspectable marker
    doc: jest.fn((_db: unknown, collection: string, id: string) => ({
        __collection: collection,
        __id: id,
    })),
    setDoc: jest.fn(() => Promise.resolve()),
    collection: jest.fn((_db: unknown, name: string) => ({ __collection: name })),
    query: jest.fn((...args: unknown[]) => ({ __query: args })),
    where: jest.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
    getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
    deleteDoc: jest.fn(() => Promise.resolve()),
    deleteField: jest.fn(() => '__DELETE_FIELD__'),
}));

jest.mock('../../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
    }),
    logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
    },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { setDoc, getDocs, doc, deleteField } from 'firebase/firestore';
import {
    saveReminderSettingGuest,
    loadReminderSettingsGuest,
    saveReminderSettingAuth,
    loadReminderSettingsAuth,
    migrateReminderSettingsToAuth,
    saveTaskStatusGuest,
    loadTaskStatusesGuest,
    saveTaskStatusAuth,
    loadTaskStatusesAuth,
    migrateTaskStatusesToAuth,
    saveBabyMessageEnabled,
    loadBabyMessageEnabled,
    saveBabyMessageHour,
    loadBabyMessageHour,
    migrateAllGuestDataToAuth,
} from '../reminderPersistence';

// ────────────────────────────────────────────────────────────────────────────
// CONSTANTS / HELPERS
// ────────────────────────────────────────────────────────────────────────────

const REMINDER_KEY = '@reminder_settings_v1';
const TASK_KEY = '@task_statuses_v1';
const BABY_ENABLED_KEY = '@baby_message_enabled_v1';
const BABY_HOUR_KEY = '@baby_message_hour_v1';
const V2_GUEST_SETTINGS_KEY = 'reminders_v2_settings_guest';
const V2_COMPLETIONS_GUEST_KEY = 'reminders_v2_completions';
const DAILY_CHECKLIST_PREFIX = '@daily_checklist_v2_';

const UID = 'auth_user_123';

/** Build a fake Firestore snapshot from an array of plain doc data objects. */
const fakeSnapshot = (datas: any[]) => ({
    docs: datas.map(d => ({ data: () => d })),
});

/** Returns all setDoc calls grouped by collection. */
const setDocCallsByCollection = (): Record<string, Array<{ id: string; data: any; options: any }>> => {
    const calls = (setDoc as jest.Mock).mock.calls;
    const grouped: Record<string, Array<{ id: string; data: any; options: any }>> = {};
    for (const [docRef, data, options] of calls) {
        const col = (docRef as any).__collection ?? '<unknown>';
        const id = (docRef as any).__id ?? '<unknown>';
        if (!grouped[col]) grouped[col] = [];
        grouped[col].push({ id, data, options });
    }
    return grouped;
};

beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
    // Default getDocs → empty snapshot unless a test overrides it.
    (getDocs as jest.Mock).mockResolvedValue({ docs: [] });
});

// ════════════════════════════════════════════════════════════════════════════
// REMINDER SETTINGS — GUEST
// ════════════════════════════════════════════════════════════════════════════

describe('saveReminderSettingGuest', () => {
    it('persists a new reminder with all fields into AsyncStorage', async () => {
        await saveReminderSettingGuest('rem_water', true, 3, ['08:00', '12:00', '18:00']);

        const raw = mockStorage.get(REMINDER_KEY);
        expect(raw).toBeDefined();
        const parsed = JSON.parse(raw as string);
        expect(parsed.rem_water.enabled).toBe(true);
        expect(parsed.rem_water.timesPerDay).toBe(3);
        expect(parsed.rem_water.customHours).toEqual(['08:00', '12:00', '18:00']);
        expect(typeof parsed.rem_water.lastModified).toBe('string');
        // lastModified must be a valid ISO date
        expect(new Date(parsed.rem_water.lastModified).toString()).not.toBe('Invalid Date');
    });

    it('merges into existing settings without clobbering other reminders', async () => {
        await saveReminderSettingGuest('rem_a', true, 1);
        await saveReminderSettingGuest('rem_b', false, 2);

        const parsed = JSON.parse(mockStorage.get(REMINDER_KEY) as string);
        expect(Object.keys(parsed)).toEqual(expect.arrayContaining(['rem_a', 'rem_b']));
        expect(parsed.rem_a.enabled).toBe(true);
        expect(parsed.rem_b.enabled).toBe(false);
        expect(parsed.rem_b.timesPerDay).toBe(2);
    });

    it('overwrites the same reminderId on re-save', async () => {
        await saveReminderSettingGuest('rem_a', true, 1);
        await saveReminderSettingGuest('rem_a', false, 5);

        const parsed = JSON.parse(mockStorage.get(REMINDER_KEY) as string);
        expect(Object.keys(parsed)).toHaveLength(1);
        expect(parsed.rem_a.enabled).toBe(false);
        expect(parsed.rem_a.timesPerDay).toBe(5);
    });

    it('stores customHours as undefined (absent) when not provided', async () => {
        await saveReminderSettingGuest('rem_a', true, 1);

        const parsed = JSON.parse(mockStorage.get(REMINDER_KEY) as string);
        // undefined is dropped by JSON.stringify → key absent
        expect('customHours' in parsed.rem_a).toBe(false);
    });

    it('rethrows when AsyncStorage.setItem fails', async () => {
        (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
        await expect(saveReminderSettingGuest('rem_a', true, 1)).rejects.toThrow('disk full');
    });
});

describe('loadReminderSettingsGuest', () => {
    it('returns {} when no data stored', async () => {
        const result = await loadReminderSettingsGuest();
        expect(result).toEqual({});
    });

    it('returns the parsed object when data is present', async () => {
        mockStorage.set(REMINDER_KEY, JSON.stringify({
            rem_a: { enabled: true, timesPerDay: 2, lastModified: '2025-01-01' },
        }));
        const result = await loadReminderSettingsGuest();
        expect(result.rem_a.enabled).toBe(true);
        expect(result.rem_a.timesPerDay).toBe(2);
    });

    it('returns {} (swallows error) when stored JSON is corrupt', async () => {
        mockStorage.set(REMINDER_KEY, '{not-valid-json');
        const result = await loadReminderSettingsGuest();
        expect(result).toEqual({});
    });

    it('returns {} (swallows error) when AsyncStorage.getItem rejects', async () => {
        (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
        const result = await loadReminderSettingsGuest();
        expect(result).toEqual({});
    });
});

// ════════════════════════════════════════════════════════════════════════════
// REMINDER SETTINGS — AUTH
// ════════════════════════════════════════════════════════════════════════════

describe('saveReminderSettingAuth', () => {
    it('writes to userReminderSettings with docId `${userId}_${reminderId}` and merge', async () => {
        await saveReminderSettingAuth(UID, 'rem_x', true, 4, ['09:00']);

        const grouped = setDocCallsByCollection();
        expect(grouped.userReminderSettings).toHaveLength(1);
        const call = grouped.userReminderSettings[0];
        expect(call.id).toBe(`${UID}_rem_x`);
        expect(call.options).toEqual({ merge: true });
        expect(call.data.user_id).toBe(UID);
        expect(call.data.reminder_id).toBe('rem_x');
        expect(call.data.enabled).toBe(true);
        expect(call.data.times_per_day).toBe(4);
        expect(call.data.custom_hours).toEqual(['09:00']);
        expect(call.data.last_modified).toBeInstanceOf(Date);
    });

    it('rethrows when setDoc fails', async () => {
        (setDoc as jest.Mock).mockRejectedValueOnce(new Error('permission-denied'));
        await expect(saveReminderSettingAuth(UID, 'rem_x', true, 1)).rejects.toThrow('permission-denied');
    });
});

describe('loadReminderSettingsAuth', () => {
    it('returns {} immediately when userId is empty (no Firestore call)', async () => {
        const result = await loadReminderSettingsAuth('');
        expect(result).toEqual({});
        expect(getDocs).not.toHaveBeenCalled();
    });

    it('maps Firestore docs into ReminderSettingsData keyed by reminder_id', async () => {
        (getDocs as jest.Mock).mockResolvedValueOnce(fakeSnapshot([
            {
                reminder_id: 'rem_a',
                enabled: true,
                times_per_day: 2,
                custom_hours: ['08:00'],
                last_modified: '2025-03-01T00:00:00.000Z',
            },
            {
                reminder_id: 'rem_b',
                enabled: false,
                times_per_day: 1,
                last_modified: '2025-03-02T00:00:00.000Z',
            },
        ]));

        const result = await loadReminderSettingsAuth(UID);
        expect(Object.keys(result)).toEqual(['rem_a', 'rem_b']);
        expect(result.rem_a.enabled).toBe(true);
        expect(result.rem_a.timesPerDay).toBe(2);
        expect(result.rem_a.customHours).toEqual(['08:00']);
        expect(result.rem_a.lastModified).toBe('2025-03-01T00:00:00.000Z');
        expect(result.rem_b.enabled).toBe(false);
    });

    it('returns {} when getDocs rejects', async () => {
        (getDocs as jest.Mock).mockRejectedValueOnce(new Error('network'));
        const result = await loadReminderSettingsAuth(UID);
        expect(result).toEqual({});
    });
});

describe('migrateReminderSettingsToAuth', () => {
    it('migrates each guest setting to Firestore then clears the guest key', async () => {
        mockStorage.set(REMINDER_KEY, JSON.stringify({
            rem_a: { enabled: true, timesPerDay: 2, customHours: ['08:00'], lastModified: '2025-01-01' },
            rem_b: { enabled: false, timesPerDay: 1, lastModified: '2025-01-02' },
        }));

        await migrateReminderSettingsToAuth(UID);

        const grouped = setDocCallsByCollection();
        expect(grouped.userReminderSettings).toHaveLength(2);
        const ids = grouped.userReminderSettings.map(c => c.id);
        expect(ids).toEqual(expect.arrayContaining([`${UID}_rem_a`, `${UID}_rem_b`]));
        // guest key cleared after success
        expect(mockStorage.has(REMINDER_KEY)).toBe(false);
    });

    it('is a no-op (no Firestore write, no removeItem) when there are no guest settings', async () => {
        await migrateReminderSettingsToAuth(UID);
        expect(setDoc).not.toHaveBeenCalled();
        expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    });

    it('swallows errors (does not throw) and does NOT clear the key when a write fails', async () => {
        mockStorage.set(REMINDER_KEY, JSON.stringify({
            rem_a: { enabled: true, timesPerDay: 2, lastModified: '2025-01-01' },
        }));
        (setDoc as jest.Mock).mockRejectedValueOnce(new Error('write fail'));

        await expect(migrateReminderSettingsToAuth(UID)).resolves.toBeUndefined();
        // failure occurred before removeItem → guest key still present
        expect(mockStorage.has(REMINDER_KEY)).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// TASK STATUSES — GUEST
// ════════════════════════════════════════════════════════════════════════════

describe('saveTaskStatusGuest', () => {
    it('stores under composite key `${taskId}_w${weekNumber}` with completedAt when completed', async () => {
        await saveTaskStatusGuest('task_echo', 12, true);

        const parsed = JSON.parse(mockStorage.get(TASK_KEY) as string);
        expect(parsed['task_echo_w12']).toBeDefined();
        expect(parsed['task_echo_w12'].completed).toBe(true);
        expect(typeof parsed['task_echo_w12'].completedAt).toBe('string');
    });

    it('omits completedAt (undefined → absent) when not completed', async () => {
        await saveTaskStatusGuest('task_echo', 12, false);

        const parsed = JSON.parse(mockStorage.get(TASK_KEY) as string);
        expect(parsed['task_echo_w12'].completed).toBe(false);
        expect('completedAt' in parsed['task_echo_w12']).toBe(false);
    });

    it('merges multiple tasks without overwriting each other', async () => {
        await saveTaskStatusGuest('task_a', 10, true);
        await saveTaskStatusGuest('task_b', 20, false);

        const parsed = JSON.parse(mockStorage.get(TASK_KEY) as string);
        expect(Object.keys(parsed)).toEqual(expect.arrayContaining(['task_a_w10', 'task_b_w20']));
    });

    it('rethrows when AsyncStorage.setItem fails', async () => {
        (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
        await expect(saveTaskStatusGuest('task_a', 1, true)).rejects.toThrow('disk full');
    });
});

describe('loadTaskStatusesGuest', () => {
    it('returns {} when nothing stored', async () => {
        expect(await loadTaskStatusesGuest()).toEqual({});
    });

    it('returns parsed task statuses when present', async () => {
        mockStorage.set(TASK_KEY, JSON.stringify({
            'task_a_w10': { completed: true, completedAt: '2025-01-01' },
        }));
        const result = await loadTaskStatusesGuest();
        expect(result['task_a_w10'].completed).toBe(true);
    });

    it('returns {} when stored JSON is corrupt', async () => {
        mockStorage.set(TASK_KEY, 'broken{');
        expect(await loadTaskStatusesGuest()).toEqual({});
    });

    it('returns {} when getItem rejects', async () => {
        (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
        expect(await loadTaskStatusesGuest()).toEqual({});
    });
});

// ════════════════════════════════════════════════════════════════════════════
// TASK STATUSES — AUTH
// ════════════════════════════════════════════════════════════════════════════

describe('saveTaskStatusAuth', () => {
    it('writes to userTaskStatuses with docId `${userId}_${taskId}_w${weekNumber}` and a Date completed_at when completed', async () => {
        await saveTaskStatusAuth(UID, 'task_echo', 12, true);

        const grouped = setDocCallsByCollection();
        expect(grouped.userTaskStatuses).toHaveLength(1);
        const call = grouped.userTaskStatuses[0];
        expect(call.id).toBe(`${UID}_task_echo_w12`);
        expect(call.options).toEqual({ merge: true });
        expect(call.data.user_id).toBe(UID);
        expect(call.data.task_id).toBe('task_echo');
        expect(call.data.week_number).toBe(12);
        expect(call.data.completed).toBe(true);
        expect(call.data.completed_at).toBeInstanceOf(Date);
        expect(deleteField).not.toHaveBeenCalled();
    });

    it('uses deleteField() sentinel for completed_at when NOT completed', async () => {
        await saveTaskStatusAuth(UID, 'task_echo', 12, false);

        const grouped = setDocCallsByCollection();
        const call = grouped.userTaskStatuses[0];
        expect(call.data.completed).toBe(false);
        expect(deleteField).toHaveBeenCalled();
        expect(call.data.completed_at).toBe('__DELETE_FIELD__');
    });

    it('rethrows when setDoc fails', async () => {
        (setDoc as jest.Mock).mockRejectedValueOnce(new Error('permission-denied'));
        await expect(saveTaskStatusAuth(UID, 'task_a', 1, true)).rejects.toThrow('permission-denied');
    });
});

describe('loadTaskStatusesAuth', () => {
    it('returns {} immediately when userId is empty (no Firestore call)', async () => {
        const result = await loadTaskStatusesAuth('', 12);
        expect(result).toEqual({});
        expect(getDocs).not.toHaveBeenCalled();
    });

    it('maps Firestore docs into TaskStatusData keyed by `${task_id}_w${week_number}`', async () => {
        (getDocs as jest.Mock).mockResolvedValueOnce(fakeSnapshot([
            { task_id: 'task_a', week_number: 12, completed: true, completed_at: '2025-01-01T00:00:00.000Z' },
            { task_id: 'task_b', week_number: 12, completed: false },
        ]));

        const result = await loadTaskStatusesAuth(UID, 12);
        expect(result['task_a_w12'].completed).toBe(true);
        expect(result['task_a_w12'].completedAt).toBe('2025-01-01T00:00:00.000Z');
        expect(result['task_b_w12'].completed).toBe(false);
        // completed_at undefined → completedAt undefined
        expect(result['task_b_w12'].completedAt).toBeUndefined();
    });

    it('returns {} when getDocs rejects', async () => {
        (getDocs as jest.Mock).mockRejectedValueOnce(new Error('network'));
        expect(await loadTaskStatusesAuth(UID, 12)).toEqual({});
    });
});

describe('migrateTaskStatusesToAuth', () => {
    it('parses the composite key into taskId + week and writes to Firestore, then clears key', async () => {
        mockStorage.set(TASK_KEY, JSON.stringify({
            'task_echo_w12': { completed: true, completedAt: '2025-01-01' },
            'task_glucose_w24': { completed: false },
        }));

        await migrateTaskStatusesToAuth(UID);

        const grouped = setDocCallsByCollection();
        expect(grouped.userTaskStatuses).toHaveLength(2);
        const echo = grouped.userTaskStatuses.find(c => c.id === `${UID}_task_echo_w12`);
        expect(echo).toBeDefined();
        expect(echo!.data.task_id).toBe('task_echo');
        expect(echo!.data.week_number).toBe(12);
        expect(echo!.data.completed).toBe(true);
        expect(mockStorage.has(TASK_KEY)).toBe(false);
    });

    it('skips keys that do not match the `_w<digits>` pattern', async () => {
        mockStorage.set(TASK_KEY, JSON.stringify({
            'malformed_key': { completed: true },
            'task_a_w5': { completed: true },
        }));

        await migrateTaskStatusesToAuth(UID);

        const grouped = setDocCallsByCollection();
        // only the well-formed key is migrated
        expect(grouped.userTaskStatuses).toHaveLength(1);
        expect(grouped.userTaskStatuses[0].id).toBe(`${UID}_task_a_w5`);
    });

    it('is a no-op when there are no guest task statuses', async () => {
        await migrateTaskStatusesToAuth(UID);
        expect(setDoc).not.toHaveBeenCalled();
        expect(AsyncStorage.removeItem).not.toHaveBeenCalled();
    });

    it('swallows errors and does not clear the key when a write fails', async () => {
        mockStorage.set(TASK_KEY, JSON.stringify({ 'task_a_w5': { completed: true } }));
        (setDoc as jest.Mock).mockRejectedValueOnce(new Error('write fail'));

        await expect(migrateTaskStatusesToAuth(UID)).resolves.toBeUndefined();
        expect(mockStorage.has(TASK_KEY)).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// BABY MESSAGE SETTINGS
// ════════════════════════════════════════════════════════════════════════════

describe('saveBabyMessageEnabled / loadBabyMessageEnabled', () => {
    it('round-trips a true value', async () => {
        await saveBabyMessageEnabled(true);
        expect(mockStorage.get(BABY_ENABLED_KEY)).toBe('true');
        expect(await loadBabyMessageEnabled()).toBe(true);
    });

    it('round-trips a false value', async () => {
        await saveBabyMessageEnabled(false);
        expect(mockStorage.get(BABY_ENABLED_KEY)).toBe('false');
        expect(await loadBabyMessageEnabled()).toBe(false);
    });

    it('defaults to true when nothing is stored', async () => {
        expect(await loadBabyMessageEnabled()).toBe(true);
    });

    it('defaults to true when getItem rejects', async () => {
        (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
        expect(await loadBabyMessageEnabled()).toBe(true);
    });

    it('does NOT throw when setItem fails (best-effort save, error swallowed)', async () => {
        (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
        await expect(saveBabyMessageEnabled(true)).resolves.toBeUndefined();
    });
});

describe('saveBabyMessageHour / loadBabyMessageHour', () => {
    it('round-trips an hour value', async () => {
        await saveBabyMessageHour(18);
        expect(mockStorage.get(BABY_HOUR_KEY)).toBe('18');
        expect(await loadBabyMessageHour()).toBe(18);
    });

    it('persists hour 0 (midnight) and reads it back as 0, not the default', async () => {
        await saveBabyMessageHour(0);
        expect(await loadBabyMessageHour()).toBe(0);
    });

    it('defaults to 10 when nothing is stored', async () => {
        expect(await loadBabyMessageHour()).toBe(10);
    });

    it('defaults to 10 when getItem rejects', async () => {
        (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));
        expect(await loadBabyMessageHour()).toBe(10);
    });

    it('does NOT throw when setItem fails (best-effort save, error swallowed)', async () => {
        (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
        await expect(saveBabyMessageHour(9)).resolves.toBeUndefined();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// FULL MIGRATION ORCHESTRATOR (drives non-exported V2 + daily-checklist helpers)
// ════════════════════════════════════════════════════════════════════════════

describe('migrateAllGuestDataToAuth', () => {
    it('runs all five migration steps and clears every guest key on full success', async () => {
        mockStorage.set(REMINDER_KEY, JSON.stringify({
            rem_a: { enabled: true, timesPerDay: 2, lastModified: '2025-01-01' },
        }));
        mockStorage.set(TASK_KEY, JSON.stringify({
            'task_a_w5': { completed: true, completedAt: '2025-01-01' },
        }));
        mockStorage.set(V2_GUEST_SETTINGS_KEY, JSON.stringify({
            rem_hyd: { reminder_id: 'rem_hyd', enabled: true, last_modified_at: '2025-01-01T00:00:00.000Z' },
        }));
        mockStorage.set(V2_COMPLETIONS_GUEST_KEY, JSON.stringify({
            rem_hyd: ['2025-01-01', '2025-01-02'],
        }));

        await migrateAllGuestDataToAuth(UID);

        const grouped = setDocCallsByCollection();
        // V1 reminders + V1 tasks + V2 settings collections all written
        expect(grouped.userReminderSettings).toHaveLength(1);
        expect(grouped.userTaskStatuses).toHaveLength(1);
        expect(grouped.reminder_settings_v2).toHaveLength(1);
        expect(grouped.reminder_settings_v2[0].id).toBe(`${UID}_rem_hyd`);
        expect(grouped.reminder_settings_v2[0].data.user_id).toBe(UID);

        // V1 + V2-settings guest keys cleared
        expect(mockStorage.has(REMINDER_KEY)).toBe(false);
        expect(mockStorage.has(TASK_KEY)).toBe(false);
        expect(mockStorage.has(V2_GUEST_SETTINGS_KEY)).toBe(false);
        // V2 completions: legacy guest key removed, user-scoped key created
        expect(mockStorage.has(V2_COMPLETIONS_GUEST_KEY)).toBe(false);
        const userCompletions = mockStorage.get(`${V2_COMPLETIONS_GUEST_KEY}_${UID}`);
        expect(userCompletions).toBeDefined();
        const parsedCompletions = JSON.parse(userCompletions as string);
        expect(parsedCompletions.rem_hyd).toEqual(['2025-01-01', '2025-01-02']);
    });

    it('merges + dedups + sorts V2 completions into an existing user-scoped key', async () => {
        const userKey = `${V2_COMPLETIONS_GUEST_KEY}_${UID}`;
        mockStorage.set(userKey, JSON.stringify({ rem_hyd: ['2025-01-02', '2025-01-01'] }));
        mockStorage.set(V2_COMPLETIONS_GUEST_KEY, JSON.stringify({
            rem_hyd: ['2025-01-02', '2025-01-03'], // overlap on 01-02
        }));

        await migrateAllGuestDataToAuth(UID);

        const merged = JSON.parse(mockStorage.get(userKey) as string);
        // union, deduped, sorted ascending
        expect(merged.rem_hyd).toEqual(['2025-01-01', '2025-01-02', '2025-01-03']);
    });

    it('does not blow up and writes nothing when there is no guest data at all', async () => {
        await migrateAllGuestDataToAuth(UID);
        expect(setDoc).not.toHaveBeenCalled();
    });

    it('tolerates corrupt V2 settings JSON without aborting the V1 migrations (allSettled isolation)', async () => {
        mockStorage.set(REMINDER_KEY, JSON.stringify({
            rem_a: { enabled: true, timesPerDay: 2, lastModified: '2025-01-01' },
        }));
        mockStorage.set(V2_GUEST_SETTINGS_KEY, '{corrupt');

        await migrateAllGuestDataToAuth(UID);

        const grouped = setDocCallsByCollection();
        // V1 reminder still migrated despite V2 JSON corruption
        expect(grouped.userReminderSettings).toHaveLength(1);
        // No reminder_settings_v2 writes because JSON was corrupt
        expect(grouped.reminder_settings_v2).toBeUndefined();
        // corrupt V2 key is left untouched (not removed) per source behavior
        expect(mockStorage.get(V2_GUEST_SETTINGS_KEY)).toBe('{corrupt');
    });

    it('skips invalid V2 entries and strips undefined fields before Firestore write', async () => {
        mockStorage.set(V2_GUEST_SETTINGS_KEY, JSON.stringify({
            good_one: { reminder_id: 'good_one', enabled: true, note: undefined, last_modified_at: '2025-01-01T00:00:00.000Z' },
            bad_one: null, // invalid → skipped
        }));

        await migrateAllGuestDataToAuth(UID);

        const grouped = setDocCallsByCollection();
        expect(grouped.reminder_settings_v2).toHaveLength(1);
        const written = grouped.reminder_settings_v2[0];
        expect(written.id).toBe(`${UID}_good_one`);
        // undefined field stripped
        expect('note' in written.data).toBe(false);
        // canonical fields forced
        expect(written.data.user_id).toBe(UID);
        expect(written.data.reminder_id).toBe('good_one');
    });

    it('removes the V2 settings guest key when the payload is an empty object', async () => {
        mockStorage.set(V2_GUEST_SETTINGS_KEY, JSON.stringify({}));

        await migrateAllGuestDataToAuth(UID);

        expect(mockStorage.has(V2_GUEST_SETTINGS_KEY)).toBe(false);
        const grouped = setDocCallsByCollection();
        expect(grouped.reminder_settings_v2).toBeUndefined();
    });

    it('inspects daily-checklist keys without renaming them (safe no-op)', async () => {
        const dateKey = `${DAILY_CHECKLIST_PREFIX}2025-01-15`;
        const userScopedKey = `${DAILY_CHECKLIST_PREFIX}${UID}_extra`;
        mockStorage.set(dateKey, JSON.stringify({ done: ['a'] }));
        mockStorage.set(userScopedKey, JSON.stringify({ done: ['b'] }));

        await migrateAllGuestDataToAuth(UID);

        // both daily-checklist keys are preserved unchanged
        expect(mockStorage.get(dateKey)).toBe(JSON.stringify({ done: ['a'] }));
        expect(mockStorage.get(userScopedKey)).toBe(JSON.stringify({ done: ['b'] }));
    });

    it('handles empty V2 completions payload by removing the legacy guest key', async () => {
        mockStorage.set(V2_COMPLETIONS_GUEST_KEY, JSON.stringify({}));

        await migrateAllGuestDataToAuth(UID);

        expect(mockStorage.has(V2_COMPLETIONS_GUEST_KEY)).toBe(false);
    });

    it('does not throw even when the whole pipeline encounters write failures', async () => {
        mockStorage.set(REMINDER_KEY, JSON.stringify({
            rem_a: { enabled: true, timesPerDay: 2, lastModified: '2025-01-01' },
        }));
        (setDoc as jest.Mock).mockRejectedValue(new Error('global write failure'));

        await expect(migrateAllGuestDataToAuth(UID)).resolves.toBeUndefined();
    });
});
