import { createLogger } from './logger';
import { daysBetweenDateKeys, parseLocalDateKey, storedDateKey, toLocalDateKey } from './localDate';
const log = createLogger('pregnancyCalculator');
/** Last day a pregnancy is still plausible: 42+0 SA (294 days after the LMP). */
export const MAX_GESTATION_DAYS = 294;
/** 40+0 SA — the due date (LMP + 280 days). */
export const TERM_DAYS = 280;

export interface PregnancyWeekInfo {
    /** Week in progress, 1-based ("Semaine 32" = the 32nd week), clamped to 40 — the
     *  last week the weeks content covers. */
    week: number;
    /** Day of that week, 1-based (1..7). "Semaine 32, jour 1" is 31 SA + 0 j. */
    day: number;
    /** Completed weeks of amenorrhoea — the SA in "31 SA + 2 j". Not clamped. */
    completedWeeks: number;
    /** Completed days beyond those weeks (0..6) — the "+ 2 j". */
    completedDays: number;
    /** 40+0 to 42+0 SA: past the due date but still a pregnancy. */
    isPostTerm: boolean;
    /** Beyond 42+0 SA: not a plausible ongoing pregnancy (wrong date, or she delivered). */
    isInvalid: boolean;
}

/**
 * Calculate pregnancy week and day from LMP (Last Menstrual Period)
 * This is the SINGLE SOURCE OF TRUTH for pregnancy calculations
 *
 * Two conventions come out of the same day count, and every screen must pick the
 * right one: `week`/`day` count the week and day IN PROGRESS (1-based, "Semaine 32,
 * jour 1"), `completedWeeks`/`completedDays` count what is COMPLETED (0-based, the
 * "31 SA + 0 j" midwives and scan reports use). Onboarding used to print the SA
 * notation from the 1-based day and read one day ahead ("31 SA + 1 jours" on 31+0,
 * "+ 7 jours" on the last day of a week).
 *
 * Term is 40+0, but a pregnancy commonly runs to 41-42 SA, so 40+0..42+0 is
 * post-term, not invalid. It used to be rejected from 40+0 — onboarding refused a
 * woman on her due date, the week she most needs the contraction timer.
 */
export const calculatePregnancyWeek = (lmpDate: Date): PregnancyWeekInfo => {
    // Calendar days from the LMP day to TODAY ON HER PHONE. "Today" used to be the UTC
    // day, so the week and day turned over at 01:00 in Tunis and at 20:00 in New York
    // instead of at her midnight. Counting calendar days (not elapsed hours) keeps the
    // time of day and DST out of it.
    const diffDays = daysBetweenDateKeys(storedDateKey(new Date(lmpDate)), toLocalDateKey(new Date()));

    // Handle edge cases
    if (diffDays < 0) {
        log.warn('⚠️ LMP is in the future, defaulting to week 1, day 1');
        return { week: 1, day: 1, completedWeeks: 0, completedDays: 0, isPostTerm: false, isInvalid: false };
    }

    const completedWeeks = Math.floor(diffDays / 7);
    const completedDays = diffDays % 7;

    if (diffDays >= TERM_DAYS) {
        // The weeks content stops at 40: past term, screens stay on its last day and
        // show the real SA from completedWeeks/completedDays.
        const isInvalid = diffDays > MAX_GESTATION_DAYS;
        log.debug(`[PregnancyCalculator] 📅 ${diffDays} days since LMP — ${isInvalid ? 'beyond 42+0, invalid' : 'post-term'}`);
        return { week: 40, day: 7, completedWeeks, completedDays, isPostTerm: !isInvalid, isInvalid };
    }

    const week = completedWeeks + 1;
    const day = completedDays + 1;
    log.debug(`[PregnancyCalculator] ✅ Calculated: Week ${week}, Day ${day} (${diffDays} days since LMP)`);
    return { week, day, completedWeeks, completedDays, isPostTerm: false, isInvalid: false };
};

export interface DisplayedPregnancyAge {
    /** Week in progress as printed ("Semaine 41" at 40+3 SA). */
    week: number;
    /** Day of that week, 1..7. */
    day: number;
    /** Day of pregnancy, 1-based ("Jour 284" at 40+3 SA). */
    dayOfPregnancy: number;
}

/**
 * Her week and day as every screen prints them, from the COMPLETED weeks and days.
 *
 * `week`/`day` from calculatePregnancyWeek stop at 40/7 from the due date on, because
 * they pick the weeks content and that ends at 40. Screens printed them, so from 40+0 to
 * 42+0 Home said "Semaine 40" and "Jour 280" for two weeks while onboarding said
 * "Semaine 41" and the post-term note "40 SA + 3 jours". The printed age follows the
 * calendar up to 42+0 (the last plausible day); only the content stays on week 40.
 */
export const displayedPregnancyAge = (completedWeeks: number, completedDays: number): DisplayedPregnancyAge => {
    const days = Math.min(Math.max(0, completedWeeks * 7 + completedDays), MAX_GESTATION_DAYS);
    return { week: Math.floor(days / 7) + 1, day: (days % 7) + 1, dayOfPregnancy: days + 1 };
};

/**
 * displayedPregnancyAge for what PregnancyContext publishes (`week`/`dayInWeek` plus the
 * completed weeks and days), falling back to the 1-based pair when those are absent.
 */
export const displayedAgeOf = (info?: {
    week?: number;
    dayInWeek?: number;
    completedWeeks?: number;
    completedDays?: number;
} | null): DisplayedPregnancyAge =>
    displayedPregnancyAge(
        info?.completedWeeks ?? (info?.week || 1) - 1,
        info?.completedDays ?? (info?.dayInWeek || 1) - 1,
    );

/**
 * The due date (LMP + 280 days) as a calendar day, at local midnight.
 *
 * The LMP is a calendar day (see storedDateKey: typed on the web it is stored as UTC
 * midnight), so the due date is too. Adding 280 days to the stored instant and formatting
 * it in local time gave the evening before west of UTC: the same account read
 * "01 décembre" in New York and "02 décembre" in Paris.
 */
export const dueDateFromLmp = (lmpDate: Date): Date | null => {
    const lmpDay = parseLocalDateKey(storedDateKey(lmpDate));
    if (!lmpDay) return null;
    return new Date(lmpDay.getFullYear(), lmpDay.getMonth(), lmpDay.getDate() + TERM_DAYS);
};

/**
 * Helper function for components that only need the week number
 */
export const calculateCurrentWeek = (lmpDate: Date): number => {
    const { week } = calculatePregnancyWeek(lmpDate);
    return week;
};

/** T1 weeks 1–13, T2 14–27, T3 28+. Shared by Home, Reminders, weight intel. */
export const trimesterFromWeek = (week: number): 1 | 2 | 3 => {
    if (week <= 13) return 1;
    if (week <= 27) return 2;
    return 3;
};
