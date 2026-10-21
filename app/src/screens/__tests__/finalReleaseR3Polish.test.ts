/**
 * Final-release round 3, small-polish lot (B-015, B-025, E-016, E-017, E-029, E-030,
 * E-031, E-033b, E-043). Source-level wiring, like finalReleaseR3Wiring.test.ts: the
 * screens are .tsx and the repo ships no React renderer. The behaviour behind each is
 * tested next to its helper (kickCounterService, contractionTimerService, styleUtils,
 * BabyGrowthCard.helpers, the suite below for statisticsToday).
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveButtonVariant } from '../../components/common/Button.helpers';
import { todayCompletionRate } from '../reminders/statisticsToday';
import { styles as profileStyles } from '../ProfileScreen.styles';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
const LOCALES = ['fr', 'en', 'ar', 'tn'];
const locale = (lang: string, file: string) => JSON.parse(read(`src/i18n/locales/${lang}/${file}`));

describe('B-015 / E-033b — kick counter idle block and cancel button', () => {
    const kick = read('src/screens/KickCounterScreen.tsx');

    it('the idle block takes its copy from idleSessionPrompt(history.length)', () => {
        expect(kick).toMatch(/idleSessionPrompt\(state\.history\.length\)/);
        expect(kick).not.toMatch(/t\('cycle8\.kickCounter\.noSessionYet'\)/);
    });

    it('"Annuler" is an outline button, not a second filled one beside "Terminer"', () => {
        expect(kick).toMatch(/onPress=\{onCancel\}\s+variant="outline"/);
        expect(resolveButtonVariant('outline', false).backgroundColor).toBe('transparent');
    });
});

describe('E-017 — one trimester label on Home and Reminders', () => {
    it('Reminders reads the same common.trimester_N strings as Home', () => {
        expect(read('src/screens/HomeScreen.tsx')).toMatch(/t\('common\.trimester_' \+ trimesterNum\)/);
        expect(read('src/screens/reminders/RemindersTab.tsx')).toMatch(/t\('common\.trimester_' \+ profile\.trimester\)/);
    });

    it.each(LOCALES)('%s: the three labels exist and the numeric template is gone', (lang) => {
        const common = locale(lang, 'common.json');
        for (const n of [1, 2, 3]) expect(common[`trimester_${n}`]).toBeTruthy();
        // "{{trimester}}e trimestre" printed "1e trimestre" in the first trimester.
        expect(common.trimesterLabel).toBeUndefined();
    });
});

describe('E-016 — web Switch thumbs take the theme colour when ON', () => {
    it.each([
        'src/screens/SettingsScreen.tsx',
        'src/screens/AddAppointmentScreen.tsx',
        'src/screens/reminders/RemindersTab.tsx',
        'src/components/reminders/ReminderCard.tsx',
        'src/components/reminders/HydrationCard.tsx',
        'src/components/reminders/ReminderCardV2.tsx',
        'src/components/tasks/AddTaskModal.tsx',
    ])('%s goes through switchThumbProps', (file) => {
        const src = read(file);
        expect(src).toMatch(/\{\.\.\.switchThumbProps\(/);
        expect(src).not.toMatch(/\sthumbColor=/);
    });
});

describe('E-029 — Profile header e-mail', () => {
    it('is inset from the edges and stays on one line', () => {
        expect(profileStyles.header.paddingHorizontal).toBeGreaterThanOrEqual(16);
        expect(read('src/screens/ProfileScreen.tsx')).toMatch(
            /<Text style=\{styles\.headerSubtitle\} numberOfLines=\{1\} ellipsizeMode="middle">/,
        );
    });
});

describe('E-031 — leftovers of other languages', () => {
    it('ar/tn e-mail placeholder has no English "your"', () => {
        for (const lang of ['ar', 'tn']) expect(locale(lang, 'auth.json').emailPlaceholder).not.toMatch(/your/i);
    });

    it('ar/tn hydration goal spells the litre in Arabic', () => {
        for (const lang of ['ar', 'tn']) {
            const hydration = locale(lang, 'reminders.json').hydration;
            expect(hydration.outOf.replace('{{goalL}}', '')).not.toMatch(/[A-Za-z]/);
            expect(hydration.unitLitre).toBe('لتر');
        }
        expect(read('src/screens/reminders/StatisticsScreen.tsx')).toMatch(/yAxisSuffix=\{t\('reminders\.hydration\.unitLitre'\)\}/);
    });

    it('Settings has its own medical intro, without the onboarding "and continue"', () => {
        expect(read('src/screens/SettingsScreen.tsx')).toMatch(/t\('common\.medicalProfile\.settingsIntro'\)/);
        for (const lang of LOCALES) expect(locale(lang, 'common.json').medicalProfile.settingsIntro).toBeTruthy();
        expect(locale('fr', 'common.json').medicalProfile.settingsIntro).not.toMatch(/continuez/);
        expect(locale('en', 'common.json').medicalProfile.settingsIntro).not.toMatch(/continue/);
    });
});

describe('E-043 — the offline-save toast stays short', () => {
    // Three lines of toast covered the Calendar month title and its chevrons. Two
    // lines at 320pt is about 60 characters.
    it.each(LOCALES)('%s: savedOffline fits two lines', (lang) => {
        expect(locale(lang, 'add_appointment.json').savedOffline.length).toBeLessThanOrEqual(60);
    });
});

describe('E-030 / B-025 — Statistics', () => {
    const stats = read('src/screens/reminders/StatisticsScreen.tsx');

    it('the empty state carries the same header as the data branch', () => {
        const empty = stats.slice(stats.indexOf('data.dates.length === 0'), stats.indexOf('const todayRate'));
        expect(empty).toMatch(/style=\{styles\.emptyContainer\}>\s+\{header\}\s+<EmptyState/);
        expect(stats).toMatch(/emptyContainer: \{\s+flex: 1,\s+backgroundColor: theme\.colors\.background,/);
    });

    it('shows today\'s completion even before two days of history', () => {
        expect(stats).toMatch(/t\('todayCompletion', \{ percent: todayRate \}\)/);
        for (const lang of LOCALES) expect(locale(lang, 'common.json').todayCompletion).toContain('{{percent}}');
    });

    it('todayCompletionRate reads today\'s entry, or nothing', () => {
        const data = { dates: ['2026-09-30', '2026-10-01'], completionRates: [20, 50] };
        expect(todayCompletionRate(data, '2026-10-01')).toBe(50);
        expect(todayCompletionRate(data, '2026-10-02')).toBeNull();
        expect(todayCompletionRate({ dates: [], completionRates: [] }, '2026-10-01')).toBeNull();
    });
});
