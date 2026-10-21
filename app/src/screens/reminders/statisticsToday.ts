/**
 * Today's completion rate out of the Statistics series, or null when today has no
 * entry. The charts need two days, so on her first day the screen said "log at least
 * 2 days" and nothing showed the task she had just ticked.
 */
export function todayCompletionRate(
    data: { dates: string[]; completionRates: number[] },
    todayStr: string,
): number | null {
    const index = data.dates.indexOf(todayStr);
    if (index < 0) return null;
    const rate = data.completionRates[index];
    return Number.isFinite(rate) ? Math.round(rate) : null;
}
