/**
 * @jest-environment ./testing/timezoneEnvironment.js
 *
 * "Today" is her local day (utils/localDate.ts) — the pregnancy week, the Ramadan window,
 * the weight tracker's same-day check.
 *
 * The pregnancy week and day turn over at HER midnight. "Today" used to be the UTC day, so
 * Home said "jour 2" from 01:00 in Tunis but still "jour 1" at 23:30 in New York, and at the
 * week boundary the whole week (and its content) changed an hour or a few hours off.
 *
 * The LMP side keeps the day she entered: a date typed on the web (or seeded) is stored as
 * UTC midnight of that day; a date from a device picker keeps the local wall-clock day.
 */
import * as fs from 'fs';
import * as path from 'path';
import { calculatePregnancyWeek } from '../pregnancyCalculator';
import { daysBetweenDateKeys, storedDateKey } from '../localDate';
import { isRamadan } from '../contextMatcher';

declare const setTestTimezone: (tz: string) => void;

/** LMP 2026-02-25 as the web date input stores it. 2026-02-25 → 2026-09-30 is 217 days (31+0). */
const LMP_TYPED = new Date('2026-02-25T00:00:00.000Z');
const W32_D1 = { week: 32, day: 1, completedWeeks: 31, completedDays: 0, isPostTerm: false, isInvalid: false };
const W32_D2 = { week: 32, day: 2, completedWeeks: 31, completedDays: 1, isPostTerm: false, isInvalid: false };

const at = (iso: string) => jest.useFakeTimers({ now: new Date(iso) });

afterEach(() => jest.useRealTimers());

describe('America/New_York (local behind UTC)', () => {
    beforeAll(() => setTestTimezone('America/New_York'));

    it('23:30 on 30 Sept is still 30 Sept: 31+0, not the UTC day after', () => {
        at('2026-10-01T03:30:00.000Z'); // 23:30 EDT, 30 Sept
        expect(calculatePregnancyWeek(LMP_TYPED)).toEqual(W32_D1);
    });

    it('a typed LMP keeps its day (UTC midnight is 20:00 the evening before here)', () => {
        at('2026-09-30T16:00:00.000Z'); // noon EDT
        expect(storedDateKey(LMP_TYPED)).toBe('2026-02-25');
        expect(calculatePregnancyWeek(LMP_TYPED)).toEqual(W32_D1);
    });

    it('the day turns over at local midnight', () => {
        at('2026-10-01T03:59:00.000Z'); // 23:59 EDT
        expect(calculatePregnancyWeek(LMP_TYPED).completedDays).toBe(0);
        at('2026-10-01T04:00:00.000Z'); // 00:00 EDT, 1 Oct
        expect(calculatePregnancyWeek(LMP_TYPED).completedDays).toBe(1);
    });
});

describe('Africa/Tunis (UTC+1, no DST)', () => {
    beforeAll(() => setTestTimezone('Africa/Tunis'));

    it('00:30 on 1 Oct is already 1 Oct: 31+1, not the UTC day before', () => {
        at('2026-09-30T23:30:00.000Z'); // 00:30 in Tunis, 1 Oct
        expect(calculatePregnancyWeek(LMP_TYPED)).toEqual(W32_D2);
    });

    it('a picker LMP at 00:15 on 25 Feb counts from 25 Feb (its UTC day is the 24th)', () => {
        at('2026-09-30T11:00:00.000Z'); // noon in Tunis
        const picked = new Date(2026, 1, 25, 0, 15);
        expect(picked.toISOString()).toBe('2026-02-24T23:15:00.000Z');
        expect(storedDateKey(picked)).toBe('2026-02-25');
        expect(calculatePregnancyWeek(picked)).toEqual(W32_D1);
    });
});

describe('Pacific/Kiritimati (UTC+14, local ahead)', () => {
    beforeAll(() => setTestTimezone('Pacific/Kiritimati'));

    it('08:00 on 30 Sept is 30 Sept here while UTC is still the 29th', () => {
        at('2026-09-29T18:00:00.000Z');
        expect(calculatePregnancyWeek(LMP_TYPED)).toEqual(W32_D1);
    });
});

describe('Europe/Paris across the spring DST change (29 March 2026)', () => {
    beforeAll(() => setTestTimezone('Europe/Paris'));

    it('14 calendar days are 14 days even though only 13 d 23 h elapsed', () => {
        const picked = new Date(2026, 2, 20, 0, 30); // 00:30 CET, 20 March
        at('2026-04-02T22:10:00.000Z'); // 00:10 CEST, 3 April
        expect(calculatePregnancyWeek(picked)).toEqual({
            week: 3, day: 1, completedWeeks: 2, completedDays: 0, isPostTerm: false, isInvalid: false,
        });
    });

    it('the post-term boundary counts local days too', () => {
        at('2026-12-01T23:30:00.000Z'); // 00:30 CET, 2 Dec — still 1 Dec in UTC
        // 2026-02-25 → 2026-12-02 = 280 days: 40+0, post-term (UTC would say 279, 39+6).
        expect(calculatePregnancyWeek(LMP_TYPED)).toMatchObject({ completedWeeks: 40, completedDays: 0, isPostTerm: true, isInvalid: false });
    });
});

describe('isRamadan reads the local day', () => {
    // Ramadan 2026 window: 2026-02-18 .. 2026-03-19 (contextMatcher RAMADAN_WINDOWS).
    it('Tunis, 00:30 on 18 Feb: the first day has begun (UTC is still the 17th)', () => {
        setTestTimezone('Africa/Tunis');
        expect(isRamadan(new Date('2026-02-17T23:30:00.000Z'))).toBe(true);
    });

    it('New York, 22:00 on 19 March: still the last day (UTC is already the 20th)', () => {
        setTestTimezone('America/New_York');
        expect(isRamadan(new Date('2026-03-20T02:00:00.000Z'))).toBe(true);
    });
});

describe('screens take today from the local-day helper', () => {
    const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');

    it('the weight tracker asks before replacing a weighing from her same local day', () => {
        const src = read('src/screens/WeightTrackerScreen.tsx');
        expect(src).toMatch(/const today = toLocalDateKey\(\);\s*const existingToday = weightHistory\.find\(\(e: WeightEntry\) => isOnLocalDay\(e\.date, today\)\);/);
    });

    it('the Ramadan log files the fast under her local day', () => {
        expect(read('src/screens/RamadanPregnancyScreen.tsx')).toMatch(/const today = toLocalDateKey\(\);\s*const next = await logDay\(status, today\);/);
    });

    it('the onboarding date field shows the day the week is counted from', () => {
        expect(read('src/screens/OnboardingScreen.tsx')).toMatch(/value=\{storedDateKey\(selectedDate\)\}/);
    });

    it.each(['src/screens/WeightTrackerScreen.tsx', 'src/screens/RamadanPregnancyScreen.tsx', 'src/utils/contextMatcher.ts', 'src/utils/pregnancyCalculator.ts'])(
        '%s derives no day from a UTC ISO string',
        (file) => {
            expect(read(file)).not.toMatch(/toISOString\(\)\.(split\('T'\)\[0\]|slice\(0, 10\))/);
        },
    );
});

describe('daysBetweenDateKeys', () => {
    beforeAll(() => setTestTimezone('Europe/Paris'));

    it('counts calendar days, leap day included, and refuses malformed keys', () => {
        expect(daysBetweenDateKeys('2024-02-28', '2024-03-01')).toBe(2);
        expect(daysBetweenDateKeys('2026-03-28', '2026-03-30')).toBe(2);
        expect(daysBetweenDateKeys('2026-03-30', '2026-03-28')).toBe(-2);
        expect(daysBetweenDateKeys('', '2026-03-28')).toBeNaN();
    });

    it('an invalid LMP has no day (no RangeError from toISOString)', () => {
        expect(storedDateKey(new Date('nope'))).toBe('');
    });
});
