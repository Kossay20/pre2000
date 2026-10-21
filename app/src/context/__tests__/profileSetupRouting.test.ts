/**
 * Register → Onboarding (final-release Wave A, P0).
 *
 * BUG: after `createUserWithEmailAndPassword` the auth listener installed a minimal
 * profile (uid + email, no pregnancy date), App.tsx swapped AuthStack for MainTabs on
 * any non-null user, and RegisterScreen's navigate('Onboarding') had nowhere to go.
 * The new account landed on a Home with "no data available", no userProfiles
 * document was ever written, and every later device saw the same empty Home.
 *
 * FIX: the root navigator routes a signed-in user without a pregnancy anchor to
 * Onboarding (`needsProfileSetup`); `register()` installs the placeholder itself; a
 * caller that writes the profile itself (Onboarding step 4, guest upgrade) holds the
 * placeholder back (`resolveSessionProfile` → null); an upgraded guest's profile is
 * written to Firestore (`toServerProfile`).
 *
 * Pure helpers are tested behaviourally (same Option-C strategy as
 * AuthContext.login.test.ts — AuthContext.tsx itself cannot load under Jest); the
 * wiring into AuthContext / App.tsx / the screens is locked by source guards, the
 * pattern AuthContext.gdpr.test.ts uses.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    buildMinimalProfile,
    needsProfileSetup,
    resolveLoginProfile,
    resolveSessionProfile,
    toServerProfile,
} from '../loginHelpers';
import type { UserProfile } from '../../types';

const fakeDocSnap = (exists: boolean, data: Record<string, unknown> = {}) => ({
    exists: () => exists,
    data: () => data,
});
const fbUser = { uid: 'uid_new', email: 'new@example.com' };
const LMP = '2026-02-25T00:00:00.000Z';

const guestProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
    uid: 'guest_1700000000000',
    firstName: 'Amina',
    pregnancyStartDate: LMP,
    lmp: LMP,
    currentWeek: 32,
    country: 'france',
    isGuest: true,
    ...overrides,
});

describe('needsProfileSetup — the routing predicate', () => {
    it('is false when nobody is signed in (AuthStack handles that)', () => {
        expect(needsProfileSetup(null)).toBe(false);
        expect(needsProfileSetup(undefined)).toBe(false);
    });

    it('is TRUE for the placeholder a fresh registration gets', () => {
        expect(needsProfileSetup(buildMinimalProfile(fbUser))).toBe(true);
    });

    it('is true for a partial document with no pregnancy anchor (older builds, locale-only writes)', () => {
        const { profile } = resolveLoginProfile(fakeDocSnap(true, { locale: 'fr', updatedAt: 'x' }), fbUser);
        expect(needsProfileSetup(profile)).toBe(true);
    });

    it('is false once onboarding stored an anchor — pregnant, TTC (last period) or curious (synthetic date)', () => {
        expect(needsProfileSetup(guestProfile())).toBe(false);
        expect(needsProfileSetup({ pregnancyStartDate: LMP } as UserProfile)).toBe(false);
        expect(needsProfileSetup({ lmp: LMP } as UserProfile)).toBe(false);
        expect(needsProfileSetup(guestProfile({ isTTC: true, currentWeek: 0 }))).toBe(false);
        expect(needsProfileSetup(guestProfile({ isCurious: true, exploreWeek: 20 }))).toBe(false);
    });

    it('is false for a returning account whose document has only the legacy lmp field', () => {
        const { profile } = resolveLoginProfile(fakeDocSnap(true, { lmp: LMP, firstName: 'Sara' }), fbUser);
        expect(needsProfileSetup(profile)).toBe(false);
    });
});

describe('buildMinimalProfile', () => {
    it('carries uid + email, no anchor, and is NOT a guest (writes must go to Firestore)', () => {
        const p = buildMinimalProfile(fbUser);
        expect(p.uid).toBe('uid_new');
        expect(p.email).toBe('new@example.com');
        expect(p.isGuest).toBe(false);
        expect(p.pregnancyStartDate).toBeUndefined();
        expect(p.lmp).toBeUndefined();
    });

    it('maps a null email to undefined', () => {
        expect(buildMinimalProfile({ uid: 'u', email: null }).email).toBeUndefined();
    });
});

describe('resolveSessionProfile — what the auth listener / login() install', () => {
    it('fresh account, nobody writing the profile → minimal placeholder (→ Onboarding)', () => {
        const r = resolveSessionProfile(fakeDocSnap(false), fbUser, null, false);
        expect(r?.isMinimal).toBe(true);
        expect(needsProfileSetup(r!.profile)).toBe(true);
    });

    it('login on a NEW device of an account registered through the broken path → Onboarding', () => {
        // No document on the server and nothing cached on this device.
        const r = resolveSessionProfile(fakeDocSnap(false), fbUser, null, false);
        expect(needsProfileSetup(r!.profile)).toBe(true);
    });

    it('profile being written by the caller (Onboarding step 4 / guest upgrade) → null: leave the user alone', () => {
        expect(resolveSessionProfile(fakeDocSnap(false), fbUser, null, true)).toBeNull();
    });

    it('guest upgrade by new account: the listener must not clobber the guest profile cached under the OLD uid', () => {
        // Cache still holds the guest uid → resolveLoginProfile alone would return the placeholder.
        const cached = guestProfile();
        expect(resolveLoginProfile(fakeDocSnap(false), fbUser, cached).isMinimal).toBe(true);
        // With the upgrade in flight the listener leaves the in-memory guest profile in place.
        expect(resolveSessionProfile(fakeDocSnap(false), fbUser, cached, true)).toBeNull();
    });

    it('guest upgrade, listener late: adopts the promoted profile upgradeGuest cached under the new uid', () => {
        const promoted = guestProfile({ uid: fbUser.uid, isGuest: false });
        const r = resolveSessionProfile(fakeDocSnap(false), fbUser, promoted, false);
        expect(r?.isMinimal).toBe(false);
        expect(r?.profile).toBe(promoted);
        expect(needsProfileSetup(r!.profile)).toBe(false);
    });

    it('an existing complete document is installed when nobody is writing the profile', () => {
        const r = resolveSessionProfile(fakeDocSnap(true, { lmp: LMP, firstName: 'Sara' }), fbUser, null, false);
        expect(r?.isMinimal).toBe(false);
        expect(r?.profile.pregnancyStartDate).toBe(LMP);
    });

    it('A-023: even an existing document is left to the caller while pending — Onboarding must ask keep/replace before anything is installed', () => {
        expect(resolveSessionProfile(fakeDocSnap(true, { lmp: LMP, firstName: 'Sara' }), fbUser, null, true)).toBeNull();
    });
});

describe('toServerProfile — the upgraded guest profile written to userProfiles/{uid}', () => {
    const NOW = '2026-09-30T12:00:00.000Z';

    it('writes the pregnancy anchor, name, country, timestamps and a due date', () => {
        const data = toServerProfile(guestProfile(), NOW);
        expect(data).toMatchObject({
            firstName: 'Amina',
            lmp: LMP,
            pregnancyStartDate: LMP,
            country: 'france',
            createdAt: NOW,
            updatedAt: NOW,
            dpa: '2026-12-02T00:00:00.000Z',
        });
    });

    it('never writes client-only fields (uid, isGuest, email, currentWeek)', () => {
        const data = toServerProfile(guestProfile({ email: 'a@b.c' }), NOW);
        for (const k of ['uid', 'isGuest', 'email', 'currentWeek']) expect(data).not.toHaveProperty(k);
    });

    it('contains no undefined values (Firestore rejects them)', () => {
        const data = toServerProfile(guestProfile({ lastName: undefined, city: undefined }), NOW);
        expect(Object.values(data).every((v) => v !== undefined)).toBe(true);
        expect(data).not.toHaveProperty('lastName');
    });

    it('keeps TTC and curious markers, and never invents a due date for TTC', () => {
        const ttc = toServerProfile(guestProfile({ isTTC: true, cycleLength: 28, currentWeek: 0 }), NOW);
        expect(ttc).toMatchObject({ isTTC: true, cycleLength: 28 });
        expect(ttc).not.toHaveProperty('dpa');
        const curious = toServerProfile(guestProfile({ isCurious: true, exploreWeek: 20 }), NOW);
        expect(curious).toMatchObject({ isCurious: true, exploreWeek: 20 });
    });

    it('carries declared medical flags (the glucose reminder depends on them)', () => {
        const data = toServerProfile(
            guestProfile({ hasGestationalDiabetes: true, hasHypertension: false, medicalProfileAnsweredAt: NOW }),
            NOW,
        );
        expect(data).toMatchObject({ hasGestationalDiabetes: true, hasHypertension: false, medicalProfileAnsweredAt: NOW });
    });
});

// ── Wiring guards ────────────────────────────────────────────────────────────

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');

describe('wiring — register lands on Onboarding, profile written under the account', () => {
    const auth = read('src/context/AuthContext.tsx');
    const block = (from: string, to: string) => auth.slice(auth.indexOf(from), auth.indexOf(to));

    it('App.tsx routes a signed-in user without a profile to ProfileSetupStack, not MainTabs', () => {
        const app = read('App.tsx');
        expect(app).toMatch(/import\s*\{\s*needsProfileSetup\s*\}\s*from\s*'\.\/src\/context\/loginHelpers'/);
        // The same stack also hosts the health-data consent question (needsHealthDataConsent),
        // so it opens on Onboarding exactly when the profile is missing.
        expect(app).toMatch(/user\s*\?\s*\(\s*needsProfileSetup\(user\)\s*\|\|\s*needsHealthDataConsent\(user\)\s*\?\s*<ProfileSetupStack[\s\S]*?initialRouteName=\{needsProfileSetup\(user\) \? 'Onboarding' : 'HealthDataConsent'\}\s*\/>\s*:\s*<MainTabs\s*\/>\s*\)\s*:\s*<AuthStack\s*\/>/);
        const setup = app.slice(app.indexOf('const ProfileSetupStack'), app.indexOf('const HomeStack'));
        expect(setup).toMatch(/name="Onboarding"\s+component=\{OnboardingScreen\}/);
    });

    it('register() installs the minimal placeholder unless the caller writes the profile itself', () => {
        const reg = block('const register = async', 'const upgradeGuest = async');
        expect(reg).toMatch(/if \(!opts\?\.profileFollows\) \{[\s\S]*buildMinimalProfile\(userCredential\.user\)[\s\S]*setUser\(minimal\)/);
        expect(reg).toMatch(/if \(opts\?\.profileFollows\) profileSetupPendingRef\.current = true/);
    });

    it('the auth listener and login() both resolve through resolveSessionProfile with the pending flag', () => {
        expect(auth).toMatch(/resolveSessionProfile\(docSnap, fbUser, cached, profileSetupPendingRef\.current\)/);
        const login = block('const login = async', 'const loginAsGuest = async');
        expect(login).toMatch(/resolveSessionProfile\(docSnap, userCredential\.user, null, !!opts\?\.profileFollows\)/);
    });

    it('loginAsGuest clears the pending flag whatever happens, and uses the live session before going anonymous', () => {
        const lag = block('const loginAsGuest = async', 'const logout = async');
        expect(lag).toMatch(/finally \{\s*profileSetupPendingRef\.current = false;/);
        expect(lag).toMatch(/authenticatedUser \|\| firebaseUser \|\| auth\.currentUser/);
        expect(lag).toMatch(/profileData\.isCurious = true/);
    });

    it('upgradeGuest keeps the guest profile and writes it to Firestore under the new uid', () => {
        const up = block('const upgradeGuest = async', 'const login = async');
        expect(up).toMatch(/profileSetupPendingRef\.current = true/);
        expect(up).toMatch(/setDoc\(\s*doc\(db, 'userProfiles', upgraded\.uid\),\s*toServerProfile\(promoted/);
        expect(up).toMatch(/finally \{\s*profileSetupPendingRef\.current = false;/);
    });

    it('Onboarding tells register/login that it writes the profile itself (both flows)', () => {
        const onb = read('src/screens/OnboardingScreen.tsx');
        expect(onb.match(/register\(email\.trim\(\), password, \{ profileFollows: true \}\)/g)).toHaveLength(2);
        expect(onb.match(/login\(email\.trim\(\), password, \{ profileFollows: true \}\)/g)).toHaveLength(2);
    });

    it('the auth listener leaves the profile to a pending caller, whatever the document holds (A-023)', () => {
        const listener = auth.slice(auth.indexOf('onAuthStateChanged(auth'), auth.indexOf('const register = async'));
        expect(listener).toMatch(/await getDoc\(doc\(db, 'userProfiles', fbUser\.uid\)\);\s*if \(profileSetupPendingRef\.current\) \{[\s\S]*?return;/);
    });

    it('A-023: Onboarding asks before replacing an existing profile, and loginAsGuest only overwrites on replaceExisting', () => {
        const onb = read('src/screens/OnboardingScreen.tsx');
        expect(onb).toMatch(/const confirmReplaceExistingProfile = async/);
        expect(onb.match(/replaceExisting = await confirmReplaceExistingProfile\(authenticatedUser\.uid\)/g)).toHaveLength(2);
        expect(onb.match(/\{ replaceExisting, healthDataConsent: recordHealthDataConsent\(\) \},/g)).toHaveLength(2);
        const lag = block('const loginAsGuest = async', 'const logout = async');
        expect(lag).toMatch(/if \(!opts\?\.replaceExisting && shouldPreserveExistingProfile\(existingSnap\)\)/);
        // Replacing keeps createdAt and clears the mode fields a merge would leave behind.
        expect(lag).toMatch(/if \(opts\?\.replaceExisting\) \{\s*[\s\S]*?delete profileData\.createdAt;/);
    });

    it('RegisterScreen no longer races the root navigator with navigate(\'Onboarding\')', () => {
        const reg = read('src/screens/RegisterScreen.tsx');
        expect(reg).not.toMatch(/navigation\s*\.navigate\('Onboarding'\)/);
        expect(reg).not.toMatch(/routeNames\?\.includes\('Onboarding'\)/);
    });
});
