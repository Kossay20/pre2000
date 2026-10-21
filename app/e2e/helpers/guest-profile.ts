/**
 * Guest E2E profile. Pregnancy week is derived from LMP at runtime
 * (`calculatePregnancyWeek`), so `currentWeek` in the blob is documentary.
 * LMP must be (week-1)*7 days before "today" or Home week-gates are wrong.
 */
/**
 * The app counts days on the browser's calendar (Europe/Paris in every wave). Between 00:00 and
 * 02:00 Paris the UTC date is still yesterday, so "today" must be read on the Paris calendar,
 * never from toISOString(). Returns that calendar day at 00:00 UTC. ONE helper shared by the
 * seeder (lmpIsoForWeek) and the specs (wave A) so they can never disagree on the day count.
 */
export function parisToday(now: Date = new Date(), timeZone = 'Europe/Paris'): Date {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function lmpIsoForWeek(week: number, now: Date = new Date()): string {
  const daysSinceLmp = (week - 1) * 7;
  const d = parisToday(now);
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
    // Recorded by onboarding's last step; without it the app opens on the consent sheet.
    healthDataConsent: { version: '2026-09-30', at: now.toISOString() },
  } as const;
}
