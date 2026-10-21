/**
 * Wave D (final-release) — profile writes, logout races, guest-only fields, account language.
 *
 * The contract lives in profileSync.ts and is tested behaviourally; AuthContext.tsx cannot
 * load under Jest (JSX + module:preserve), so its wiring to that contract is locked by source
 * guards, the pattern AuthContext.gdpr.test.ts uses.
 */
import * as fs from 'fs';
import * as path from 'path';

jest.mock('firebase/firestore', () => ({ deleteField: () => '__DELETE_FIELD__' }));

import {
    accountLocaleToApply,
    changedFormFields,
    commitProfileUpdate,
    createSessionEpoch,
    guestLocalFields,
    installSessionProfile,
    splitProfileUpdate,
} from '../profileSync';
import { toServerProfile } from '../loginHelpers';
import type { UserProfile } from '../../types';

const LMP = '2026-02-25T00:00:00.000Z';
const account = (overrides: Partial<UserProfile> = {}): UserProfile => ({
    uid: 'uid_1',
    firstName: 'Leila',
    lastName: 'Ben',
    pregnancyStartDate: LMP,
    lmp: LMP,
    currentWeek: 32,
    country: 'france',
    isGuest: false,
    ...overrides,
});

const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
};

describe('HYP-D1 — an emptied optional field is cleared on the server, not sent as undefined', () => {
    it('splitProfileUpdate turns undefined into deleteField() and drops the key locally', () => {
        const { local, server } = splitProfileUpdate(account(), { firstName: 'Amira', lastName: undefined });
        expect(server).toEqual({ firstName: 'Amira', lastName: '__DELETE_FIELD__' });
        expect(Object.values(server)).not.toContain(undefined);
        expect(local).not.toHaveProperty('lastName');
        expect(local.firstName).toBe('Amira');
    });

    it('never sends client-only fields (uid, isGuest, currentWeek) to the server', () => {
        const { server, local } = splitProfileUpdate(account(), { currentWeek: 33, uid: 'x', isGuest: false, country: 'tunisia' });
        expect(server).toEqual({ country: 'tunisia' });
        expect(local.currentWeek).toBe(33);
    });

    it('a refused server write changes nothing on the device and reports the failure', async () => {
        const writeLocal = jest.fn();
        const res = await commitProfileUpdate({
            current: account(),
            data: { lastName: undefined },
            writeServer: () => Promise.reject(new Error('permission-denied')),
            writeLocal,
            isStillCurrent: () => true,
        });
        expect(res).toEqual({ ok: false, error: 'permission-denied' });
        expect(writeLocal).not.toHaveBeenCalled();
    });

    it('writes the server before the device, with updatedAt, and returns the saved profile', async () => {
        const order: string[] = [];
        let sent: Record<string, unknown> = {};
        const res = await commitProfileUpdate({
            current: account(),
            data: { lastName: undefined },
            writeServer: async (payload) => {
                order.push('server');
                sent = payload;
            },
            writeLocal: async () => {
                order.push('local');
            },
            isStillCurrent: () => true,
        });
        expect(order).toEqual(['server', 'local']);
        expect(sent.lastName).toBe('__DELETE_FIELD__');
        expect(typeof sent.updatedAt).toBe('string');
        expect(res.ok && res.profile).not.toHaveProperty('lastName');
    });

    it('a guest (no server copy) fails when the device write fails', async () => {
        const res = await commitProfileUpdate({
            current: account({ isGuest: true }),
            data: { firstName: 'X' },
            writeServer: null,
            writeLocal: () => Promise.reject(new Error('quota')),
            isStillCurrent: () => true,
        });
        expect(res.ok).toBe(false);
    });
});

describe('logout race — a late profile write after logout is dropped', () => {
    it('a profile save whose server round trip ends after logout never rewrites the device', async () => {
        const session = createSessionEpoch();
        const token = session.current();
        const server = deferred<void>();
        const storage = new Map<string, string>([['user_profile', '{"uid":"uid_1"}']]);
        const pending = commitProfileUpdate({
            current: account(),
            data: { locale: 'ar' },
            writeServer: () => server.promise,
            writeLocal: async (p) => {
                storage.set('user_profile', JSON.stringify(p));
            },
            isStillCurrent: () => session.isCurrent(token),
        });
        // Logout: end the session, then wipe the device.
        session.end();
        storage.clear();
        server.resolve();
        await expect(pending).resolves.toEqual({ ok: false, error: 'SESSION_ENDED' });
        expect(storage.has('user_profile')).toBe(false);
    });

    it("the auth listener's Firestore read resolving after logout installs nothing", async () => {
        const session = createSessionEpoch();
        const token = session.current();
        const read = deferred<UserProfile>();
        const storage = new Map<string, string>();
        const setUser = jest.fn();
        const listener = (async () => {
            const profile = await read.promise;
            return installSessionProfile(() => session.isCurrent(token), profile, setUser, async (p) => {
                storage.set('user_profile', JSON.stringify(p));
            });
        })();
        session.end();
        read.resolve(account());
        await expect(listener).resolves.toBe(false);
        expect(setUser).not.toHaveBeenCalled();
        expect(storage.size).toBe(0);
    });

    it('a read in the live session still installs the profile', async () => {
        const session = createSessionEpoch();
        const token = session.current();
        const setUser = jest.fn();
        const persist = jest.fn().mockResolvedValue(undefined);
        await expect(installSessionProfile(() => session.isCurrent(token), account(), setUser, persist)).resolves.toBe(true);
        expect(setUser).toHaveBeenCalledTimes(1);
        expect(persist).toHaveBeenCalledTimes(1);
    });
});

describe('HYP-D6 — guest-only fields survive reload and upgrade', () => {
    const contacts = [{ id: '1', name: 'Sage-femme', number: '0612345678', type: 'doctor' as const }];

    it('fills contacts, height and weight from guestProfile when the auth profile lacks them', () => {
        expect(guestLocalFields({}, { emergencyContacts: contacts, height: 165, prePregnancyWeight: 60 })).toEqual({
            emergencyContacts: contacts,
            height: 165,
            prePregnancyWeight: 60,
        });
    });

    it("the upgraded account's server profile carries them", () => {
        const data = toServerProfile(account({ emergencyContacts: contacts, height: 165, prePregnancyWeight: 60 }), LMP);
        expect(data).toMatchObject({ emergencyContacts: contacts, height: 165, prePregnancyWeight: 60 });
    });

    it('never overrides a value the auth profile already has', () => {
        expect(guestLocalFields({ emergencyContacts: [], height: 170 }, { emergencyContacts: contacts, height: 165 })).toEqual({});
        expect(guestLocalFields({}, null)).toEqual({});
    });
});

describe('HYP-D2 — the Profile form re-syncs only the fields that changed', () => {
    it('adding an emergency contact (same names) re-syncs nothing', () => {
        const prev = { firstName: 'Leila', lastName: 'Ben', country: 'france', lmp: LMP };
        expect(changedFormFields(prev, { ...prev })).toEqual([]);
    });

    it('a saved change re-syncs that field only; no previous snapshot re-syncs all', () => {
        const prev = { firstName: 'Leila', lastName: 'Ben', country: 'france', lmp: LMP };
        expect(changedFormFields(prev, { ...prev, lastName: undefined })).toEqual(['lastName']);
        expect(changedFormFields(null, prev)).toHaveLength(6);
    });
});

describe('language saved on the account', () => {
    it('applies a supported account language that differs from the current one', () => {
        expect(accountLocaleToApply('ar', 'fr')).toBe('ar');
        expect(accountLocaleToApply('ar', 'ar')).toBeNull();
        expect(accountLocaleToApply(undefined, 'fr')).toBeNull();
        expect(accountLocaleToApply('de', 'fr')).toBeNull();
    });
});

// ── Wiring guards ────────────────────────────────────────────────────────────

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');

describe('AuthContext wiring', () => {
    const auth = read('src/context/AuthContext.tsx');
    const block = (from: string, to: string) => auth.slice(auth.indexOf(from), auth.indexOf(to, auth.indexOf(from)));

    it('logout ends the session before signing out and wiping, and always signs out', () => {
        const logout = block('const logout = async', 'const updateProfile');
        const end = logout.indexOf('sessionRef.current.end()');
        expect(end).toBeGreaterThan(-1);
        expect(end).toBeLessThan(logout.indexOf('await signOut(auth)'));
        expect(end).toBeLessThan(logout.indexOf('await wipeLocalUserData()'));
        expect(logout).not.toMatch(/if \(firebaseUser\) \{\s*await signOut/);
    });

    it('the auth listener drops a profile read that finished after the session ended', () => {
        const listener = block('onAuthStateChanged(auth', 'const register = async');
        expect(listener).toMatch(/const sessionToken = sessionRef\.current\.current\(\);/);
        expect(listener).toMatch(/auth\.currentUser\?\.uid === fbUser\.uid/);
        const read = listener.indexOf("await getDoc(doc(db, 'userProfiles', fbUser.uid));");
        const check = listener.indexOf('if (!stillSignedIn()) {');
        expect(read).toBeGreaterThan(-1);
        expect(check).toBeGreaterThan(read);
        expect(check).toBeLessThan(listener.indexOf('if (docSnap.exists())'));
        expect(listener.match(/installSessionProfile\(stillSignedIn,/g)).toHaveLength(2);
        expect(listener).not.toMatch(/setUser\(profile\);\s*await AsyncStorage\.setItem\('user_profile'/);
    });

    it('updateProfile goes through commitProfileUpdate with the session check', () => {
        const up = block('const updateProfile = async', 'const setLocale');
        expect(up).toMatch(/commitProfileUpdate\(\{/);
        expect(up).toMatch(/isStillCurrent: \(\) => sessionRef\.current\.isCurrent\(sessionToken\)/);
        expect(up).not.toMatch(/AsyncStorage\.setItem\('user_profile'[\s\S]*setDoc\(/);
    });

    it('reset and deletion end the session before wiping', () => {
        expect(block('const resetProfile', 'const clearLocalStateAfterDeletion')).toMatch(/sessionRef\.current\.end\(\);[\s\S]*await wipeLocalUserData\(\)/);
        expect(block('const clearLocalStateAfterDeletion', 'const deleteAccount')).toMatch(/sessionRef\.current\.end\(\);\s*await wipeLocalUserData\(\)/);
    });

    it('setLocale applies the language and saves it on the account; login applies the saved one', () => {
        const setLocale = block('const setLocale', 'const resetProfile');
        expect(setLocale).toMatch(/await applyLanguage\(locale\)/);
        expect(setLocale).toMatch(/updateProfile\(\{ locale \}\)/);
        const login = block('const login = async', 'const loginAsGuest = async');
        expect(login).toMatch(/accountLocaleToApply\(resolved\.profile\.locale, i18n\.language\)/);
    });

    it('both language pickers go through setLocale', () => {
        expect(read('src/components/common/LanguageSelector.tsx')).toMatch(/await setLocale\(lang\)/);
        expect(read('src/screens/LanguageSelectScreen.tsx')).toMatch(/await setLocale\(languageCode\)/);
    });

    it('upgradeGuest folds the guest-only fields into the promoted profile', () => {
        const up = block('const upgradeGuest = async', 'const login = async');
        expect(up).toMatch(/guestLocalFields\(guestProfile,/);
        expect(up).toMatch(/\.\.\.guestLocal,/);
    });

    it('an expected REAUTH_REQUIRED is logged as a warning, not an error', () => {
        const del = block('const deleteAccount = async', 'const reauthenticateAndDelete');
        expect(del).toMatch(/classifyDeletionFailure\(error\) === 'reauth' \? log\.warn : log\.error/);
        expect(read('src/hooks/useAccountDeletion.tsx')).toMatch(/\(isExpectedAuthError\(error\) \? log\.warn : log\.error\)\('Reauthenticate-and-delete error:'/);
    });

    it('PregnancyContext merges guest-only fields on reload', () => {
        expect(read('src/context/PregnancyContext.tsx')).toMatch(/guestLocalFields\(profileData,/);
    });
});

describe('logout flushes pending tracker syncs first, bounded', () => {
    it('settleWithin resolves on settle, on rejection, and on timeout', async () => {
        const { settleWithin } = jest.requireActual('../../services/trackerSync');
        await expect(settleWithin(Promise.resolve(1), 1000)).resolves.toBe('settled');
        await expect(settleWithin(Promise.reject(new Error('x')), 1000)).resolves.toBe('settled');
        await expect(settleWithin(new Promise(() => {}), 10)).resolves.toBe('timeout');
    });

    it('logout pushes kick/contraction/bag records before signing out and wiping', () => {
        const auth = read('src/context/AuthContext.tsx');
        const logout = auth.slice(auth.indexOf('const logout = async'), auth.indexOf('const updateProfile'));
        // The flush (and the "N records would be lost" question) lives in trackerLogout,
        // tested in services/__tests__/trackerLogout.test.ts. A "no" returns before the
        // session is ended, signed out or wiped.
        const flush = logout.indexOf('if (uid && !(await settleTrackersBeforeLogout(uid, options?.confirmUnsyncedLoss))) return;');
        expect(flush).toBeGreaterThan(-1);
        expect(flush).toBeLessThan(logout.indexOf('sessionRef.current.end()'));
        expect(flush).toBeLessThan(logout.indexOf('await signOut(auth)'));
        expect(flush).toBeLessThan(logout.indexOf('await wipeLocalUserData()'));
        const settle = read('src/services/trackerLogout.ts');
        expect(settle).toMatch(/pushPendingSessions\(uid\), pushPendingContractions\(uid\), pushPendingBag\(uid\)/);
        expect(settle).toMatch(/LOGOUT_FLUSH_TIMEOUT_MS = 3000/);
    });

    it('PregnancyContext.setProfile surfaces a failed save to its callers', () => {
        const ctx = read('src/context/PregnancyContext.tsx');
        const setProfile = ctx.slice(ctx.indexOf('const setProfile = async'), ctx.indexOf('const contextValue'));
        expect(setProfile).toMatch(/log\.error\('\[PregnancyContext\] ❌ Error setting profile', e\);\s*[\s\S]*?throw e;/);
        expect(setProfile).toMatch(/if \(!res\.ok\) throw new Error/);
    });
});
