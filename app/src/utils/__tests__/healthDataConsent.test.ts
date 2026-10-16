/**
 * Explicit consent to the processing of pregnancy/health data (GDPR art. 9, Apple 5.1.1,
 * Play health-apps policy). Nobody was ever asked: registration linked to the policy and
 * onboarding showed a medical disclaimer, nothing more.
 *
 * The pure helpers are tested behaviourally. The screens and AuthContext are .tsx that
 * ts-jest cannot load under the Expo tsconfig, so their wiring is locked at source level,
 * the pattern authFunnelUi.test.ts and AuthContext.gdpr.test.ts use.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    HEALTH_DATA_CONSENT_VERSION,
    isValidHealthDataConsent,
    needsHealthDataConsent,
    recordHealthDataConsent,
} from '../healthDataConsent';
import { toServerProfile } from '../../context/loginHelpers';
import type { UserProfile } from '../../types';

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
const LMP = '2026-02-25T00:00:00.000Z';
const CONSENT = { version: HEALTH_DATA_CONSENT_VERSION, at: '2026-09-30T08:00:00.000Z' };

describe('the consent record', () => {
    it('is the policy version plus the moment of the tick', () => {
        expect(recordHealthDataConsent(new Date('2026-09-30T08:00:00.000Z'))).toEqual(CONSENT);
        expect(HEALTH_DATA_CONSENT_VERSION).toBe('2026-10-16');
    });

    it('accepts only a complete, bounded record', () => {
        expect(isValidHealthDataConsent(CONSENT)).toBe(true);
        expect(isValidHealthDataConsent(undefined)).toBe(false);
        expect(isValidHealthDataConsent(true)).toBe(false);
        expect(isValidHealthDataConsent({ version: HEALTH_DATA_CONSENT_VERSION })).toBe(false);
        expect(isValidHealthDataConsent({ ...CONSENT, at: '' })).toBe(false);
        expect(isValidHealthDataConsent({ ...CONSENT, at: 'not a date' })).toBe(false);
        expect(isValidHealthDataConsent({ ...CONSENT, version: 'x'.repeat(41) })).toBe(false);
    });
});

describe('needsHealthDataConsent — gating', () => {
    it('is false while there is no profile, or it is still in onboarding (asked there)', () => {
        expect(needsHealthDataConsent(null)).toBe(false);
        expect(needsHealthDataConsent({})).toBe(false);
    });

    it('is true for a finished profile saved before the question existed', () => {
        expect(needsHealthDataConsent({ lmp: LMP })).toBe(true);
        expect(needsHealthDataConsent({ pregnancyStartDate: LMP })).toBe(true);
        expect(needsHealthDataConsent({ lmp: LMP, healthDataConsent: { version: '' } })).toBe(true);
    });

    it('is false once she has consented', () => {
        expect(needsHealthDataConsent({ lmp: LMP, healthDataConsent: CONSENT })).toBe(false);
    });
});

describe('persistence', () => {
    it('a guest upgrading to an account carries her consent to the server profile', () => {
        const guest = {
            uid: 'guest_1', firstName: 'Amira', country: 'France', lmp: LMP, pregnancyStartDate: LMP,
            currentWeek: 32, isGuest: true, healthDataConsent: CONSENT,
        } as UserProfile;
        expect(toServerProfile(guest, '2026-09-30T09:00:00.000Z').healthDataConsent).toEqual(CONSENT);
    });

    const auth = read('src/context/AuthContext.tsx');

    it('onboarding writes the consent to userProfiles, not only to the device', () => {
        const payload = auth.slice(
            auth.indexOf('const profileData: Record<string, any> = {'),
            auth.indexOf("await setDoc(doc(db, 'userProfiles', uid), profileData"),
        );
        expect(payload).toMatch(/profileData\.healthDataConsent = /);
        const newUser = auth.slice(auth.indexOf('const newUser: UserProfile = {'), auth.indexOf('try {', auth.indexOf('const newUser: UserProfile = {')));
        expect(newUser).toMatch(/\.\.\.consentFields,/);
        expect(auth).toMatch(/const consentFields: \{ healthDataConsent\?: HealthDataConsent \} = isValidHealthDataConsent\(consent\)/);
    });

    it('an existing profile kept on re-onboarding records the consent just given', () => {
        const adopt = auth.slice(auth.indexOf('const adopted = {'), auth.indexOf("log.info('[AuthContext] ↩️ W1 #3"));
        expect(adopt).toMatch(/healthDataConsent/);
        expect(adopt).toMatch(/setDoc\(doc\(db, 'userProfiles', uid\), \{ healthDataConsent/);
    });
});

describe('the question is asked before the profile is saved — every path', () => {
    const onb = read('src/screens/OnboardingScreen.tsx');

    it('starts unticked', () => {
        expect(onb).toMatch(/const \[healthConsent, setHealthConsent\] = useState\(false\);/);
    });

    it.each([
        // Account / signed-in button, and the "without an account" one where there is one.
        ['pregnant', 'const renderStep4 = ', 'const renderStep2TTC = ', 2],
        ['trying', 'const renderStep3TTC = ', 'const renderStep2Curious = ', 2],
        ['curious', 'const renderStep3Curious = ', 'const handleFinishTTC = ', 1],
    ] as const)('%s: the final step shows the checkbox and every save button waits for it', (_flow, from, to, buttons) => {
        const step = onb.slice(onb.indexOf(from), onb.indexOf(to));
        expect(step).toContain('<HealthDataConsentCheck');
        const saves = [...step.matchAll(/onPress=\{\(\) => handleFinish\w*\(.*\)\}\s*\n\s*disabled=\{(.*)\}\s*\n/g)];
        expect(saves).toHaveLength(buttons);
        for (const [, disabled] of saves) expect(disabled).toMatch(/!healthConsent/);
    });

    it.each(['handleFinish = ', 'handleFinishTTC = ', 'handleFinishCurious = '])(
        '%s refuses to save without it and passes the record on',
        (fn) => {
            const at = onb.indexOf(`const ${fn}`);
            const body = onb.slice(at, onb.indexOf('\n    };\n', at));
            expect(body).toMatch(/if \(!healthConsent\) return;/);
            expect(body).toMatch(/healthDataConsent: recordHealthDataConsent\(\)/);
        },
    );

    it('is a real checkbox: role, checked state on native and web, 44pt target', () => {
        const src = read('src/components/common/HealthDataConsentCheck.tsx');
        expect(src).toMatch(/accessibilityRole="checkbox"/);
        expect(src).toMatch(/accessibilityState=\{\{ checked,/);
        expect(src).toMatch(/'aria-checked': checked/);
        expect(src).toMatch(/minHeight: 44/);
        expect(src).toMatch(/navigate\('PrivacyPolicy'\)/);
    });
});

describe('profiles saved before the question — blocking sheet', () => {
    const app = read('App.tsx');

    it('routes them to the consent screen before Home', () => {
        expect(app).toMatch(/needsProfileSetup\(user\) \|\| needsHealthDataConsent\(user\)/);
        const stack = app.slice(app.indexOf('const ProfileSetupStack'), app.indexOf('const HomeStack'));
        expect(stack).toContain('name="HealthDataConsent"');
        // The policy must be readable from both setup screens.
        expect(stack).toContain('name="PrivacyPolicy"');
    });

    it('declining offers the existing erase flow, or sign-out for an account', () => {
        const src = read('src/screens/HealthDataConsentScreen.tsx');
        // Same hook as Profile and Settings; here the export button is on the sheet itself.
        expect(src).toMatch(/useAccountDeletion\(\{ exportOnThisScreen: true \}\)/);
        expect(src).toMatch(/user\?\.isGuest \? requestResetProfile : requestDeleteAccount/);
        expect(src).toMatch(/onPress=\{logout\}/);
        expect(src).toMatch(/updateProfile\(\{ healthDataConsent: recordHealthDataConsent\(\) \}\)/);
        expect(src).toMatch(/disabled=\{!checked \|\| saving\}/);
    });
});

describe('copy', () => {
    const LOCALES = ['fr', 'en', 'ar', 'tn'];
    const keys = (lang: string) =>
        Object.keys(JSON.parse(read(`src/i18n/locales/${lang}/onboarding.json`)).healthConsent ?? {}).sort();

    it('exists in all four locales with the same keys', () => {
        const fr = keys('fr');
        expect(fr).toEqual(expect.arrayContaining(['label', 'policyLink', 'hint', 'sheetTitle', 'sheetText']));
        for (const lang of LOCALES) expect({ lang, keys: keys(lang) }).toEqual({ lang, keys: fr });
    });

    it('the privacy policy describes this consent and how to withdraw it', () => {
        for (const lang of LOCALES) {
            const p = JSON.parse(read(`src/i18n/locales/${lang}/common.json`)).privacy;
            expect(p.usage.consent.length).toBeGreaterThan(0);
            expect(p.rights.consentDesc).toContain('{{deleteFromSettings}}');
            expect(p.rights.consentDesc).toContain('{{eraseGuest}}');
            expect(p.rights.consentDesc).toContain('{{medical}}');
        }
        expect(read('src/screens/PrivacyPolicyScreen.tsx')).toContain("t('privacy.usage.consent')");
    });
});
