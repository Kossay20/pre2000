import { createLogger } from './logger';
const log = createLogger('pregnancyCalculator');
/**
 * Calculate pregnancy week and day from LMP (Last Menstrual Period)
 * This is the SINGLE SOURCE OF TRUTH for pregnancy calculations
 */
export const calculatePregnancyWeek = (lmpDate: Date): { week: number; day: number; isInvalid?: boolean } => {
    const now = new Date();
    const lmp = new Date(lmpDate);

    // Use UTC to avoid timezone issues/DST shifts affecting the day difference
    const nowAllocated = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const lmpAllocated = Date.UTC(lmp.getUTCFullYear(), lmp.getUTCMonth(), lmp.getUTCDate());

    const diffTime = nowAllocated - lmpAllocated;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    // Handle edge cases
    if (diffDays < 0) {
        log.warn('⚠️ LMP is in the future, defaulting to week 1, day 1');
        return { week: 1, day: 1 };
    }

    // Calculate week and day (1-based counting)
    const week = Math.floor(diffDays / 7) + 1;
    const day = (diffDays % 7) + 1;

    // Cap at 40 weeks
    if (week > 40) {
        log.debug('[PregnancyCalculator] 📅 Week > 40, capping at week 40 day 7 but marking as invalid');
        return { week: 40, day: 7, isInvalid: true };
    }

    log.debug(`[PregnancyCalculator] ✅ Calculated: Week ${week}, Day ${day} (${diffDays} days since LMP)`);
    return { week, day, isInvalid: false };
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
