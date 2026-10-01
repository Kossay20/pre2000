/**
 * @jest-environment ./testing/timezoneEnvironment.js
 *
 * Local calendar days (utils/localDate) and the add-appointment date rules built on them
 * (utils/appointmentDate), run under the zones where the UTC day and the local day part:
 * New York in the evening (local day < UTC day) and Kiritimati, UTC+14 (local day > UTC day).
 */
import { isOnLocalDay, parseLocalDateKey, parseTimeHHMM, toLocalDateKey } from '../localDate';
import { initialAppointmentDate, quickAddDateKey, toMinute, withLocalDay, withLocalTime } from '../appointmentDate';

declare const setTestTimezone: (tz: string) => void;

describe.each([
    // 20:30 on 30 Sept in New York is already 1 Oct in UTC.
    ['America/New_York', '2026-10-01T00:30:13.559Z', '2026-09-30', '2026-10-01'],
    // 11:06 on 1 Oct in Kiritimati is still 30 Sept in UTC.
    ['Pacific/Kiritimati', '2026-09-30T21:06:13.559Z', '2026-10-01', '2026-09-30'],
])('%s', (tz, nowIso, localDay, utcDay) => {
    const now = new Date(nowIso);

    beforeAll(() => {
        setTestTimezone(tz);
    });

    it('the zone really puts the local day on the other side of the UTC day', () => {
        expect(nowIso.slice(0, 10)).toBe(utcDay);
        expect(localDay).not.toBe(utcDay);
    });

    it('toLocalDateKey gives the local day, not the UTC one', () => {
        expect(toLocalDateKey(now)).toBe(localDay);
    });

    it('isOnLocalDay matches a UTC instant to the local day it falls on', () => {
        expect(isOnLocalDay(nowIso, localDay)).toBe(true);
        expect(isOnLocalDay(nowIso, utcDay)).toBe(false);
    });

    it('parseLocalDateKey returns local midnight of that day', () => {
        const d = parseLocalDateKey(localDay)!;
        expect(toLocalDateKey(d)).toBe(localDay);
        expect([d.getHours(), d.getMinutes()]).toEqual([0, 0]);
    });

    it('Home quick-add opens the form on the local today, and N weeks ahead when previewing', () => {
        expect(quickAddDateKey(32, 32, now)).toBe(localDay);
        const inTwoWeeks = new Date(now);
        inTwoWeeks.setDate(inTwoWeeks.getDate() + 14);
        expect(quickAddDateKey(34, 32, now)).toBe(toLocalDateKey(inTwoWeeks));
    });

    it('a form opened on today starts at the current minute, seconds zeroed', () => {
        const d = initialAppointmentDate(localDay, now);
        expect(toLocalDateKey(d)).toBe(localDay);
        expect(d.getHours()).toBe(now.getHours());
        expect(d.getMinutes()).toBe(now.getMinutes());
        expect([d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0]);
    });

    it('a form opened on another day starts at 09:00 local that day', () => {
        const d = initialAppointmentDate('2026-10-05', now);
        expect(toLocalDateKey(d)).toBe('2026-10-05');
        expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([9, 0, 0]);
    });
});

describe('strict dates and times', () => {
    it('rejects a day that does not exist instead of rolling it over', () => {
        expect(parseLocalDateKey('2026-02-31')).toBeNull();
        expect(parseLocalDateKey('2026-13-01')).toBeNull();
        expect(parseLocalDateKey('2026-04-31')).toBeNull();
        expect(parseLocalDateKey('2026-2-3')).toBeNull();
        expect(parseLocalDateKey('')).toBeNull();
        expect(parseLocalDateKey('2028-02-29')).not.toBeNull(); // leap year
    });

    it('withLocalDay keeps the time and refuses 2026-02-31', () => {
        const base = new Date(2026, 8, 30, 10, 30, 0, 0);
        expect(withLocalDay(base, '2026-02-31')).toBeNull();
        const moved = withLocalDay(base, '2026-10-02')!;
        expect(toLocalDateKey(moved)).toBe('2026-10-02');
        expect([moved.getHours(), moved.getMinutes()]).toEqual([10, 30]);
    });

    it('withLocalTime sets HH:MM with seconds and ms zeroed', () => {
        const base = new Date(2026, 8, 30, 8, 12, 13, 559);
        const d = withLocalTime(base, '10:30')!;
        expect([d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()]).toEqual([10, 30, 0, 0]);
        expect(withLocalTime(base, '25:00')).toBeNull();
        expect(withLocalTime(base, '10:60')).toBeNull();
        expect(parseTimeHHMM('7:30')).toBeNull();
    });

    it('toMinute drops seconds and milliseconds', () => {
        const d = toMinute(new Date(2026, 8, 30, 10, 30, 13, 559));
        expect([d.getSeconds(), d.getMilliseconds()]).toEqual([0, 0]);
    });
});
