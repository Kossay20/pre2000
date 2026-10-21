import type { TFunction } from 'i18next';

/**
 * "31 SA + 2 jours" / "31 weeks + 2 days" / "31 أسبوعًا + يومان" from COMPLETED weeks
 * and days (calculatePregnancyWeek's completedWeeks / completedDays — never the
 * 1-based week/day, which read one day ahead).
 *
 * Both halves are real plurals: the old single template printed "1 jours",
 * "1 أيام" and "31 أسابيع" (Arabic takes the singular accusative from 11 on).
 */
export const formatGestationalAge = (t: TFunction, completedWeeks: number, completedDays: number): string =>
    t('common.gestationalAge.format', {
        weeks: t('common.gestationalAge.weeks', { count: completedWeeks }),
        days: t('common.gestationalAge.days', { count: completedDays }),
    });
