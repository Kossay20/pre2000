/**
 * Unit tests for dataExportService.ts
 *
 * Covers the 2 exported functions of the RGPD/GDPR data-export service:
 *   - generateExportData(user, profile)
 *       * guest detection (user.isGuest, uid starting with "guest", uid="guest")
 *       * authenticated path: gathers all 10 user collections
 *       * userId anonymization (raw UID never exported)
 *       * email only included for authenticated users (guest -> undefined)
 *       * metadata envelope (schemaVersion, appVersion, platform, exportedAt)
 *       * Promise.allSettled fallbacks via unwrap() — one failing service never
 *         aborts the export (arrays -> [], records -> {})
 *       * taskStatuses: guest -> {} (no query), auth -> merged Firestore docs
 *       * taskStatuses inner query error -> {} fallback (does not reject)
 *       * profile spread is preserved
 *   - exportUserData(user, profile, t)
 *       * happy path: writes JSON file to cache + opens share sheet
 *       * sharing unavailable -> Alert, no shareAsync
 *       * generateExportData throwing -> caught -> Alert (no rethrow)
 *
 * All sibling services + firestore + expo + react-native deps are mocked.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../config/firebase', () => ({ db: {} }));

jest.mock('../../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
    }),
}));

// firebase/firestore — only needed for the inline userTaskStatuses query.
jest.mock('firebase/firestore', () => ({
    collection: jest.fn((_db, name) => ({ __collection: name })),
    query: jest.fn((...args) => ({ __query: args })),
    where: jest.fn((field, op, value) => ({ __where: { field, op, value } })),
    getDocs: jest.fn(),
}));

// react-native — Alert + Platform.OS.
jest.mock('react-native', () => ({
    Alert: { alert: jest.fn() },
    Platform: { OS: 'ios' },
}));

// expo-sharing
jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn(),
    shareAsync: jest.fn(),
}));

// expo-file-system/legacy
jest.mock('expo-file-system/legacy', () => ({
    cacheDirectory: 'file:///cache/',
    writeAsStringAsync: jest.fn(),
    EncodingType: { UTF8: 'utf8' },
}));

// Sibling services — each returns a controllable jest.fn().
jest.mock('../weightService', () => ({ getWeightHistory: jest.fn() }));
jest.mock('../remindersV2Service', () => ({ loadUserSettings: jest.fn() }));
jest.mock('../calendarService', () => ({ loadUserEvents: jest.fn() }));
jest.mock('../taskService', () => ({ getUserTasks: jest.fn() }));
jest.mock('../healthService', () => ({
    getWeightHistory: jest.fn(),
    getBloodPressureHistory: jest.fn(),
    getGlucoseHistory: jest.fn(),
    getSymptomsHistory: jest.fn(),
}));
jest.mock('../reminderPersistence', () => ({ loadReminderSettingsAuth: jest.fn() }));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { collection, query, where, getDocs } from 'firebase/firestore';

import { generateExportData, exportUserData } from '../dataExportService';

import { getWeightHistory as getWeightEntriesHistory } from '../weightService';
import { loadUserSettings } from '../remindersV2Service';
import { loadUserEvents } from '../calendarService';
import { getUserTasks } from '../taskService';
import {
    getWeightHistory as getWeightHealthMetrics,
    getBloodPressureHistory,
    getGlucoseHistory,
    getSymptomsHistory,
} from '../healthService';
import { loadReminderSettingsAuth } from '../reminderPersistence';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGetDocs = getDocs as jest.Mock;
const mockCollection = collection as jest.Mock;
const mockQuery = query as jest.Mock;
const mockWhere = where as jest.Mock;
const mockIsAvailable = Sharing.isAvailableAsync as jest.Mock;
const mockShareAsync = Sharing.shareAsync as jest.Mock;
const mockWriteAsString = FileSystem.writeAsStringAsync as jest.Mock;
const mockAlert = Alert.alert as jest.Mock;

const mLoadUserEvents = loadUserEvents as jest.Mock;
const mGetUserTasks = getUserTasks as jest.Mock;
const mGetWeightHealth = getWeightHealthMetrics as jest.Mock;
const mGetWeightEntries = getWeightEntriesHistory as jest.Mock;
const mGetBloodPressure = getBloodPressureHistory as jest.Mock;
const mGetGlucose = getGlucoseHistory as jest.Mock;
const mGetSymptoms = getSymptomsHistory as jest.Mock;
const mLoadReminderSettingsAuth = loadReminderSettingsAuth as jest.Mock;
const mLoadUserSettings = loadUserSettings as jest.Mock;

/** Make every sibling service resolve with sensible non-empty defaults. */
function primeAllResolved() {
    mLoadUserEvents.mockResolvedValue([{ id: 'evt1' }]);
    mGetUserTasks.mockResolvedValue([{ id: 'task1' }]);
    mGetWeightHealth.mockResolvedValue([{ w: 60 }]);
    mGetWeightEntries.mockResolvedValue([{ w: 61 }]);
    mGetBloodPressure.mockResolvedValue([{ sys: 120 }]);
    mGetGlucose.mockResolvedValue([{ g: 90 }]);
    mGetSymptoms.mockResolvedValue([{ s: 'nausea' }]);
    mLoadReminderSettingsAuth.mockResolvedValue({ v1: true });
    mLoadUserSettings.mockResolvedValue({ v2: true });
    // Inline userTaskStatuses query.
    mockGetDocs.mockResolvedValue({
        docs: [
            { id: 'uidAAAA_t1_w10', data: () => ({ completed: true }) },
            { id: 'uidAAAA_t2_w11', data: () => ({ completed: false }) },
        ],
    });
}

beforeEach(() => {
    jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// generateExportData
// ---------------------------------------------------------------------------

describe('generateExportData — authenticated user', () => {
    const authUser = { uid: 'uidAAAA1234567890', email: 'mama@example.com', isGuest: false };
    const profile = { name: 'Amina', dueDate: '2026-09-01' };

    beforeEach(() => {
        primeAllResolved();
    });

    test('gathers all 10 user collections via the sibling services', async () => {
        await generateExportData(authUser, profile);

        expect(mLoadUserEvents).toHaveBeenCalledWith('uidAAAA1234567890');
        expect(mGetUserTasks).toHaveBeenCalledWith('uidAAAA1234567890');
        expect(mGetWeightHealth).toHaveBeenCalledWith('uidAAAA1234567890');
        expect(mGetWeightEntries).toHaveBeenCalledWith('uidAAAA1234567890');
        expect(mGetBloodPressure).toHaveBeenCalledWith('uidAAAA1234567890');
        expect(mGetGlucose).toHaveBeenCalledWith('uidAAAA1234567890');
        expect(mLoadReminderSettingsAuth).toHaveBeenCalledWith('uidAAAA1234567890');
        expect(mLoadUserSettings).toHaveBeenCalledWith('uidAAAA1234567890');
    });

    test('symptoms history is fetched with the ~11-year (4000d) look-back', async () => {
        await generateExportData(authUser, profile);
        expect(mGetSymptoms).toHaveBeenCalledWith('uidAAAA1234567890', 4000);
    });

    test('maps each settled result into the right export section', async () => {
        const data = await generateExportData(authUser, profile);

        expect(data.appointments).toEqual([{ id: 'evt1' }]);
        expect(data.tasks).toEqual([{ id: 'task1' }]);
        expect(data.health.weightHistoryHealthMetrics).toEqual([{ w: 60 }]);
        expect(data.health.weightHistoryEntries).toEqual([{ w: 61 }]);
        expect(data.health.bloodPressure).toEqual([{ sys: 120 }]);
        expect(data.health.glucose).toEqual([{ g: 90 }]);
        expect(data.health.symptomsLog).toEqual([{ s: 'nausea' }]);
        expect(data.reminders.settingsV1).toEqual({ v1: true });
        expect(data.reminders.settingsV2).toEqual({ v2: true });
    });

    test('anonymizes the userId — raw UID never appears, only user_XXXX***', async () => {
        const data = await generateExportData(authUser, profile);
        expect(data.metadata.userId).toBe('user_uidA***');
        // The raw uid must not leak anywhere in the serialized envelope.
        expect(JSON.stringify(data)).not.toContain('uidAAAA1234567890');
    });

    test('includes the email for authenticated users', async () => {
        const data = await generateExportData(authUser, profile);
        expect(data.profile.email).toBe('mama@example.com');
        expect(data.profile.isGuest).toBe(false);
    });

    test('spreads the profile and stamps a fresh metadata envelope', async () => {
        const data = await generateExportData(authUser, profile);

        expect(data.profile.name).toBe('Amina');
        expect(data.profile.dueDate).toBe('2026-09-01');
        expect(data.metadata.appVersion).toBe('1.0.0');
        expect(data.metadata.platform).toBe('ios');
        expect(data.metadata.schemaVersion).toBe(3);
        expect(typeof data.metadata.exportedAt).toBe('string');
        expect(new Date(data.metadata.exportedAt).toISOString()).toBe(data.metadata.exportedAt);
    });

    test('queries userTaskStatuses by user_id and merges docs keyed by doc.id', async () => {
        const data = await generateExportData(authUser, profile);

        expect(mockCollection).toHaveBeenCalledWith({}, 'userTaskStatuses');
        expect(mockWhere).toHaveBeenCalledWith('user_id', '==', 'uidAAAA1234567890');
        expect(mockQuery).toHaveBeenCalled();
        expect(mockGetDocs).toHaveBeenCalledTimes(1);

        expect(data.reminders.taskStatuses).toEqual({
            uidAAAA_t1_w10: { completed: true },
            uidAAAA_t2_w11: { completed: false },
        });
    });
});

describe('generateExportData — guest user', () => {
    const profile = { name: 'Guest Mama' };

    beforeEach(() => {
        primeAllResolved();
    });

    test('flagged guest via user.isGuest exports anonymized "guest" id and no email', async () => {
        const user = { uid: 'realuid999', isGuest: true, email: 'leak@example.com' };
        const data = await generateExportData(user, profile);

        expect(data.metadata.userId).toBe('guest');
        expect(data.profile.email).toBeUndefined();
        expect(data.profile.isGuest).toBe(true);
        // Email must not leak in serialized form.
        expect(JSON.stringify(data)).not.toContain('leak@example.com');
    });

    test('guest detected by uid prefix "guest" — taskStatuses query is skipped', async () => {
        const user = { uid: 'guest-abc-123' };
        const data = await generateExportData(user, profile);

        expect(data.profile.isGuest).toBe(true);
        expect(data.metadata.userId).toBe('guest');
        // The guest branch resolves to {} WITHOUT touching Firestore.
        expect(mockGetDocs).not.toHaveBeenCalled();
        expect(data.reminders.taskStatuses).toEqual({});
    });

    test('no user object at all → defaults to guest uid and empty taskStatuses', async () => {
        const data = await generateExportData(undefined, profile);

        expect(data.metadata.userId).toBe('guest');
        expect(data.profile.isGuest).toBe(true);
        expect(data.profile.email).toBeUndefined();
        expect(mockGetDocs).not.toHaveBeenCalled();
        expect(data.reminders.taskStatuses).toEqual({});
    });

    test('still fetches the non-task-status collections with the guest uid', async () => {
        await generateExportData({ uid: 'guest-1' }, profile);
        expect(mLoadUserEvents).toHaveBeenCalledWith('guest-1');
        expect(mGetUserTasks).toHaveBeenCalledWith('guest-1');
    });
});

describe('generateExportData — resilience via Promise.allSettled / unwrap', () => {
    const authUser = { uid: 'uidBBBB000', email: 'b@example.com', isGuest: false };
    const profile = {};

    beforeEach(() => {
        primeAllResolved();
    });

    test('a rejected array-service falls back to [] without aborting export', async () => {
        mGetUserTasks.mockRejectedValue(new Error('tasks boom'));
        mGetSymptoms.mockRejectedValue(new Error('symptoms boom'));

        const data = await generateExportData(authUser, profile);

        // Failing ones → [] ; the rest still populated.
        expect(data.tasks).toEqual([]);
        expect(data.health.symptomsLog).toEqual([]);
        expect(data.appointments).toEqual([{ id: 'evt1' }]);
        expect(data.health.glucose).toEqual([{ g: 90 }]);
    });

    test('a rejected record-service falls back to {} without aborting export', async () => {
        mLoadReminderSettingsAuth.mockRejectedValue(new Error('v1 boom'));
        mLoadUserSettings.mockRejectedValue(new Error('v2 boom'));

        const data = await generateExportData(authUser, profile);

        expect(data.reminders.settingsV1).toEqual({});
        expect(data.reminders.settingsV2).toEqual({});
        // Other sections intact.
        expect(data.tasks).toEqual([{ id: 'task1' }]);
    });

    test('inner userTaskStatuses query error falls back to {} (no rejection)', async () => {
        mockGetDocs.mockRejectedValue(new Error('firestore down'));

        const data = await generateExportData(authUser, profile);

        expect(data.reminders.taskStatuses).toEqual({});
        // Everything else still resolves fine.
        expect(data.appointments).toEqual([{ id: 'evt1' }]);
    });

    test('all services failing still returns a well-formed envelope with empty sections', async () => {
        mLoadUserEvents.mockRejectedValue(new Error('x'));
        mGetUserTasks.mockRejectedValue(new Error('x'));
        mGetWeightHealth.mockRejectedValue(new Error('x'));
        mGetWeightEntries.mockRejectedValue(new Error('x'));
        mGetBloodPressure.mockRejectedValue(new Error('x'));
        mGetGlucose.mockRejectedValue(new Error('x'));
        mGetSymptoms.mockRejectedValue(new Error('x'));
        mLoadReminderSettingsAuth.mockRejectedValue(new Error('x'));
        mLoadUserSettings.mockRejectedValue(new Error('x'));
        mockGetDocs.mockRejectedValue(new Error('x'));

        const data = await generateExportData(authUser, profile);

        expect(data.appointments).toEqual([]);
        expect(data.tasks).toEqual([]);
        expect(data.health).toEqual({
            weightHistoryHealthMetrics: [],
            weightHistoryEntries: [],
            bloodPressure: [],
            glucose: [],
            symptomsLog: [],
        });
        expect(data.reminders).toEqual({ settingsV1: {}, taskStatuses: {}, settingsV2: {} });
        // Envelope metadata still present.
        expect(data.metadata.schemaVersion).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// exportUserData
// ---------------------------------------------------------------------------

describe('exportUserData', () => {
    const authUser = { uid: 'uidCCCC777', email: 'c@example.com', isGuest: false };
    const profile = { name: 'Lina' };
    const t = jest.fn((key: string) => key);

    beforeEach(() => {
        primeAllResolved();
        mockIsAvailable.mockResolvedValue(true);
        mockShareAsync.mockResolvedValue(undefined);
        mockWriteAsString.mockResolvedValue(undefined);
    });

    test('writes the JSON export to the cache dir and opens the share sheet', async () => {
        await exportUserData(authUser, profile, t);

        expect(mockWriteAsString).toHaveBeenCalledTimes(1);
        const [uri, contents, opts] = mockWriteAsString.mock.calls[0];

        // File URI = cacheDirectory + dated filename.
        expect(uri).toMatch(/^file:\/\/\/cache\/mama-bebe-export-\d{4}-\d{2}-\d{2}\.json$/);
        expect(opts).toEqual({ encoding: 'utf8' });

        // Contents are valid pretty-printed JSON of the export.
        const parsed = JSON.parse(contents);
        expect(parsed.metadata.schemaVersion).toBe(3);
        expect(parsed.profile.name).toBe('Lina');
        // pretty-printed (indent of 2) → contains newlines.
        expect(contents).toContain('\n');

        expect(mockShareAsync).toHaveBeenCalledWith(uri, {
            mimeType: 'application/json',
            dialogTitle: 'common.privacyData.export',
            UTI: 'public.json',
        });
        expect(mockAlert).not.toHaveBeenCalled();
    });

    test('does NOT leak the raw UID into the written file (anonymized)', async () => {
        await exportUserData(authUser, profile, t);
        const contents = mockWriteAsString.mock.calls[0][1];
        expect(contents).not.toContain('uidCCCC777');
        expect(JSON.parse(contents).metadata.userId).toBe('user_uidC***');
    });

    test('alerts and skips sharing when share sheet is unavailable', async () => {
        mockIsAvailable.mockResolvedValue(false);

        await exportUserData(authUser, profile, t);

        expect(mockWriteAsString).toHaveBeenCalledTimes(1); // file still written first
        expect(mockShareAsync).not.toHaveBeenCalled();
        expect(mockAlert).toHaveBeenCalledWith('common.error', 'export.errorMessage');
    });

    test('falls back to common.error when export.errorMessage is empty', async () => {
        mockIsAvailable.mockResolvedValue(false);
        const tEmpty = jest.fn((key: string) => (key === 'export.errorMessage' ? '' : key));

        await exportUserData(authUser, profile, tEmpty);

        expect(mockAlert).toHaveBeenCalledWith('common.error', 'common.error');
    });

    test('catches generateExportData failure → alerts, no rethrow, no share', async () => {
        // Force the underlying file write to throw so the catch block runs.
        mockWriteAsString.mockRejectedValue(new Error('disk full'));

        await expect(exportUserData(authUser, profile, t)).resolves.toBeUndefined();

        expect(mockShareAsync).not.toHaveBeenCalled();
        expect(mockAlert).toHaveBeenCalledWith('common.error', 'export.errorMessage');
    });

    test('an error thrown inside generateExportData is caught (no rethrow to caller)', async () => {
        // Make Sharing.isAvailableAsync reject AFTER write — caught by outer try.
        mockIsAvailable.mockRejectedValue(new Error('sharing module crashed'));

        await expect(exportUserData(authUser, profile, t)).resolves.toBeUndefined();
        expect(mockAlert).toHaveBeenCalledWith('common.error', 'export.errorMessage');
    });

    test('filename date stamp matches today (YYYY-MM-DD from ISO date)', async () => {
        await exportUserData(authUser, profile, t);
        const uri = mockWriteAsString.mock.calls[0][0];
        const expectedStamp = new Date().toISOString().split('T')[0];
        expect(uri).toBe(`file:///cache/mama-bebe-export-${expectedStamp}.json`);
    });
});
