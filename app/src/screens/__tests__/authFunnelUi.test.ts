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

// ── Round 1 (Wave A adversary) ───────────────────────────────────────────────

const LOCALES = ['fr', 'en', 'ar', 'tn'];
const locale = (lng: string, file: string) => JSON.parse(read(`src/i18n/locales/${lng}/${file}.json`));

describe('A-008 — the country question is explained and required', () => {
    const src = read('src/screens/OnboardingScreen.tsx');
    it('shows why it matters and blocks step-3 Continue until answered', () => {
        expect(src).toMatch(/testID="onboarding_country_hint">\{t\('onboarding\.step3\.countryHint'\)\}/);
        expect(src).toMatch(/disabled=\{!country\}\s*testID="onboarding_step3_continue"/);
    });
    it.each(LOCALES)('%s: the hint names the emergency number, and "other" says it means 112', (lng) => {
        expect(locale(lng, 'onboarding').step3.countryHint).toMatch(/15.*190/);
        expect(locale(lng, 'common').countries.other).toContain('112');
    });
    it('never pre-selects a country from the UI language (only the device region)', () => {
        expect(src).not.toMatch(/i18n\.language[^\n]*setCountry|setCountry\([^)]*i18n\.language/);
    });
    it.each(['ContractionTimerScreen', 'ChatbotScreen'])('%s discloses a guessed number with a link to fix it', (name) => {
        const screen = read(`src/screens/${name}.tsx`);
        expect(screen).toMatch(/<EmergencyNumberNote source=\{emergencyContact\.source\} \/>/);
        expect(screen).toMatch(/emergencyNumberLabel\(t, emergencyContact\)/);
    });
});

describe('Onboarding step 4 for a signed-in account', () => {
    const src = read('src/screens/OnboardingScreen.tsx');
    it('does not offer "continue without an account" (pregnant and TTC flows)', () => {
        const skip = src.indexOf('testID="onboarding_step4_skip"');
        expect(src.lastIndexOf('{!user && (', skip)).toBeGreaterThan(src.lastIndexOf('</TouchableOpacity>', skip));
        const ttcSkip = src.indexOf('onPress={() => handleFinishTTC(false)}');
        expect(src.slice(src.lastIndexOf('{!user && (', ttcSkip), ttcSkip)).not.toMatch(/<\/TouchableOpacity>/);
    });
});

describe('A-014 / A-015 — onboarding back controls', () => {
    const src = read('src/screens/OnboardingScreen.tsx');
    it('every in-body back is a named button', () => {
        expect(src).not.toMatch(/<TouchableOpacity onPress=\{prevStep\}/);
    });
    it('the stack header back (and browser back) goes to the previous step past step 1', () => {
        expect(src).toMatch(/usePreventRemove\(step > 1, \(\) => \{\s*prevStep\(\);/);
    });
});

describe('A-016 — guest data copy is true in both Anonymous-Auth configurations', () => {
    it.each(LOCALES)('%s: a guest variant of the medical privacy note exists and claims no server account', (lng) => {
        const note = locale(lng, 'common').medicalProfile.privacyNoteGuest;
        expect(typeof note).toBe('string');
        expect(note).not.toBe(locale(lng, 'common').medicalProfile.privacyNote);
    });
    it.each(['src/screens/OnboardingScreen.tsx', 'src/screens/SettingsScreen.tsx'])('%s picks the guest note for guests', (file) => {
        expect(read(file)).toContain("t(user && !user.isGuest ? 'common.medicalProfile.privacyNote' : 'common.medicalProfile.privacyNoteGuest')");
    });
    it.each(LOCALES)('%s: AuthChoice no longer says guest data is "not saved"', (lng) => {
        const old: Record<string, string> = {
            fr: 'ne seront pas sauvegardées', en: "won't be saved", ar: 'لن يتم حفظ', tn: 'ما تتسجّلش',
        };
        expect(locale(lng, 'auth').guestDisclaimer).not.toContain(old[lng]);
    });
});

describe('A-017 / A-019 — Language screen', () => {
    it('no "translations in progress" bullets, in code or copy', () => {
        expect(read('src/screens/LanguageSelectScreen.tsx')).not.toMatch(/infoTranslationsWIP|infoFrenchComplete/);
        for (const lng of LOCALES) {
            const c = locale(lng, 'common');
            expect(c.infoTranslationsWIP).toBeUndefined();
            expect(c.infoFrenchComplete).toBeUndefined();
        }
    });
    it('English carries the same flag on the language card and the language chip', () => {
        expect(read('src/screens/LanguageSelectScreen.tsx')).toMatch(/code: 'en', name: 'English', flag: '🇬🇧'/);
        expect(read('src/components/common/LanguageSelector.tsx')).toMatch(/code: 'en', label: 'English', flag: '🇬🇧'/);
    });
});

describe('A-011 — compact EmptyState is content-sized on web', () => {
    it('does not use flex: 0 (a 0% basis on react-native-web)', () => {
        const block = read('src/components/common/EmptyState.tsx').split('containerCompact: {')[1].split('},')[0]
            .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
        expect(block).not.toMatch(/\bflex: 0\b/);
        expect(block).toMatch(/flexBasis: 'auto'/);
    });
});

describe('A-020 / A-022 — Register and Login fields', () => {
    it.each(['src/screens/RegisterScreen.tsx', 'src/screens/LoginScreen.tsx'])('%s: every placeholder is visibly a placeholder', (file) => {
        const src = read(file);
        const placeholders = (src.match(/placeholder=\{t\(/g) || []).length;
        expect(placeholders).toBeGreaterThan(0);
        expect((src.match(/placeholderTextColor=\{theme\.colors\.neutral400\}/g) || []).length).toBe(placeholders);
    });
    it('the strength meter shows a strength word, not a second wording of the rule', () => {
        const src = read('src/screens/RegisterScreen.tsx');
        expect(src).not.toMatch(/passwordHintAdd(Digit|Upper)/);
        expect(src).toMatch(/t\('passwordStrengthWeak'\)/);
        for (const lng of LOCALES) {
            const a = locale(lng, 'auth');
            for (const k of ['passwordStrengthWeak', 'passwordStrengthMedium', 'passwordStrengthStrong']) expect(a[k]).toBeTruthy();
        }
    });
});

describe('A-018 — step 4 copy', () => {
    it.each([['ar', '،'], ['tn', '،'], ['fr', ','], ['en', ',']])('%s greeting uses the right comma', (lng, comma) => {
        expect(locale(lng, 'onboarding').step4.greeting).toBe(`{{name}}${comma}`);
    });
    it('no "d\'un(e)" template artefact in French; English labels carry their article', () => {
        const fr = locale('fr', 'onboarding');
        expect(JSON.stringify(fr)).not.toContain("d'un(e)");
        expect(fr.comparisons.concombre).toBe('un concombre');
        expect(locale('en', 'onboarding').comparisons.avocat).toBe('an avocado');
    });
});

describe('A-021e — password reset never reveals whether an account exists', () => {
    it('an unknown email gets the same success message as a known one', () => {
        const src = read('src/screens/LoginScreen.tsx');
        expect(src).toMatch(/if \(error\?\.code === 'auth\/user-not-found'\) \{\s*setSuccess\(t\('resetEmailSent'\)\);/);
    });
});

describe('A-010 — post-term on Home', () => {
    it('Home keeps the week-40 content and adds the post-term note with the real SA; "did you deliver?" stays for > 42+0 only', () => {
        const src = read('src/screens/HomeScreen.tsx');
        expect(src).toMatch(/\{isPostTerm && completedWeeks != null && completedDays != null && \(\s*<View style=\{styles\.postpartumBanner\} testID="home_postterm_note">/);
        expect(src).toMatch(/t\('home\.postTermNote', \{ ga: formatGestationalAge\(t, completedWeeks, completedDays\) \}\)/);
        expect(src).toMatch(/\{isInvalid && \(\s*<View style=\{styles\.postpartumBanner\}>/);
    });
});
