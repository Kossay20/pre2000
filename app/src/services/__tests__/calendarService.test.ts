/**
 * Unit tests for calendarService.
 *
 * calendarService is the central calendar feature module. It:
 *   - Generates template-based events for a pregnancy week (date math + priority colors)
 *   - Loads calendar templates and user events from Firestore
 *   - Performs CRUD on user events (with a guest guard)
 *   - Combines template + user events for a week and groups them by local date
 *
 * Collaborators are mocked:
 *   - firebase/firestore  -> deterministic doc snapshots / write stubs
 *   - ../config/firebase  -> { db: {} }
 *   - ../utils/logger     -> silent logger we can assert on
 *   - ./rdvNotificationService -> { cancelRDVReminders } so we never touch the
 *     expo-notifications / AsyncStorage / timezone chain it pulls in.
 *
 * ../theme is loaded real (react-native -> react-native-web is mapped in
 * jest.config) so we assert against theme.colors.* instead of hardcoded hex.
 *
 * Date-math determinism note: calculateEventDate / getWeekDates use LOCAL date
 * parts (setDate / getDay / getHours). Assertions therefore use getDay() and
 * getLocalDateKey (local), never toISOString() (UTC) which would drift by the
 * machine's timezone offset.
 */

// --- Mocks ----------------------------------------------------------------

jest.mock('../../config/firebase', () => ({
    db: {},
}));

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

// Load-bearing mock: rdvNotificationService pulls expo-notifications,
// AsyncStorage, timezoneService, notificationService, i18n. Mock it directly.
jest.mock('../rdvNotificationService', () => ({
    cancelRDVReminders: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('firebase/firestore', () => ({
    collection: jest.fn(() => ({ __type: 'collection' })),
    doc: jest.fn((_db: unknown, coll: string, id: string) => ({ __type: 'doc', coll, id })),
    query: jest.fn((...args: unknown[]) => ({ __type: 'query', args })),
    where: jest.fn((field: string, op: string, value: unknown) => ({ __type: 'where', field, op, value })),
    orderBy: jest.fn((field: string) => ({ __type: 'orderBy', field })),
    limit: jest.fn((n: number) => ({ __type: 'limit', n })),
    getDocs: jest.fn(),
    getDoc: jest.fn(),
    setDoc: jest.fn().mockResolvedValue(undefined),
    deleteDoc: jest.fn().mockResolvedValue(undefined),
    deleteField: jest.fn(() => ({ __type: 'deleteField' })),
}));

// --- Imports (after mocks) ------------------------------------------------

import {
    generateEventsForWeek,
    generateAllEvents,
    getEventsForWeek,
    loadCalendarTemplates,
    getWeekDates,
    getUpcomingAppointments,
    calculateWeekFromDate,
    loadUserEvents,
    saveUserEvent,
    newUserEventId,
    deleteUserEvent,
    updateUserEvent,
    getCombinedEventsForWeek,
    getLocalDateKey,
    groupEventsByDate,
    GeneratedEvent,
    getUserEvent,
    getCurrentPregnancyWeekRange,
    countEventsInRange,
} from '../calendarService';
import { theme } from '../../theme';
import { collection, getDocs, getDoc, doc, setDoc, deleteDoc, where } from 'firebase/firestore';
import { cancelRDVReminders } from '../rdvNotificationService';
import type { CalendarTemplate, UserEvent, CombinedEvent } from '../../types';

const mockedGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;
const mockedSetDoc = setDoc as jest.MockedFunction<typeof setDoc>;
const mockedDeleteDoc = deleteDoc as jest.MockedFunction<typeof deleteDoc>;
const mockedCancel = cancelRDVReminders as jest.MockedFunction<typeof cancelRDVReminders>;

// Build a Firestore snapshot whose docs[].data() returns each provided object.
const makeSnapshot = (rows: unknown[]) => ({
    docs: rows.map((r) => ({ data: () => r })),
});

// Fixed, timezone-safe LMP: 2026-01-01 is a Thursday (getDay() === 4) in local time.
const LMP = new Date(2026, 0, 1);

const makeTemplate = (overrides: Partial<CalendarTemplate> = {}): CalendarTemplate => ({
    template_id: 't1',
    title_fr: 'Échographie T1',
    title_ar: 'تصوير',
    title_en: 'First scan',
    title_tn: 'Echo',
    description_fr: 'Première échographie',
    description_ar: 'وصف',
    description_en: 'First ultrasound',
    description_tn: 'desc tn',
    type: 'exam',
    importance: 'essential',
    week_min: 11,
    week_max: 14,
    recommended_day: 4,
    sources: 'HAS',
    ...overrides,
});

const makeUserEvent = (overrides: Partial<UserEvent> = {}): UserEvent => ({
    event_id: 'evt_1',
    user_id: 'user_123',
    title: 'RDV gynéco',
    date: '2026-06-15T10:00:00.000Z',
    week: 12,
    type: 'appointment',
    notes: 'Apporter la carte',
    created_at: '2026-05-01T08:00:00.000Z',
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedSetDoc.mockResolvedValue(undefined);
    mockedDeleteDoc.mockResolvedValue(undefined);
    mockedCancel.mockResolvedValue(undefined);
});

// ===========================================================================
// generateEventsForWeek  (+ calculateEventDate + getPriorityColor helpers)
// ===========================================================================

describe('generateEventsForWeek', () => {
    test('returns empty array when no templates provided', () => {
        expect(generateEventsForWeek([], LMP, 12)).toEqual([]);
    });

    test('returns empty array when no template matches the target week', () => {
        const tpl = makeTemplate({ week_min: 20, week_max: 24 });
        expect(generateEventsForWeek([tpl], LMP, 12)).toEqual([]);
    });

    test('includes a template whose [week_min, week_max] range covers the target week', () => {
        const tpl = makeTemplate({ week_min: 11, week_max: 14 });
        const events = generateEventsForWeek([tpl], LMP, 12);
        expect(events).toHaveLength(1);
        expect(events[0].templateId).toBe('t1');
    });

    test('includes templates at the inclusive week_min and week_max boundaries', () => {
        const tpl = makeTemplate({ week_min: 12, week_max: 12 });
        expect(generateEventsForWeek([tpl], LMP, 12)).toHaveLength(1);
        expect(generateEventsForWeek([tpl], LMP, 11)).toHaveLength(0);
        expect(generateEventsForWeek([tpl], LMP, 13)).toHaveLength(0);
    });

    test('maps all multilingual + meta fields onto the generated event', () => {
        const tpl = makeTemplate({ week_min: 1, week_max: 40, recommended_day: 5 });
        const [ev] = generateEventsForWeek([tpl], LMP, 1);
        expect(ev).toMatchObject({
            id: 't1_w1',
            templateId: 't1',
            title: 'Échographie T1', // title defaults to FR
            title_fr: 'Échographie T1',
            title_ar: 'تصوير',
            title_en: 'First scan',
            title_tn: 'Echo',
            week: 1,
            type: 'exam',
            description: 'Première échographie',
            description_fr: 'Première échographie',
            source: 'HAS',
        });
        expect(ev.date).toBeInstanceOf(Date);
    });

    test('importance is stringified onto the event', () => {
        const tpl = makeTemplate({ week_min: 1, week_max: 40, importance: 'recommended' });
        const [ev] = generateEventsForWeek([tpl], LMP, 1);
        expect(ev.importance).toBe('recommended');
    });

    test('numeric importance is also stringified', () => {
        const tpl = makeTemplate({ week_min: 1, week_max: 40, importance: 2 as unknown as CalendarTemplate['importance'] });
        const [ev] = generateEventsForWeek([tpl], LMP, 1);
        expect(ev.importance).toBe('2');
    });

    test('falls back to empty string when description_fr is missing', () => {
        const tpl = makeTemplate({ week_min: 1, week_max: 40, description_fr: undefined as unknown as string });
        const [ev] = generateEventsForWeek([tpl], LMP, 1);
        expect(ev.description).toBe('');
        expect(ev.description_fr).toBe('');
    });

    test('uses recommended_day default of 4 (middle of week) when not specified', () => {
        const withDay = makeTemplate({ template_id: 'a', week_min: 1, week_max: 40, recommended_day: 4 });
        const withoutDay = makeTemplate({ template_id: 'b', week_min: 1, week_max: 40, recommended_day: undefined });
        const [evA] = generateEventsForWeek([withDay], LMP, 5);
        const [evB] = generateEventsForWeek([withoutDay], LMP, 5);
        // Same effective day -> same final calendar date.
        expect(getLocalDateKey(evA.date)).toBe(getLocalDateKey(evB.date));
    });

    test('pushes an event that falls on a Sunday to the following Monday', () => {
        // LMP 2026-01-01 (Thu). week 1, recommended_day 4 -> offset +3 -> Sun 2026-01-04 -> pushed to Mon 2026-01-05.
        const tpl = makeTemplate({ week_min: 1, week_max: 40, recommended_day: 4 });
        const [ev] = generateEventsForWeek([tpl], LMP, 1);
        expect(ev.date.getDay()).toBe(1); // Monday, not Sunday
        expect(getLocalDateKey(ev.date)).toBe('2026-01-05');
    });

    test('does NOT shift an event that does not fall on a Sunday', () => {
        // week 1, recommended_day 5 -> offset +4 -> Mon 2026-01-05, no push.
        const tpl = makeTemplate({ week_min: 1, week_max: 40, recommended_day: 5 });
        const [ev] = generateEventsForWeek([tpl], LMP, 1);
        expect(ev.date.getDay()).toBe(1);
        expect(getLocalDateKey(ev.date)).toBe('2026-01-05');
    });

    test('sorts the returned events by ascending date', () => {
        const early = makeTemplate({ template_id: 'early', week_min: 1, week_max: 40, recommended_day: 2 });
        const late = makeTemplate({ template_id: 'late', week_min: 1, week_max: 40, recommended_day: 6 });
        // Pass them out of order; expect sorted ascending.
        const events = generateEventsForWeek([late, early], LMP, 2);
        expect(events).toHaveLength(2);
        expect(events[0].date.getTime()).toBeLessThanOrEqual(events[1].date.getTime());
        expect(events[0].templateId).toBe('early');
        expect(events[1].templateId).toBe('late');
    });
});

// ===========================================================================
// getPriorityColor (exercised via priorityColor on generated events)
// ===========================================================================

describe('priorityColor mapping (via generateEventsForWeek)', () => {
    const colorFor = (importance: unknown): string => {
        const tpl = makeTemplate({
            week_min: 1,
            week_max: 40,
            importance: importance as CalendarTemplate['importance'],
        });
        return generateEventsForWeek([tpl], LMP, 1)[0].priorityColor;
    };

    test('numeric levels 1-4 map to the correct palette colors', () => {
        expect(colorFor(1)).toBe(theme.colors.calendarPriorityCritical);
        expect(colorFor(2)).toBe(theme.colors.calendarPriorityHigh);
        expect(colorFor(3)).toBe(theme.colors.calendarPriorityModerate);
        expect(colorFor(4)).toBe(theme.colors.teal500);
    });

    test('English string labels map correctly', () => {
        expect(colorFor('critical')).toBe(theme.colors.calendarPriorityCritical);
        expect(colorFor('high')).toBe(theme.colors.calendarPriorityHigh);
        expect(colorFor('moderate')).toBe(theme.colors.calendarPriorityModerate);
        expect(colorFor('medium')).toBe(theme.colors.calendarPriorityModerate);
        expect(colorFor('low')).toBe(theme.colors.teal500);
        expect(colorFor('info')).toBe(theme.colors.calendarPriorityInfo);
        expect(colorFor('information')).toBe(theme.colors.calendarPriorityInfo);
    });

    test('French (legacy) string labels map correctly', () => {
        expect(colorFor('critique')).toBe(theme.colors.calendarPriorityCritical);
        expect(colorFor('élevé')).toBe(theme.colors.calendarPriorityHigh);
        expect(colorFor('modéré')).toBe(theme.colors.calendarPriorityModerate);
        expect(colorFor('faible')).toBe(theme.colors.teal500);
    });

    test('label matching is case-insensitive and trims whitespace', () => {
        expect(colorFor(' HIGH ')).toBe(theme.colors.calendarPriorityHigh);
        expect(colorFor('Critical')).toBe(theme.colors.calendarPriorityCritical);
    });

    test('unknown importance falls back to the information color', () => {
        expect(colorFor('totally-unknown')).toBe(theme.colors.calendarPriorityInfo);
    });

    test('typed importance values (essential/recommended/optional) map to distinct colors', () => {
        // BUGFIX (calendarService.ts): the CalendarTemplate.importance union is now mapped —
        // essential→high, recommended→moderate, optional→info — instead of all falling through
        // to the grey information fallback.
        expect(colorFor('essential')).toBe(theme.colors.calendarPriorityHigh);
        expect(colorFor('recommended')).toBe(theme.colors.calendarPriorityModerate);
        expect(colorFor('optional')).toBe(theme.colors.calendarPriorityInfo);
    });
});

// ===========================================================================
// generateAllEvents
// ===========================================================================

describe('generateAllEvents', () => {
    test('generates one event per week (1..40) for a template that spans the whole pregnancy', () => {
        const tpl = makeTemplate({ week_min: 1, week_max: 40 });
        const events = generateAllEvents([tpl], LMP);
        expect(events).toHaveLength(40);
        const weeks = events.map((e) => e.week);
        expect(Math.min(...weeks)).toBe(1);
        expect(Math.max(...weeks)).toBe(40);
    });

    test('only emits events within the template week range', () => {
        const tpl = makeTemplate({ week_min: 11, week_max: 14 });
        const events = generateAllEvents([tpl], LMP);
        expect(events.map((e) => e.week).sort((a, b) => a - b)).toEqual([11, 12, 13, 14]);
    });

    test('returns empty array for empty templates', () => {
        expect(generateAllEvents([], LMP)).toEqual([]);
    });
});

// ===========================================================================
// getEventsForWeek
// ===========================================================================

describe('getEventsForWeek', () => {
    const allEvents = [
        { week: 10 } as GeneratedEvent,
        { week: 12 } as GeneratedEvent,
        { week: 12 } as GeneratedEvent,
        { week: 13 } as GeneratedEvent,
    ];

    test('filters events to the requested week', () => {
        expect(getEventsForWeek(allEvents, 12)).toHaveLength(2);
    });

    test('returns empty array when no event matches the week', () => {
        expect(getEventsForWeek(allEvents, 99)).toEqual([]);
    });
});

// ===========================================================================
// loadCalendarTemplates
// ===========================================================================

describe('loadCalendarTemplates', () => {
    test('returns the templates parsed from the snapshot on success', async () => {
        const rows = [makeTemplate({ template_id: 'a' }), makeTemplate({ template_id: 'b' })];
        mockedGetDocs.mockResolvedValueOnce(makeSnapshot(rows) as never);
        const result = await loadCalendarTemplates();
        expect(result).toHaveLength(2);
        expect(result[0].template_id).toBe('a');
        expect(collection).toHaveBeenCalledWith({}, 'calendarTemplates');
        expect(mockLog.success).toHaveBeenCalled();
    });

    test('warns when the snapshot is empty and returns []', async () => {
        mockedGetDocs.mockResolvedValueOnce(makeSnapshot([]) as never);
        const result = await loadCalendarTemplates();
        expect(result).toEqual([]);
        expect(mockLog.warn).toHaveBeenCalledWith(
            expect.stringContaining('No calendar templates found')
        );
    });

    test('returns [] and logs error when getDocs rejects', async () => {
        mockedGetDocs.mockRejectedValueOnce(new Error('network'));
        const result = await loadCalendarTemplates();
        expect(result).toEqual([]);
        expect(mockLog.error).toHaveBeenCalled();
    });
});

// ===========================================================================
// getWeekDates
// ===========================================================================

describe('getWeekDates', () => {
    test('week 1 starts at LMP at 00:00:00 and ends 6 days later at 23:59:59.999', () => {
        const { start, end } = getWeekDates(LMP, 1);
        expect(getLocalDateKey(start)).toBe('2026-01-01');
        expect(start.getHours()).toBe(0);
        expect(start.getMinutes()).toBe(0);
        expect(start.getSeconds()).toBe(0);
        expect(start.getMilliseconds()).toBe(0);

        expect(getLocalDateKey(end)).toBe('2026-01-07');
        expect(end.getHours()).toBe(23);
        expect(end.getMinutes()).toBe(59);
        expect(end.getSeconds()).toBe(59);
        expect(end.getMilliseconds()).toBe(999);
    });

    test('shifts the window forward by 7 days per week number', () => {
        const { start } = getWeekDates(LMP, 3); // +14 days -> 2026-01-15
        expect(getLocalDateKey(start)).toBe('2026-01-15');
    });

    test('the window spans 7 calendar days (start..end inclusive)', () => {
        const { start, end } = getWeekDates(LMP, 5);
        // start = day 0 at 00:00:00.000, end = day +6 at 23:59:59.999, so the
        // raw ms gap is ~6.9999 days, which Math.round() takes to 7 calendar days.
        const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        expect(days).toBe(7);
        // end is always after start.
        expect(end.getTime()).toBeGreaterThan(start.getTime());
    });
});

// ===========================================================================
// calculateWeekFromDate
// ===========================================================================

describe('calculateWeekFromDate', () => {
    test('returns 1 for the LMP date itself', () => {
        expect(calculateWeekFromDate(LMP, new Date(2026, 0, 1))).toBe(1);
    });

    test('returns 1 for any day within the first 7 days', () => {
        expect(calculateWeekFromDate(LMP, new Date(2026, 0, 7))).toBe(1);
    });

    test('rolls to week 2 on day 8', () => {
        expect(calculateWeekFromDate(LMP, new Date(2026, 0, 8))).toBe(2);
    });

    test('clamps a date before the LMP to week 1', () => {
        expect(calculateWeekFromDate(LMP, new Date(2025, 11, 1))).toBe(1);
    });

    test('clamps a far-future date to week 40', () => {
        expect(calculateWeekFromDate(LMP, new Date(2027, 0, 1))).toBe(40);
    });

    test('reaches week 40 well into the 40th week (clamp upper bound)', () => {
        // NB: exact day-273 can land on week 39 because a DST transition shortens
        // the elapsed ms by an hour, so Math.floor(diffDays/7) rounds down. Using a
        // date a few days past the week-40 start avoids that boundary flakiness.
        const deepWk40 = new Date(LMP);
        deepWk40.setDate(LMP.getDate() + 39 * 7 + 3); // a few days into week 40
        expect(calculateWeekFromDate(LMP, deepWk40)).toBe(40);
    });
});

// ===========================================================================
// loadUserEvents
// ===========================================================================

describe('loadUserEvents', () => {
    test('returns [] for an empty userId (guard) without hitting Firestore', async () => {
        const result = await loadUserEvents('');
        expect(result).toEqual([]);
        expect(mockedGetDocs).not.toHaveBeenCalled();
    });

    test('returns [] for a guest_ prefixed userId (guard)', async () => {
        const result = await loadUserEvents('guest_abc');
        expect(result).toEqual([]);
        expect(mockedGetDocs).not.toHaveBeenCalled();
    });

    test('loads and parses user events for an authenticated user', async () => {
        const rows = [makeUserEvent({ event_id: 'e1' }), makeUserEvent({ event_id: 'e2' })];
        mockedGetDocs.mockResolvedValueOnce(makeSnapshot(rows) as never);
        const result = await loadUserEvents('user_123');
        expect(result).toHaveLength(2);
        expect(where).toHaveBeenCalledWith('user_id', '==', 'user_123');
    });

    test('returns [] and logs error when getDocs rejects', async () => {
        mockedGetDocs.mockRejectedValueOnce(new Error('boom'));
        const result = await loadUserEvents('user_123');
        expect(result).toEqual([]);
        expect(mockLog.error).toHaveBeenCalled();
    });
});

// ===========================================================================
// getUpcomingAppointments
// ===========================================================================

describe('getUpcomingAppointments', () => {
    // Use offsets relative to the real "now" the SUT computes internally.
    const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
    const DAY = 24 * 60 * 60 * 1000;

    test('returns [] for empty userId (guard)', async () => {
        expect(await getUpcomingAppointments('')).toEqual([]);
        expect(mockedGetDocs).not.toHaveBeenCalled();
    });

    test('returns [] for guest_ userId (guard)', async () => {
        expect(await getUpcomingAppointments('guest_x')).toEqual([]);
        expect(mockedGetDocs).not.toHaveBeenCalled();
    });

    test('returns only future events, sorted ascending', async () => {
        const rows = [
            makeUserEvent({ event_id: 'past', date: iso(-2 * DAY) }),
            makeUserEvent({ event_id: 'far', date: iso(10 * DAY) }),
            makeUserEvent({ event_id: 'soon', date: iso(1 * DAY) }),
        ];
        mockedGetDocs.mockResolvedValueOnce(makeSnapshot(rows) as never);
        const result = await getUpcomingAppointments('user_123');
        expect(result.map((e) => e.event_id)).toEqual(['soon', 'far']);
    });

    test('slices to the limit (default 3)', async () => {
        const rows = Array.from({ length: 5 }, (_, i) =>
            makeUserEvent({ event_id: `e${i}`, date: iso((i + 1) * DAY) })
        );
        mockedGetDocs.mockResolvedValueOnce(makeSnapshot(rows) as never);
        const result = await getUpcomingAppointments('user_123');
        expect(result).toHaveLength(3);
        expect(result.map((e) => e.event_id)).toEqual(['e0', 'e1', 'e2']);
    });

    test('honours a custom limit count', async () => {
        const rows = Array.from({ length: 5 }, (_, i) =>
            makeUserEvent({ event_id: `e${i}`, date: iso((i + 1) * DAY) })
        );
        mockedGetDocs.mockResolvedValueOnce(makeSnapshot(rows) as never);
        const result = await getUpcomingAppointments('user_123', 2);
        expect(result).toHaveLength(2);
    });

    test('returns [] and logs error when getDocs rejects', async () => {
        mockedGetDocs.mockRejectedValueOnce(new Error('fail'));
        expect(await getUpcomingAppointments('user_123')).toEqual([]);
        expect(mockLog.error).toHaveBeenCalled();
    });
});

// ===========================================================================
// saveUserEvent
// ===========================================================================

describe('saveUserEvent', () => {
    const baseInput = (): Omit<UserEvent, 'event_id' | 'created_at'> => ({
        user_id: 'user_123',
        title: 'RDV',
        date: '2026-06-15T10:00:00.000Z',
        week: 12,
        type: 'appointment',
        notes: 'note',
    });

    test('rejects with guest_blocked for empty user_id (guard) without writing', async () => {
        await expect(
            saveUserEvent({ ...baseInput(), user_id: '' })
        ).rejects.toThrow('guest_blocked');
        expect(mockedSetDoc).not.toHaveBeenCalled();
        expect(mockLog.warn).toHaveBeenCalled();
    });

    test('rejects with guest_blocked for a guest_ user_id (guard)', async () => {
        await expect(
            saveUserEvent({ ...baseInput(), user_id: 'guest_42' })
        ).rejects.toThrow('guest_blocked');
        expect(mockedSetDoc).not.toHaveBeenCalled();
    });

    test('writes a cleaned event with a generated event_id and created_at', async () => {
        const result = await saveUserEvent(baseInput());
        expect(result.event_id).toMatch(/^user_event_\d+_[a-z0-9]+$/);
        expect(typeof result.created_at).toBe('string');
        expect(result.user_id).toBe('user_123');
        expect(mockedSetDoc).toHaveBeenCalledTimes(1);
        // doc() is called with the generated id and the userEvents collection.
        const docArg = (doc as jest.Mock).mock.calls[0];
        expect(docArg[1]).toBe('userEvents');
        expect(docArg[2]).toBe(result.event_id);
    });

    test('strips undefined fields before writing (Firestore rejects undefined)', async () => {
        const result = await saveUserEvent({ ...baseInput(), notes: undefined as unknown as string });
        expect(Object.prototype.hasOwnProperty.call(result, 'notes')).toBe(false);
        const written = mockedSetDoc.mock.calls[0][1] as Record<string, unknown>;
        expect(Object.prototype.hasOwnProperty.call(written, 'notes')).toBe(false);
        expect(written.event_id).toBe(result.event_id);
    });

    test('generates distinct event_ids on rapid successive calls', async () => {
        const a = await saveUserEvent(baseInput());
        const b = await saveUserEvent(baseInput());
        expect(a.event_id).not.toBe(b.event_id);
    });

    test('a caller-supplied event_id makes a re-submit overwrite the same doc, never duplicate', async () => {
        const id = newUserEventId();
        const a = await saveUserEvent(baseInput(), { eventId: id });
        const b = await saveUserEvent(baseInput(), { eventId: id });
        expect(a.event_id).toBe(id);
        expect(b.event_id).toBe(id);
        const ids = (doc as jest.Mock).mock.calls.map((c) => c[2]);
        expect(ids).toEqual([id, id]);
    });

    test('an acknowledged write is not pending', async () => {
        const result = await saveUserEvent(baseInput());
        expect(result.pendingSync).toBe(false);
    });

    test('offline: when the server never acknowledges, resolves as queued instead of hanging', async () => {
        // Firestore applies the write locally at once but only settles setDoc on the
        // server ack — offline that is "never", which left Save on "Enregistrement…".
        mockedSetDoc.mockReturnValueOnce(new Promise<void>(() => {}));
        const result = await saveUserEvent(baseInput(), { ackTimeoutMs: 10 });
        expect(result.pendingSync).toBe(true);
        expect(result.event_id).toMatch(/^user_event_/);
        expect(mockedSetDoc).toHaveBeenCalledTimes(1);
    });

    test('a rejection that arrives before the ack timeout still throws', async () => {
        mockedSetDoc.mockRejectedValueOnce(new Error('denied fast'));
        await expect(saveUserEvent(baseInput(), { ackTimeoutMs: 1000 })).rejects.toThrow('denied fast');
    });

    test('rethrows when setDoc fails', async () => {
        mockedSetDoc.mockRejectedValueOnce(new Error('write failed'));
        await expect(saveUserEvent(baseInput())).rejects.toThrow('write failed');
        expect(mockLog.error).toHaveBeenCalled();
    });

    test('logs the permission-denied branch WITHOUT leaking the raw uid', async () => {
        // PII REGRESSION GUARD. This branch used to pass `cleanedEvent.user_id`
        // straight to log.error — the one log level that is not __DEV__-gated and
        // whose extra args are forwarded to Sentry verbatim, defeating the SHA-256
        // UID hashing in logger.setUser(). It now logs only presence.
        const err = Object.assign(new Error('denied'), { code: 'permission-denied' });
        mockedSetDoc.mockRejectedValueOnce(err);
        await expect(saveUserEvent(baseInput())).rejects.toBe(err);
        expect(mockLog.error).toHaveBeenCalledWith(
            expect.stringContaining('PERMISSION DENIED'),
            true
        );
        const loggedRawUid = mockLog.error.mock.calls.some((args: unknown[]) =>
            args.some(a => typeof a === 'string' && a.includes('user_123')),
        );
        expect(loggedRawUid).toBe(false);
    });
});

// ===========================================================================
// deleteUserEvent
// ===========================================================================

describe('deleteUserEvent', () => {
    test('deletes the doc and cancels RDV reminders', async () => {
        await expect(deleteUserEvent('evt_99')).resolves.toBeUndefined();
        expect(mockedDeleteDoc).toHaveBeenCalledTimes(1);
        const docArg = (doc as jest.Mock).mock.calls[0];
        expect(docArg[1]).toBe('userEvents');
        expect(docArg[2]).toBe('evt_99');
        expect(mockedCancel).toHaveBeenCalledWith('evt_99');
    });

    test('still resolves when cancelRDVReminders throws (error swallowed)', async () => {
        mockedCancel.mockRejectedValueOnce(new Error('notif fail'));
        await expect(deleteUserEvent('evt_1')).resolves.toBeUndefined();
        expect(mockedDeleteDoc).toHaveBeenCalledTimes(1);
        expect(mockLog.warn).toHaveBeenCalled();
    });

    test('rethrows when deleteDoc fails', async () => {
        mockedDeleteDoc.mockRejectedValueOnce(new Error('delete failed'));
        await expect(deleteUserEvent('evt_1')).rejects.toThrow('delete failed');
        expect(mockLog.error).toHaveBeenCalled();
        // cancel should not be reached when the delete itself fails.
        expect(mockedCancel).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// updateUserEvent
// ===========================================================================

describe('updateUserEvent', () => {
    test('writes a merge update with undefined fields stripped', async () => {
        await expect(
            updateUserEvent('evt_1', { title: 'Updated', notes: undefined })
        ).resolves.toEqual({ pendingSync: false });
        expect(mockedSetDoc).toHaveBeenCalledTimes(1);
        const [, payload, options] = mockedSetDoc.mock.calls[0];
        expect(payload).toEqual({ title: 'Updated' });
        expect(options).toEqual({ merge: true });
    });

    test('null clears a field on the server (deleteField), so emptied notes do not survive the merge', async () => {
        await updateUserEvent('evt_1', { title: 'Écho', notes: null, location: null });
        const [, payload, options] = mockedSetDoc.mock.calls[0];
        expect(payload).toEqual({
            title: 'Écho',
            notes: { __type: 'deleteField' },
            location: { __type: 'deleteField' },
        });
        expect(options).toEqual({ merge: true });
    });

    test('offline: an unacknowledged update resolves as queued', async () => {
        mockedSetDoc.mockReturnValueOnce(new Promise<void>(() => {}));
        await expect(updateUserEvent('evt_1', { title: 'x' }, { ackTimeoutMs: 10 })).resolves.toEqual({ pendingSync: true });
    });

    test('rethrows when setDoc fails', async () => {
        mockedSetDoc.mockRejectedValueOnce(new Error('update failed'));
        await expect(updateUserEvent('evt_1', { title: 'x' })).rejects.toThrow('update failed');
        expect(mockLog.error).toHaveBeenCalled();
    });
});

// ===========================================================================
// getCombinedEventsForWeek
// ===========================================================================

describe('getCombinedEventsForWeek', () => {
    const makeGenerated = (overrides: Partial<GeneratedEvent> = {}): GeneratedEvent => ({
        id: 'tpl_w12',
        templateId: 'tpl',
        title: 'Échographie',
        title_fr: 'Échographie',
        title_ar: 'تصوير',
        title_en: 'Scan',
        title_tn: 'Echo',
        date: new Date(2026, 5, 10),
        week: 12,
        type: 'exam',
        importance: '1',
        description: 'desc',
        description_fr: 'desc fr',
        description_ar: 'desc ar',
        description_en: 'desc en',
        description_tn: 'desc tn',
        source: 'HAS',
        priorityColor: theme.colors.calendarPriorityCritical,
        ...overrides,
    });

    test('includes template events for the requested week and tags them source=template', () => {
        const templates = [makeGenerated({ week: 12 }), makeGenerated({ id: 'other', week: 13 })];
        const result = getCombinedEventsForWeek(templates, [], 12);
        expect(result).toHaveLength(1);
        expect(result[0].source).toBe('template');
        expect(result[0].priorityColor).toBe(theme.colors.calendarPriorityCritical);
    });

    test('filters user events by WEEK NUMBER when no date range is given', () => {
        const users = [
            makeUserEvent({ event_id: 'in', week: 12 }),
            makeUserEvent({ event_id: 'out', week: 13 }),
        ];
        const result = getCombinedEventsForWeek([], users, 12);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('in');
        expect(result[0].source).toBe('user');
        expect(result[0].priorityColor).toBe(theme.colors.indigoAccent);
    });

    test('filters user events by DATE RANGE when start/end provided (ignoring week field)', () => {
        const start = new Date(2026, 5, 8);
        const end = new Date(2026, 5, 14, 23, 59, 59, 999);
        const users = [
            // wrong week number but inside the date range -> kept
            makeUserEvent({ event_id: 'inrange', week: 99, date: new Date(2026, 5, 10).toISOString() }),
            // outside the date range -> dropped
            makeUserEvent({ event_id: 'outrange', week: 12, date: new Date(2026, 6, 1).toISOString() }),
        ];
        const result = getCombinedEventsForWeek([], users, 12, start, end);
        expect(result.map((e) => e.id)).toEqual(['inrange']);
    });

    test('maps user event fields (notes) onto the combined event', () => {
        const users = [makeUserEvent({ event_id: 'u1', week: 12, notes: 'bring card' })];
        const [ev] = getCombinedEventsForWeek([], users, 12);
        expect(ev.notes).toBe('bring card');
        expect(ev.date).toBeInstanceOf(Date);
    });

    test('preserves the user event location field in the combined view', () => {
        // BUGFIX (calendarService.ts): the user-event → CombinedEvent mapping now carries
        // `location` (UserEvent.location → CombinedEvent.location) — the address no longer
        // silently disappears in the combined/grouped calendar view.
        const users = [makeUserEvent({ event_id: 'u1', week: 12, location: 'Clinique Avicenne, Tunis' })];
        const [ev] = getCombinedEventsForWeek([], users, 12);
        expect(ev.location).toBe('Clinique Avicenne, Tunis');
    });

    test('combines template + user events and sorts the whole list by date ascending', () => {
        const templates = [makeGenerated({ id: 'tpl', week: 12, date: new Date(2026, 5, 12) })];
        const users = [makeUserEvent({ event_id: 'u-early', week: 12, date: new Date(2026, 5, 9).toISOString() })];
        const result = getCombinedEventsForWeek(templates, users, 12);
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('u-early'); // earlier date first
        expect(result[1].id).toBe('tpl');
    });

    test('returns [] when neither templates nor user events match', () => {
        expect(getCombinedEventsForWeek([], [], 12)).toEqual([]);
    });
});

// ===========================================================================
// getLocalDateKey
// ===========================================================================

describe('getLocalDateKey', () => {
    test('formats as zero-padded YYYY-MM-DD in local time', () => {
        expect(getLocalDateKey(new Date(2026, 0, 5))).toBe('2026-01-05'); // Jan 5
        expect(getLocalDateKey(new Date(2026, 11, 25))).toBe('2026-12-25'); // Dec 25
    });

    test('uses local date parts (a late-evening local time does not roll to the next day)', () => {
        // 2026-12-05 at 23:30 local — toISOString() could roll to Dec 6 in +TZ,
        // but getLocalDateKey must keep Dec 5.
        const d = new Date(2026, 11, 5, 23, 30, 0);
        expect(getLocalDateKey(d)).toBe('2026-12-05');
    });
});

// ===========================================================================
// groupEventsByDate
// ===========================================================================

describe('groupEventsByDate', () => {
    const makeCombined = (id: string, date: Date): CombinedEvent => ({
        id,
        title: id,
        date,
        week: 12,
        type: 'appointment',
        source: 'user',
    });

    test('returns an empty object for no events', () => {
        expect(groupEventsByDate([])).toEqual({});
    });

    test('groups events by their local date key', () => {
        const events = [
            makeCombined('a', new Date(2026, 5, 10, 9, 0)),
            makeCombined('b', new Date(2026, 5, 10, 15, 0)),
            makeCombined('c', new Date(2026, 5, 11, 8, 0)),
        ];
        const grouped = groupEventsByDate(events);
        expect(Object.keys(grouped).sort()).toEqual(['2026-06-10', '2026-06-11']);
        expect(grouped['2026-06-10'].map((e) => e.id)).toEqual(['a', 'b']);
        expect(grouped['2026-06-11'].map((e) => e.id)).toEqual(['c']);
    });
});

// ===========================================================================
// getUserEvent — the edit form reads the event by id
// ===========================================================================

describe('getUserEvent', () => {
    const mockedGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;

    test('returns the stored event, location and notes included', async () => {
        const stored = makeUserEvent({ event_id: 'evt_7', location: 'Clinique', notes: 'Jeûner' });
        mockedGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => stored } as never);
        await expect(getUserEvent('evt_7')).resolves.toEqual(stored);
        expect((doc as jest.Mock).mock.calls[0].slice(1)).toEqual(['userEvents', 'evt_7']);
    });

    test('returns null for a deleted event, an unreadable one, or no id', async () => {
        mockedGetDoc.mockResolvedValueOnce({ exists: () => false, data: () => undefined } as never);
        await expect(getUserEvent('gone')).resolves.toBeNull();
        mockedGetDoc.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
        await expect(getUserEvent('not_mine')).resolves.toBeNull();
        await expect(getUserEvent('')).resolves.toBeNull();
    });
});

// ===========================================================================
// "This week" — one range and one counter for the Calendar and the Home pill
// ===========================================================================

describe('getCurrentPregnancyWeekRange + countEventsInRange', () => {
    afterEach(() => jest.useRealTimers());

    test('four appointments later this week count as 4 on both surfaces, whatever Home displays', () => {
        // Wednesday 30 Sept 2026, 10:00 local; LMP 31 weeks earlier → pregnancy week 32
        // starts today and ends next Tuesday.
        jest.useFakeTimers({ now: new Date(2026, 8, 30, 10, 0) });
        const lmp = new Date(2026, 1, 25);
        const saturday = [9, 10, 11, 12].map((h) => makeUserEvent({
            event_id: `e${h}`,
            date: new Date(2026, 9, 3, h, 0).toISOString(),
        }));
        const range = getCurrentPregnancyWeekRange(lmp);
        expect(getLocalDateKey(range.start)).toBe('2026-09-30');
        expect(getLocalDateKey(range.end)).toBe('2026-10-06');

        // Calendar: all user events in the displayed week (getWeekDates of the real week).
        const calendarCount = countEventsInRange(saturday, getWeekDates(lmp, 32));
        // Home: the uncapped upcoming list, same range. Showing only 3 must not change it.
        const homeCount = countEventsInRange(saturday, range);
        expect(calendarCount).toBe(4);
        expect(homeCount).toBe(calendarCount);
        expect(countEventsInRange(saturday.slice(0, 3), range)).toBe(3); // the old capped input
    });

    test('an appointment the day after the week ends is not "this week"', () => {
        jest.useFakeTimers({ now: new Date(2026, 8, 30, 10, 0) });
        const range = getCurrentPregnancyWeekRange(new Date(2026, 1, 25));
        const nextWeek = makeUserEvent({ date: new Date(2026, 9, 7, 0, 0).toISOString() });
        const lastMinute = makeUserEvent({ date: new Date(2026, 9, 6, 23, 59).toISOString() });
        expect(countEventsInRange([nextWeek], range)).toBe(0);
        expect(countEventsInRange([lastMinute], range)).toBe(1);
    });
});
