import { createLogger, logger } from '../utils/logger';
const log = createLogger('AuthContext');

import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInAnonymously,
    signOut,
    onAuthStateChanged,
    EmailAuthProvider,
    reauthenticateWithCredential,
    linkWithCredential,
    User as FirebaseUser
} from 'firebase/auth';
import { doc, setDoc, getDoc, deleteField } from 'firebase/firestore';
import { deleteUserAccount, finishDeletionAfterReauth, eraseAccountData, resumePendingDeletion, hasPendingDeletion, classifyDeletionFailure } from './accountDeletion';
import { showAlert } from '../utils/alert';
import { commitProfileUpdate, createSessionEpoch, installSessionProfile, guestLocalFields, accountLocaleToApply } from './profileSync';
import { changeLanguage as applyLanguage } from '../i18n/rtl';
import i18n from '../i18n';
import { db, auth } from '../config/firebase';
import { UserProfile } from '../types';
import { calculateCurrentWeek } from '../utils/pregnancyCalculator';
import { calculateFertileWindow } from '../utils/fertility';
import { migrateAllGuestDataToAuth } from '../services/reminderPersistence';
import { pushPendingSessions } from '../services/kickCounterService';
import { pushPendingContractions } from '../services/contractionTimerService';
import { pushPendingBag } from '../services/hospitalBagService';
import { settleWithin } from '../services/trackerSync';
import { isExpectedAuthError } from '../utils/firebaseErrors';

// Logout, resetProfile and deleteAccount all erase the device through one function:
// scheduled notifications, every private key listed in ./storageKeys (exact and by prefix),
// and the content cache. localWipe.test.ts checks it against every key the app writes.
import { wipeLocalUserData } from './localWipe';
import { MedicalFlags, sanitizeMedicalFlags } from '../utils/medicalFlags';
import { isValidHealthDataConsent, HealthDataConsent } from '../utils/healthDataConsent';


// Re-export pure helper extracted to ./loginHelpers so it can be unit-tested
// without loading AuthContext.tsx (whose JSX trips ts-jest under module:"preserve").
import { resolveSessionProfile, shouldPreserveExistingProfile, buildMinimalProfile, toServerProfile } from './loginHelpers';
import { deriveIsGuest, hasPermanentAccount } from './accountMode';
export { resolveLoginProfile } from './loginHelpers';
export type { ResolvedLoginProfile } from './loginHelpers';

interface AuthContextType {
    user: UserProfile | null;
    firebaseUser: FirebaseUser | null;
    loading: boolean;
    // `profileFollows`: the caller writes the profile itself right after (Onboarding's
    // step-4 account creation). Otherwise the new account gets the minimal placeholder
    // at once, which routes it to Onboarding.
    register: (email: string, password: string, opts?: { profileFollows?: boolean }) => Promise<FirebaseUser>;
    // NAV-01: upgrade an in-app guest to a permanent account WITHOUT re-onboarding.
    // Links the anonymous Firebase user in place (preserves uid + data) when one exists;
    // otherwise creates a fresh account and migrates local guest data.
    upgradeGuest: (email: string, password: string) => Promise<FirebaseUser>;
    login: (email: string, password: string, opts?: { profileFollows?: boolean }) => Promise<void>;
    loginAsGuest: (
        firstName: string,
        pregnancyStartDate: Date,
        country: string,
        lastName?: string,
        city?: string,
        ageRange?: string,
        isFirstPregnancy?: boolean,
        authenticatedUser?: FirebaseUser,  // NEW: Pass the firebase user directly
        // TTC-FIX: opt-in TTC mode. When isTTC === true, currentWeek is forced to 0
        // and the date passed in `pregnancyStartDate` is interpreted as the user's
        // last period date (LMP-equivalent for cycle tracking, NOT for pregnancy week).
        ttcOptions?: { isTTC: true; cycleLength: number },
        // Cycle 3 F201 : opt-in Curious mode (mode découverte). Différencie
        // l'utilisatrice qui explore d'une vraie grossesse.
        curiousOptions?: { isCurious: true; exploreWeek: number },
        // Declared conditions collected at onboarding step 3. Sanitised before
        // persistence — see utils/medicalFlags.ts.
        medicalFlags?: MedicalFlags,
        // The user was asked and chose to replace the profile this account already
        // has with the answers she just gave (Onboarding's email-already-in-use path).
        // Without it an existing profile is kept — never overwritten silently.
        // `healthDataConsent`: the consent ticked on onboarding's last step, saved with
        // the profile (see utils/healthDataConsent.ts).
        opts?: { replaceExisting?: boolean; healthDataConsent?: HealthDataConsent },
    ) => Promise<void>;
    logout: () => Promise<void>;
    // Reports success/failure explicitly and never throws. The server is written first and
    // the device only once it accepted the edit, so `ok: false` means nothing changed
    // anywhere. A field passed as `undefined` is cleared (see profileSync.splitProfileUpdate).
    updateProfile: (
        data: Partial<UserProfile>,
    ) => Promise<{ ok: true } | { ok: false, error: string }>;
    setLocale: (locale: string) => Promise<void>;
    resetProfile: () => Promise<void>;
    // Throws REAUTH_REQUIRED (session too old — nothing erased yet) or PURGE_INCOMPLETE
    // (some Firestore data could not be erased — the account is kept so it can be retried).
    deleteAccount: () => Promise<void>;
    // F4: when deleteAccount throws REAUTH_REQUIRED, the UI re-prompts for the
    // password and calls this method, which reauthenticates and only then purges
    // and deletes — a wrong or cancelled password leaves the account untouched.
    reauthenticateAndDelete: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);


export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    // True while a caller is about to write this account's profile itself — Onboarding
    // creating the account at step 4, or a guest upgrading. The auth listener fires on
    // the new sign-in before that write lands and would install the minimal placeholder,
    // which the root navigator reads as "needs onboarding": the screen doing the work
    // would unmount mid-flight and the user would see step 1 flash, or — on an upgrade —
    // lose the guest profile she already has. While this is set the listener and
    // login() install nothing; whoever set it clears it once the real profile is in
    // place (loginAsGuest, upgradeGuest).
    const profileSetupPendingRef = useRef(false);
    // Ended by logout / reset / deletion before they sign out and wipe the device, so a
    // profile read or write still in flight cannot put the signed-out user back.
    const sessionRef = useRef(createSessionEpoch());

    useEffect(() => {
        // 1. Try to restore from AsyncStorage first (fastest)
        const loadLocalUser = async () => {
            try {
                const storedProfile = await AsyncStorage.getItem('user_profile');
                if (storedProfile) {
                    const profile = JSON.parse(storedProfile);
                    setUser(profile);
                    // FIRST-PAINT FIX: App.tsx renders `null` for the entire
                    // NavigationContainer while `loading` is true, and `loading` only
                    // cleared at the END of the onAuthStateChanged callback — i.e.
                    // after Firebase auth init AND an awaited Firestore getDoc. A
                    // returning user therefore stared at a blank screen for a network
                    // round-trip, and for much longer on a slow or flaky connection.
                    // The cached profile is enough to paint the right tree now; the
                    // Firestore read below reconciles it a moment later. This does not
                    // widen what can be shown — the signed-out branch already leaves a
                    // cached `user` in place — it only shows the same state sooner.
                    setLoading(false);
                    log.debug('[AuthContext] ⚡️ Restored user from AsyncStorage (painting from cache)');
                }
            } catch (e) {
                log.error('Failed to load local user', e);
            }
        };
        loadLocalUser();

        // 2. Listen to Firebase auth state (source of truth)
        const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            setFirebaseUser(fbUser);
            // Tag (or clear) the Sentry user as soon as Firebase resolves the
            // session so any crash that happens during cold-start bootstrap
            // is already attached to the right account.
            logger.setUser(fbUser ? fbUser.uid : null);
            if (fbUser) {
                // A cold start paints from the cached profile before this read returns, so
                // the user can log out while it is still in flight. Its result only counts if
                // the session it was read for is still the signed-in one.
                const sessionToken = sessionRef.current.current();
                const stillSignedIn = () =>
                    sessionRef.current.isCurrent(sessionToken) && auth.currentUser?.uid === fbUser.uid;
                const persistProfile = (p: UserProfile) => AsyncStorage.setItem('user_profile', JSON.stringify(p));
                // Load profile from Firestore for authenticated users
                try {
                    const docSnap = await getDoc(doc(db, 'userProfiles', fbUser.uid));
                    if (profileSetupPendingRef.current) {
                        // The caller owns the profile for this sign-in (see the ref):
                        // Onboarding may still have to ask whether an existing profile
                        // is kept or replaced, and installing either one here would swap
                        // the navigator out from under that question.
                        log.debug('[AuthContext] Session restored while a caller is writing the profile — left to the caller');
                        setLoading(false);
                        return;
                    }
                    if (!stillSignedIn()) {
                        log.debug('[AuthContext] Profile read finished after the session ended — dropped');
                        setLoading(false);
                        return;
                    }
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        // FIX: Add uid from Firebase auth (it's not stored in Firestore document)
                        // FIX: Ensure pregnancyStartDate exists, fallback to lmp if missing (backward compatibility)
                        const profile = {
                            ...data,
                            uid: fbUser.uid, // CRITICAL: Add UID from Firebase auth
                            pregnancyStartDate: data.pregnancyStartDate || data.lmp
                        } as UserProfile;

                        // Recalculate current week to ensure it's up to date
                        if (profile.pregnancyStartDate) {
                            const lmpDate = new Date(profile.pregnancyStartDate);
                            const calculatedWeek = calculateCurrentWeek(lmpDate);

                            if (calculatedWeek !== profile.currentWeek) {
                                log.debug(`[AuthContext] 🔄 Updating current week from ${profile.currentWeek} to ${calculatedWeek}`);
                                profile.currentWeek = calculatedWeek;
                                // Update in Firestore silently
                                setDoc(doc(db, 'userProfiles', fbUser.uid), { currentWeek: calculatedWeek }, { merge: true })
                                    .catch((e) => log.warn('[AuthContext] Could not store the recomputed week:', e));
                            }
                        }

                        await installSessionProfile(stillSignedIn, profile, setUser, persistProfile);
                    } else {
                        // A deletion that erased everything but could not delete the Auth
                        // user is finished here, instead of opening the emptied account as
                        // if nothing had happened (see accountDeletion.resumePendingDeletion).
                        // When it cannot be finished now (the sign-in is too old, or offline),
                        // she is signed out rather than shown the emptied account: signing in
                        // again finishes it, since the marker survives the logout.
                        const resume = await resumePendingDeletion(db, fbUser);
                        if (resume !== 'none') {
                            sessionRef.current.end();
                            if (resume !== 'deleted') await signOut(auth).catch(() => {});
                            await wipeLocalUserData();
                            setUser(null);
                            setFirebaseUser(null);
                            logger.setUser(null);
                            setLoading(false);
                            if (resume === 'deleted') {
                                showAlert(i18n.t('profile.deleteDoneTitle'), i18n.t('profile.deleteDoneMsg'));
                            } else {
                                showAlert(i18n.t('profile.deletePendingTitle'), i18n.t('profile.deletePendingSignInMsg'));
                            }
                            return;
                        }
                        // R4 FIX: parité avec login() — si une session Firebase existe
                        // mais que le doc Firestore est absent (compte orphelin, race
                        // pendant signup, suppression manuelle), on synthétise le
                        // profil minimal via resolveLoginProfile. Sans ça, l'utilisateur
                        // reste coincé sur AuthStack au cold start malgré une session
                        // valide. Sans ancre de grossesse, needsProfileSetup l'envoie
                        // ensuite sur Onboarding (et non sur une Home vide).
                        // Hand the cached profile in. An anonymous guest has no
                        // Firestore document at all — loginAsGuest writes one only
                        // for a permanent account — so without this the placeholder
                        // overwrites her real profile on the first restart after
                        // Anonymous Auth is enabled.
                        let cached: UserProfile | null = null;
                        try {
                            const raw = await AsyncStorage.getItem('user_profile');
                            cached = raw ? (JSON.parse(raw) as UserProfile) : null;
                        } catch {
                            cached = null;
                        }
                        const resolved = resolveSessionProfile(docSnap, fbUser, cached, profileSetupPendingRef.current);
                        if (!resolved) {
                            log.debug('[AuthContext] Cold-start: profile missing but being written by the caller — left alone');
                            setLoading(false);
                            return;
                        }
                        const { profile, isMinimal } = resolved;
                        if (!(await installSessionProfile(stillSignedIn, profile, setUser, persistProfile))) {
                            setLoading(false);
                            return;
                        }
                        if (isMinimal) {
                            log.warn('[AuthContext] ⚠️ Cold-start: Firestore profile missing — bootstrapped minimal profile');
                            // Note: guest data migration is intentionally NOT triggered here
                            // (parité avec login(): migration ne tourne que pour profil non-minimal).
                        }
                    }
                } catch (error) {
                    // Logging out while this read is in flight signs the request out from
                    // under it, and the rules then refuse it (permission-denied on
                    // userProfiles). That is the logout working, not a fault.
                    if (!stillSignedIn()) {
                        log.debug('[AuthContext] Profile read refused after the session ended — ignored');
                    } else {
                        log.error('Failed to load user profile:', error);
                    }
                }
            }
            // Don't load guest profile automatically - let user go through auth flow
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const register = async (
        email: string,
        password: string,
        opts?: { profileFollows?: boolean },
    ): Promise<FirebaseUser> => {
        log.debug('[AuthContext] 📝 Registering new user:', email);
        if (opts?.profileFollows) profileSetupPendingRef.current = true;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            setFirebaseUser(userCredential.user);
            logger.setUser(userCredential.user.uid);
            log.debug('[AuthContext] ✅ User registered successfully:', userCredential.user.uid);
            if (!opts?.profileFollows) {
                // A brand-new account has no profile. Install the placeholder now rather
                // than waiting for the auth listener's Firestore read: needsProfileSetup
                // sees no pregnancy anchor and the root navigator shows Onboarding, where
                // the profile is written under this account. Previously the placeholder
                // took the user straight to MainTabs — a Home with no week, and no
                // userProfiles document ever written.
                const minimal = buildMinimalProfile(userCredential.user);
                setUser(minimal);
                await AsyncStorage.setItem('user_profile', JSON.stringify(minimal));
            }
            // Return the user so it can be passed to loginAsGuest immediately
            return userCredential.user;
        } catch (error) {
            if (opts?.profileFollows) profileSetupPendingRef.current = false;
            (isExpectedAuthError(error) ? log.warn : log.error)('[AuthContext] ❌ Registration error:', error);
            throw error;
        }
    };

    // NAV-01: promote a guest to a permanent account in place. If the current
    // Firebase user is anonymous (Anonymous Auth enabled, owner gate G1), link the
    // email/password credential so the uid + all data are preserved with no
    // re-onboarding. Otherwise (local-only guest / Anonymous Auth off) fall back to
    // creating a fresh account. In both cases local guest data is migrated and the
    // profile is flipped to authenticated (the existing profile-sync effect persists it).
    const upgradeGuest = async (email: string, password: string): Promise<FirebaseUser> => {
        log.debug('[AuthContext] ⬆️ Upgrading guest to account:', email);
        const current = auth.currentUser;
        const guestProfile = user;
        let upgraded: FirebaseUser;
        // Creating a fresh account (the local-only guest branch) fires the auth
        // listener for a uid with no Firestore document, and the cached profile still
        // carries the old guest uid — so it would install the placeholder over the
        // guest's profile and send her back through onboarding.
        profileSetupPendingRef.current = true;
        try {
            if (current && current.isAnonymous) {
                const credential = EmailAuthProvider.credential(email, password);
                const result = await linkWithCredential(current, credential);
                upgraded = result.user;
                log.debug('[AuthContext] ✅ Anonymous guest linked in place, uid:', upgraded.uid);
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                upgraded = userCredential.user;
                log.debug('[AuthContext] ✅ New account created for guest upgrade, uid:', upgraded.uid);
            }
        } catch (error) {
            profileSetupPendingRef.current = false;
            (isExpectedAuthError(error) ? log.warn : log.error)('[AuthContext] ❌ Guest upgrade error:', error);
            throw error;
        }
        setFirebaseUser(upgraded);
        logger.setUser(upgraded.uid);
        try {
            try {
                await migrateAllGuestDataToAuth(upgraded.uid);
                log.info('[AuthContext] ✅ Guest data migrated after upgrade');
            } catch (migrationError) {
                log.warn('[AuthContext] ⚠️ Guest data migration failed (non-blocking):', migrationError);
            }
            if (guestProfile) {
                // A guest's emergency contacts and WeightTracker setup live in the
                // 'guestProfile' entry, not on the auth profile; fold them in so they reach
                // the account's server profile below.
                let guestLocal = {};
                try {
                    const raw = await AsyncStorage.getItem('guestProfile');
                    guestLocal = guestLocalFields(guestProfile, raw ? JSON.parse(raw) : null);
                } catch (readError) {
                    log.warn('[AuthContext] ⚠️ Could not read the guest-only profile fields:', readError);
                }
                const promoted: UserProfile = {
                    ...guestProfile,
                    ...guestLocal,
                    isGuest: false,
                    uid: upgraded.uid,
                    email: upgraded.email ?? guestProfile.email,
                };
                // Local first: the auth listener falls back to this cache when the
                // Firestore document is not there yet, and it must find the promoted
                // profile under the new uid, not the old guest one.
                await AsyncStorage.setItem('user_profile', JSON.stringify(promoted)).catch(() => {});
                setUser(promoted);
                // Nothing else writes the profile to the server for an upgraded guest —
                // a guest's profile was device-only — so do it here. Without it the
                // account had no userProfiles document and a sign-in on another device
                // had to onboard from scratch. Best effort: the account exists and the
                // profile is safe on this device either way.
                try {
                    await setDoc(
                        doc(db, 'userProfiles', upgraded.uid),
                        toServerProfile(promoted, new Date().toISOString()),
                        { merge: true },
                    );
                } catch (writeError) {
                    log.warn('[AuthContext] ⚠️ Could not write the upgraded profile to Firestore:', writeError);
                }
            }
        } finally {
            profileSetupPendingRef.current = false;
        }
        return upgraded;
    };

    const login = async (email: string, password: string, opts?: { profileFollows?: boolean }) => {
        log.debug('[AuthContext] 🔐 Logging in user:', email);
        // Onboarding's email-already-in-use recovery signs in and then writes the
        // profile itself; see profileSetupPendingRef.
        if (opts?.profileFollows) profileSetupPendingRef.current = true;
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            setFirebaseUser(userCredential.user);
            logger.setUser(userCredential.user.uid);
            log.debug('[AuthContext] ✅ User logged in:', userCredential.user.uid);

            // Load profile (BUG FIX: Firestore docs don't carry their own id; F4 FIX:
            // missing doc → minimal placeholder, which needsProfileSetup routes to
            // Onboarding — where an account without a profile belongs — unless
            // Onboarding is the caller and is about to write it (resolveSessionProfile
            // returns null). Funneled through loginHelpers for unit-testability.)
            const sessionToken = sessionRef.current.current();
            const docSnap = await getDoc(doc(db, 'userProfiles', userCredential.user.uid));
            const resolved = resolveSessionProfile(docSnap, userCredential.user, null, !!opts?.profileFollows);
            if (resolved?.isMinimal && (await hasPendingDeletion(userCredential.user.uid))) {
                // She asked for this account to be deleted and its data is already erased.
                // The auth listener, which fires for this same sign-in, finishes the deletion
                // (this fresh sign-in is recent enough) and tells her; installing the empty
                // placeholder here would send her to onboarding instead.
                log.info('[AuthContext] Sign-in to an account with a pending deletion — left to the listener');
                return;
            }
            if (resolved) {
                await installSessionProfile(
                    () => sessionRef.current.isCurrent(sessionToken),
                    resolved.profile,
                    setUser,
                    (p) => AsyncStorage.setItem('user_profile', JSON.stringify(p)),
                );
                // Signing in is when the account's language follows her to this device. A
                // cold start does not do this, so a change she makes here is never undone
                // by an older value read back from the server.
                const locale = accountLocaleToApply(resolved.profile.locale, i18n.language);
                if (locale) {
                    applyLanguage(locale).catch((e) => log.warn('[AuthContext] Could not apply the account language:', e));
                }
            }

            if (resolved && !resolved.isMinimal) {
                log.debug('[AuthContext] ✅ User profile loaded from Firestore');
            } else if (resolved) {
                log.warn('[AuthContext] ⚠️ User profile not found in Firestore — bootstrapping minimal profile');
            }

            // W4 #6 FIX: migrate guest data (tasks, reminders) REGARDLESS of whether a Firestore
            // profile already existed. Previously this was nested under `if (!isMinimal)`, so a
            // returning user whose profile doc is missing/unreadable (orphan account, offline login)
            // silently lost their guest-created data. Idempotent + best-effort (never blocks login).
            try {
                await migrateAllGuestDataToAuth(userCredential.user.uid);
                log.info('[AuthContext] ✅ Guest data migration completed after login');
            } catch (migrationError) {
                log.warn('[AuthContext] ⚠️ Guest data migration failed (non-blocking):', migrationError);
            }
        } catch (error) {
            if (opts?.profileFollows) profileSetupPendingRef.current = false;
            (isExpectedAuthError(error) ? log.warn : log.error)('[AuthContext] ❌ Login error:', error);
            throw error;
        }
    };

    const loginAsGuest = async (
        firstName: string,
        pregnancyStartDate: Date,
        country: string,
        lastName?: string,
        city?: string,
        ageRange?: string,
        isFirstPregnancy?: boolean,
        authenticatedUser?: FirebaseUser,  // NEW: Pass the firebase user directly (fixes timing issue)
        ttcOptions?: { isTTC: true; cycleLength: number },
        // Cycle 3 F201 : option Curious (mode découverte) — différencie l'utilisatrice
        // qui explore d'une vraie grossesse. Setting `isCurious: true` permet aux
        // screens de garder `if (user?.isCurious)` au lieu de croire l'utilisatrice enceinte.
        curiousOptions?: { isCurious: true; exploreWeek: number },
        medicalFlags?: MedicalFlags,
        opts?: { replaceExisting?: boolean; healthDataConsent?: HealthDataConsent },
    ) => {
        // Cycle 3 F100 : tenter signInAnonymously si pas d'utilisateur fourni.
        // Avant : `uid = 'guest_'+Date.now()` ne satisfait PAS `isAuthenticatedReader()`
        // dans firestore.rules → tous les fetches Firestore échouent → écran vide
        // perpétuel ("Error loading data" / skeleton). Maintenant : on demande à
        // Firebase un uid anonyme réel qui satisfait les rules. Si Anonymous Auth
        // n'est pas activé en Console (`auth/admin-restricted-operation` ou
        // `auth/operation-not-allowed`), fallback sur l'ancien uid local + warning
        // — l'utilisatrice voit toujours un écran vide MAIS au moins l'app ne
        // crashe pas et le dev/operator sait quoi activer.
        // auth.currentUser as a last resort: a signed-in user finishing Onboarding
        // (needsProfileSetup) can be painted from the cached profile before the auth
        // listener has put the session into state. Falling through to
        // signInAnonymously there would swap her account for an anonymous one.
        let effectiveUser = authenticatedUser || firebaseUser || auth.currentUser;
        if (!effectiveUser) {
            try {
                const cred = await signInAnonymously(auth);
                effectiveUser = cred.user;
                log.debug('[AuthContext] 👤 signInAnonymously OK, uid:', effectiveUser.uid);
            } catch (e: any) {
                if (
                    e?.code === 'auth/admin-restricted-operation' ||
                    e?.code === 'auth/operation-not-allowed'
                ) {
                    log.warn(
                        '[AuthContext] ⚠️ Anonymous Auth disabled in Firebase Console — guest mode will see empty screens until enabled. Error code:',
                        e.code
                    );
                } else {
                    log.warn('[AuthContext] ⚠️ signInAnonymously unexpected error:', e?.message);
                }
                // Fallback : pas de blocage, mais data Firestore inaccessible.
            }
        }
        const isAuthenticated = !!effectiveUser;
        const uid = effectiveUser?.uid || 'guest_' + Date.now();
        const isTTC = ttcOptions?.isTTC === true;

        log.debug('[AuthContext] 👤 Creating profile:', {
            firstName,
            country,
            city,
            ageRange,
            isAuthenticated,
            uid,
            hasAuthenticatedUser: !!authenticatedUser,
            hasFirebaseUser: !!firebaseUser,
            isTTC,
        });

        // TTC-FIX: do NOT compute a pregnancy week for TTC users — they are not
        // pregnant. The date stored in `pregnancyStartDate` is the cycle start
        // (last period date). currentWeek is forced to 0 to defuse any UI that
        // reads it without checking isTTC.
        const currentWeek = isTTC ? 0 : calculateCurrentWeek(pregnancyStartDate);
        log.debug('[AuthContext] 📅 Calculated current week:', currentWeek);

        // TTC-FIX: precompute fertility window so consumers can read it without
        // re-deriving from cycleLength + LMP.
        let ttcFields: Pick<
            UserProfile,
            'isTTC' | 'cycleLength' | 'ovulationDate' | 'fertileWindowStart' | 'fertileWindowEnd'
        > = {};
        if (isTTC && ttcOptions) {
            try {
                const { ovulationDate, fertileWindowStart, fertileWindowEnd } =
                    calculateFertileWindow(pregnancyStartDate, ttcOptions.cycleLength);
                ttcFields = {
                    isTTC: true,
                    cycleLength: ttcOptions.cycleLength,
                    ovulationDate: ovulationDate.toISOString(),
                    fertileWindowStart: fertileWindowStart.toISOString(),
                    fertileWindowEnd: fertileWindowEnd.toISOString(),
                };
            } catch (e) {
                log.warn('[AuthContext] ⚠️ TTC fertility window calc failed:', e);
                ttcFields = { isTTC: true, cycleLength: ttcOptions.cycleLength };
            }
        }

        // Cycle 3 F201 : marker Curious appliqué si curiousOptions présent.
        const curiousFields = curiousOptions
            ? { isCurious: true as const, exploreWeek: curiousOptions.exploreWeek }
            : {};

        // Declared conditions. Sanitised rather than spread verbatim: these land in
        // userProfiles/{uid}, and a non-boolean slipping through would be compared
        // by strict equality against a rule's boolean and quietly match nothing —
        // the same failure that made the glucose rule inert, by a different door.
        const medicalFields = sanitizeMedicalFlags(medicalFlags);
        // Validated like the flags: it lands in userProfiles/{uid}, whose rules take only
        // a {version, at} map of short strings.
        const consent = opts?.healthDataConsent;
        const consentFields: { healthDataConsent?: HealthDataConsent } = isValidHealthDataConsent(consent)
            ? { healthDataConsent: { version: consent.version, at: consent.at } }
            : {};

        const newUser: UserProfile = {
            uid,
            email: effectiveUser?.email || undefined,
            firstName,
            lastName,
            pregnancyStartDate: pregnancyStartDate.toISOString(), // For AuthContext
            lmp: pregnancyStartDate.toISOString(), // For PregnancyContext - CRITICAL!
            currentWeek,
            country,
            city,
            ageRange,
            isFirstPregnancy,
            isGuest: deriveIsGuest(effectiveUser),
            ...ttcFields,
            ...curiousFields,
            ...medicalFields,
            ...consentFields,
        };

        try {
            // Gated on a PERMANENT account, not merely on being authenticated: an
            // anonymous session would otherwise read `userProfiles/<uid>` and, on a
            // hit, adopt it with `isGuest: false` — re-introducing the very bug this
            // guards against, one layer down.
            if (hasPermanentAccount(effectiveUser)) {
                // W1 #3 — re-onboarding data-loss guard. If this authenticated uid ALREADY has a
                // complete profile (a returning user re-ran onboarding and recovered via the
                // email-already-in-use → login path), do NOT overwrite their stored lmp/firstName/
                // createdAt with the fresh onboarding form. Adopt the stored profile, migrate any
                // guest data, and finish. A missing/partial doc (no pregnancy anchor) falls through
                // to the normal create path. See shouldPreserveExistingProfile + its unit tests.
                try {
                    const existingSnap = await getDoc(doc(db, 'userProfiles', uid));
                    if (!opts?.replaceExisting && shouldPreserveExistingProfile(existingSnap)) {
                        const stored = existingSnap.data() || {};
                        const adopted = {
                            ...newUser,
                            ...stored,
                            uid,
                            isGuest: false,
                            currentWeek: stored.isTTC
                                ? 0
                                : (stored.lmp ? calculateCurrentWeek(new Date(stored.lmp)) : newUser.currentWeek),
                            // She kept her stored profile but has just given consent on
                            // the last step: record it on the kept profile too, or the
                            // next cold start would ask again.
                            ...consentFields,
                        } as UserProfile;
                        if (consentFields.healthDataConsent) {
                            try {
                                await setDoc(doc(db, 'userProfiles', uid), { healthDataConsent: consentFields.healthDataConsent }, { merge: true });
                            } catch (consentWriteError) {
                                log.warn('[AuthContext] ⚠️ Could not record the consent on the kept profile:', consentWriteError);
                            }
                        }
                        await AsyncStorage.setItem('user_profile', JSON.stringify(adopted));
                        setUser(adopted);
                        try {
                            await migrateAllGuestDataToAuth(uid);
                        } catch (migrationError) {
                            log.warn('[AuthContext] ⚠️ Guest migration after profile-preserve failed (non-blocking):', migrationError);
                        }
                        log.info('[AuthContext] ↩️ W1 #3: existing profile preserved on re-onboard (no overwrite), uid:', uid);
                        return;
                    }
                } catch (preserveCheckError) {
                    // Read failed (offline/permission) — fall through to the normal write rather
                    // than block the user. Worst case reverts to prior behaviour, never worse.
                    log.warn('[AuthContext] ⚠️ existing-profile check failed, proceeding to write:', preserveCheckError);
                }

                // Save to Firestore for authenticated users
                // IMPORTANT: Firestore doesn't accept undefined values, so we filter them out
                log.debug('[AuthContext] 💾 Saving to Firestore for authenticated user:', uid);

                const profileData: Record<string, any> = {
                    firstName,
                    lmp: pregnancyStartDate.toISOString(),
                    pregnancyStartDate: pregnancyStartDate.toISOString(), // FIX: Explicitly save pregnancyStartDate
                    country,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };

                // TTC-FIX: only persist DPA when the user is actually pregnant.
                // For TTC users, "DPA = LMP + 280d" is medically meaningless and
                // would later be misread as a real due date.
                if (!isTTC) {
                    profileData.dpa = new Date(
                        pregnancyStartDate.getTime() + 280 * 24 * 60 * 60 * 1000,
                    ).toISOString();
                }

                // Only add optional fields if they are defined
                if (lastName !== undefined) profileData.lastName = lastName;
                if (city !== undefined) profileData.city = city;
                if (ageRange !== undefined) profileData.ageRange = ageRange;
                if (isFirstPregnancy !== undefined) profileData.isFirstPregnancy = isFirstPregnancy;

                // TTC-FIX: persist TTC fields (Firestore-safe — only defined keys)
                if (ttcFields.isTTC) profileData.isTTC = true;
                if (ttcFields.cycleLength !== undefined) profileData.cycleLength = ttcFields.cycleLength;
                if (ttcFields.ovulationDate) profileData.ovulationDate = ttcFields.ovulationDate;
                if (ttcFields.fertileWindowStart) profileData.fertileWindowStart = ttcFields.fertileWindowStart;
                if (ttcFields.fertileWindowEnd) profileData.fertileWindowEnd = ttcFields.fertileWindowEnd;

                // Curious mode. Reachable for a signed-in account now that Onboarding
                // runs for any account without a profile; left out, the cold start would
                // rebuild her from this document as pregnant at the explored week.
                if (curiousOptions) {
                    profileData.isCurious = true;
                    profileData.exploreWeek = curiousOptions.exploreWeek;
                }

                // Declared conditions. This payload is a whitelist built field by
                // field, and the first cut of this feature spread the flags into the
                // in-memory profile and AsyncStorage but never named them here — so
                // they never left the device. The cold start then rebuilds the
                // profile from this document alone, with no merge against the cache,
                // and writes the result back over AsyncStorage: a woman would have
                // declared gestational diabetes, seen the glucose reminder appear,
                // restarted once, and lost both.
                if (medicalFields.hasGestationalDiabetes !== undefined)
                    profileData.hasGestationalDiabetes = medicalFields.hasGestationalDiabetes;
                if (medicalFields.hasHypertension !== undefined)
                    profileData.hasHypertension = medicalFields.hasHypertension;
                if (medicalFields.isTwinPregnancy !== undefined)
                    profileData.isTwinPregnancy = medicalFields.isTwinPregnancy;
                if (medicalFields.medicalProfileAnsweredAt !== undefined)
                    profileData.medicalProfileAnsweredAt = medicalFields.medicalProfileAnsweredAt;
                if (consentFields.healthDataConsent) profileData.healthDataConsent = consentFields.healthDataConsent;

                if (opts?.replaceExisting) {
                    // She chose to replace an existing profile: keep its createdAt, and
                    // clear the mode fields this write does not set, or a merge would
                    // leave a replaced TTC profile flagged TTC (or a stale due date).
                    delete profileData.createdAt;
                    for (const key of ['dpa', 'isTTC', 'cycleLength', 'ovulationDate', 'fertileWindowStart', 'fertileWindowEnd', 'isCurious', 'exploreWeek']) {
                        if (profileData[key] === undefined) profileData[key] = deleteField();
                    }
                }
                await setDoc(doc(db, 'userProfiles', uid), profileData, { merge: true });
                log.debug('[AuthContext] ✅ Profile saved to Firestore');
            }

            // Also save to AsyncStorage for offline access
            await AsyncStorage.setItem('user_profile', JSON.stringify(newUser));
            log.debug('[AuthContext] ✅ Profile saved to AsyncStorage');
            log.debug('[AuthContext] 📅 LMP saved:', pregnancyStartDate.toISOString());

            setUser(newUser);

            // MA8-FIX: après inscription depuis l'onboarding, `register()` ne déclenche pas
            // `migrateAllGuestDataToAuth` (contrairement à `login()`). Les données guest
            // (rappels, checklist, etc.) restaient locales alors que l'utilisateur est
            // désormais authentifié. `loginAsGuest` est le seul point d'entrée pour lier
            // le profil onboarding à un compte — on migre ici, best-effort et idempotent.
            // Permanent account only. Migrating for an anonymous session would push a
            // guest's local data into Firestore behind their back, while every screen
            // still tells them their data is not tied to an account — and the upgrade
            // path (`upgradeGuest`) already migrates at the moment they do create one.
            if (hasPermanentAccount(effectiveUser)) {
                try {
                    await migrateAllGuestDataToAuth(uid);
                    log.info('[AuthContext] ✅ Guest → auth migration after onboarding signup');
                } catch (migrationError) {
                    log.warn('[AuthContext] ⚠️ Guest migration failed (non-blocking):', migrationError);
                }
            }
        } catch (error) {
            log.error('[AuthContext] ❌ Failed to save profile:', error);
            throw error;
        } finally {
            profileSetupPendingRef.current = false;
        }
    };

    const logout = async () => {
        // First, so a profile read or save still in flight drops its result instead of
        // writing 'user_profile' back after the wipe below.
        sessionRef.current.end();
        try {
            // Kick sessions, contractions and the bag are written to the device first and
            // sent afterwards; the wipe below erases whatever has not reached the server yet.
            // Give those pushes a moment while the session can still write — bounded, so no
            // signal never blocks the logout.
            const uid = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : null;
            if (uid) {
                const flushed = await settleWithin(
                    Promise.allSettled([pushPendingSessions(uid), pushPendingContractions(uid), pushPendingBag(uid)]),
                    3000,
                );
                if (flushed === 'timeout') log.warn('[AuthContext] Tracker records still unsent at logout');
            }
            // Not gated on `firebaseUser` state: a cold start paints from the cache before
            // the auth listener has reported the restored session, and skipping signOut then
            // left the session alive to be restored on the next launch. signOut is queued
            // behind Firebase's own initialisation and is harmless when nobody is signed in.
            await signOut(auth);
            await wipeLocalUserData();
            log.info('[AuthContext] 🧹 All local data purged on logout');
            setUser(null);
            setFirebaseUser(null);
            logger.setUser(null);
        } catch (error) {
            log.error('Failed to logout:', error);
        }
    };

    // Server first, then the device, then React state — so what the app shows and caches is
    // what the account holds. It used to write the device first and keep the edit even when
    // Firestore refused it (an emptied "Nom" sent `undefined`, which Firestore rejects), and
    // the Profile screen said "Succès" while the server still had the old name.
    const updateProfile = async (
        data: Partial<UserProfile>,
    ): Promise<{ ok: true } | { ok: false, error: string }> => {
        if (!user) return { ok: false, error: 'No authenticated user' };
        const sessionToken = sessionRef.current.current();
        const uid = user.uid;
        const result = await commitProfileUpdate({
            current: user,
            data,
            // A guest's profile lives on the device only.
            writeServer: !user.isGuest && firebaseUser
                ? (payload) => setDoc(doc(db, 'userProfiles', uid), payload, { merge: true })
                : null,
            writeLocal: (p) => AsyncStorage.setItem('user_profile', JSON.stringify(p)),
            isStillCurrent: () => sessionRef.current.isCurrent(sessionToken),
        });
        if (!result.ok) {
            if (result.error !== 'SESSION_ENDED') log.error('Failed to update profile:', result.error);
            return result;
        }
        setUser(result.profile);
        return { ok: true };
    };

    // An explicit language choice: applied on this device at once, and saved on the account
    // so a sign-in on another device (login() above) opens in the same language.
    const setLocale = async (locale: string) => {
        await applyLanguage(locale);
        if (user) {
            const res = await updateProfile({ locale });
            if (!res.ok) log.warn('Language changed on this device but not saved to the account:', res.error);
        }
    };

    const resetProfile = async () => {
        try {
            // Any Firebase session (a permanent account, or an anonymous guest once Anonymous
            // Auth is on) has data in Firestore beyond the profile document: erase all of it
            // before signing out, because signing out loses the only uid that can reach it.
            // A failed purge throws here, with the session intact, so the reset can be retried.
            if (firebaseUser) {
                await eraseAccountData(db, firebaseUser);
            }
            // After the purge (which keeps the session when it fails), before the wipe.
            sessionRef.current.end();
            if (firebaseUser) {
                await signOut(auth);
            }

            await wipeLocalUserData();

            // Reset states
            setUser(null);
            setFirebaseUser(null);
            logger.setUser(null);

            log.debug('[AuthContext] ✅ Profile reset complete — all local data purged');
        } catch (error) {
            log.error('Failed to reset profile:', error);
            throw error;
        }
    };

    // Everything the device holds for the deleted account: scheduled notifications,
    // every private AsyncStorage key, the in-memory content cache, then the session.
    const clearLocalStateAfterDeletion = async () => {
        sessionRef.current.end();
        await wipeLocalUserData();
        // Setting user to null swaps the navigator to AuthStack; no screen needs to navigate.
        setUser(null);
        setFirebaseUser(null);
        logger.setUser(null);
    };

    const deleteAccount = async () => {
        try {
            if (firebaseUser) {
                log.debug('[AuthContext] Starting account deletion for:', firebaseUser.uid);
                // GDPR purge (RGPD Art. 17) then the Auth user — see accountDeletion.ts for
                // the ordering. The Auth user is deleted only after every collection was
                // erased, and a stale session is sent to reauthentication before any purge.
                await deleteUserAccount(db, firebaseUser);
                log.debug('[AuthContext] Firebase Auth user deleted');
                await clearLocalStateAfterDeletion();
            }
        } catch (error) {
            // A session too old to delete with is a normal step of the flow (the UI asks for
            // the password next and nothing has been erased), not a fault worth an error report.
            (classifyDeletionFailure(error) === 'reauth' ? log.warn : log.error)('Failed to delete account:', error);
            throw error;
        }
    };

    // F4: Finish account deletion after REAUTH_REQUIRED. Nothing has been purged yet
    // (deleteAccount checks the sign-in age first), so reauthenticate, then purge and delete.
    const reauthenticateAndDelete = async (password: string) => {
        if (!firebaseUser || !firebaseUser.email) {
            throw new Error('No authenticated user with email to reauthenticate');
        }
        const credential = EmailAuthProvider.credential(firebaseUser.email, password);
        await finishDeletionAfterReauth(db, firebaseUser, () =>
            reauthenticateWithCredential(firebaseUser, credential),
        );
        log.debug('[AuthContext] Firebase Auth user deleted (after reauth)');
        await clearLocalStateAfterDeletion();
    };

    return (
        <AuthContext.Provider value={{
            user,
            firebaseUser,
            loading,
            register,
            upgradeGuest,
            login,
            loginAsGuest,
            logout,
            updateProfile,
            setLocale,
            resetProfile,
            deleteAccount,
            reauthenticateAndDelete
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
