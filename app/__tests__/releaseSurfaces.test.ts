/**
 * What a store reviewer (or a user in an emergency) sees on the release build.
 *
 * Jest here runs in a node environment with no component renderer, so these
 * read the screen sources, the same way releaseConfig.test.ts reads eas.json.
 * Each block pins one finding of the 2026-09-30 final-release audit.
 */
import fs from 'fs';
import path from 'path';
import { COUNTRY_OPTIONS } from '../src/utils/clinicalChecks';

const APP_DIR = path.resolve(__dirname, '..');
const read = (relative: string) => fs.readFileSync(path.join(APP_DIR, relative), 'utf8');
const LOCALES = ['fr', 'en', 'ar', 'tn'] as const;
const locale = (lng: string, file: string) =>
    JSON.parse(read(`src/i18n/locales/${lng}/${file}.json`));

describe('F-002: the emergency number follows the country, not the language', () => {
    const screens = ['ChatbotScreen', 'ContractionTimerScreen', 'HealthDashboardScreen'];

    it.each(screens)('%s resolves the number from the device region, never i18n.language', (name) => {
        const src = read(`src/screens/${name}.tsx`);
        const calls = src.match(/resolveEmergencyNumber\([^;]*\)/g) ?? [];
        expect(calls.length).toBeGreaterThan(0);
        for (const call of calls) {
            expect(call).toContain('getDeviceRegionCode()');
            expect(call).not.toContain('i18n.language');
        }
    });

    it.each(['OnboardingScreen', 'ProfileScreen'])('%s never defaults the country to Tunisia', (name) => {
        const src = read(`src/screens/${name}.tsx`);
        expect(src).not.toMatch(/useState\([^)]*'tunisia'/);
        expect(src).not.toMatch(/setCountry\([^)]*'tunisia'\)/);
        expect(src).toContain('COUNTRY_OPTIONS');
    });

    it.each(LOCALES)('%s labels every selectable country', (lng) => {
        const countries = locale(lng, 'common').countries;
        for (const c of COUNTRY_OPTIONS) {
            expect({ c, label: typeof countries[c] === 'string' && countries[c].length > 0 })
                .toEqual({ c, label: true });
        }
    });
});

describe('F-008: nothing in the app is labelled beta', () => {
    it('the assistant header has no BETA badge', () => {
        expect(read('src/screens/ChatbotScreen.tsx')).not.toMatch(/>\s*BETA\s*</);
        // …and keeps its permanent medical disclaimer.
        expect(read('src/screens/ChatbotScreen.tsx')).toContain("t('common.chatDisclaimer')");
    });

    it('the language picker does not call Tunisian a beta', () => {
        expect(read('src/screens/LanguageSelectScreen.tsx')).not.toMatch(/\(beta\)/i);
    });
});

describe('F-009: no "coming soon" dead ends', () => {
    it('the Health dashboard "See all" opens the calendar', () => {
        const src = read('src/screens/HealthDashboardScreen.tsx');
        expect(src).not.toContain('soonAvailable');
        expect(src).toContain("navigation.navigate('Calendrier', { screen: 'CalendarMain'");
    });

    it.each(LOCALES)('%s has no leftover soonAvailable copy', (lng) => {
        const dashboard = locale(lng, 'dashboard');
        expect(dashboard.soonAvailable).toBeUndefined();
        expect(dashboard.soonAvailableDesc).toBeUndefined();
    });
});

describe('F-016: developer tools stay out of the release Settings', () => {
    it('"Test notifications" only renders under __DEV__', () => {
        const src = read('src/screens/SettingsScreen.tsx');
        const call = src.indexOf('await sendTestNotification()');
        expect(call).toBeGreaterThan(-1);
        const gate = src.lastIndexOf('{__DEV__ && (', call);
        expect(gate).toBeGreaterThan(-1);
        // The gate's parenthesis must still be open where the button is rendered.
        const between = src.slice(gate + '{__DEV__ && '.length, call);
        const depth = [...between].reduce((d, ch) => d + (ch === '(' ? 1 : ch === ')' ? -1 : 0), 0);
        expect(depth).toBeGreaterThan(0);
    });
});

describe('F-019: medical content carries the medical disclaimer', () => {
    it.each(['ArticleDetailScreen', 'WeekRecommendationsScreen', 'HomeScreen'])(
        '%s renders <MedicalDisclaimer />',
        (name) => {
            expect(read(`src/screens/${name}.tsx`)).toMatch(/<MedicalDisclaimer\b/);
        },
    );

    it('onboarding step 1 (shared by the guest and account paths) states it once', () => {
        const src = read('src/screens/OnboardingScreen.tsx');
        const start = src.indexOf('const renderStep1 = () =>');
        const end = src.indexOf('const renderStep2 = () =>');
        expect(start).toBeGreaterThan(-1);
        expect(src.slice(start, end)).toContain("t('legalTerms.terms.medical')");
        expect(src.split("t('legalTerms.terms.medical')").length - 1).toBe(1);
    });

    it.each(LOCALES)('%s has both disclaimer strings', (lng) => {
        expect(locale(lng, 'dashboard').disclaimer).toMatch(/\S/);
        expect(locale(lng, 'common').legalTerms.terms.medical).toMatch(/\S/);
    });
});
