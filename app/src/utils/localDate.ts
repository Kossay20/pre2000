/**
 * Calendar days as the user sees them on her phone.
 *
 * A "day" in this app — today's appointments, the symptom log entry, a task completed
 * today, the date the add-appointment form opens on — is the LOCAL calendar day.
 * `toISOString().split('T')[0]` gives the UTC day instead, which is a different day for
 * part of every day outside UTC: after 20:00 in New York, before 02:00 in Tunis in
 * summer, most of the day in the Pacific. Everything that derives a day key goes
 * through here.
 */

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_HHMM = /^(\d{2}):(\d{2})$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** yyyy-MM-dd of `date` in the device's timezone. */
export const toLocalDateKey = (date: Date = new Date()): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Local midnight of a yyyy-MM-dd key, or null when the key is malformed or names a day
 * that does not exist. `new Date(2026, 1, 31)` silently rolls over to 3 March, so the
 * parsed parts are checked against what came back.
 */
export const parseLocalDateKey = (key: string): Date | null => {
    const m = DATE_KEY.exec(key.trim());
    if (!m) return null;
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
};

/** [hours, minutes] of an HH:MM string, or null when it is not a real time of day. */
export const parseTimeHHMM = (value: string): [number, number] | null => {
    const m = TIME_HHMM.exec(value.trim());
    if (!m) return null;
    const [hours, minutes] = [Number(m[1]), Number(m[2])];
    if (hours > 23 || minutes > 59) return null;
    return [hours, minutes];
};

/**
 * The calendar day a stored date names, as yyyy-MM-dd. A day entered without a time —
 * the web date input, `new Date('2026-02-25')`, a seeded profile — is stored as UTC
 * midnight of that day, and read in local time it is the evening before west of UTC.
 * Any other instant came from a device picker, which keeps the local wall-clock day.
 */
export const storedDateKey = (date: Date): string => {
    if (Number.isNaN(date.getTime())) return '';
    const utcMidnight =
        date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
    return utcMidnight ? date.toISOString().slice(0, 10) : toLocalDateKey(date);
};

/**
 * Whole calendar days from day `from` to day `to` (yyyy-MM-dd), negative when `to` is
 * earlier; NaN when either key is malformed. Counted on the calendar, so neither the hour
 * nor a DST change in between can move it.
 */
export const daysBetweenDateKeys = (from: string, to: string): number => {
    const a = DATE_KEY.exec(from);
    const b = DATE_KEY.exec(to);
    if (!a || !b) return NaN;
    const day = (m: RegExpExecArray) => Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Math.round((day(b) - day(a)) / 86_400_000);
};

/** True when the instant `iso` falls on the local day `dayKey`. */
export const isOnLocalDay = (iso: string | Date, dayKey: string): boolean => {
    const date = iso instanceof Date ? iso : new Date(iso);
    return !Number.isNaN(date.getTime()) && toLocalDateKey(date) === dayKey;
};
