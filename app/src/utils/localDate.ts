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

/** True when the instant `iso` falls on the local day `dayKey`. */
export const isOnLocalDay = (iso: string | Date, dayKey: string): boolean => {
    const date = iso instanceof Date ? iso : new Date(iso);
    return !Number.isNaN(date.getTime()) && toLocalDateKey(date) === dayKey;
};
