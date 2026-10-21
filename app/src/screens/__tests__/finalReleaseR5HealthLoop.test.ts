/**
 * Final-release round 5, health loop + cross-surface consistency (A-040, B-031, B-033,
 * B-036, B-038, B-023). The screens are .tsx with JSX, which ts-jest cannot load under
 * the Expo tsconfig, so — like healthLoopR3Wiring.test.ts — the wiring is locked at
 * source level; the arithmetic behind it is unit-tested directly.
 */
import * as fs from 'fs';
import * as path from 'path';
import { dayOfPregnancyFor, displayedPregnancyAge } from '../../utils/pregnancyCalculator';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
const LOCALES = ['fr', 'en', 'ar', 'tn'];
const locale = (lang: string, file: string) => JSON.parse(read(`src/i18n/locales/${lang}/${file}`));

describe('A-040 — the Message de Bébé footer prints the same Jour as the baby card', () => {
    it('week 32, day 1 is day 218, not "Jour 1"', () => {
        expect(dayOfPregnancyFor(32, 1)).toBe(218);
    });

    it('agrees with displayedPregnancyAge for every day, post-term included', () => {
        for (let days = 0; days <= 294; days++) {
            const age = displayedPregnancyAge(Math.floor(days / 7), days % 7);
            expect(dayOfPregnancyFor(age.week, age.day)).toBe(age.dayOfPregnancy);
        }
    });

    it('the footer passes the day of pregnancy, not the bare day-in-week', () => {
        const card = read('src/components/home/BabyMessageCard.tsx');
        expect(card).toMatch(/t\('home\.weekDay', \{ week, day: dayOfPregnancyFor\(week, day\) \}\)/);
        expect(card).not.toMatch(/t\('home\.weekDay', \{ week, day \}\)/);
    });
});

describe('B-031 — Rappels cette semaine', () => {
    const health = read('src/screens/HealthDashboardScreen.tsx');

    it('totals come from the week\'s task list, not from the status docs', () => {
        const svc = read('src/services/healthService.ts');
        expect(svc).toMatch(/fetchTasksForWeekV2\(currentWeek\)/);
        expect(svc).not.toMatch(/Object\.keys\(taskStatuses\)\.length/);
    });

    it('an empty week shows words, not a "0 / 0" progress bar with a green 0%', () => {
        expect(health).toMatch(/remindersTotal > 0 \? \(/);
        expect(health).toMatch(/t\('dashboard\.noRemindersThisWeek'\)/);
        expect(health).toMatch(/remindersPercent === 0 && \{ color: theme\.colors\.textSecondary \}/);
    });

    it('the empty-state string exists in the four languages', () => {
        for (const lang of LOCALES) {
            expect({ lang, ok: !!locale(lang, 'dashboard.json').noRemindersThisWeek }).toEqual({ lang, ok: true });
        }
    });
});

describe('B-033 — blood-pressure inputs are labelled', () => {
    const modal = read('src/components/health/HealthBPModal.tsx');

    it('each input has a visible label and an accessibilityLabel', () => {
        expect(modal).toMatch(/accessibilityLabel=\{t\('dashboard\.systolicLabel'\)\}/);
        expect(modal).toMatch(/accessibilityLabel=\{t\('dashboard\.diastolicLabel'\)\}/);
        expect(modal).toMatch(/<Text style=\{styles\.inputLabel\}>\{t\('dashboard\.systolicLabel'\)\}<\/Text>/);
        expect(modal).toMatch(/<Text style=\{styles\.inputLabel\}>\{t\('dashboard\.diastolicLabel'\)\}<\/Text>/);
    });

    it('the labels exist in the four languages and differ from each other', () => {
        for (const lang of LOCALES) {
            const d = locale(lang, 'dashboard.json');
            expect(d.systolicLabel).toBeTruthy();
            expect(d.diastolicLabel).toBeTruthy();
            expect(d.systolicLabel).not.toBe(d.diastolicLabel);
        }
    });
});

describe('B-036 — editing an appointment is not titled "Ajouter un RDV"', () => {
    it('the screen sets the header title from the eventId param', () => {
        const screen = read('src/screens/AddAppointmentScreen.tsx');
        expect(screen).toMatch(/navigation\.setOptions\(\{\s*title: eventId \? t\('addAppointment\.editTitle'\) : t\('common\.screen\.addAppointment'\),/);
    });

    it('the edit title exists in the four languages and is not the add title', () => {
        for (const lang of LOCALES) {
            const edit = locale(lang, 'add_appointment.json').editTitle;
            expect(edit).toBeTruthy();
            expect(edit).not.toBe(locale(lang, 'common.json').screen.addAppointment);
        }
    });
});

describe('B-038 — a gain far over the band is not called "un peu au-dessus"', () => {
    it('the screen uses the service\'s own significant-high tier for a plainer label', () => {
        const weight = read('src/screens/WeightTrackerScreen.tsx');
        expect(weight).toMatch(/weightStatus\.messageKey === 'weight\.status\.highSignificant'\s*\? 'weight\.aboveSignificant'\s*: 'weight\.above'/);
    });

    it('the stronger label exists in the four languages and sends her to the midwife', () => {
        for (const lang of LOCALES) {
            const w = locale(lang, 'weight.json');
            expect(w.aboveSignificant).toBeTruthy();
            expect(w.aboveSignificant).not.toBe(w.above);
        }
        expect(locale('fr', 'weight.json').aboveSignificant).toMatch(/sage-femme/);
        expect(locale('en', 'weight.json').aboveSignificant).toMatch(/midwife/);
    });
});

describe('B-023 — the lb/kg dialogs use the locale number formatter', () => {
    it('no toFixed(1) reaches a dialog string', () => {
        const weight = read('src/screens/WeightTrackerScreen.tsx');
        expect(weight).not.toMatch(/converted: \(weight \* 0\.453592\)\.toFixed\(1\)/);
        expect(weight).toMatch(/t\('weight\.unitCheckMsg', \{ weight: num\(weight\), converted: num\(weight \* 0\.453592\) \}\)/);
        expect(weight).toMatch(/t\('weight\.highWeightMsg', \{ weight: num\(weight\), converted: num\(weight \* 0\.453592\) \}\)/);
        expect(weight).toMatch(/t\('weight\.convertedMsg', \{ original: num\(weight\), converted: num\(convertedWeight\) \}\)/);
    });
});
