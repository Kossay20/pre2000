const FULL_TERM_DAYS = 280;

/**
 * Share of the pregnancy behind her, from the same day count the card prints.
 * It used to be week / 40, which counts the week in progress as already done:
 * "Jour 218" sat next to "80%" when 218 of 280 days is 78%.
 */
export function pregnancyProgressPercent(dayOfPregnancy: number): number {
    if (!Number.isFinite(dayOfPregnancy)) return 0;
    return Math.min(Math.max((dayOfPregnancy / FULL_TERM_DAYS) * 100, 0), 100);
}
