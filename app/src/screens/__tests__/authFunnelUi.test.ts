/**
 * Auth funnel UI guards (final-release Wave A: GJ-006, GJ-008, forgot-password label,
 * onboarding choice state). These screens are .tsx with JSX, which ts-jest cannot load
 * under the Expo tsconfig (jsx: react-native / module: preserve) and the repo ships no
 * React renderer — so, like AuthContext.gdpr.test.ts, the fixes are locked at source
 * level, plus a behavioural check on the locale files.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');

describe('GJ-006 — Language: Continue is always on screen', () => {
    const src = read('src/screens/LanguageSelectScreen.tsx');

    it('renders Continue in a footer AFTER the ScrollView, not at the end of the scrolled list', () => {
        const scrollEnd = src.indexOf('</ScrollView>');
        const continueAt = src.indexOf("t('common.continue')");
        expect(scrollEnd).toBeGreaterThan(-1);
        expect(continueAt).toBeGreaterThan(scrollEnd);
        expect(src.slice(scrollEnd, continueAt)).toMatch(/style=\{\[styles\.footer/);
    });

    it('pads the footer for the home indicator', () => {
        expect(src).toMatch(/paddingBottom: Math\.max\(insets\.bottom, 12\)/);
    });
});

describe('GJ-008 — one back control on Register / Login, never named after a route', () => {
    it.each(['src/screens/RegisterScreen.tsx', 'src/screens/LoginScreen.tsx'])(
        '%s shows its in-body back only when the stack header cannot go back',
        (file) => {
            const src = read(file);
            expect(src).toMatch(/const showInlineBack = !navigation\.canGoBack\(\);/);
            const backAt = src.indexOf('<RtlAwareChevron direction="back"');
            expect(src.lastIndexOf('{showInlineBack && (', backAt)).toBeGreaterThan(-1);
            expect(src.slice(src.lastIndexOf('{showInlineBack && (', backAt), backAt)).toMatch(/accessibilityLabel=\{t\('common\.back'\)\}/);
        },
    );

    it('AuthStack titles the screens the header back is named after', () => {
        const app = read('App.tsx');
        const authStack = app.slice(app.indexOf('const AuthStack'), app.indexOf('const ProfileSetupStack'));
        expect(authStack).toMatch(/name="Language"[^>]*title: t\('common\.chooseLanguage'\)/);
        expect(authStack).toMatch(/name="AuthChoice"[^>]*title: t\('startJourney'\)/);
        expect(authStack).toMatch(/\.\.\.localizedHeaderBack\(t\)/);
    });

    it('every stack takes its back button from localizedHeaderBack (no bare headerBackTitle left)', () => {
        const app = read('App.tsx');
        expect(app).not.toMatch(/headerBackTitle:/);
        // Auth, ProfileSetup, Home, Resources, Calendar, Reminders.
        expect(app.match(/\.\.\.localizedHeaderBack\(t\)/g)).toHaveLength(6);
    });

    it('the web header back is named with the localized word, not "<route>, back"', () => {
        const src = read('src/navigation/headerBack.tsx');
        expect(src).toMatch(/const label = t\('common\.back'\);/);
        expect(src).toMatch(/headerBackTitle: label/);
        expect(src).toMatch(/accessibilityLabel=\{label\}/);
        expect(src).toMatch(/canGoBack \? <WebHeaderBack/);
    });
});

describe('Forgot password — in-flight state', () => {
    const src = read('src/screens/LoginScreen.tsx');

    it('shows a spinner and a localized label, never a bare "…"', () => {
        expect(src).not.toMatch(/defaultValue: '…'/);
        expect(src).toMatch(/resetLoading && <ActivityIndicator/);
        expect(src).toMatch(/resetLoading \? t\('sendingResetEmail'\) : t\('forgotPassword'\)/);
        expect(src).toMatch(/disabled=\{resetLoading\}/);
    });

    it.each(['fr', 'en', 'ar', 'tn'])('%s has a real sendingResetEmail string', (lng) => {
        const auth = JSON.parse(read(`src/i18n/locales/${lng}/auth.json`));
        expect(typeof auth.sendingResetEmail).toBe('string');
        expect(auth.sendingResetEmail.replace(/[.…\s]/g, '').length).toBeGreaterThan(2);
    });
});

describe('Onboarding single-choice options expose their selected state on web too', () => {
    const src = read('src/screens/OnboardingScreen.tsx');

    it('defines choiceA11y with aria-pressed on web', () => {
        expect(src).toMatch(/const choiceA11y = \(selected: boolean\) => \(\{\s*accessibilityState: \{ selected \},\s*\.\.\.\(Platform\.OS === 'web' \? \{ 'aria-pressed': selected \} : \{\}\),/);
    });

    it('age range and country buttons use it', () => {
        expect(src).toMatch(/\{\.\.\.choiceA11y\(ageRange === range\)\}/);
        expect(src).toMatch(/\{\.\.\.choiceA11y\(country === item\.value\)\}/);
    });

    it('no single-choice option is left with the native-only accessibilityState.selected', () => {
        expect(src).not.toMatch(/accessibilityState=\{\{ selected:/);
    });
});
