/**
 * Date/time rules of the add-appointment form, kept out of the screen so they can be
 * unit-tested (the repo ships no React renderer).
 */
import { addDays } from 'date-fns';
import { parseLocalDateKey, parseTimeHHMM, toLocalDateKey } from './localDate';

/** Appointments are to the minute: the form never keeps the seconds of `new Date()`. */
export const toMinute = (date: Date): Date => {
    const copy = new Date(date);
    copy.setSeconds(0, 0);
    return copy;
};

/**
 * The date/time a new appointment form opens on. `selectedDate` is a local yyyy-MM-dd
 * day (Calendar FAB, Home quick-add); an ISO timestamp is still accepted from older
 * callers. Today opens on the current time, another day on 09:00.
 */
export const initialAppointmentDate = (selectedDate?: string, now: Date = new Date()): Date => {
    if (selectedDate) {
        const day = parseLocalDateKey(selectedDate);
        if (day) {
            if (toLocalDateKey(day) === toLocalDateKey(now)) return toMinute(now);
            day.setHours(9, 0, 0, 0);
            return day;
        }
        const instant = new Date(selectedDate);
        if (!Number.isNaN(instant.getTime())) {
            // A bare midnight (00:00, or up to 02:00 after a UTC offset) means "that day".
            if (instant.getHours() <= 2 && instant.getMinutes() === 0) {
                if (toLocalDateKey(instant) === toLocalDateKey(now)) return toMinute(now);
                const morning = new Date(instant);
                morning.setHours(9, 0, 0, 0);
                return morning;
            }
            return toMinute(instant);
        }
    }
    return toMinute(now);
};

/** `date` moved to the local day `dayKey`, time kept — null when the day does not exist. */
export const withLocalDay = (date: Date, dayKey: string): Date | null => {
    const day = parseLocalDateKey(dayKey);
    if (!day) return null;
    const next = new Date(date);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    return next;
};

/** `date` at HH:MM (seconds zeroed) — null when the time is not a real time of day. */
export const withLocalTime = (date: Date, hhmm: string): Date | null => {
    const time = parseTimeHHMM(hhmm);
    if (!time) return null;
    const next = new Date(date);
    next.setHours(time[0], time[1], 0, 0);
    return next;
};

/**
 * The day Home's "+ RDV" opens the form on: today, or the same weekday of the week the
 * user is previewing with the week arrows. It used to be LMP + N days computed from the
 * LMP instant, which is UTC midnight — west of UTC that is the evening before, so the
 * form opened one day early in New York.
 */
export const quickAddDateKey = (displayedWeek: number, realWeek: number | undefined, now: Date = new Date()): string =>
    toLocalDateKey(addDays(now, realWeek ? (displayedWeek - realWeek) * 7 : 0));
