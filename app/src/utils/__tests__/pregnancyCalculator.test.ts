import { calculatePregnancyWeek, trimesterFromWeek } from '../pregnancyCalculator';

describe('pregnancyCalculator', () => {
    // Helper to mock current date
    const mockDate = (dateString: string) => {
        const date = new Date(dateString);
        jest.useFakeTimers();
        jest.setSystemTime(date);
    };

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('calculatePregnancyWeek', () => {
        // Reference date for tests: Wednesday, January 10, 2024
        // 2024 is a Leap Year!
        const TODAY = '2024-01-10T12:00:00.000Z';

        beforeEach(() => {
            mockDate(TODAY);
        });

        // ---------------------------------------------------------------------
        // 1. STANDARD CASES (Happy Path)
        // ---------------------------------------------------------------------

        it('should return Week 1, Day 1 when LMP is today', () => {
            const lmp = new Date(TODAY);
            const result = calculatePregnancyWeek(lmp);
            expect(result).toMatchObject({ week: 1, day: 1, isInvalid: false });
        });

        it('should return Week 1, Day 7 when LMP was 6 days ago', () => {
            const lmp = new Date('2024-01-04T10:00:00.000Z'); // 6 days before Jan 10
            const result = calculatePregnancyWeek(lmp);
            expect(result).toMatchObject({ week: 1, day: 7, isInvalid: false });
        });

        it('should return Week 2, Day 1 when LMP was 7 days ago (Start of Week 2)', () => {
            const lmp = new Date('2024-01-03T10:00:00.000Z'); // 7 days before Jan 10
            const result = calculatePregnancyWeek(lmp);
            expect(result).toMatchObject({ week: 2, day: 1, isInvalid: false });
        });

        it('should return Week 10, Day 1 when LMP was exactly 9 weeks ago', () => {
            // 9 weeks = 63 days
            // Jan 10 - 63 days = Nov 8, 2023
            const lmp = new Date('2023-11-08T10:00:00.000Z');
            const result = calculatePregnancyWeek(lmp);
            expect(result).toMatchObject({ week: 10, day: 1, isInvalid: false });
        });

        it('should return Week 13, Day 1 when LMP was exactly 12 weeks (84 days) ago', () => {
            const lmp = new Date('2024-01-10T12:00:00.000Z');
            lmp.setUTCDate(lmp.getUTCDate() - 84);
            const result = calculatePregnancyWeek(lmp);
            expect(result).toMatchObject({ week: 13, day: 1, isInvalid: false });
        });

        it('trimesterFromWeek: week 13 is T1 (aligned with Home, not week<=12)', () => {
            expect(trimesterFromWeek(1)).toBe(1);
            expect(trimesterFromWeek(12)).toBe(1);
            expect(trimesterFromWeek(13)).toBe(1);
            expect(trimesterFromWeek(14)).toBe(2);
            expect(trimesterFromWeek(27)).toBe(2);
            expect(trimesterFromWeek(28)).toBe(3);
            expect(trimesterFromWeek(40)).toBe(3);
        });

        it('should ignore time components (noon vs midnight)', () => {
            // Jan 3 at 23:59 should still be 7 days ago relative to Jan 10
            const lmp = new Date('2024-01-03T23:59:59.000Z');
            const result = calculatePregnancyWeek(lmp);
            expect(result).toMatchObject({ week: 2, day: 1, isInvalid: false });
        });

        // ---------------------------------------------------------------------
        // 2. EDGE CASES (Boundaries & Invalid Inputs)
        // ---------------------------------------------------------------------

        it('should handle future LMP gracefully by defaulting to Week 1 Day 1', () => {
            const futureLMP = new Date('2024-02-01T10:00:00.000Z');
            const result = calculatePregnancyWeek(futureLMP);
            expect(result).toMatchObject({ week: 1, day: 1 });
        });

        it('42+0 exactly (294 days) is still a pregnancy — post-term, content week capped at 40/7', () => {
            // Jan 10 2024 - 294 days = March 22 2023
            const wayBack = new Date('2023-03-22T10:00:00.000Z');
            const result = calculatePregnancyWeek(wayBack);
            expect(result).toMatchObject({ week: 40, day: 7, completedWeeks: 42, completedDays: 0, isPostTerm: true, isInvalid: false });
        });

        // ---------------------------------------------------------------------
        // 3. LEAP YEAR HANDLING (2024 was a leap year)
        // ---------------------------------------------------------------------

        it('should correctly calculate across a leap day (Feb 29)', () => {
            // Mock date to AFTER Feb 29 (e.g., March 1, 2024)
            mockDate('2024-03-01T12:00:00.000Z');

            // LMP: Feb 28, 2024 (2 days ago: Feb 29, Mar 1)
            // Day 0 = Feb 28
            // Day 1 = Feb 29
            // Day 2 = Mar 1 (Today)
            // Wait:
            // 2024-03-01 minus 2024-02-28 = 2 days difference (29, 01)
            // diffDays = 2
            // week = floor(2/7) + 1 = 1
            // day = (2 % 7) + 1 = 3
            // So on Mar 1, if LMP was Feb 28, you are at Day 3 of Week 1.

            const lmp = new Date('2024-02-28T12:00:00.000Z');
            const result = calculatePregnancyWeek(lmp);

            // Expect correct calculation accounting for Feb 29
            // If leap year wasn't handled, it might be off by 1
            expect(result).toMatchObject({ week: 1, day: 3, isInvalid: false });
        });
    });
});

// Final-release A-009 / A-010: the SA notation counts COMPLETED days, and a pregnancy
// is valid until 42+0 (40+0..42+0 = post-term), with exact boundary dates.
describe('pregnancyCalculator — completed SA and post-term boundaries', () => {
    const TODAY = '2026-09-30T12:00:00.000Z';
    const lmpDaysAgo = (days: number) => {
        const d = new Date(TODAY);
        d.setUTCDate(d.getUTCDate() - days);
        return d;
    };
    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date(TODAY));
    });
    afterEach(() => jest.useRealTimers());

    it('31+0 exactly (LMP 2026-02-25, 217 days): 31 SA + 0 j, week 32 day 1', () => {
        const r = calculatePregnancyWeek(new Date('2026-02-25T00:00:00.000Z'));
        expect(r).toEqual({ week: 32, day: 1, completedWeeks: 31, completedDays: 0, isPostTerm: false, isInvalid: false });
    });

    it('last day of a week is +6, never the impossible +7', () => {
        expect(calculatePregnancyWeek(lmpDaysAgo(223))).toMatchObject({ completedWeeks: 31, completedDays: 6, week: 32, day: 7 });
        expect(calculatePregnancyWeek(lmpDaysAgo(224))).toMatchObject({ completedWeeks: 32, completedDays: 0, week: 33, day: 1 });
    });

    it('LMP today is 0 SA + 0 j', () => {
        expect(calculatePregnancyWeek(lmpDaysAgo(0))).toMatchObject({ completedWeeks: 0, completedDays: 0, week: 1, day: 1 });
    });

    it('39+6 (279 days) is a normal week-40 pregnancy', () => {
        expect(calculatePregnancyWeek(lmpDaysAgo(279))).toEqual({
            week: 40, day: 7, completedWeeks: 39, completedDays: 6, isPostTerm: false, isInvalid: false,
        });
    });

    it('40+0 (the due date, 280 days) is post-term, NOT invalid', () => {
        expect(calculatePregnancyWeek(lmpDaysAgo(280))).toEqual({
            week: 40, day: 7, completedWeeks: 40, completedDays: 0, isPostTerm: true, isInvalid: false,
        });
    });

    it('41+6 (293 days) is post-term', () => {
        expect(calculatePregnancyWeek(lmpDaysAgo(293))).toMatchObject({ completedWeeks: 41, completedDays: 6, isPostTerm: true, isInvalid: false });
    });

    it('42+0 (294 days) is the last valid day', () => {
        expect(calculatePregnancyWeek(lmpDaysAgo(294))).toMatchObject({ isPostTerm: true, isInvalid: false });
    });

    it('42+1 (295 days) and beyond are invalid, and no longer post-term', () => {
        expect(calculatePregnancyWeek(lmpDaysAgo(295))).toMatchObject({ completedWeeks: 42, completedDays: 1, isPostTerm: false, isInvalid: true });
        expect(calculatePregnancyWeek(lmpDaysAgo(43 * 7))).toMatchObject({ isInvalid: true });
    });

    it('the content week never exceeds 40 (weeks data covers 1-40 only)', () => {
        for (const days of [279, 280, 287, 294, 295, 400]) {
            expect(calculatePregnancyWeek(lmpDaysAgo(days)).week).toBeLessThanOrEqual(40);
        }
    });
});
