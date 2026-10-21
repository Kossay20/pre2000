/**
 * Final-release round 3, the daily health loop (B-001, B-009, B-010, B-011, B-012, B-013,
 * B-014, B-017, B-023, B-026). The screens are .tsx with JSX, which ts-jest cannot load
 * under the Expo tsconfig, so — like finalReleaseR3Wiring.test.ts — the wiring is locked
 * at source level. The behaviour behind it is unit-tested in clinicalChecks.test.ts
 * (thresholds, month summary) and weightService.test.ts (same-day list, gauge).
 */
import * as fs from 'fs';
import * as path from 'path';
import { formatDecimal } from '../../utils/localizedFormat';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
const LOCALES = ['fr', 'en', 'ar', 'tn'];
const locale = (lang: string, file: string) => JSON.parse(read(`src/i18n/locales/${lang}/${file}`));

const health = read('src/screens/HealthDashboardScreen.tsx');
const weight = read('src/screens/WeightTrackerScreen.tsx');
const weightStyles = read('src/screens/WeightTrackerScreen.styles.ts');

describe('B-009 — the Glycémie card speaks from the readings', () => {
    it('the month label is derived, and no fixed "normal" label is left', () => {
        expect(health).toMatch(/const glucoseMonth = summarizeGlucoseMonth\(glucoseHistory\)/);
        expect(health).toMatch(/t\(`dashboard\.glucoseMonth\.\$\{glucoseMonth\}`\)/);
        expect(health).not.toMatch(/glucoseNormal/);
    });

    it('the three states exist in the four languages, and none says "normal" for the empty one', () => {
        for (const lang of LOCALES) {
            const strings = locale(lang, 'dashboard.json');
            expect(strings.glucoseNormal).toBeUndefined();
            for (const state of ['empty', 'inRange', 'outOfRange']) {
                expect({ lang, state, ok: !!strings.glucoseMonth?.[state] }).toEqual({ lang, state, ok: true });
            }
            const all = Object.values(strings.glucoseMonth);
            expect(new Set(all).size).toBe(3);
        }
        expect(locale('fr', 'dashboard.json').glucoseMonth.empty).not.toMatch(/normal/i);
        expect(locale('en', 'dashboard.json').glucoseMonth.empty).not.toMatch(/normal/i);
    });

    it('a reading is shown in the alert colour only when checkGlucose flags it', () => {
        expect(health).toMatch(/checkGlucose\(glucoseHistory\[0\]\.value\) && \{ color: theme\.colors\.deepOrange900 \}/);
    });
});

describe('B-010 — flagged readings keep their flag in the history', () => {
    it('blood pressure and glucose rows go through the clinical checks', () => {
        expect(health).toMatch(/renderFlag\(checkBloodPressure\(value\.systolic, value\.diastolic\)\)/);
        expect(health).toMatch(/renderFlag\(checkGlucose\(g\.value\)\)/);
        expect(health).toMatch(/renderFlag\(stats\?\.lastBP \? checkBloodPressure\(stats\.lastBP\.systolic, stats\.lastBP\.diastolic\) : null\)/);
    });

    it('the thresholds are listed for clinical sign-off', () => {
        const dossier = read('docs/clinical-review/HEALTH_THRESHOLDS_DOSSIER.md');
        expect(dossier).toMatch(/5,1 mmol\/L/);
        expect(dossier).toMatch(/140–159/);
        expect(dossier).toMatch(/dans les 24 heures/);
        for (const lang of LOCALES) {
            const alerts = locale(lang, 'dashboard.json').alerts;
            expect(dossier).toContain(alerts.bpHigh.message);
            expect(dossier).toContain(alerts.glucoseSurveillance.message);
        }
    });
});

describe('B-001 — Health asks before replacing today\'s weighing, like "Mon Poids"', () => {
    const save = health.slice(health.indexOf('const handleAddWeight'), health.indexOf('const handleAddBP'));

    it('looks today\'s weighings up across both sources and asks with the tracker\'s wording', () => {
        expect(save).toMatch(/const today = weighingsOnDay\(await getAllWeightEntries\(userId\)\)/);
        expect(save).toMatch(/t\('weight\.entryExistsTitle'\)/);
        expect(save).toMatch(/t\('weight\.entryExistsMsg', \{ weight: num\(today\[0\]\.weight\) \}\)/);
        expect(save).toMatch(/t\('weight\.replace'\)/);
    });

    it('saves the new weighing first, then deletes the ones it replaces', () => {
        const persist = save.slice(save.indexOf('const persist = async'), save.indexOf('const checkThenPersist'));
        expect(persist.indexOf('await saveWeightEntry(')).toBeGreaterThan(-1);
        expect(persist.indexOf('await saveWeightEntry(')).toBeLessThan(persist.indexOf('deleteWeightEntry(userId, old.id, old.source)'));
    });
});

describe('B-017 — symptom chips expose their on/off state', () => {
    it('selected for native screen readers, aria-pressed on web', () => {
        const chips = health.slice(health.indexOf('SYMPTOM_CHIPS.map'), health.indexOf('noSymptomsToday'));
        expect(chips).toMatch(/accessibilityState=\{\{ selected: symptoms\.includes\(chip\.key\) \}\}/);
        expect(chips).toMatch(/Platform\.OS === 'web' \? \{ 'aria-pressed': symptoms\.includes\(chip\.key\) \} : \{\}/);
    });
});

describe('B-023 — decimals follow the language on Weight and Health', () => {
    it('fr and tn write a comma, en and ar a dot', () => {
        expect(formatDecimal(68.4, 'fr')).toBe('68,4');
        expect(formatDecimal(5.2, 'fr')).toBe('5,2');
        expect(formatDecimal(5.2, 'tn')).toBe('5,2');
        expect(formatDecimal(68.4, 'en')).toBe('68.4');
        expect(formatDecimal(68.4, 'ar')).toBe('68.4');
    });

    it('the screens print weights and glucose through formatDecimal', () => {
        expect(weight).toMatch(/const num = \(value: number\) => formatDecimal\(value, i18n\.language\)/);
        expect(weight).toMatch(/\{num\(latestWeight\)\} \{t\('weight\.hugeWeight'\)\}/);
        expect(weight).toMatch(/\{num\(entry\.weight\)\} \{t\('common\.kg'\)\}/);
        expect(weight).not.toMatch(/\.toFixed\(1\)\} /);
        expect(health).toMatch(/\{num\(glucoseHistory\[0\]\.value\)\} \{t\('dashboard\.mmolL'\)\}/);
        expect(health).toMatch(/\{num\(g\.value\)\} \{t\('dashboard\.mmolL'\)\}/);
        expect(health).not.toMatch(/weightGain\.toFixed/);
    });
});

describe('B-028 — the gauge dot is placed by gaugeDotPercent', () => {
    it('no 0–100 % mapping is left in the screen; the labels carry the decimals', () => {
        expect(weight).toMatch(/left: `\$\{gaugeDotPercent\(latestWeight, recommendedRange\.min, recommendedRange\.max\)\}%`/);
        expect(weight).not.toMatch(/\(recommendedRange\.max - recommendedRange\.min\)\) \* 100/);
        expect(weight).not.toMatch(/recommendedRange\.(min|max)\.toFixed\(0\)/);
    });
});

describe('B-026 — one empty state on Weight', () => {
    it('the top card is left out until there is a weighing; Historique keeps its call to action', () => {
        expect(weight).toMatch(/\{weightHistory\.length > 0 && \(\s*<View style=\{styles\.weightDisplay\}>/);
        expect(weight).toMatch(/t\('weight\.startTracking'\)/);
    });
});

describe('B-014 / B-012 — the chart and the tip chips stay inside their card', () => {
    it('the chart width takes the gutter and the card padding off, both sides', () => {
        const chart = read('src/components/weight/WeightMiniChart.tsx');
        expect(chart).toMatch(/contentWidth - 2 \* \(SCREEN_GUTTER \+ CARD_PADDING\)/);
        expect(chart).toMatch(/width=\{weightChartWidth\(getContentWidth\(\)\)\}/);
        // The two constants are the paddings the stylesheet really uses.
        expect(weightStyles.slice(weightStyles.indexOf('content: {'), weightStyles.indexOf('header: {'))).toMatch(/padding: 16,/);
        expect(weightStyles.slice(weightStyles.indexOf('chartContainer: {'), weightStyles.indexOf('chartTitle: {'))).toMatch(/padding: 16,/);
        expect(chart).toMatch(/const SCREEN_GUTTER = 16;\s*const CARD_PADDING = 16;/);
    });

    it('a tip chip cannot be wider than its row, so its text wraps', () => {
        const chip = weightStyles.slice(weightStyles.indexOf('suggestionChip: {'), weightStyles.indexOf('suggestionIcon: {'));
        expect(chip).toMatch(/maxWidth: '100%'/);
        expect(weightStyles.slice(weightStyles.indexOf('suggestionText: {'))).toMatch(/flexShrink: 1/);
    });
});

describe('B-013 — the weight tip states no hydration figure of its own', () => {
    it('no litres-per-day number in any language (Reminders holds the one goal)', () => {
        for (const lang of LOCALES) {
            const tip: string = locale(lang, 'weight.json').suggestions.t3Hydration;
            expect({ lang, tip, hasNumber: /\d/.test(tip) }).toEqual({ lang, tip, hasNumber: false });
        }
    });
});

// Round 4: "Mesure hors objectif ce mois-ci" ran on one line into the card's right edge.
describe('the Glycémie month label stays inside its card', () => {
    const healthStyles = read('src/screens/HealthDashboardScreen.styles.ts');

    it('each half of the summary takes an equal share of the row, so the label wraps', () => {
        const box = healthStyles.slice(healthStyles.indexOf('glucoseStatBox: {'), healthStyles.indexOf('glucoseStatText: {'));
        expect(box).toMatch(/flex: 1,/);
        expect(box).toMatch(/minWidth: 0,/);
        const glucose = health.slice(health.indexOf('Section 3: Glycémie'), health.indexOf('glucoseHistory.slice(1, 3)'));
        expect(glucose.match(/<View style=\{styles\.glucoseStatBox\}>/g)).toHaveLength(2);
        expect(glucose).not.toMatch(/styles\.statBox\b/);
        expect(glucose).toMatch(/\[styles\.statLabel, styles\.glucoseStatText\]\}>\{glucoseMonthLabel\}/);
    });

    it('the label is never held on one line', () => {
        const glucose = health.slice(health.indexOf('Section 3: Glycémie'), health.indexOf('glucoseHistory.slice(1, 3)'));
        expect(glucose).not.toMatch(/numberOfLines/);
    });
});

describe('B-011 — "Ma Journée" has the Tasks tab\'s gutter', () => {
    const myDay = read('src/components/tasks/MyDaySection.tsx');

    it('the section is inset by the theme spacing, like its sibling sections', () => {
        const container = myDay.slice(myDay.indexOf('container: {'), myDay.indexOf('header: {'));
        expect(container).toMatch(/marginHorizontal: theme\.spacing\.m/);
        const tab = read('src/screens/reminders/TasksTab.tsx');
        expect(tab.slice(tab.indexOf('taskSection: {'))).toMatch(/marginHorizontal: 16/);
    });

    it('the date capitalises its first letter only ("Jeudi 1 octobre")', () => {
        const date = myDay.slice(myDay.indexOf('    date: {'), myDay.indexOf('progressContainer: {'));
        expect(date).not.toMatch(/textTransform: 'capitalize',/);
    });
});
