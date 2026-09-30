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
            expect(result).toEqual({ week: 1, day: 1, isInvalid: false });
        });

        it('should return Week 1, Day 7 when LMP was 6 days ago', () => {
            const lmp = new Date('2024-01-04T10:00:00.000Z'); // 6 days before Jan 10
            const result = calculatePregnancyWeek(lmp);
            expect(result).toEqual({ week: 1, day: 7, isInvalid: false });
        });

        it('should return Week 2, Day 1 when LMP was 7 days ago (Start of Week 2)', () => {
            const lmp = new Date('2024-01-03T10:00:00.000Z'); // 7 days before Jan 10
            const result = calculatePregnancyWeek(lmp);
            expect(result).toEqual({ week: 2, day: 1, isInvalid: false });
        });

        it('should return Week 10, Day 1 when LMP was exactly 9 weeks ago', () => {
            // 9 weeks = 63 days
            // Jan 10 - 63 days = Nov 8, 2023
            const lmp = new Date('2023-11-08T10:00:00.000Z');
            const result = calculatePregnancyWeek(lmp);
            expect(result).toEqual({ week: 10, day: 1, isInvalid: false });
        });

        it('should return Week 13, Day 1 when LMP was exactly 12 weeks (84 days) ago', () => {
            const lmp = new Date('2024-01-10T12:00:00.000Z');
            lmp.setUTCDate(lmp.getUTCDate() - 84);
            const result = calculatePregnancyWeek(lmp);
            expect(result).toEqual({ week: 13, day: 1, isInvalid: false });
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
            expect(result).toEqual({ week: 2, day: 1, isInvalid: false });
        });

        // ---------------------------------------------------------------------
        // 2. EDGE CASES (Boundaries & Invalid Inputs)
        // ---------------------------------------------------------------------

        it('should handle future LMP gracefully by defaulting to Week 1 Day 1', () => {
            const futureLMP = new Date('2024-02-01T10:00:00.000Z');
            const result = calculatePregnancyWeek(futureLMP);
            expect(result).toEqual({ week: 1, day: 1 });
        });

        it('should cap at Week 40 Day 7 if overdue', () => {
            // 42 weeks ago
            // 42 * 7 = 294 days
            // Jan 10 2024 - 294 days = ~March 2023
            const wayBack = new Date('2023-03-22T10:00:00.000Z');
            const result = calculatePregnancyWeek(wayBack);
            expect(result).toEqual({ week: 40, day: 7, isInvalid: true });
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
            expect(result).toEqual({ week: 1, day: 3, isInvalid: false });
        });
    });
});
