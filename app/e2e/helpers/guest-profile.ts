/**
 * Guest E2E profile. Pregnancy week is derived from LMP at runtime
 * (`calculatePregnancyWeek`), so `currentWeek` in the blob is documentary.
 * LMP must be (week-1)*7 days before "today" or Home week-gates are wrong.
 */
export function lmpIsoForWeek(week: number, now: Date = new Date()): string {
  const daysSinceLmp = (week - 1) * 7;
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - daysSinceLmp);
  return d.toISOString();
}

export function buildGuestProfile(week = 13, now: Date = new Date()) {
  const lmp = lmpIsoForWeek(week, now);
  return {
    uid: 'guest_e2e_fixture',
    firstName: 'E2E',
    lastName: 'Tester',
    pregnancyStartDate: lmp,
    lmp,
    currentWeek: week,
    country: 'France',
    ageRange: '25-29',
    isFirstPregnancy: true,
    isGuest: true,
  } as const;
}
