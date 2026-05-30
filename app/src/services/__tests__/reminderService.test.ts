/**
 * Unit tests for reminderService (src/services/reminderService.ts).
 *
 * The module exposes 7 async functions over Firestore + a local JSON file:
 *   - fetchRemindersForWeek(weekNumber)      -> ReminderTemplate[]
 *   - fetchTasksForWeek(weekNumber)          -> WeeklyTask[] (from WEEKLY_TASKS.json)
 *   - fetchWeekRemindersAndTasks(weekNumber) -> { reminders, tasks }
 *   - getUserReminderSettings(userId)        -> UserReminderSettings[]
 *   - updateReminderSettings(...)            -> void (setDoc merge)
 *   - getUserTaskStatuses(userId, week)      -> UserTaskStatus[]
 *   - updateTaskStatus(...)                  -> void (setDoc merge)
 *
 * We mock firebase/firestore and the firebase config so we can drive each
 * Firestore branch deterministically, and we mock the logger to keep the
 * console quiet and to allow optional assertions.
 *
 * fetchTasksForWeek reads the REAL src/data/WEEKLY_TASKS.json via require(),
 * so for that function we either use the real data or jest.mock the module
 * to drive deterministic / error paths.
 */

// --- Mocks ----------------------------------------------------------------

// Logger mock: createLogger() returns a stable object so assertions are possible.
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

// Firebase config: db is just an opaque token; the service passes it through.
jest.mock('../../config/firebase', () => ({
    db: { __db: true },
}));

// Firestore primitives. We make the query-building helpers return inspectable
// tokens so we can assert how queries are composed, and leave getDocs/setDoc/...
// as bare jest.fn() to be configured per-test.
jest.mock('firebase/firestore', () => ({
    collection: jest.fn((_db, name) => ({ __collection: name })),
    query: jest.fn((ref, ...constraints) => ({ __query: { ref, constraints } })),
    where: jest.fn((field, op, value) => ({ __where: { field, op, value } })),
    getDocs: jest.fn(),
    getDoc: jest.fn(),
    doc: jest.fn((_db, coll, id) => ({ __doc: { coll, id } })),
    setDoc: jest.fn(() => Promise.resolve()),
}));

// --- Imports (after mocks) ------------------------------------------------

import {
    fetchRemindersForWeek,
    fetchTasksForWeek,
    fetchWeekRemindersAndTasks,
    getUserReminderSettings,
    updateReminderSettings,
    getUserTaskStatuses,
    updateTaskStatus,
} from '../reminderService';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';

const mockedGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;
const mockedSetDoc = setDoc as jest.MockedFunction<typeof setDoc>;
const mockedCollection = collection as jest.MockedFunction<typeof collection>;
const mockedQuery = query as jest.MockedFunction<typeof query>;
const mockedWhere = where as jest.MockedFunction<typeof where>;
const mockedDoc = doc as jest.MockedFunction<typeof doc>;

// --- Helpers --------------------------------------------------------------

/**
 * Build a fake QuerySnapshot from an array of {id, data} entries.
 * The service uses snapshot.size, snapshot.docs, and doc.id / doc.data().
 */
const makeSnapshot = (entries: Array<{ id?: string; data: any }>) => ({
    size: entries.length,
    docs: entries.map((e, i) => ({
        id: e.id ?? `doc_${i}`,
        data: () => e.data,
    })),
});

beforeEach(() => {
    jest.clearAllMocks();
});

// =====================================================================
// fetchRemindersForWeek
// =====================================================================
describe('fetchRemindersForWeek', () => {
    it('maps calendar appointment docs to ReminderTemplate with all provided fields', async () => {
        const calendarSnap = makeSnapshot([
            {
                id: 'cal_1',
                data: {
                    title_fr: 'Écho T1',
                    title_ar: 'سونار',
                    title_en: 'Echo',
                    title_tn: 'سونار تونسي',
                    description_fr: 'desc fr',
                    description_ar: 'desc ar',
                    description_en: 'desc en',
                    description_tn: 'desc tn',
                    week_min: 11,
                    week_max: 13,
                    importance_level: 3,
                    is_mandatory: true,
                },
            },
        ]);
        const reminderSnap = makeSnapshot([]); // no daily reminders

        mockedGetDocs
            .mockResolvedValueOnce(calendarSnap as any) // calendar query
            .mockResolvedValueOnce(reminderSnap as any); // daily reminder query

        const result = await fetchRemindersForWeek(12);

        expect(result).toHaveLength(1);
        // The service builds an object literal with extra runtime fields not in
        // the ReminderTemplate type (id, importance_level, is_mandatory, ...),
        // so we read those via `any` to assert the real runtime shape.
        const r = result[0] as any;
        expect(r.id).toBe('cal_1');
        expect(r.reminder_id).toBe('cal_1');
        expect(r.title_fr).toBe('Écho T1');
        expect(r.title_ar).toBe('سونار');
        expect(r.title_en).toBe('Echo');
        expect(r.title_tn).toBe('سونار تونسي');
        expect(r.description_fr).toBe('desc fr');
        expect(r.category).toBe('checkup');
        expect(r.week_min).toBe(11);
        expect(r.week_max).toBe(13);
        expect(r.importance_level).toBe(3);
        expect(r.is_mandatory).toBe(true);
        expect(r.default_times_per_day).toBe(1);
        expect(r.suggested_hours).toEqual(['09:00']);
        expect(r.can_user_customize).toBe(false);
        expect(r.priority).toBe('medium');
    });

    it('applies default fallbacks for missing calendar fields (week_min/max default to weekNumber)', async () => {
        const calendarSnap = makeSnapshot([
            { id: 'cal_empty', data: {} }, // no fields at all
        ]);
        const reminderSnap = makeSnapshot([]);

        mockedGetDocs
            .mockResolvedValueOnce(calendarSnap as any)
            .mockResolvedValueOnce(reminderSnap as any);

        const result = await fetchRemindersForWeek(20);

        expect(result).toHaveLength(1);
        const r = result[0] as any;
        expect(r.title_fr).toBe('');
        expect(r.title_ar).toBe('');
        expect(r.description_en).toBe('');
        expect(r.week_min).toBe(20); // defaults to weekNumber
        expect(r.week_max).toBe(20);
        expect(r.importance_level).toBe(2); // default
        expect(r.is_mandatory).toBe(false); // default
        expect(r.category).toBe('checkup');
    });

    it('builds the calendar query with where("week","==",weekNumber) on calendarTemplates', async () => {
        mockedGetDocs
            .mockResolvedValueOnce(makeSnapshot([]) as any)
            .mockResolvedValueOnce(makeSnapshot([]) as any);

        await fetchRemindersForWeek(15);

        expect(mockedCollection).toHaveBeenCalledWith({ __db: true }, 'calendarTemplates');
        expect(mockedWhere).toHaveBeenCalledWith('week', '==', 15);
    });

    it('builds the daily reminder query with the week_min<= and week_max>= constraints', async () => {
        mockedGetDocs
            .mockResolvedValueOnce(makeSnapshot([]) as any)
            .mockResolvedValueOnce(makeSnapshot([]) as any);

        await fetchRemindersForWeek(15);

        expect(mockedCollection).toHaveBeenCalledWith({ __db: true }, 'reminderTemplates');
        expect(mockedWhere).toHaveBeenCalledWith('week_min', '<=', 15);
        expect(mockedWhere).toHaveBeenCalledWith('week_max', '>=', 15);
    });

    it('returns daily reminder docs (raw data) combined with calendar reminders', async () => {
        const calendarSnap = makeSnapshot([
            { id: 'cal_1', data: { title_fr: 'Calendar item' } },
        ]);
        const reminderSnap = makeSnapshot([
            { id: 'rem_1', data: { reminder_id: 'rem_1', title_fr: 'Hydratation', week_min: 1, week_max: 40 } },
            { id: 'rem_2', data: { reminder_id: 'rem_2', title_fr: 'Acide folique', week_min: 1, week_max: 12 } },
        ]);

        mockedGetDocs
            .mockResolvedValueOnce(calendarSnap as any)
            .mockResolvedValueOnce(reminderSnap as any);

        const result = await fetchRemindersForWeek(8);

        expect(result).toHaveLength(3);
        // calendar first, then dailies
        expect(result[0].title_fr).toBe('Calendar item');
        expect(result[1].title_fr).toBe('Hydratation');
        expect(result[2].title_fr).toBe('Acide folique');
    });

    it('falls back to fetch-all-and-manual-filter when the composite-index query throws', async () => {
        const calendarSnap = makeSnapshot([]);
        // The "all reminders" snapshot used by the fallback path
        const allRemindersSnap = makeSnapshot([
            { id: 'a', data: { reminder_id: 'a', title_fr: 'In range', week_min: 5, week_max: 15 } },
            { id: 'b', data: { reminder_id: 'b', title_fr: 'Out of range high', week_min: 20, week_max: 30 } },
            { id: 'c', data: { reminder_id: 'c', title_fr: 'Out of range low', week_min: 1, week_max: 4 } },
            { id: 'd', data: { reminder_id: 'd', title_fr: 'Boundary min', week_min: 10, week_max: 40 } },
        ]);

        mockedGetDocs
            .mockResolvedValueOnce(calendarSnap as any) // calendar query
            .mockRejectedValueOnce(new Error('FAILED_PRECONDITION: index required')) // indexed daily query
            .mockResolvedValueOnce(allRemindersSnap as any); // fallback "all" fetch

        const result = await fetchRemindersForWeek(10);

        // Only docs where week_min<=10<=week_max survive: a (5-15) and d (10-40)
        expect(result.map(r => r.reminder_id).sort()).toEqual(['a', 'd']);
        expect(mockLog.warn).toHaveBeenCalled();
    });

    it('deduplicates reminders sharing the same reminder_id', async () => {
        const calendarSnap = makeSnapshot([]);
        const reminderSnap = makeSnapshot([
            { id: 'x', data: { reminder_id: 'dup', title_fr: 'First', week_min: 1, week_max: 40 } },
            { id: 'y', data: { reminder_id: 'dup', title_fr: 'Second different title', week_min: 1, week_max: 40 } },
        ]);

        mockedGetDocs
            .mockResolvedValueOnce(calendarSnap as any)
            .mockResolvedValueOnce(reminderSnap as any);

        const result = await fetchRemindersForWeek(5);

        expect(result).toHaveLength(1);
        expect(result[0].title_fr).toBe('First');
    });

    it('deduplicates reminders sharing the same normalized title_fr (case/space-insensitive)', async () => {
        const calendarSnap = makeSnapshot([]);
        const reminderSnap = makeSnapshot([
            { id: 'x', data: { reminder_id: 'id1', title_fr: 'Boire de l’eau', week_min: 1, week_max: 40 } },
            { id: 'y', data: { reminder_id: 'id2', title_fr: '  BOIRE DE L’EAU  ', week_min: 1, week_max: 40 } },
        ]);

        mockedGetDocs
            .mockResolvedValueOnce(calendarSnap as any)
            .mockResolvedValueOnce(reminderSnap as any);

        const result = await fetchRemindersForWeek(5);

        // Same normalized title -> second dropped
        expect(result).toHaveLength(1);
        expect(result[0].reminder_id).toBe('id1');
    });

    it('keeps reminders that have neither an id nor a title (empty-key items are not deduped)', async () => {
        const calendarSnap = makeSnapshot([]);
        const reminderSnap = makeSnapshot([
            { id: 'x', data: { reminder_id: '', title_fr: '', week_min: 1, week_max: 40 } },
            { id: 'y', data: { reminder_id: '', title_fr: '', week_min: 1, week_max: 40 } },
        ]);

        mockedGetDocs
            .mockResolvedValueOnce(calendarSnap as any)
            .mockResolvedValueOnce(reminderSnap as any);

        const result = await fetchRemindersForWeek(5);

        // Neither id nor title means the dedup guards never trigger -> both kept.
        expect(result).toHaveLength(2);
    });

    it('dedupes by id even when titles differ, and by title even when ids differ', async () => {
        const calendarSnap = makeSnapshot([]);
        const reminderSnap = makeSnapshot([
            { id: 'a', data: { reminder_id: 'sameId', title_fr: 'Alpha', week_min: 1, week_max: 40 } },
            { id: 'b', data: { reminder_id: 'sameId', title_fr: 'Beta', week_min: 1, week_max: 40 } }, // dup id
            { id: 'c', data: { reminder_id: 'otherId', title_fr: 'Alpha', week_min: 1, week_max: 40 } }, // dup title
            { id: 'd', data: { reminder_id: 'uniqueId', title_fr: 'Gamma', week_min: 1, week_max: 40 } },
        ]);

        mockedGetDocs
            .mockResolvedValueOnce(calendarSnap as any)
            .mockResolvedValueOnce(reminderSnap as any);

        const result = await fetchRemindersForWeek(5);

        expect(result.map(r => r.reminder_id)).toEqual(['sameId', 'uniqueId']);
    });

    it('returns [] and logs error when the (first) calendar getDocs rejects', async () => {
        mockedGetDocs.mockRejectedValueOnce(new Error('network down'));

        const result = await fetchRemindersForWeek(10);

        expect(result).toEqual([]);
        expect(mockLog.error).toHaveBeenCalled();
    });

    it('returns [] and logs error when the fallback "all" fetch also rejects (inner+outer catch)', async () => {
        mockedGetDocs
            .mockResolvedValueOnce(makeSnapshot([]) as any) // calendar ok
            .mockRejectedValueOnce(new Error('index missing')) // indexed daily fails
            .mockRejectedValueOnce(new Error('all fetch also fails')); // fallback fails -> outer catch

        const result = await fetchRemindersForWeek(10);

        expect(result).toEqual([]);
        expect(mockLog.error).toHaveBeenCalled();
    });

    it('returns an empty array when there are no calendar and no daily reminders', async () => {
        mockedGetDocs
            .mockResolvedValueOnce(makeSnapshot([]) as any)
            .mockResolvedValueOnce(makeSnapshot([]) as any);

        const result = await fetchRemindersForWeek(40);

        expect(result).toEqual([]);
    });
});

// =====================================================================
// fetchTasksForWeek  (reads real src/data/WEEKLY_TASKS.json)
// =====================================================================
describe('fetchTasksForWeek (real WEEKLY_TASKS.json)', () => {
    it('returns only tasks whose [week_min, week_max] range contains the given week', async () => {
        const tasks = await fetchTasksForWeek(7);
        expect(tasks.length).toBeGreaterThan(0);
        for (const t of tasks) {
            expect(t.week_min).toBeLessThanOrEqual(7);
            expect(t.week_max).toBeGreaterThanOrEqual(7);
        }
        // task_first_consult covers weeks 6-8 -> must be present at week 7
        expect(tasks.some(t => t.task_id === 'task_first_consult')).toBe(true);
    });

    it('respects inclusive boundaries (week == week_min and week == week_max)', async () => {
        // task_first_consult: week_min 6, week_max 8
        const atMin = await fetchTasksForWeek(6);
        const atMax = await fetchTasksForWeek(8);
        expect(atMin.some(t => t.task_id === 'task_first_consult')).toBe(true);
        expect(atMax.some(t => t.task_id === 'task_first_consult')).toBe(true);
    });

    it('sorts results by priority high -> medium -> low', async () => {
        const tasks = await fetchTasksForWeek(10);
        const order: Record<string, number> = { high: 3, medium: 2, low: 1 };
        for (let i = 1; i < tasks.length; i++) {
            expect(order[tasks[i - 1].priority]).toBeGreaterThanOrEqual(order[tasks[i].priority]);
        }
    });

    it('returns [] for a week outside every task range', async () => {
        const tasks = await fetchTasksForWeek(999);
        expect(tasks).toEqual([]);
    });
});

// fetchTasksForWeek with a mocked JSON module to drive deterministic + error paths.
describe('fetchTasksForWeek (mocked data module)', () => {
    const TASKS_PATH = '../../data/WEEKLY_TASKS.json';

    afterEach(() => {
        jest.resetModules();
        jest.dontMock(TASKS_PATH);
    });

    it('treats a missing tasks array as empty (defaults to [])', async () => {
        // require a fresh module copy so it picks up the doMock
        jest.resetModules();
        jest.doMock(TASKS_PATH, () => ({ version: '1.0' }));
        jest.doMock('../../utils/logger', () => ({ createLogger: () => mockLog }));
        jest.doMock('../../config/firebase', () => ({ db: { __db: true } }));
        jest.doMock('firebase/firestore', () => ({
            collection: jest.fn(), query: jest.fn(), where: jest.fn(),
            getDocs: jest.fn(), getDoc: jest.fn(), doc: jest.fn(), setDoc: jest.fn(),
        }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const svc = require('../reminderService');
        const tasks = await svc.fetchTasksForWeek(10);
        expect(tasks).toEqual([]);
    });

    it('sorts a deterministic mocked task set by priority high>medium>low', async () => {
        jest.resetModules();
        jest.doMock(TASKS_PATH, () => ({
            tasks: [
                { task_id: 't_low', week_min: 1, week_max: 40, priority: 'low' },
                { task_id: 't_high', week_min: 1, week_max: 40, priority: 'high' },
                { task_id: 't_med', week_min: 1, week_max: 40, priority: 'medium' },
            ],
        }));
        jest.doMock('../../utils/logger', () => ({ createLogger: () => mockLog }));
        jest.doMock('../../config/firebase', () => ({ db: { __db: true } }));
        jest.doMock('firebase/firestore', () => ({
            collection: jest.fn(), query: jest.fn(), where: jest.fn(),
            getDocs: jest.fn(), getDoc: jest.fn(), doc: jest.fn(), setDoc: jest.fn(),
        }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const svc = require('../reminderService');
        const tasks = await svc.fetchTasksForWeek(20);
        expect(tasks.map((t: any) => t.task_id)).toEqual(['t_high', 't_med', 't_low']);
    });

    it('returns [] and logs error when require/processing throws (data module errors)', async () => {
        jest.resetModules();
        jest.doMock(TASKS_PATH, () => {
            throw new Error('JSON load failed');
        });
        jest.doMock('../../utils/logger', () => ({ createLogger: () => mockLog }));
        jest.doMock('../../config/firebase', () => ({ db: { __db: true } }));
        jest.doMock('firebase/firestore', () => ({
            collection: jest.fn(), query: jest.fn(), where: jest.fn(),
            getDocs: jest.fn(), getDoc: jest.fn(), doc: jest.fn(), setDoc: jest.fn(),
        }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const svc = require('../reminderService');
        const tasks = await svc.fetchTasksForWeek(10);
        expect(tasks).toEqual([]);
    });
});

// =====================================================================
// fetchWeekRemindersAndTasks
// =====================================================================
describe('fetchWeekRemindersAndTasks', () => {
    it('returns both reminders and tasks for the week in a single object', async () => {
        const calendarSnap = makeSnapshot([
            { id: 'cal_1', data: { title_fr: 'RDV' } },
        ]);
        const reminderSnap = makeSnapshot([]);
        mockedGetDocs
            .mockResolvedValueOnce(calendarSnap as any)
            .mockResolvedValueOnce(reminderSnap as any);

        const result = await fetchWeekRemindersAndTasks(7);

        expect(result).toHaveProperty('reminders');
        expect(result).toHaveProperty('tasks');
        expect(result.reminders).toHaveLength(1);
        expect(result.reminders[0].title_fr).toBe('RDV');
        // tasks come from real JSON; week 7 has at least one
        expect(result.tasks.length).toBeGreaterThan(0);
    });

    it('still returns tasks when reminders fail (reminders -> [], tasks unaffected)', async () => {
        // First getDocs (calendar) rejects -> fetchRemindersForWeek returns []
        mockedGetDocs.mockRejectedValueOnce(new Error('firestore offline'));

        const result = await fetchWeekRemindersAndTasks(7);

        expect(result.reminders).toEqual([]);
        expect(result.tasks.length).toBeGreaterThan(0);
    });
});

// =====================================================================
// getUserReminderSettings
// =====================================================================
describe('getUserReminderSettings', () => {
    it('queries userReminderSettings by user_id and maps doc data', async () => {
        const snap = makeSnapshot([
            { id: 's1', data: { user_id: 'u1', reminder_id: 'r1', enabled: true } },
            { id: 's2', data: { user_id: 'u1', reminder_id: 'r2', enabled: false } },
        ]);
        mockedGetDocs.mockResolvedValueOnce(snap as any);

        const result = await getUserReminderSettings('u1');

        expect(mockedCollection).toHaveBeenCalledWith({ __db: true }, 'userReminderSettings');
        expect(mockedWhere).toHaveBeenCalledWith('user_id', '==', 'u1');
        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ reminder_id: 'r1', enabled: true });
        expect(result[1]).toMatchObject({ reminder_id: 'r2', enabled: false });
    });

    it('returns [] when the user has no settings', async () => {
        mockedGetDocs.mockResolvedValueOnce(makeSnapshot([]) as any);
        const result = await getUserReminderSettings('u-none');
        expect(result).toEqual([]);
    });

    it('returns [] and logs error when getDocs rejects', async () => {
        mockedGetDocs.mockRejectedValueOnce(new Error('boom'));
        const result = await getUserReminderSettings('u1');
        expect(result).toEqual([]);
        expect(mockLog.error).toHaveBeenCalled();
    });
});

// =====================================================================
// updateReminderSettings
// =====================================================================
describe('updateReminderSettings', () => {
    it('writes to doc id `${userId}_${reminderId}` with merge and a last_modified timestamp', async () => {
        await updateReminderSettings('user1', 'rem9', { enabled: true } as any);

        expect(mockedDoc).toHaveBeenCalledWith({ __db: true }, 'userReminderSettings', 'user1_rem9');

        expect(mockedSetDoc).toHaveBeenCalledTimes(1);
        const [, payload, options] = mockedSetDoc.mock.calls[0] as any[];
        expect(payload).toMatchObject({
            user_id: 'user1',
            reminder_id: 'rem9',
            enabled: true,
        });
        expect(payload.last_modified).toBeInstanceOf(Date);
        expect(options).toEqual({ merge: true });
    });

    it('spreads arbitrary partial settings into the written payload', async () => {
        await updateReminderSettings('u', 'r', {
            enabled: false,
            custom_times: ['08:00', '20:00'],
        } as any);

        const [, payload] = mockedSetDoc.mock.calls[0] as any[];
        expect(payload.enabled).toBe(false);
        expect(payload.custom_times).toEqual(['08:00', '20:00']);
    });

    it('propagates (re-throws) errors from setDoc', async () => {
        mockedSetDoc.mockRejectedValueOnce(new Error('permission denied'));
        await expect(
            updateReminderSettings('u', 'r', {} as any)
        ).rejects.toThrow('permission denied');
        expect(mockLog.error).toHaveBeenCalled();
    });
});

// =====================================================================
// getUserTaskStatuses
// =====================================================================
describe('getUserTaskStatuses', () => {
    it('queries userTaskStatuses by user_id AND week_number and maps results', async () => {
        const snap = makeSnapshot([
            { id: 't1', data: { user_id: 'u1', task_id: 'taskA', week_number: 12, completed: true } },
        ]);
        mockedGetDocs.mockResolvedValueOnce(snap as any);

        const result = await getUserTaskStatuses('u1', 12);

        expect(mockedCollection).toHaveBeenCalledWith({ __db: true }, 'userTaskStatuses');
        expect(mockedWhere).toHaveBeenCalledWith('user_id', '==', 'u1');
        expect(mockedWhere).toHaveBeenCalledWith('week_number', '==', 12);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ task_id: 'taskA', completed: true });
    });

    it('returns [] when no statuses exist', async () => {
        mockedGetDocs.mockResolvedValueOnce(makeSnapshot([]) as any);
        const result = await getUserTaskStatuses('u1', 5);
        expect(result).toEqual([]);
    });

    it('returns [] and logs error when getDocs rejects', async () => {
        mockedGetDocs.mockRejectedValueOnce(new Error('offline'));
        const result = await getUserTaskStatuses('u1', 5);
        expect(result).toEqual([]);
        expect(mockLog.error).toHaveBeenCalled();
    });
});

// =====================================================================
// updateTaskStatus
// =====================================================================
describe('updateTaskStatus', () => {
    it('writes doc id `${userId}_${taskId}_${weekNumber}` with completed=true and a completed_at Date', async () => {
        await updateTaskStatus('u1', 'taskA', 14, true);

        expect(mockedDoc).toHaveBeenCalledWith({ __db: true }, 'userTaskStatuses', 'u1_taskA_14');

        const [, payload, options] = mockedSetDoc.mock.calls[0] as any[];
        expect(payload).toMatchObject({
            user_id: 'u1',
            task_id: 'taskA',
            week_number: 14,
            completed: true,
        });
        expect(payload.completed_at).toBeInstanceOf(Date);
        expect(options).toEqual({ merge: true });
    });

    it('sets completed_at to null when completed=false', async () => {
        await updateTaskStatus('u1', 'taskA', 14, false);

        const [, payload] = mockedSetDoc.mock.calls[0] as any[];
        expect(payload.completed).toBe(false);
        expect(payload.completed_at).toBeNull();
    });

    it('propagates (re-throws) errors from setDoc', async () => {
        mockedSetDoc.mockRejectedValueOnce(new Error('write failed'));
        await expect(updateTaskStatus('u1', 'taskA', 1, true)).rejects.toThrow('write failed');
        expect(mockLog.error).toHaveBeenCalled();
    });
});
