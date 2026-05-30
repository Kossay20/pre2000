/**
 * Unit tests for appointmentService.
 *
 * The module under test (src/services/appointmentService.ts) is a thin adapter
 * that maps calendar `UserEvent`s into the unified `Appointment` shape.
 * It has exactly three behavioural branches in getAppointments():
 *   1. No authenticated user  -> returns []
 *   2. Authenticated user     -> maps loadUserEvents() result -> Appointment[]
 *   3. loadUserEvents throws   -> caught, returns []
 *
 * We mock its collaborators (auth, calendarService.loadUserEvents, logger) so we
 * can drive each branch deterministically.
 */

// --- Mocks ----------------------------------------------------------------

// Mutable auth mock: tests set/clear auth.currentUser to flip the auth branch.
jest.mock('../../config/firebase', () => ({
    auth: { currentUser: null as { uid: string } | null },
}));

// Mock the real data source. appointmentService only uses loadUserEvents.
jest.mock('../calendarService', () => ({
    loadUserEvents: jest.fn(),
}));

// Logger mock so log.warn/error don't hit the console and so we can assert on it.
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

// --- Imports (after mocks) ------------------------------------------------

import { getAppointments } from '../appointmentService';
import { auth } from '../../config/firebase';
import { loadUserEvents } from '../calendarService';
import type { UserEvent } from '../../types';

const mockedLoadUserEvents = loadUserEvents as jest.MockedFunction<typeof loadUserEvents>;
// auth is the mutable mock object; cast for assignment of currentUser.
const mockedAuth = auth as unknown as { currentUser: { uid: string } | null };

// Helper to build a UserEvent with sensible defaults.
const makeEvent = (overrides: Partial<UserEvent> = {}): UserEvent => ({
    event_id: 'evt_1',
    user_id: 'user_123',
    title: 'Échographie',
    date: '2026-06-15T10:00:00.000Z',
    week: 12,
    type: 'appointment',
    notes: 'Apporter la carte',
    created_at: '2026-05-01T08:00:00.000Z',
    ...overrides,
});

beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.currentUser = { uid: 'user_123' };
    mockedLoadUserEvents.mockResolvedValue([]);
});

describe('appointmentService.getAppointments', () => {
    describe('authentication branch', () => {
        it('returns [] when there is no authenticated user (currentUser null)', async () => {
            mockedAuth.currentUser = null;

            const result = await getAppointments();

            expect(result).toEqual([]);
            // Should short-circuit before touching the data source.
            expect(mockedLoadUserEvents).not.toHaveBeenCalled();
            expect(mockLog.warn).toHaveBeenCalledTimes(1);
        });

        it('returns [] when currentUser exists but uid is undefined', async () => {
            // currentUser?.uid -> undefined, which is falsy -> empty branch.
            mockedAuth.currentUser = {} as { uid: string };

            const result = await getAppointments();

            expect(result).toEqual([]);
            expect(mockedLoadUserEvents).not.toHaveBeenCalled();
            expect(mockLog.warn).toHaveBeenCalledTimes(1);
        });

        it('returns [] when uid is an empty string (falsy)', async () => {
            mockedAuth.currentUser = { uid: '' };

            const result = await getAppointments();

            expect(result).toEqual([]);
            expect(mockedLoadUserEvents).not.toHaveBeenCalled();
        });

        it('passes the authenticated uid through to loadUserEvents', async () => {
            mockedAuth.currentUser = { uid: 'abc-789' };
            mockedLoadUserEvents.mockResolvedValue([]);

            await getAppointments();

            expect(mockedLoadUserEvents).toHaveBeenCalledTimes(1);
            expect(mockedLoadUserEvents).toHaveBeenCalledWith('abc-789');
        });
    });

    describe('empty data', () => {
        it('returns [] when the user has no events', async () => {
            mockedLoadUserEvents.mockResolvedValue([]);

            const result = await getAppointments();

            expect(result).toEqual([]);
            expect(Array.isArray(result)).toBe(true);
        });
    });

    describe('mapping UserEvent -> Appointment', () => {
        it('maps a fully populated event into an Appointment', async () => {
            const event = makeEvent({
                event_id: 'evt_42',
                title: 'Consultation',
                date: '2026-07-20T14:30:00.000Z',
                type: 'appointment',
                notes: 'Bilan sanguin',
            });
            mockedLoadUserEvents.mockResolvedValue([event]);

            const result = await getAppointments();

            expect(result).toHaveLength(1);
            const appt = result[0];
            expect(appt.id).toBe('evt_42');
            expect(appt.title).toBe('Consultation');
            expect(appt.type).toBe('appointment');
            expect(appt.notes).toBe('Bilan sanguin');
            // doctor is always undefined (UserEvent has no doctor field).
            expect(appt.doctor).toBeUndefined();
            // date is converted from ISO string to a Date instance.
            expect(appt.date).toBeInstanceOf(Date);
            expect(appt.date.toISOString()).toBe('2026-07-20T14:30:00.000Z');
        });

        it('preserves order and maps multiple events one-to-one', async () => {
            const events = [
                makeEvent({ event_id: 'a', title: 'First', date: '2026-06-01T00:00:00.000Z' }),
                makeEvent({ event_id: 'b', title: 'Second', date: '2026-06-02T00:00:00.000Z' }),
                makeEvent({ event_id: 'c', title: 'Third', date: '2026-06-03T00:00:00.000Z' }),
            ];
            mockedLoadUserEvents.mockResolvedValue(events);

            const result = await getAppointments();

            expect(result.map(a => a.id)).toEqual(['a', 'b', 'c']);
            expect(result.map(a => a.title)).toEqual(['First', 'Second', 'Third']);
            // getAppointments does NOT sort — it maps in source order.
            expect(result.map(a => a.date.toISOString())).toEqual([
                '2026-06-01T00:00:00.000Z',
                '2026-06-02T00:00:00.000Z',
                '2026-06-03T00:00:00.000Z',
            ]);
        });

        it('always sets doctor to undefined (field not derived from UserEvent)', async () => {
            // Even if the source object happens to carry a doctor-like field, the
            // mapper hardcodes doctor: undefined.
            const event = makeEvent();
            (event as unknown as Record<string, unknown>).doctor = 'Dr. House';
            mockedLoadUserEvents.mockResolvedValue([event]);

            const result = await getAppointments();

            expect(result[0].doctor).toBeUndefined();
        });
    });

    describe('field fallbacks / falsy handling', () => {
        it('defaults id to empty string when event_id is missing', async () => {
            const event = makeEvent({ event_id: undefined as unknown as string });
            mockedLoadUserEvents.mockResolvedValue([event]);

            const result = await getAppointments();

            expect(result[0].id).toBe('');
        });

        it('defaults title to empty string when title is missing', async () => {
            const event = makeEvent({ title: undefined as unknown as string });
            mockedLoadUserEvents.mockResolvedValue([event]);

            const result = await getAppointments();

            expect(result[0].title).toBe('');
        });

        it("defaults type to 'appointment' when type is falsy", async () => {
            const event = makeEvent({ type: '' as unknown as 'appointment' });
            mockedLoadUserEvents.mockResolvedValue([event]);

            const result = await getAppointments();

            expect(result[0].type).toBe('appointment');
        });

        it('keeps a custom non-falsy type unchanged', async () => {
            const event = makeEvent({ type: 'reminder' as unknown as 'appointment' });
            mockedLoadUserEvents.mockResolvedValue([event]);

            const result = await getAppointments();

            expect(result[0].type).toBe('reminder');
        });

        it('maps empty-string notes to undefined (notes || undefined)', async () => {
            const event = makeEvent({ notes: '' });
            mockedLoadUserEvents.mockResolvedValue([event]);

            const result = await getAppointments();

            expect(result[0].notes).toBeUndefined();
        });

        it('maps missing notes to undefined', async () => {
            const event = makeEvent({ notes: undefined });
            mockedLoadUserEvents.mockResolvedValue([event]);

            const result = await getAppointments();

            expect(result[0].notes).toBeUndefined();
        });

        it('preserves non-empty notes', async () => {
            const event = makeEvent({ notes: 'Important note' });
            mockedLoadUserEvents.mockResolvedValue([event]);

            const result = await getAppointments();

            expect(result[0].notes).toBe('Important note');
        });
    });

    describe('date conversion edge cases', () => {
        it('produces an Invalid Date (NaN time) for an unparseable date string, without throwing', async () => {
            const event = makeEvent({ date: 'not-a-real-date' });
            mockedLoadUserEvents.mockResolvedValue([event]);

            const result = await getAppointments();

            expect(result).toHaveLength(1);
            expect(result[0].date).toBeInstanceOf(Date);
            expect(Number.isNaN(result[0].date.getTime())).toBe(true);
        });

        it('parses a date-only string into a valid Date', async () => {
            const event = makeEvent({ date: '2026-12-25' });
            mockedLoadUserEvents.mockResolvedValue([event]);

            const result = await getAppointments();

            expect(Number.isNaN(result[0].date.getTime())).toBe(false);
            expect(result[0].date.toISOString()).toBe('2026-12-25T00:00:00.000Z');
        });
    });

    describe('error handling', () => {
        it('returns [] and logs when loadUserEvents rejects', async () => {
            mockedLoadUserEvents.mockRejectedValue(new Error('firestore down'));

            const result = await getAppointments();

            expect(result).toEqual([]);
            expect(mockLog.error).toHaveBeenCalledTimes(1);
        });

        it('never throws even on rejection (resolves to [])', async () => {
            mockedLoadUserEvents.mockRejectedValue(new Error('boom'));

            // If the catch were missing, this await would reject.
            await expect(getAppointments()).resolves.toEqual([]);
        });
    });
});
