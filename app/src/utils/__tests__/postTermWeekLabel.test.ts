/**
 * A-025: past the due date every screen prints the same week and day.
 *
 * calculatePregnancyWeek keeps `week`/`day` on 40/7 from 40+0 to 42+0 because they pick
 * the weeks content, and that ends at 40. Home printed them ("Semaine 40", "Jour 280")
 * while onboarding printed the real week ("Semaine 41") and the post-term note said
 * "40 SA + 3 jours" on the same screen. Every printed age now goes through
 * displayedPregnancyAge — onboarding directly from the calculator, the other screens from
 * what PregnancyContext publishes (useCurrentWeek, Health, Reminders) — so this checks
 * both paths agree, and that the screens are wired to them.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    calculatePregnancyWeek,
    displayedAgeOf,
    displayedPregnancyAge,
    dueDateFromLmp,
} from '../pregnancyCalculator';
import { toLocalDateKey } from '../localDate';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');

const TODAY = new Date(2026, 9, 1, 12, 0, 0); // local noon, 1 Oct 2026
/** The LMP `days` days before today, stored as a typed date is (UTC midnight). */
const lmpDaysAgo = (days: number) => new Date(Date.UTC(2026, 9, 1 - days));

/** What PregnancyContext.updatePregnancyInfo publishes for a pregnant profile. */
const contextInfo = (lmp: Date) => {
    const { week, day, isInvalid, isPostTerm, completedWeeks, completedDays } = calculatePregnancyWeek(lmp);
    return { week, dayInWeek: day, isInvalid, isPostTerm, completedWeeks, completedDays, mode: 'pregnant' as const };
};

beforeEach(() => jest.useFakeTimers({ now: TODAY }));
afterEach(() => jest.useRealTimers());

describe('A-025 — the printed week and day past term', () => {
    // [days since LMP, SA, printed week, printed day of week, day of pregnancy]
    const cases: Array<[number, string, number, number, number]> = [
        [279, '39+6', 40, 7, 280],
        [280, '40+0', 41, 1, 281],
        [283, '40+3', 41, 4, 284],
        [293, '41+6', 42, 7, 294],
        [294, '42+0', 43, 1, 295],
    ];

    it.each(cases)('%i days (%s): "Semaine %i", day %i of the week, "Jour %i" on every screen', (days, _sa, week, day, dayOfPregnancy) => {
        const lmp = lmpDaysAgo(days);
        const calc = calculatePregnancyWeek(lmp);

        // Onboarding preview (step 2) and summary (step 4).
        const onboarding = displayedPregnancyAge(calc.completedWeeks, calc.completedDays);
        // Home header + day counter and Profile (useCurrentWeek), Health and Reminders headers.
        const fromContext = displayedAgeOf(contextInfo(lmp));

        expect(onboarding).toEqual({ week, day, dayOfPregnancy });
        expect(fromContext).toEqual(onboarding);
        // The weeks content stays on 40 past term; only the label moves on.
        expect(calc.week).toBe(Math.min(week, 40));
        // The printed week always agrees with the SA the post-term note prints.
        expect(onboarding.week).toBe(calc.completedWeeks + 1);
        expect(onboarding.day).toBe(calc.completedDays + 1);
    });

    it('beyond 42+0 the printed age stops at 42+0 instead of counting on', () => {
        expect(displayedAgeOf(contextInfo(lmpDaysAgo(320)))).toEqual({ week: 43, day: 1, dayOfPregnancy: 295 });
    });

    it('before the LMP / without completed weeks it falls back to the 1-based pair', () => {
        expect(displayedAgeOf(null)).toEqual({ week: 1, day: 1, dayOfPregnancy: 1 });
        expect(displayedAgeOf({ week: 12, dayInWeek: 3 })).toEqual({ week: 12, day: 3, dayOfPregnancy: 80 });
    });
});

describe('A-025 — the screens print the shared helper, not the content week', () => {
    it('Home: header from overrideWeek ?? displayWeek, day counter from dayOfPregnancy', () => {
        const home = read('src/screens/HomeScreen.tsx');
        expect(home).toMatch(/const shownWeek = overrideWeek \?\? displayWeek;/);
        expect(home).toMatch(/<Text style=\{styles\.weekTitle\}>\{t\('common\.week'\)\} \{shownWeek\}<\/Text>/);
        expect(home).toMatch(/dayOfPregnancy=\{overrideWeek === null \? dayOfPregnancy : undefined\}/);
        const card = read('src/components/home/BabyGrowthCard.tsx');
        expect(card).toMatch(/const dayOfPregnancy = realDayOfPregnancy\s*\?\?/);
    });

    it('useCurrentWeek returns displayedAgeOf(pregnancyInfo)', () => {
        const hook = read('src/hooks/useCurrentWeek.ts');
        expect(hook).toMatch(/const displayed = displayedAgeOf\(pregnancyInfo\);/);
        expect(hook).toMatch(/displayWeek: displayed\.week,/);
        expect(hook).toMatch(/dayOfPregnancy: displayed\.dayOfPregnancy,/);
    });

    it('Onboarding, Profile, Health and Reminders print the displayed week', () => {
        expect(read('src/screens/OnboardingScreen.tsx')).toMatch(
            /const \{ week: displayWeek, dayOfPregnancy \} = displayedPregnancyAge\(pregnancyInfo\.completedWeeks, pregnancyInfo\.completedDays\);/,
        );
        expect(read('src/screens/ProfileScreen.tsx')).toMatch(/\{t\('common\.week'\)\} \{displayWeek \|\| '—'\}/);
        expect(read('src/screens/HealthDashboardScreen.tsx')).toMatch(/displayedAgeOf\(pregnancyInfo\)\.week/);
        expect(read('src/screens/reminders/RemindersTab.tsx')).toMatch(/\{t\('common\.week'\)\} \{displayedAgeOf\(pregnancyInfo\)\.week\}/);
    });

    it('A-029: the onboarding post-term note does not repeat the SA printed just above it', () => {
        const onboarding = read('src/screens/OnboardingScreen.tsx');
        expect(onboarding).toMatch(/t\('onboarding\.step2\.postTermNote'\)/);
        expect(onboarding).not.toMatch(/t\('home\.postTermNote'/);
        for (const lng of ['fr', 'en', 'ar', 'tn']) {
            const note = JSON.parse(read(`src/i18n/locales/${lng}/onboarding.json`)).step2.postTermNote;
            expect(typeof note).toBe('string');
            expect(note).not.toMatch(/\{\{ga\}\}/);
        }
    });
});

describe('due date', () => {
    it('is LMP + 280 calendar days, as a local day', () => {
        const due = dueDateFromLmp(lmpDaysAgo(217));
        // 1 Oct 2026 − 217 days + 280 days = 1 Oct + 63 days = 3 Dec 2026.
        expect(due && toLocalDateKey(due)).toBe('2026-12-03');
        expect(due?.getHours()).toBe(0);
    });

    it('Profile and the PDF show the LMP and due date as calendar days (dueDateTimezones.test.ts)', () => {
        const profile = read('src/screens/ProfileScreen.tsx');
        expect(profile).toMatch(/const dpa = dueDateFromLmp\(lmp\)/);
        expect(profile).toMatch(/format\(dpa, 'd MMMM yyyy'/);
        // D-046: the LMP chip and the due date use one format (long month, no padded day).
        expect(profile).toMatch(/format\(lmpDay, 'd MMMM yyyy'/);
        expect(profile).not.toMatch(/addDays\(lmpDate, 280\)/);
        expect(profile).not.toMatch(/dpa: dpa\.toISOString\(\)/);
        const pdf = read('src/services/pdfExportService.ts');
        expect(pdf).toMatch(/format\(calendarDay\(profile\.dpa\)/);
        expect(pdf).toMatch(/format\(calendarDay\(profile\.lmp\)/);
    });
});
