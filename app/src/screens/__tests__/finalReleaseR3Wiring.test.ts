/**
 * Final-release round 3 wiring (A-025, A-033, B-002, E-028, E-044). The screens are .tsx with JSX, which
 * ts-jest cannot load under the Expo tsconfig and the repo ships no React renderer — so,
 * like planningWiring.test.ts, the wiring is locked at source level. The behaviour behind
 * it is tested in services/__tests__/calendarWeekTimezones.test.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveButtonVariant } from '../../components/common/Button.helpers';
import { theme } from '../../theme';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
const LOCALES = ['fr', 'en', 'ar', 'tn'];
const locale = (lang: string, file: string) => JSON.parse(read(`src/i18n/locales/${lang}/${file}`));

describe('A-025 — every surface prints her real week, the calendar opens on today', () => {
    const calendar = read('src/screens/CalendarScreen.tsx');

    it('Calendar never reads the profile\'s content week (it stops at 40)', () => {
        expect(calendar).not.toMatch(/user\??\.currentWeek/);
        expect(calendar).not.toMatch(/calculateCurrentWeek/);
    });

    it('the strip opens on, and "Aujourd\'hui" returns to, the week holding today', () => {
        expect(calendar).toMatch(/useState\(\(\) =>\s*user\?\.pregnancyStartDate \? pregnancyWeekOfDate\(new Date\(user\.pregnancyStartDate\)\) : 1\)/);
        const today = calendar.slice(calendar.indexOf('const handlePressToday'), calendar.indexOf('const handleSelectWeekView'));
        expect(today).toMatch(/setCurrentWeek\(pregnancyWeekOfDate\(new Date\(user\.pregnancyStartDate\), today\)\)/);
    });

    it('the header label goes through displayedPregnancyAge', () => {
        expect(calendar).toMatch(/t\('calendar\.weekOfPregnancy', \{ week: displayedCalendarWeek\(currentWeek\) \}\)/);
    });

    it('paging forward does not stop at week 40, so her own appointments after it stay reachable', () => {
        expect(calendar).toMatch(/currentWeek < LAST_CALENDAR_WEEK/);
        expect(calendar).not.toMatch(/currentWeek < 40/);
    });

    it('Home, Profile and Reminders print displayedAgeOf', () => {
        expect(read('src/hooks/useCurrentWeek.ts')).toMatch(/displayWeek: displayed\.week/);
        expect(read('src/screens/HomeScreen.tsx')).toMatch(/const shownWeek = overrideWeek \?\? displayWeek/);
        expect(read('src/screens/ProfileScreen.tsx')).toMatch(/\{t\('common\.week'\)\} \{displayWeek \|\| '—'\}/);
        expect(read('src/screens/reminders/RemindersTab.tsx')).toMatch(/\{displayedAgeOf\(pregnancyInfo\)\.week\}/);
    });

    it('the weight tracker and the health dashboard print and file the real week', () => {
        const weight = read('src/screens/WeightTrackerScreen.tsx');
        expect(weight).toMatch(/const shownWeek = hasWeekInfo \? displayedAgeOf\(pregnancyInfo\)\.week : null/);
        expect(weight).not.toMatch(/number: currentWeek/);
        expect(weight).not.toMatch(/week: currentWeek \}/);
        expect(weight).toMatch(/week_of_pregnancy: shownWeek \?\? 0/);
        const dashboard = read('src/screens/HealthDashboardScreen.tsx');
        expect(dashboard).not.toMatch(/const week = pregnancyInfo\.week;/);
        expect(dashboard).toMatch(/saveDailySymptoms\(user\.uid, displayedAgeOf\(pregnancyInfo\)\.week/);
    });

    it('the content week is not written to the server profile', () => {
        expect(read('src/context/AuthContext.tsx')).not.toMatch(/\{ currentWeek: calculatedWeek \}/);
    });
});

describe('B-002 — the new-appointment subtitle follows the selected type', () => {
    it('Médical (the default) and Personnel each have their subtitle', () => {
        const form = read('src/screens/AddAppointmentScreen.tsx');
        expect(form).toMatch(/t\(type === 'medical' \? 'addAppointment\.newSubtitleMedical' : 'addAppointment\.newSubtitle'\)/);
        for (const lang of LOCALES) {
            const strings = locale(lang, 'add_appointment.json');
            expect(strings.newSubtitleMedical).toBeTruthy();
            expect(strings.newSubtitleMedical).not.toBe(strings.newSubtitle);
        }
    });
});

describe('E-044 / E-028 — icons that take the text colour, and no dated calendar emoji', () => {
    it('the type chips carry an Ionicons icon in the chip\'s text colour, not an emoji in the label', () => {
        const form = read('src/screens/AddAppointmentScreen.tsx');
        expect(form).toMatch(/<Ionicons name="medkit-outline" size=\{16\} color=\{type === 'medical' \? theme\.colors\.white : theme\.colors\.text\}/);
        expect(form).toMatch(/<Ionicons name="person-outline" size=\{16\} color=\{type === 'other' \? theme\.colors\.white : theme\.colors\.text\}/);
        for (const lang of LOCALES) {
            const strings = locale(lang, 'add_appointment.json');
            for (const key of ['typeMedical', 'typeOther']) {
                expect(strings[key]).not.toMatch(/\p{Extended_Pictographic}/u);
            }
        }
    });

    it('the calendar\'s empty and error states and onboarding step 2 draw a calendar instead of 📅', () => {
        const calendar = read('src/screens/CalendarScreen.tsx');
        expect(calendar).not.toMatch(/>\s*(📅|📆|🗓)/u);
        expect(calendar.match(/<Ionicons name="calendar-outline"/g)).toHaveLength(2);
        const onboarding = read('src/screens/OnboardingScreen.tsx');
        expect(onboarding).not.toMatch(/stepEmoji\}>(📅|📆|🗓)/u);
        expect(onboarding).toMatch(/<Ionicons name="calendar-outline" size=\{64\}/);
    });
});

describe('A-033 — the last step\'s buttons, switched off, look like the shared disabled Button', () => {
    const onboarding = read('src/screens/OnboardingScreen.tsx');

    it('the off pair is the shared Button\'s readable one', () => {
        const off = resolveButtonVariant('primary', true);
        expect(off.textColor).not.toBe(theme.colors.white);
        expect(onboarding).toMatch(/const OFF = resolveButtonVariant\('primary', true\)/);
    });

    it('no gradient button keeps the white-on-grey disabled gradient', () => {
        expect(onboarding).not.toMatch(/neutral300, theme\.colors\.gray500/);
        expect(onboarding.match(/\? START_OFF_COLORS : START_ON_COLORS/g)).toHaveLength(3);
        expect(onboarding.match(/&& \{ color: OFF\.textColor \}/g)).toHaveLength(3);
        expect(onboarding.match(/&& styles\.startButtonOff\]/g)).toHaveLength(3);
    });
});
