/**
 * @jest-environment ./testing/timezoneEnvironment.js
 *
 * The due date is a calendar day, the same in every timezone.
 *
 * Profile computed it as addDays(new Date(lmp), 280) and formatted it in local time. A
 * typed or seeded LMP is stored as UTC midnight of that day, which is the evening before
 * west of UTC, so the same account read "01 décembre" in New York and "02 décembre" in
 * Paris. dueDateFromLmp reads the LMP's calendar day (storedDateKey, as the week
 * calculator does) and adds 280 calendar days.
 */
import { addDays, format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { dueDateFromLmp } from '../pregnancyCalculator';
import { storedDateKey } from '../localDate';

declare const setTestTimezone: (tz: string) => void;

/** LMP 25 Feb 2026 as the web date input / a seeded profile stores it. */
const LMP_TYPED = '2026-02-25T00:00:00.000Z';
const show = (d: Date | null) => (d ? format(d, 'dd MMMM yyyy', { locale: fr }) : null);

describe.each(['Europe/Paris', 'Africa/Tunis', 'America/New_York', 'Etc/GMT+12', 'Pacific/Kiritimati'])('in %s', (tz) => {
    beforeAll(() => setTestTimezone(tz));

    it('a typed LMP of 25 Feb gives a due date of 2 December', () => {
        expect(show(dueDateFromLmp(new Date(LMP_TYPED)))).toBe('02 décembre 2026');
    });

    it('an LMP picked on the device (local wall-clock instant) gives the same day', () => {
        expect(show(dueDateFromLmp(new Date(2026, 1, 25, 14, 30)))).toBe('02 décembre 2026');
    });

    it('stored back as UTC midnight of that day, it reads the same day everywhere', () => {
        const due = dueDateFromLmp(new Date(LMP_TYPED))!;
        const iso = `${format(due, 'yyyy-MM-dd')}T00:00:00.000Z`;
        expect(storedDateKey(new Date(iso))).toBe('2026-12-02');
    });
});

describe('the old instant arithmetic, for the record', () => {
    beforeAll(() => setTestTimezone('America/New_York'));

    it('read a day early west of UTC', () => {
        expect(show(addDays(new Date(LMP_TYPED), 280))).toBe('01 décembre 2026');
    });
});
