/**
 * Comprehensive unit tests for `timezoneService`.
 *
 * Coverage goals:
 *   - getTimezoneFromCountry   : known codes, lowercase, unknown, empty → UTC fallback
 *   - getCurrentTimeInTimezone : wall-clock numbers of the target TZ projected onto a
 *                                device-local Date; validity + numeric parts
 *   - formatDateInTimezone     : Intl wrapper — locale default, custom options/locale, TZ projection
 *   - createDateAtTimeInTimezone: wall-clock anchoring, day preservation, DST vs non-DST,
 *                                midnight (hour→24 normalization branch), invalid baseDate
 *                                fallback, and the Intl-failure catch/fallback path
 *   - getTimezoneOffset        : UTC=0, fixed-offset zones, relational consistency
 *   - SUPPORTED_COUNTRIES      : shape + every code resolves to a real IANA zone
 *
 * All time assertions are timezone-agnostic: results are re-projected through
 * `Intl.DateTimeFormat` with an explicit `timeZone` so the suite is green on any CI host.
 */

import {
    getTimezoneFromCountry,
    getCurrentTimeInTimezone,
    formatDateInTimezone,
    createDateAtTimeInTimezone,
    getTimezoneOffset,
    SUPPORTED_COUNTRIES,
} from '../timezoneService';

jest.mock('../../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
    }),
}));

// ----------------------------------------------------------------------------
// TZ-agnostic assertion helpers
// ----------------------------------------------------------------------------

/** Wall clock HH:mm:ss of an instant when displayed in a given IANA zone. */
const timeInTz = (d: Date, tz: string): string =>
    new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(d);

/** Calendar day YYYY-MM-DD of an instant when displayed in a given IANA zone. */
const dateInTz = (d: Date, tz: string): string =>
    new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(d);

// ============================================================================
// getTimezoneFromCountry
// ============================================================================

describe('getTimezoneFromCountry', () => {
    it('resolves the documented North-Africa / Middle-East zones', () => {
        expect(getTimezoneFromCountry('DZ')).toBe('Africa/Algiers');
        expect(getTimezoneFromCountry('MA')).toBe('Africa/Casablanca');
        expect(getTimezoneFromCountry('TN')).toBe('Africa/Tunis');
        expect(getTimezoneFromCountry('EG')).toBe('Africa/Cairo');
        expect(getTimezoneFromCountry('SA')).toBe('Asia/Riyadh');
        expect(getTimezoneFromCountry('AE')).toBe('Asia/Dubai');
        expect(getTimezoneFromCountry('PS')).toBe('Asia/Gaza');
    });

    it('resolves the European (French-speaking) zones', () => {
        expect(getTimezoneFromCountry('FR')).toBe('Europe/Paris');
        expect(getTimezoneFromCountry('BE')).toBe('Europe/Brussels');
        expect(getTimezoneFromCountry('CH')).toBe('Europe/Zurich');
        expect(getTimezoneFromCountry('LU')).toBe('Europe/Luxembourg');
        expect(getTimezoneFromCountry('MC')).toBe('Europe/Monaco');
    });

    it('resolves the African (French-speaking) and Americas zones', () => {
        expect(getTimezoneFromCountry('SN')).toBe('Africa/Dakar');
        expect(getTimezoneFromCountry('CI')).toBe('Africa/Abidjan');
        expect(getTimezoneFromCountry('MG')).toBe('Indian/Antananarivo');
        expect(getTimezoneFromCountry('CA')).toBe('America/Montreal');
        expect(getTimezoneFromCountry('US')).toBe('America/New_York');
    });

    it('uppercases the input before lookup (lowercase codes still resolve)', () => {
        expect(getTimezoneFromCountry('fr')).toBe('Europe/Paris');
        expect(getTimezoneFromCountry('tn')).toBe('Africa/Tunis');
        expect(getTimezoneFromCountry('Dz')).toBe('Africa/Algiers');
    });

    it('falls back to UTC for an unknown country code', () => {
        expect(getTimezoneFromCountry('ZZ')).toBe('UTC');
        expect(getTimezoneFromCountry('xx')).toBe('UTC');
        expect(getTimezoneFromCountry('XYZ')).toBe('UTC');
    });

    it('falls back to UTC for an empty string', () => {
        expect(getTimezoneFromCountry('')).toBe('UTC');
    });

    it('returns the literal DEFAULT-mapped value (UTC) and never undefined', () => {
        const result = getTimezoneFromCountry('NOPE');
        expect(result).toBe('UTC');
        expect(result).not.toBeUndefined();
    });

    it('does NOT treat the literal key "DEFAULT" specially via the public API (resolves to UTC anyway)', () => {
        // 'DEFAULT' is itself a key mapping to 'UTC', so this just returns 'UTC'.
        expect(getTimezoneFromCountry('DEFAULT')).toBe('UTC');
    });
});

// ============================================================================
// getCurrentTimeInTimezone
// ============================================================================

describe('getCurrentTimeInTimezone', () => {
    const FIXED_NOW = new Date('2026-06-15T12:34:56.000Z'); // a deterministic instant

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('returns a valid Date object', () => {
        const result = getCurrentTimeInTimezone('Europe/Paris');
        expect(result).toBeInstanceOf(Date);
        expect(isNaN(result.getTime())).toBe(false);
    });

    it('projects the target-TZ wall-clock numbers onto the returned Date (UTC zone)', () => {
        // At 2026-06-15T12:34:56Z, UTC wall clock is exactly 12:34:56 on 2026-06-15.
        // The function reads those numbers in the target TZ and rebuilds a *device-local* Date,
        // so the LOCAL getters of the result equal the UTC wall-clock numbers.
        const result = getCurrentTimeInTimezone('UTC');
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(5); // June, 0-indexed
        expect(result.getDate()).toBe(15);
        expect(result.getHours()).toBe(12);
        expect(result.getMinutes()).toBe(34);
        expect(result.getSeconds()).toBe(56);
    });

    it('reflects the offset of a non-DST eastern zone (Asia/Dubai = UTC+4)', () => {
        // 12:34:56Z → 16:34:56 in Dubai. Those numbers land in the local-Date components.
        const result = getCurrentTimeInTimezone('Asia/Dubai');
        expect(result.getHours()).toBe(16);
        expect(result.getMinutes()).toBe(34);
        expect(result.getDate()).toBe(15);
    });

    it('mirrors exactly what Intl would format for the target zone (any host)', () => {
        const tz = 'America/New_York';
        const result = getCurrentTimeInTimezone(tz);

        // Recompute the expected numeric parts the same way the source does.
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }).formatToParts(FIXED_NOW);
        const v = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);

        expect(result.getFullYear()).toBe(v('year'));
        expect(result.getMonth()).toBe(v('month') - 1);
        expect(result.getDate()).toBe(v('day'));
        expect(result.getHours()).toBe(v('hour'));
        expect(result.getMinutes()).toBe(v('minute'));
        expect(result.getSeconds()).toBe(v('second'));
    });
});

// ============================================================================
// formatDateInTimezone
// ============================================================================

describe('formatDateInTimezone', () => {
    // A fixed instant: 2026-06-15T06:00:00Z.
    const instant = new Date('2026-06-15T06:00:00.000Z');

    it('returns a non-empty string', () => {
        const out = formatDateInTimezone(instant, 'Europe/Paris');
        expect(typeof out).toBe('string');
        expect(out.length).toBeGreaterThan(0);
    });

    it('defaults to the fr-FR locale when none is provided', () => {
        // fr-FR default + no field options → Intl emits the locale-default representation.
        // Assert it matches what fr-FR Intl produces for the same TZ (locale-agnostic check).
        const out = formatDateInTimezone(instant, 'Europe/Paris');
        const expected = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(instant);
        expect(out).toBe(expected);
    });

    it('honors a custom locale argument', () => {
        const outEn = formatDateInTimezone(instant, 'Europe/Paris', undefined, 'en-US');
        const expectedEn = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris' }).format(instant);
        expect(outEn).toBe(expectedEn);
    });

    it('applies custom Intl options merged with the timeZone', () => {
        const out = formatDateInTimezone(
            instant,
            'Asia/Dubai',
            { hour: '2-digit', minute: '2-digit', hour12: false },
            'en-GB'
        );
        // 06:00Z → 10:00 in Dubai (UTC+4).
        expect(out).toContain('10:00');
    });

    it('renders different wall-clock times for two zones from the same instant', () => {
        const paris = formatDateInTimezone(
            instant,
            'Europe/Paris',
            { hour: '2-digit', minute: '2-digit', hour12: false },
            'en-GB'
        );
        const dubai = formatDateInTimezone(
            instant,
            'Asia/Dubai',
            { hour: '2-digit', minute: '2-digit', hour12: false },
            'en-GB'
        );
        // 06:00Z → 08:00 CEST (Paris, summer) vs 10:00 Dubai. Must differ.
        expect(paris).not.toBe(dubai);
        expect(paris).toContain('08:00');
        expect(dubai).toContain('10:00');
    });

    it('respects the timeZone projection independent of the host (UTC display)', () => {
        const out = formatDateInTimezone(
            instant,
            'UTC',
            { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
            'en-GB'
        );
        expect(out).toContain('06:00:00');
    });
});

// ============================================================================
// createDateAtTimeInTimezone
// ============================================================================

describe('createDateAtTimeInTimezone', () => {
    it('produces an instant whose target-TZ wall clock equals the requested HH:mm', () => {
        const base = new Date(2026, 5, 15, 12, 0, 0); // device-local June 15 2026
        const result = createDateAtTimeInTimezone(base, 14, 30, 'Europe/Paris');
        expect(timeInTz(result, 'Europe/Paris')).toBe('14:30:00');
    });

    it('preserves the input calendar day in the target TZ (no off-by-one)', () => {
        const base = new Date(2026, 5, 1, 12, 0, 0);
        const result = createDateAtTimeInTimezone(base, 8, 0, 'Africa/Tunis');
        expect(dateInTz(result, 'Africa/Tunis')).toBe('2026-06-01');
        expect(timeInTz(result, 'Africa/Tunis')).toBe('08:00:00');
    });

    it('normalizes midnight correctly (hour 0 → exercises the "24"→0 branch)', () => {
        // en-US hour12:false reports midnight as "24"; the source remaps it to 0.
        const base = new Date(2026, 5, 15, 9, 0, 0);
        const result = createDateAtTimeInTimezone(base, 0, 0, 'Europe/Paris');
        expect(timeInTz(result, 'Europe/Paris')).toBe('00:00:00');
        expect(dateInTz(result, 'Europe/Paris')).toBe('2026-06-15');
        expect(isNaN(result.getTime())).toBe(false);
    });

    it('handles a non-DST zone identically in summer and winter (Africa/Algiers, UTC+1)', () => {
        const summer = createDateAtTimeInTimezone(new Date(2026, 6, 15), 9, 0, 'Africa/Algiers');
        const winter = createDateAtTimeInTimezone(new Date(2026, 0, 15), 9, 0, 'Africa/Algiers');
        expect(timeInTz(summer, 'Africa/Algiers')).toBe('09:00:00');
        expect(timeInTz(winter, 'Africa/Algiers')).toBe('09:00:00');
        // UTC+1 year-round → both display 08:00 in UTC.
        expect(timeInTz(summer, 'UTC')).toBe('08:00:00');
        expect(timeInTz(winter, 'UTC')).toBe('08:00:00');
    });

    it('respects DST in Europe/Paris (CET=UTC+1 winter, CEST=UTC+2 summer)', () => {
        const winter = createDateAtTimeInTimezone(new Date(2026, 0, 15), 8, 0, 'Europe/Paris');
        const summer = createDateAtTimeInTimezone(new Date(2026, 6, 15), 8, 0, 'Europe/Paris');
        expect(timeInTz(winter, 'Europe/Paris')).toBe('08:00:00');
        expect(timeInTz(summer, 'Europe/Paris')).toBe('08:00:00');
        expect(timeInTz(winter, 'UTC')).toBe('07:00:00'); // 08:00 CET → 07:00 UTC
        expect(timeInTz(summer, 'UTC')).toBe('06:00:00'); // 08:00 CEST → 06:00 UTC
    });

    it('handles a western (negative-offset) zone (America/New_York)', () => {
        const result = createDateAtTimeInTimezone(new Date(2026, 6, 4), 9, 0, 'America/New_York');
        expect(timeInTz(result, 'America/New_York')).toBe('09:00:00');
        expect(dateInTz(result, 'America/New_York')).toBe('2026-07-04');
        // EDT = UTC-4 in July → 09:00 local = 13:00 UTC.
        expect(timeInTz(result, 'UTC')).toBe('13:00:00');
    });

    it('supports minutes precision', () => {
        const result = createDateAtTimeInTimezone(new Date(2026, 2, 10), 6, 45, 'Asia/Dubai');
        expect(timeInTz(result, 'Asia/Dubai')).toBe('06:45:00');
        expect(timeInTz(result, 'UTC')).toBe('02:45:00'); // Dubai UTC+4
    });

    it('falls back to a valid Date (current date) when baseDate is an invalid Date', () => {
        const invalid = new Date('not-a-real-date');
        const result = createDateAtTimeInTimezone(invalid, 8, 0, 'Europe/Paris');
        expect(isNaN(result.getTime())).toBe(false);
        // The day defaults to "now", but HH:mm must still read 08:00 in Paris.
        expect(timeInTz(result, 'Europe/Paris')).toBe('08:00:00');
    });

    it('falls back to a valid Date when baseDate is null/undefined', () => {
        // The source guards with `if (!safeDate ...)`.
        const result = createDateAtTimeInTimezone(null as unknown as Date, 7, 15, 'Africa/Tunis');
        expect(isNaN(result.getTime())).toBe(false);
        expect(timeInTz(result, 'Africa/Tunis')).toBe('07:15:00');
    });

    it('falls back to device-local time when the timezone is invalid (Intl throws → catch branch)', () => {
        // An invalid IANA zone makes `new Intl.DateTimeFormat({ timeZone })` throw,
        // so the catch path runs: fallback = clone of baseDate with setHours(h, m, 0, 0).
        const base = new Date(2026, 5, 15, 0, 0, 0);
        const result = createDateAtTimeInTimezone(base, 10, 20, 'Not/AValidZone');
        expect(isNaN(result.getTime())).toBe(false);
        // Fallback uses device-local setHours → assert via LOCAL getters.
        expect(result.getHours()).toBe(10);
        expect(result.getMinutes()).toBe(20);
        expect(result.getSeconds()).toBe(0);
        expect(result.getMilliseconds()).toBe(0);
        expect(result.getFullYear()).toBe(2026);
        expect(result.getMonth()).toBe(5);
        expect(result.getDate()).toBe(15);
    });

    it('never returns NaN across a spread of zones', () => {
        const zones = ['UTC', 'Europe/Paris', 'Africa/Tunis', 'Asia/Dubai', 'America/Montreal', 'Indian/Antananarivo'];
        for (const tz of zones) {
            const r = createDateAtTimeInTimezone(new Date(2026, 3, 20), 12, 0, tz);
            expect(isNaN(r.getTime())).toBe(false);
        }
    });
});

// ============================================================================
// getTimezoneOffset
// ============================================================================

describe('getTimezoneOffset', () => {
    const FIXED_NOW = new Date('2026-06-15T12:00:00.000Z');

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_NOW);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('returns 0 for UTC', () => {
        expect(getTimezoneOffset('UTC')).toBe(0);
    });

    it('returns the correct fixed offset for a non-DST eastern zone (Asia/Dubai = +4)', () => {
        expect(getTimezoneOffset('Asia/Dubai')).toBe(4);
    });

    it('returns the correct fixed offset for Africa/Tunis / Africa/Algiers (+1, no DST)', () => {
        expect(getTimezoneOffset('Africa/Tunis')).toBe(1);
        expect(getTimezoneOffset('Africa/Algiers')).toBe(1);
    });

    it('returns a positive offset for an eastern zone and negative for a western zone', () => {
        expect(getTimezoneOffset('Asia/Riyadh')).toBeGreaterThan(0); // +3
        expect(getTimezoneOffset('America/New_York')).toBeLessThan(0); // -4 / -5
    });

    it('reflects DST: Europe/Paris is UTC+2 in summer (around the fixed June instant)', () => {
        expect(getTimezoneOffset('Europe/Paris')).toBe(2);
    });

    it('returns a finite number for every supported-country zone', () => {
        for (const c of SUPPORTED_COUNTRIES) {
            const tz = getTimezoneFromCountry(c.code);
            const offset = getTimezoneOffset(tz);
            expect(Number.isFinite(offset)).toBe(true);
        }
    });
});

// ============================================================================
// SUPPORTED_COUNTRIES
// ============================================================================

describe('SUPPORTED_COUNTRIES', () => {
    it('is a non-empty array', () => {
        expect(Array.isArray(SUPPORTED_COUNTRIES)).toBe(true);
        expect(SUPPORTED_COUNTRIES.length).toBeGreaterThan(0);
    });

    it('every entry has a code, a French name, and an Arabic name', () => {
        for (const c of SUPPORTED_COUNTRIES) {
            expect(typeof c.code).toBe('string');
            expect(c.code.length).toBe(2);
            expect(typeof c.name).toBe('string');
            expect(c.name.length).toBeGreaterThan(0);
            expect(typeof c.nameAr).toBe('string');
            expect(c.nameAr.length).toBeGreaterThan(0);
        }
    });

    it('every code resolves to a non-UTC IANA zone via getTimezoneFromCountry', () => {
        for (const c of SUPPORTED_COUNTRIES) {
            const tz = getTimezoneFromCountry(c.code);
            expect(tz).not.toBe('UTC'); // all supported countries have a real mapping
            // Every resolved zone must be a constructible IANA zone.
            expect(() => new Intl.DateTimeFormat('en-US', { timeZone: tz })).not.toThrow();
        }
    });

    it('has no duplicate country codes', () => {
        const codes = SUPPORTED_COUNTRIES.map((c) => c.code);
        expect(new Set(codes).size).toBe(codes.length);
    });

    it('includes the app core target markets (TN, DZ, MA, FR)', () => {
        const codes = SUPPORTED_COUNTRIES.map((c) => c.code);
        expect(codes).toEqual(expect.arrayContaining(['TN', 'DZ', 'MA', 'FR']));
    });
});
