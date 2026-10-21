/**
 * @jest-environment ./testing/timezoneEnvironment.js
 *
 * The calendar's pregnancy weeks are the weeks Home counts, in every timezone and past the
 * due date.
 *
 * - The strip of week n runs from LMP day + 7·(n−1) to + 6, local days. It was built by
 *   adding days to the stored LMP instant in local time; a typed or seeded LMP is UTC
 *   midnight, the evening before west of UTC, so in New York "Semaine 32" started on
 *   Tuesday while Home called Wednesday day 1 of week 32.
 * - The calendar opens on the week holding today. It opened on the content week, which
 *   stops at 40, so at 40+3 SA it showed a week in the past under "Semaine 40" while Home,
 *   Reminders and Profile said "Semaine 41".
 */
declare const setTestTimezone: (tz: string) => void;

jest.mock('../../config/firebase', () => ({ db: {} }));
jest.mock('../rdvNotificationService', () => ({ cancelRDVReminders: jest.fn() }));
jest.mock('../../utils/logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));
jest.mock('firebase/firestore', () => ({
    collection: jest.fn(), getDocs: jest.fn(), getDoc: jest.fn(), doc: jest.fn(), setDoc: jest.fn(),
    deleteDoc: jest.fn(), deleteField: jest.fn(), query: jest.fn(), where: jest.fn(), orderBy: jest.fn(), limit: jest.fn(),
}));

import {
    calculateWeekFromDate,
    displayedCalendarWeek,
    generateAllEvents,
    generateEventsForWeek,
    getCombinedEventsForWeek,
    getCurrentPregnancyWeekRange,
    getLocalDateKey,
    getWeekDates,
    LAST_CALENDAR_WEEK,
    pregnancyWeekOfDate,
} from '../calendarService';
import { calculatePregnancyWeek, displayedAgeOf } from '../../utils/pregnancyCalculator';
import { toLocalDateKey } from '../../utils/localDate';
import type { CalendarTemplate, UserEvent } from '../../types';

const ZONES = ['Europe/Paris', 'Africa/Tunis', 'America/New_York', 'Etc/GMT+12', 'Pacific/Kiritimati'];

/** The LMP as the web date input / a seeded profile stores it: UTC midnight of that day. */
const typedLmp = (key: string) => new Date(`${key}T00:00:00.000Z`);
/** The LMP picked on a device: a local wall-clock instant on that day. */
const pickedLmp = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 14, 30);
};
/** The day `days` days before today, as a key. */
const daysAgo = (days: number) => {
    const now = new Date();
    return toLocalDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
};
/** What PregnancyContext publishes for this LMP (see PregnancyContext.recompute). */
const pregnancyInfoFor = (lmp: Date) => {
    const { week, day, completedWeeks, completedDays } = calculatePregnancyWeek(lmp);
    return { week, dayInWeek: day, completedWeeks, completedDays };
};
const inRange = (range: { start: Date; end: Date }, date: Date) => date >= range.start && date <= range.end;

describe.each(ZONES)('in %s', (tz) => {
    beforeAll(() => setTestTimezone(tz));
    afterEach(() => jest.useRealTimers());

    describe.each([['typed', typedLmp], ['picked on the device', pickedLmp]] as const)('LMP 25 Feb 2026 %s', (_, lmpOf) => {
        const lmp = () => lmpOf('2026-02-25');

        it('week 32 runs Wed 30 Sep to Tue 6 Oct, local midnight to local midnight', () => {
            const { start, end } = getWeekDates(lmp(), 32);
            expect(getLocalDateKey(start)).toBe('2026-09-30');
            expect(getLocalDateKey(end)).toBe('2026-10-06');
            expect([start.getHours(), start.getMinutes()]).toEqual([0, 0]);
            expect([end.getHours(), end.getMinutes(), end.getSeconds()]).toEqual([23, 59, 59]);
        });

        it('the day Home calls week 32 day 1 is the strip\'s first day', () => {
            jest.useFakeTimers({ now: new Date(2026, 8, 30, 23, 30) });
            const info = pregnancyInfoFor(lmp());
            expect([displayedAgeOf(info).week, displayedAgeOf(info).day]).toEqual([32, 1]);
            expect(pregnancyWeekOfDate(lmp())).toBe(32);
            expect(getLocalDateKey(getCurrentPregnancyWeekRange(lmp()).start)).toBe('2026-09-30');
        });

        it('an appointment is filed under the week the strip shows it in', () => {
            expect(calculateWeekFromDate(lmp(), new Date(2026, 8, 29, 10, 0))).toBe(31);
            expect(calculateWeekFromDate(lmp(), new Date(2026, 8, 30, 10, 0))).toBe(32);
            expect(calculateWeekFromDate(lmp(), new Date(2026, 9, 6, 23, 0))).toBe(32);
        });

        it('a suggestion for day 1 of week 32 lands on Wed 30 Sep', () => {
            const tpl = { template_id: 't', title_fr: 'x', description_fr: '', type: 'exam', importance: 'essential', week_min: 32, week_max: 32, recommended_day: 1 } as CalendarTemplate;
            expect(getLocalDateKey(generateEventsForWeek([tpl], lmp(), 32)[0].date)).toBe('2026-09-30');
        });
    });

    describe('the calendar opens on the week holding today', () => {
        it.each([
            ['40+3 SA', 283, 41],
            ['25+0 SA', 175, 26],
        ])('at %s', (_, days, week) => {
            jest.useFakeTimers({ now: new Date(2026, 9, 1, 23, 30) });
            for (const lmp of [typedLmp(daysAgo(days)), pickedLmp(daysAgo(days))]) {
                const initial = pregnancyWeekOfDate(lmp);
                expect(inRange(getWeekDates(lmp, initial), new Date())).toBe(true);
                expect(displayedCalendarWeek(initial)).toBe(week);
                expect(initial).toBeLessThanOrEqual(LAST_CALENDAR_WEEK);
            }
        });
    });

    it('past week 40 there are no suggestions, and her own appointments still show', () => {
        jest.useFakeTimers({ now: new Date(2026, 9, 1, 9, 0) });
        const lmp = typedLmp(daysAgo(283));
        const tpl = { template_id: 't', title_fr: 'x', description_fr: '', type: 'exam', importance: 'essential', week_min: 1, week_max: 45, recommended_day: 2 } as CalendarTemplate;
        const suggestions = generateAllEvents([tpl], lmp);
        expect(Math.max(...suggestions.map((e) => e.week))).toBe(40);

        const today = new Date(2026, 9, 1, 15, 0);
        const mine = { event_id: 'mine', title: 'Monitoring', date: today.toISOString(), week: calculateWeekFromDate(lmp, today), type: 'appointment' } as unknown as UserEvent;
        const week = pregnancyWeekOfDate(lmp);
        const { start, end } = getWeekDates(lmp, week);
        expect(getCombinedEventsForWeek(suggestions, [mine], week, start, end).map((e) => e.id)).toEqual(['mine']);
    });

    describe('one week number on Home, Calendar, Reminders and Profile', () => {
        it.each([
            [279, 40],
            [280, 41],
            [283, 41],
            [293, 42],
        ])('day %i since the LMP reads "Semaine %i" everywhere', (days, expected) => {
            jest.useFakeTimers({ now: new Date(2026, 9, 1, 9, 0) });
            const lmp = typedLmp(daysAgo(days));
            const info = pregnancyInfoFor(lmp);
            // Home and Profile print useCurrentWeek().displayWeek = displayedAgeOf(pregnancyInfo).week;
            // Reminders prints displayedAgeOf(pregnancyInfo).week; Calendar prints
            // displayedCalendarWeek of the week it opens on (finalReleaseR3Wiring locks the wiring).
            const labels = {
                home: displayedAgeOf(info).week,
                profile: displayedAgeOf(info).week,
                reminders: displayedAgeOf(info).week,
                calendar: displayedCalendarWeek(pregnancyWeekOfDate(lmp)),
            };
            expect(labels).toEqual({ home: expected, profile: expected, reminders: expected, calendar: expected });
        });
    });
});
