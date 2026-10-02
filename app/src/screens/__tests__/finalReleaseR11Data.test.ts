/**
 * Round 11 "data" lot: one date style, the journal PDF's country and kg, BP history,
 * emoji-free accessible names, the calendar fallback, the login e-mail padding and the
 * onboarding method chips. Source-level, like finalReleaseR9Home.test.ts.
 */
import fs from 'fs';
import path from 'path';

const APP = path.resolve(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(APP, p), 'utf8');
const json = (p: string) => JSON.parse(read(p));

describe('B-023 / D-046 — day without a padded zero', () => {
    it.each([
        'src/services/pdfExportService.ts',
        'src/screens/WeightTrackerScreen.tsx',
        'src/screens/HealthDashboardScreen.tsx',
        'src/screens/CompletedTasksScreen.tsx',
        'src/components/tasks/AddTaskModal.tsx',
        'src/components/calendar/EventCard.tsx',
    ])('%s has no dd pattern and no numeric toLocaleDateString', (file) => {
        // 'yyyy-MM-dd' is the ISO value of a date input, never shown.
        const src = read(file).replace(/'yyyy-MM-dd'/g, '');
        expect(src).not.toMatch(/'[^'\n]*\bdd\b[^'\n]*'/);
        expect(src).not.toMatch(/toLocaleDateString/);
    });

    it('the journal appointment date is a localized long date', () => {
        expect(read('src/services/pdfExportService.ts')).toMatch(/format\(new Date\(a\.date\), 'd MMMM yyyy HH:mm', \{ locale \}\)/);
    });

    it('the weight chart y labels put a no-break space before kg', () => {
        expect(read('src/components/weight/WeightMiniChart.tsx')).toMatch(/yAxisSuffix=\{`\\u00A0\$\{t\('common\.kg'\)\}`\}/);
    });

    it.each(['fr', 'en'])('hydration "out of" keeps a no-break space before L (%s)', (lang) => {
        expect(json(`src/i18n/locales/${lang}/reminders.json`).hydration.outOf).toMatch(/\{\{goalL\}\} L$/);
    });
});

describe('D-052 — the journal PDF', () => {
    const src = read('src/services/pdfExportService.ts');
    it('translates any stored country key, not only tunisia', () => {
        expect(src).toMatch(/t\(`common\.countries\.\$\{profile\.country\}`, \{ defaultValue: profile\.country \}\)/);
        for (const lang of ['fr', 'en', 'ar', 'tn']) {
            const c = json(`src/i18n/locales/${lang}/common.json`).countries;
            for (const key of ['tunisia', 'france', 'belgium', 'morocco', 'algeria', 'switzerland', 'canada', 'usa', 'uk']) {
                expect(c[key]).toBeTruthy();
            }
        }
    });
    it('keeps the kg value left-to-right inside RTL pages', () => {
        expect(src).toMatch(/<span dir="ltr">\$\{w\.weight\}&nbsp;kg<\/span>/);
    });
});

describe('B-027 item 3 — BP history skips the latest, like glucose', () => {
    const src = read('src/screens/HealthDashboardScreen.tsx');
    it('lists readings after the one the card shows', () => {
        expect(src).toMatch(/bpHistory\.slice\(1, 3\)/);
        expect(src).toMatch(/glucoseHistory\.slice\(1, 3\)/);
    });
});

describe('E-063 — accessible names without emoji', () => {
    it('Health BP, AddTask reminder switch and Weight "how it works" use plainLabel', () => {
        expect(read('src/screens/HealthDashboardScreen.tsx')).toMatch(/plainLabel\(t\('dashboard\.bloodPressure'\)\)/);
        expect(read('src/components/tasks/AddTaskModal.tsx')).toMatch(/accessibilityLabel=\{plainLabel\(t\('tasks\.modal\.addReminder'\)\)\}/);
        expect(read('src/screens/WeightTrackerScreen.tsx')).toMatch(/accessibilityLabel=\{plainLabel\(t\('weight\.howItWorks'\)\)\}/);
    });
});

describe('E-052 — calendar templates fall back to the bundled copy', () => {
    const src = read('src/services/calendarService.ts');
    it('also when the snapshot is empty (offline cache)', () => {
        expect(src).toMatch(/templates\.length === 0\) \{[\s\S]{0,400}return getBundledCalendarTemplates\(\)/);
    });
});

describe('E-051 — login e-mail field', () => {
    it('leaves less padding at the physical right, where the LTR address ends', () => {
        const src = read('src/screens/LoginScreen.tsx');
        expect(src).toMatch(/input: \{[^}]*paddingRight: theme\.spacing\.s/);
    });
});

describe('E-028 — onboarding method chips draw vectors', () => {
    it.each(['fr', 'en', 'ar', 'tn'])('%s strings carry no emoji', (lang) => {
        const step2 = json(`src/i18n/locales/${lang}/onboarding.json`).step2;
        expect(step2.methodDdr).toMatch(/^[^\p{Extended_Pictographic}]+$/u);
        expect(step2.methodConception).toMatch(/^[^\p{Extended_Pictographic}]+$/u);
    });
    it('the screen draws calendar-outline and moon-outline', () => {
        const src = read('src/screens/OnboardingScreen.tsx');
        expect(src).toMatch(/name="calendar-outline"\s+size=\{16\}/);
        expect(src).toMatch(/name="moon-outline"/);
    });
});
