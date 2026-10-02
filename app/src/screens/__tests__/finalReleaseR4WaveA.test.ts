/**
 * Final-release round 4, Wave A polish (A-034, A-035, A-037, A-038, A-039, A-040).
 * Source-level wiring, like finalReleaseR3Polish.test.ts: the screens are .tsx and the
 * repo ships no React renderer. A-036 (French no-break spaces) is in
 * src/i18n/__tests__/frTypography.test.ts.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveButtonVariant } from '../../components/common/Button.helpers';
import { styles as onboardingStyles } from '../OnboardingScreen.styles';
import { theme } from '../../theme';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
const LOCALES = ['fr', 'en', 'ar', 'tn'];
const locale = (lang: string, file: string) => JSON.parse(read(`src/i18n/locales/${lang}/${file}`));

const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

describe('A-034 — the disabled "continue without an account" link stays readable', () => {
    const src = read('src/screens/OnboardingScreen.tsx');

    it('is no longer dimmed with the 0.6 opacity', () => {
        expect(src).not.toMatch(/styles\.skipAccountButton, [^\]]*styles\.startButtonDisabled/);
        expect((onboardingStyles.skipAccountButton as { opacity?: number }).opacity).toBeUndefined();
    });

    it('takes the disabled save button\'s grey instead, in both flows', () => {
        const disabledText = /<Text style=\{\[styles\.skipAccountText, \(loading \|\| !healthConsent\) && styles\.skipAccountTextDisabled\]\}>/g;
        expect(src.match(disabledText)).toHaveLength(2);
        const color = onboardingStyles.skipAccountTextDisabled.color as string;
        expect(color).toBe(resolveButtonVariant('primary', true).textColor);
        expect(contrast(color, theme.colors.white)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(color, theme.colors.background)).toBeGreaterThanOrEqual(4.5);
    });
});

describe('A-035 / A-038 — the export button says what it exports, and fits', () => {
    it('a shared Button label wraps to a second, centred line instead of being cut', () => {
        const button = read('src/components/common/Button.tsx');
        expect(button).toMatch(/numberOfLines=\{2\}/);
        expect(button).not.toMatch(/numberOfLines=\{1\}/);
        expect(button).toMatch(/text: \{\s*fontWeight: '600',\s*textAlign: 'center',/);
    });

    it.each([
        ['fr', 'Exporter mes données'],
        ['en', 'Export my data'],
        ['ar', 'تصدير بياناتي'],
        ['tn', 'صدّر الداتا متاعي'],
    ])('%s: "%s" — the verb and its object, short enough for one line at 320pt', (lang, label) => {
        const value = locale(lang, 'common.json').privacyData.export;
        expect(value).toBe(label);
        expect(value.split(' ').length).toBeGreaterThanOrEqual(2);
        // 280pt button − 2 × 24pt padding leaves about 25 semi-bold 16pt characters.
        expect(value.length).toBeLessThanOrEqual(22);
    });

    it('the dialogs quote the label through {{exportLabel}}, never a hardcoded copy', () => {
        for (const lang of LOCALES) {
            const profile = locale(lang, 'profile.json');
            expect(profile.exportFirstHere).toContain('{{exportLabel}}');
            expect(JSON.stringify(profile)).not.toContain('(JSON)');
        }
        expect(read('src/hooks/useAccountDeletion.tsx')).toMatch(/exportLabel: t\('common\.privacyData\.export'\)/);
    });

    it('tn step 4 names the password with one word in the field and in its helper line', () => {
        const word = 'كلمة المرور';
        expect(locale('tn', 'onboarding.json').step4.passwordPlaceholder).toBe(word);
        expect(locale('tn', 'auth.json').passwordMin.startsWith(word)).toBe(true);
    });
});

describe('A-037 — the emergency call row wraps centred', () => {
    it.each(['src/screens/ContractionTimerScreen.tsx', 'src/screens/RamadanPregnancyScreen.tsx'])('%s', (file) => {
        expect(read(file)).toMatch(/callText: \{[^}]*textAlign: 'center'[^}]*\}/);
    });
});

describe('A-039 — past the due date Home no longer says the big day is coming', () => {
    const home = read('src/screens/HomeScreen.tsx');

    it('her own week past 40+0 swaps the week-40 title for the post-term line, and hides it beyond 42+0', () => {
        expect(home).toMatch(/const isPastDueToday = overrideWeek === null && \(isPostTerm \|\| isInvalid\);/);
        expect(home).toMatch(/\{!\(isPastDueToday && isInvalid\) && \(\s*<Text style=\{styles\.weekSubtitle\}>\s*\{isPastDueToday\s*\? t\('home\.postTermTitle'\)\s*: cleanTitle\./);
    });

    it('the baby-message footer names her real week and day past term', () => {
        expect(home).toMatch(/week=\{isPastDueToday && todayAge \? todayAge\.week : currentWeekNumber\}/);
        expect(home).toMatch(/day=\{isPastDueToday && todayAge \? todayAge\.day : overrideDay \|\| currentDay\}/);
    });

    it.each(LOCALES)('%s: the post-term title exists and does not announce an approaching day', (lang) => {
        const title = locale(lang, 'home.json').postTermTitle;
        expect(title).toBeTruthy();
        expect(title).not.toMatch(/approche|approach|يقترب/i);
    });
});

describe('A-040 — step 4 prints the week and day Home prints', () => {
    const src = read('src/screens/OnboardingScreen.tsx');

    it('uses Home\'s labels and the day of pregnancy, not an uppercase day-of-week', () => {
        expect(src).toMatch(/const \{ week: displayWeek, dayOfPregnancy \} = displayedPregnancyAge\(/);
        expect(src).toMatch(/\{t\('common\.week'\)\} \{displayWeek\}<\/Text>\s*<Text style=\{styles\.dayNumber\}>\{t\('home\.day'\)\} \{dayOfPregnancy\}<\/Text>/);
        expect(read('src/components/home/BabyGrowthCard.tsx')).toMatch(/\{t\('home\.day'\)\} \{dayOfPregnancy\}/);
        expect(src).not.toMatch(/weekCaps|dayCaps/);
    });

    it.each(LOCALES)('%s: the uppercase-only keys are gone and the shared labels exist', (lang) => {
        const step4 = locale(lang, 'onboarding.json').step4;
        expect(step4.weekCaps).toBeUndefined();
        expect(step4.dayCaps).toBeUndefined();
        expect(locale(lang, 'common.json').week).toBeTruthy();
        expect(locale(lang, 'home.json').day).toBeTruthy();
    });

    it('fr and en use sentence case, as on Home', () => {
        expect(locale('fr', 'common.json').week).toBe('Semaine');
        expect(locale('fr', 'home.json').day).toBe('Jour');
        expect(locale('en', 'common.json').week).toBe('Week');
        expect(locale('en', 'home.json').day).toBe('Day');
    });
});
