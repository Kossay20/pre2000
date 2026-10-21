/**
 * Unit tests for taskService.ts
 *
 * Covers the 5 exported functions that manage user-created custom tasks
 * stored in Firestore 'userTasks':
 *   - createTask        (reminder / recurrence / trim / notif / error branches)
 *   - getUserTasks      (guest+empty guards, in-memory sort, date fallbacks, error)
 *   - updateTaskStatus  (recurring vs one-off, completed true/false, error)
 *   - updateTask        (recurrence undefined/null/value, notif cancel+reschedule, error)
 *   - deleteTask        (delete + cancel notif, error)
 *
 * All Firestore + notification + i18n dependencies are mocked.
 */

import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    updateDoc,
    deleteDoc,
    doc,
    Timestamp,
    arrayUnion,
    arrayRemove,
} from 'firebase/firestore';

import {
    createTask,
    getUserTasks,
    updateTaskStatus,
    updateTask,
    deleteTask,
} from '../taskService';

import {
    scheduleOneTimeNotification,
    cancelReminderNotifications,
} from '../notificationService';

import { getTaskMessage } from '../../utils/notificationMessages';
import { RecurrenceRule } from '../../types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../config/firebase', () => ({ db: {} }));

// Timestamp.fromDate returns a sentinel object carrying the original Date so we
// can both assert the call AND round-trip through .toDate() when reading back.
jest.mock('firebase/firestore', () => ({
    collection: jest.fn((_db, name) => ({ __collection: name })),
    addDoc: jest.fn(),
    getDocs: jest.fn(),
    query: jest.fn((...args) => ({ __query: args })),
    where: jest.fn((field, op, value) => ({ __where: { field, op, value } })),
    updateDoc: jest.fn(),
    deleteDoc: jest.fn(),
    doc: jest.fn((_db, coll, id) => ({ __doc: { coll, id } })),
    Timestamp: {
        fromDate: jest.fn((d: Date) => ({ __ts: true, toDate: () => d })),
        now: () => ({ toDate: () => new Date() }),
    },
    orderBy: jest.fn(),
    arrayUnion: jest.fn((v) => ({ __arrayUnion: v })),
    arrayRemove: jest.fn((v) => ({ __arrayRemove: v })),
}));

jest.mock('../notificationService', () => ({
    scheduleOneTimeNotification: jest.fn(() => Promise.resolve()),
    cancelReminderNotifications: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../utils/notificationMessages', () => ({
    getTaskMessage: jest.fn(() => ({ title: 'NOTIF_TITLE', body: 'NOTIF_BODY' })),
}));

jest.mock('../../i18n', () => ({
    __esModule: true,
    default: { language: 'fr', t: (k: string) => k, changeLanguage: jest.fn() },
}));

jest.mock('@react-native-async-storage/async-storage', () => {
    const store: Record<string, string> = {};
    return {
        getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
        setItem: jest.fn((k: string, v: string) => { store[k] = v; return Promise.resolve(); }),
        removeItem: jest.fn((k: string) => { delete store[k]; return Promise.resolve(); }),
        multiRemove: jest.fn((keys: string[]) => { keys.forEach(k => delete store[k]); return Promise.resolve(); }),
        getAllKeys: jest.fn(() => Promise.resolve(Object.keys(store))),
    };
});

jest.mock('../../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
    }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockAddDoc = addDoc as jest.Mock;
const mockGetDocs = getDocs as jest.Mock;
const mockUpdateDoc = updateDoc as jest.Mock;
const mockDeleteDoc = deleteDoc as jest.Mock;
const mockTimestamp = Timestamp as unknown as { fromDate: jest.Mock; now: () => any };

/** Build a fake Firestore doc snapshot. created_at/updated_at default to ts wrappers. */
function makeDoc(id: string, data: Record<string, any>) {
    return {
        id,
        data: () => data,
    };
}

/** Wrap a Date into the same {toDate} shape produced by Timestamp.fromDate mock. */
function ts(date: Date) {
    return { __ts: true, toDate: () => date };
}

beforeEach(() => {
    jest.clearAllMocks();
    // default resolved values
    mockAddDoc.mockResolvedValue({ id: 'generated-id' });
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockGetDocs.mockResolvedValue({ docs: [] });
});

// ===========================================================================
// createTask
// ===========================================================================

describe('createTask', () => {
    test('creates a basic task with defaults and returns mapped UserTask', async () => {
        const result = await createTask('user-1', 'Buy vitamins');

        expect(collection).toHaveBeenCalledWith({}, 'userTasks');
        expect(mockAddDoc).toHaveBeenCalledTimes(1);

        const [, payload] = mockAddDoc.mock.calls[0];
        expect(payload.user_id).toBe('user-1');
        expect(payload.title).toBe('Buy vitamins');
        expect(payload.priority).toBe('medium'); // default
        expect(payload.completed).toBe(false);
        expect(payload.reminder_time).toBeNull();
        // no recurrence => no recurrence/completed_dates keys
        expect(payload).not.toHaveProperty('recurrence');
        expect(payload).not.toHaveProperty('completed_dates');

        expect(result.task_id).toBe('generated-id');
        expect(result.user_id).toBe('user-1');
        expect(result.title).toBe('Buy vitamins');
        expect(result.priority).toBe('medium');
        expect(result.completed).toBe(false);
        expect(result.created_at).toBeInstanceOf(Date);
        expect(result.updated_at).toBeInstanceOf(Date);
        expect(result.reminder_time).toBeUndefined();
        expect(result.recurrence).toBeUndefined();
        expect(result.completed_dates).toBeUndefined();
    });

    test('trims the title before persisting and returning', async () => {
        const result = await createTask('user-1', '   Padded title   ', 'high');
        const [, payload] = mockAddDoc.mock.calls[0];
        expect(payload.title).toBe('Padded title');
        expect(result.title).toBe('Padded title');
        expect(payload.priority).toBe('high');
    });

    test('does NOT schedule a notification when no reminderTime', async () => {
        await createTask('user-1', 'No reminder');
        expect(scheduleOneTimeNotification).not.toHaveBeenCalled();
        expect(getTaskMessage).not.toHaveBeenCalled();
    });

    test('schedules a notification when reminderTime is provided', async () => {
        const reminder = new Date('2026-06-01T09:00:00Z');
        const result = await createTask('user-1', 'Take pill', 'low', reminder);

        const [, payload] = mockAddDoc.mock.calls[0];
        // reminder_time stored as a Timestamp wrapper (not null)
        expect(mockTimestamp.fromDate).toHaveBeenCalledWith(reminder);
        expect(payload.reminder_time).not.toBeNull();

        // getTaskMessage called with trimmed title + current locale (fr)
        expect(getTaskMessage).toHaveBeenCalledWith('Take pill', 'fr');

        // notification scheduled with the generated id + message + reminder date
        expect(scheduleOneTimeNotification).toHaveBeenCalledWith(
            'generated-id',
            'NOTIF_TITLE',
            'NOTIF_BODY',
            reminder,
        );

        // returned reminder_time is the original Date
        expect(result.reminder_time).toBe(reminder);
    });

    test('includes recurrence + empty completed_dates when recurrence provided', async () => {
        const recurrence: RecurrenceRule = { type: 'daily' };
        const result = await createTask('user-1', 'Walk', 'medium', undefined, recurrence);

        const [, payload] = mockAddDoc.mock.calls[0];
        expect(payload.recurrence).toEqual(recurrence);
        expect(payload.completed_dates).toEqual([]);

        expect(result.recurrence).toEqual(recurrence);
        expect(result.completed_dates).toEqual([]);
    });

    test('returns completed_dates undefined when no recurrence', async () => {
        const result = await createTask('user-1', 'Once');
        expect(result.completed_dates).toBeUndefined();
    });

    test('rethrows and logs when addDoc fails', async () => {
        const err = new Error('firestore down');
        mockAddDoc.mockRejectedValueOnce(err);
        await expect(createTask('user-1', 'fail')).rejects.toThrow('firestore down');
        // notification should not be attempted on failure
        expect(scheduleOneTimeNotification).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// getUserTasks
// ===========================================================================

describe('getUserTasks', () => {
    test('returns [] for empty userId (guard)', async () => {
        const result = await getUserTasks('');
        expect(result).toEqual([]);
        expect(getDocs).not.toHaveBeenCalled();
    });

    test('returns [] for guest_ userId (guard)', async () => {
        const result = await getUserTasks('guest_abc123');
        expect(result).toEqual([]);
        expect(getDocs).not.toHaveBeenCalled();
    });

    test('queries by user_id and maps documents', async () => {
        const created = new Date('2026-01-01T00:00:00Z');
        mockGetDocs.mockResolvedValueOnce({
            docs: [
                makeDoc('t1', {
                    user_id: 'u1',
                    title: 'A',
                    priority: 'high',
                    completed: false,
                    created_at: ts(created),
                    updated_at: ts(created),
                }),
            ],
        });

        const result = await getUserTasks('u1');

        expect(where).toHaveBeenCalledWith('user_id', '==', 'u1');
        expect(query).toHaveBeenCalled();
        expect(result).toHaveLength(1);
        expect(result[0].task_id).toBe('t1');
        expect(result[0].title).toBe('A');
        expect(result[0].created_at).toEqual(created);
    });

    test('falls back to new Date() when created_at/updated_at missing', async () => {
        mockGetDocs.mockResolvedValueOnce({
            docs: [
                makeDoc('t1', {
                    user_id: 'u1',
                    title: 'No dates',
                    priority: 'low',
                    completed: false,
                    // no created_at / updated_at
                }),
            ],
        });

        const result = await getUserTasks('u1');
        expect(result[0].created_at).toBeInstanceOf(Date);
        expect(result[0].updated_at).toBeInstanceOf(Date);
        expect(result[0].completed_at).toBeUndefined();
        expect(result[0].reminder_time).toBeUndefined();
    });

    test('maps optional fields (completed_at, reminder_time, recurrence, completed_dates)', async () => {
        const c = new Date('2026-02-01T00:00:00Z');
        const r = new Date('2026-02-02T08:00:00Z');
        const completedAt = new Date('2026-02-03T10:00:00Z');
        const recurrence: RecurrenceRule = { type: 'interval', interval: 3 };
        mockGetDocs.mockResolvedValueOnce({
            docs: [
                makeDoc('t1', {
                    user_id: 'u1',
                    title: 'Full',
                    priority: 'medium',
                    completed: true,
                    created_at: ts(c),
                    updated_at: ts(c),
                    completed_at: ts(completedAt),
                    reminder_time: ts(r),
                    recurrence,
                    completed_dates: ['2026-02-03'],
                }),
            ],
        });

        const result = await getUserTasks('u1');
        expect(result[0].completed_at).toEqual(completedAt);
        expect(result[0].reminder_time).toEqual(r);
        expect(result[0].recurrence).toEqual(recurrence);
        expect(result[0].completed_dates).toEqual(['2026-02-03']);
    });

    test('sorts incomplete tasks before completed tasks', async () => {
        const d = new Date('2026-01-01T00:00:00Z');
        mockGetDocs.mockResolvedValueOnce({
            docs: [
                makeDoc('done', { user_id: 'u1', title: 'Done', priority: 'high', completed: true, created_at: ts(d), updated_at: ts(d) }),
                makeDoc('todo', { user_id: 'u1', title: 'Todo', priority: 'low', completed: false, created_at: ts(d), updated_at: ts(d) }),
            ],
        });

        const result = await getUserTasks('u1');
        expect(result.map(t => t.task_id)).toEqual(['todo', 'done']);
    });

    test('sorts by priority (high → medium → low) among same completion state', async () => {
        const d = new Date('2026-01-01T00:00:00Z');
        mockGetDocs.mockResolvedValueOnce({
            docs: [
                makeDoc('low', { user_id: 'u1', title: 'L', priority: 'low', completed: false, created_at: ts(d), updated_at: ts(d) }),
                makeDoc('high', { user_id: 'u1', title: 'H', priority: 'high', completed: false, created_at: ts(d), updated_at: ts(d) }),
                makeDoc('med', { user_id: 'u1', title: 'M', priority: 'medium', completed: false, created_at: ts(d), updated_at: ts(d) }),
            ],
        });

        const result = await getUserTasks('u1');
        expect(result.map(t => t.task_id)).toEqual(['high', 'med', 'low']);
    });

    test('sorts by created_at (newest first) when same completion + priority', async () => {
        const older = new Date('2026-01-01T00:00:00Z');
        const newer = new Date('2026-03-01T00:00:00Z');
        mockGetDocs.mockResolvedValueOnce({
            docs: [
                makeDoc('older', { user_id: 'u1', title: 'O', priority: 'high', completed: false, created_at: ts(older), updated_at: ts(older) }),
                makeDoc('newer', { user_id: 'u1', title: 'N', priority: 'high', completed: false, created_at: ts(newer), updated_at: ts(newer) }),
            ],
        });

        const result = await getUserTasks('u1');
        expect(result.map(t => t.task_id)).toEqual(['newer', 'older']);
    });

    test('returns [] and does not throw when getDocs rejects', async () => {
        mockGetDocs.mockRejectedValueOnce(new Error('network'));
        const result = await getUserTasks('u1');
        expect(result).toEqual([]);
    });
});

// ===========================================================================
// updateTaskStatus
// ===========================================================================

describe('updateTaskStatus', () => {
    test('one-off complete: sets completed=true + completed_at timestamp', async () => {
        await updateTaskStatus('task-1', true);

        expect(doc).toHaveBeenCalledWith({}, 'userTasks', 'task-1');
        const [, payload] = mockUpdateDoc.mock.calls[0];
        expect(payload.completed).toBe(true);
        expect(payload.completed_at).not.toBeNull();
        expect(payload.completed_at).toBeDefined();
        expect(payload.updated_at).toBeDefined();
        expect(payload).not.toHaveProperty('completed_dates');
    });

    test('one-off uncomplete: sets completed=false + completed_at null', async () => {
        await updateTaskStatus('task-1', false);
        const [, payload] = mockUpdateDoc.mock.calls[0];
        expect(payload.completed).toBe(false);
        expect(payload.completed_at).toBeNull();
    });

    test('recurring complete with dateStr: arrayUnion on completed_dates', async () => {
        await updateTaskStatus('task-1', true, true, '2026-05-30');
        expect(arrayUnion).toHaveBeenCalledWith('2026-05-30');
        const [, payload] = mockUpdateDoc.mock.calls[0];
        expect(payload.completed_dates).toEqual({ __arrayUnion: '2026-05-30' });
        // recurring path must NOT touch the boolean completed field
        expect(payload).not.toHaveProperty('completed');
        expect(payload).not.toHaveProperty('completed_at');
    });

    test('recurring uncomplete with dateStr: arrayRemove on completed_dates', async () => {
        await updateTaskStatus('task-1', false, true, '2026-05-30');
        expect(arrayRemove).toHaveBeenCalledWith('2026-05-30');
        const [, payload] = mockUpdateDoc.mock.calls[0];
        expect(payload.completed_dates).toEqual({ __arrayRemove: '2026-05-30' });
    });

    test('isRecurring true but no dateStr falls back to one-off boolean path', async () => {
        await updateTaskStatus('task-1', true, true);
        const [, payload] = mockUpdateDoc.mock.calls[0];
        expect(payload.completed).toBe(true);
        expect(payload).not.toHaveProperty('completed_dates');
        expect(arrayUnion).not.toHaveBeenCalled();
    });

    test('dateStr provided but isRecurring falsy uses one-off path', async () => {
        await updateTaskStatus('task-1', true, false, '2026-05-30');
        const [, payload] = mockUpdateDoc.mock.calls[0];
        expect(payload.completed).toBe(true);
        expect(payload).not.toHaveProperty('completed_dates');
        expect(arrayUnion).not.toHaveBeenCalled();
    });

    test('rethrows when updateDoc fails', async () => {
        mockUpdateDoc.mockRejectedValueOnce(new Error('boom'));
        await expect(updateTaskStatus('task-1', true)).rejects.toThrow('boom');
    });
});

// ===========================================================================
// updateTask
// ===========================================================================

describe('updateTask', () => {
    test('updates title (trimmed) + priority + null reminder by default', async () => {
        await updateTask('task-1', '  Renamed  ', 'high');

        expect(doc).toHaveBeenCalledWith({}, 'userTasks', 'task-1');
        const [, payload] = mockUpdateDoc.mock.calls[0];
        expect(payload.title).toBe('Renamed');
        expect(payload.priority).toBe('high');
        expect(payload.reminder_time).toBeNull();
        expect(payload.updated_at).toBeDefined();
        // recurrence undefined => key absent
        expect(payload).not.toHaveProperty('recurrence');
    });

    test('always cancels existing notifications', async () => {
        await updateTask('task-1', 'X', 'low');
        expect(cancelReminderNotifications).toHaveBeenCalledWith('task-1');
    });

    test('does not reschedule a notification when no reminderTime', async () => {
        await updateTask('task-1', 'X', 'low');
        expect(scheduleOneTimeNotification).not.toHaveBeenCalled();
        expect(getTaskMessage).not.toHaveBeenCalled();
    });

    test('reschedules notification when reminderTime is provided', async () => {
        const reminder = new Date('2026-07-01T07:30:00Z');
        await updateTask('task-1', '  Reminder task  ', 'medium', reminder);

        const [, payload] = mockUpdateDoc.mock.calls[0];
        expect(mockTimestamp.fromDate).toHaveBeenCalledWith(reminder);
        expect(payload.reminder_time).not.toBeNull();

        // cancel happens before schedule
        expect(cancelReminderNotifications).toHaveBeenCalledWith('task-1');
        expect(getTaskMessage).toHaveBeenCalledWith('Reminder task', 'fr');
        expect(scheduleOneTimeNotification).toHaveBeenCalledWith(
            'task-1',
            'NOTIF_TITLE',
            'NOTIF_BODY',
            reminder,
        );
    });

    test('recurrence === null sets recurrence to null (transition to one-off)', async () => {
        await updateTask('task-1', 'X', 'low', undefined, null);
        const [, payload] = mockUpdateDoc.mock.calls[0];
        expect(payload.recurrence).toBeNull();
    });

    test('recurrence object is persisted as-is', async () => {
        const recurrence: RecurrenceRule = { type: 'specific_days', days: [1, 3, 5] };
        await updateTask('task-1', 'X', 'low', undefined, recurrence);
        const [, payload] = mockUpdateDoc.mock.calls[0];
        expect(payload.recurrence).toEqual(recurrence);
    });

    test('recurrence undefined leaves recurrence key absent', async () => {
        await updateTask('task-1', 'X', 'low', undefined, undefined);
        const [, payload] = mockUpdateDoc.mock.calls[0];
        expect(payload).not.toHaveProperty('recurrence');
    });

    test('rethrows when updateDoc fails (notifications not touched)', async () => {
        mockUpdateDoc.mockRejectedValueOnce(new Error('update fail'));
        await expect(updateTask('task-1', 'X', 'low')).rejects.toThrow('update fail');
        expect(cancelReminderNotifications).not.toHaveBeenCalled();
    });

    test('rethrows when cancelReminderNotifications fails after update', async () => {
        (cancelReminderNotifications as jest.Mock).mockRejectedValueOnce(new Error('cancel fail'));
        await expect(updateTask('task-1', 'X', 'low')).rejects.toThrow('cancel fail');
        expect(mockUpdateDoc).toHaveBeenCalled();
    });
});

// ===========================================================================
// deleteTask
// ===========================================================================

describe('deleteTask', () => {
    test('deletes the doc and cancels notifications', async () => {
        await deleteTask('task-1');
        expect(doc).toHaveBeenCalledWith({}, 'userTasks', 'task-1');
        expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
        expect(cancelReminderNotifications).toHaveBeenCalledWith('task-1');
    });

    test('rethrows when deleteDoc fails (cancel not reached)', async () => {
        mockDeleteDoc.mockRejectedValueOnce(new Error('delete fail'));
        await expect(deleteTask('task-1')).rejects.toThrow('delete fail');
        expect(cancelReminderNotifications).not.toHaveBeenCalled();
    });

    test('rethrows when cancelReminderNotifications fails after delete', async () => {
        (cancelReminderNotifications as jest.Mock).mockRejectedValueOnce(new Error('cancel fail'));
        await expect(deleteTask('task-1')).rejects.toThrow('cancel fail');
        expect(mockDeleteDoc).toHaveBeenCalled();
    });
});
