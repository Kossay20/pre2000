import { createLogger, logger } from '../utils/logger';
const log = createLogger('AuthContext');

import React, { createContext, useState, useContext, useEffect } from 'react';
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
import { doc, setDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { purgeUserFirestoreData } from './gdprPurge';
import { db, auth } from '../config/firebase';
import { UserProfile } from '../types';
import { calculateCurrentWeek } from '../utils/pregnancyCalculator';
import { calculateFertileWindow } from '../utils/fertility';
import { migrateAllGuestDataToAuth } from '../services/reminderPersistence';
import { clearContentCache } from '../services/contentService';
import { cancelAllNotifications } from '../services/notificationService';

// NEW-01 & NEW-02 FIX: Single source of truth for ALL private local data keys.
// Any key added here is automatically purged on logout, resetProfile, and deleteAccount.
//
// U-FIX-11: Some services use dynamic key suffixes (e.g. `@weight_entries_${userId}`,
// `reminders_v2_completions_${userId}`, `@daily_checklist_v2_${date}`). These cannot be
// listed statically. They are purged via `purgeDynamicPrivateKeys()` below which scans
// `AsyncStorage.getAllKeys()` for known prefixes.
// W8 #1: the canonical key lists live in ./storageKeys (pure module) so they can be unit-tested
// without loading this Provider — see storageKeys.test.ts.
import { PRIVATE_STORAGE_KEYS, PRIVATE_STORAGE_KEY_PREFIXES } from './storageKeys';

const purgeDynamicPrivateKeys = async () => {
    try {
        const all = await AsyncStorage.getAllKeys();
        const toRemove = all.filter(k =>
            PRIVATE_STORAGE_KEY_PREFIXES.some(prefix => k.startsWith(prefix))
        );
        if (toRemove.length > 0) {
            await AsyncStorage.multiRemove(toRemove);
            log.debug(`[AuthContext] 🧹 Purged ${toRemove.length} dynamic private keys`);
        }
    } catch (e) {
        log.warn('[AuthContext] Failed to purge dynamic private keys:', e);
    }
};


// Re-export pure helper extracted to ./loginHelpers so it can be unit-tested
// without loading AuthContext.tsx (whose JSX trips ts-jest under module:"preserve").
import { resolveLoginProfile, shouldPreserveExistingProfile } from './loginHelpers';
export { resolveLoginProfile } from './loginHelpers';
export type { ResolvedLoginProfile } from './loginHelpers';

interface AuthContextType {
    user: UserProfile | null;
    firebaseUser: FirebaseUser | null;
    loading: boolean;
    register: (email: string, password: string) => Promise<FirebaseUser>;
    // NAV-01: upgrade an in-app guest to a permanent account WITHOUT re-onboarding.
    // Links the anonymous Firebase user in place (preserves uid + data) when one exists;
    // otherwise creates a fresh account and migrates local guest data.
    upgradeGuest: (email: string, password: string) => Promise<FirebaseUser>;
    login: (email: string, password: string) => Promise<void>;
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
    ) => Promise<void>;
    logout: () => Promise<void>;
    // MA6-FIX: updateProfile now reports success/failure explicitly so callers
    // can surface a warning when cloud sync fails. Local AsyncStorage write is
    // attempted first; the function never throws (preserves the historical
    // non-disruptive behavior of profile saves).
    updateProfile: (
        data: Partial<UserProfile>,
    ) => Promise<{ ok: true } | { ok: false, error: string }>;
    setLocale: (locale: string) => Promise<void>;
    resetProfile: () => Promise<void>;
    deleteAccount: () => Promise<void>;
    // F4: when deleteAccount throws REAUTH_REQUIRED, the UI re-prompts for the
    // password and calls this method to finish the deletion (Firestore data is
    // already purged by the prior deleteAccount call — only Auth + local state
    // and notifications remain).
    reauthenticateAndDelete: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);


export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserProfile | null>(null);
    const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        // 1. Try to restore from AsyncStorage first (fastest)
        const loadLocalUser = async () => {
            try {
                const storedProfile = await AsyncStorage.getItem('user_profile');
                if (storedProfile) {
                    const profile = JSON.parse(storedProfile);
                    setUser(profile);
                    log.debug('[AuthContext] ⚡️ Restored user from AsyncStorage');
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
                // Load profile from Firestore for authenticated users
                try {
                    const docSnap = await getDoc(doc(db, 'userProfiles', fbUser.uid));
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
                                setDoc(doc(db, 'userProfiles', fbUser.uid), { currentWeek: calculatedWeek }, { merge: true });
                            }
                        }

                        setUser(profile);
                        await AsyncStorage.setItem('user_profile', JSON.stringify(profile));
                    } else {
                        // R4 FIX: parité avec login() — si une session Firebase existe
                        // mais que le doc Firestore est absent (compte orphelin, race
                        // pendant signup, suppression manuelle), on synthétise le
                        // profil minimal via resolveLoginProfile pour que MainTabs
                        // puisse se monter. Sans ça, l'utilisateur reste coincé sur
                        // AuthStack au cold start malgré une session valide.
                        const { profile, isMinimal } = resolveLoginProfile(docSnap, fbUser);
                        setUser(profile);
                        await AsyncStorage.setItem('user_profile', JSON.stringify(profile));
                        if (isMinimal) {
                            log.warn('[AuthContext] ⚠️ Cold-start: Firestore profile missing — bootstrapped minimal profile');
                            // Note: guest data migration is intentionally NOT triggered here
                            // (parité avec login(): migration ne tourne que pour profil non-minimal).
                        }
                    }
                } catch (error) {
                    log.error('Failed to load user profile:', error);
                }
            }
            // Don't load guest profile automatically - let user go through auth flow
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const register = async (email: string, password: string): Promise<FirebaseUser> => {
        log.debug('[AuthContext] 📝 Registering new user:', email);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            setFirebaseUser(userCredential.user);
            log.debug('[AuthContext] ✅ User registered successfully:', userCredential.user.uid);
            // Return the user so it can be passed to loginAsGuest immediately
            return userCredential.user;
        } catch (error) {
            log.error('[AuthContext] ❌ Registration error:', error);
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
        let upgraded: FirebaseUser;
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
            log.error('[AuthContext] ❌ Guest upgrade error:', error);
            throw error;
        }
        setFirebaseUser(upgraded);
        logger.setUser(upgraded.uid);
        try {
            await migrateAllGuestDataToAuth(upgraded.uid);
            log.info('[AuthContext] ✅ Guest data migrated after upgrade');
        } catch (migrationError) {
            log.warn('[AuthContext] ⚠️ Guest data migration failed (non-blocking):', migrationError);
        }
        // Flip the in-memory profile to authenticated; the !isGuest+firebaseUser sync
        // effect writes it to Firestore, and we persist locally for immediate UX.
        setUser((prev) => {
            if (!prev) return prev;
            const promoted = { ...prev, isGuest: false, uid: upgraded.uid };
            AsyncStorage.setItem('user_profile', JSON.stringify(promoted)).catch(() => {});
            return promoted;
        });
        return upgraded;
    };

    const login = async (email: string, password: string) => {
        log.debug('[AuthContext] 🔐 Logging in user:', email);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            setFirebaseUser(userCredential.user);
            logger.setUser(userCredential.user.uid);
            log.debug('[AuthContext] ✅ User logged in:', userCredential.user.uid);

            // Load profile (BUG FIX: Firestore docs don't carry their own id; F4 FIX:
            // missing doc → minimal placeholder so MainTabs renders. Both branches
            // funneled through `resolveLoginProfile` for unit-testability.)
            const docSnap = await getDoc(doc(db, 'userProfiles', userCredential.user.uid));
            const { profile, isMinimal } = resolveLoginProfile(docSnap, userCredential.user);
            setUser(profile);
            await AsyncStorage.setItem('user_profile', JSON.stringify(profile));

            if (!isMinimal) {
                log.debug('[AuthContext] ✅ User profile loaded from Firestore');
            } else {
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
            log.error('[AuthContext] ❌ Login error:', error);
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
        let effectiveUser = authenticatedUser || firebaseUser;
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
            isGuest: !isAuthenticated,
            ...ttcFields,
            ...curiousFields,
        };

        try {
            if (isAuthenticated) {
                // W1 #3 — re-onboarding data-loss guard. If this authenticated uid ALREADY has a
                // complete profile (a returning user re-ran onboarding and recovered via the
                // email-already-in-use → login path), do NOT overwrite their stored lmp/firstName/
                // createdAt with the fresh onboarding form. Adopt the stored profile, migrate any
                // guest data, and finish. A missing/partial doc (no pregnancy anchor) falls through
                // to the normal create path. See shouldPreserveExistingProfile + its unit tests.
                try {
                    const existingSnap = await getDoc(doc(db, 'userProfiles', uid));
                    if (shouldPreserveExistingProfile(existingSnap)) {
                        const stored = existingSnap.data() || {};
                        const adopted = {
                            ...newUser,
                            ...stored,
                            uid,
                            isGuest: false,
                            currentWeek: stored.isTTC
                                ? 0
                                : (stored.lmp ? calculateCurrentWeek(new Date(stored.lmp)) : newUser.currentWeek),
                        } as UserProfile;
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
            if (isAuthenticated) {
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
        }
    };

    const logout = async () => {
        try {
            if (firebaseUser) {
                await signOut(auth);
            }
            
            // NEW: Cancel native ghost notifications
            try {
                await cancelAllNotifications();
                log.info('[AuthContext] 🧹 All local notifications cancelled (Auth)');
            } catch (err) {
                log.warn('[AuthContext] ⚠️ Failed to cancel notifications:', err);
            }

            // NEW-01 & NEW-02 FIX: Purge ALL private data (shared constant = no key ever missed)
            await AsyncStorage.multiRemove([...PRIVATE_STORAGE_KEYS]);
            // U-FIX-11: also purge dynamic-suffix keys (per-uid weights, completions, daily checklist)
            await purgeDynamicPrivateKeys();
            // Clear in-memory Firestore content cache (articles, supplements)
            clearContentCache();
            log.info('[AuthContext] 🧹 All local data purged on logout');
            setUser(null);
            setFirebaseUser(null);
            logger.setUser(null);
        } catch (error) {
            log.error('Failed to logout:', error);
        }
    };

    // MA6-FIX: returns an explicit { ok, error } discriminated union instead of
    // silently swallowing errors. Callers (ProfileScreen, OnboardingScreen) can
    // now warn the user when cloud sync fails. Function never throws — local
    // AsyncStorage state is always updated when possible so the in-memory user
    // stays consistent even on Firestore write failure.
    const updateProfile = async (
        data: Partial<UserProfile>,
    ): Promise<{ ok: true } | { ok: false, error: string }> => {
        if (!user) return { ok: false, error: 'No authenticated user' };
        const updatedUser = { ...user, ...data };

        let localOk = false;
        try {
            await AsyncStorage.setItem('user_profile', JSON.stringify(updatedUser));
            localOk = true;
        } catch (error: any) {
            log.error('Failed to persist profile to AsyncStorage:', error);
        }

        try {
            // Only update Firestore if not a guest and authenticated
            if (!user.isGuest && firebaseUser) {
                // BUG FIX: Only write safe server fields to Firestore.
                // Never write client-only fields like isGuest, uid, currentWeek (recalculated on load).
                const { isGuest, uid, currentWeek, ...serverSafeData } = data;
                if (Object.keys(serverSafeData).length > 0) {
                    await setDoc(
                        doc(db, 'userProfiles', user.uid),
                        { ...serverSafeData, updatedAt: new Date().toISOString() },
                        { merge: true }
                    );
                }
            }

            setUser(updatedUser);
            return { ok: true };
        } catch (error: any) {
            log.error('Failed to update profile (cloud sync):', error);
            // Still update in-memory state so the UI reflects the user's intent;
            // the next successful sync attempt will reconcile with the server.
            if (localOk) setUser(updatedUser);
            const message =
                typeof error?.message === 'string' && error.message.length > 0
                    ? error.message
                    : 'Cloud sync failed';
            return { ok: false, error: message };
        }
    };

    const setLocale = async (locale: string) => {
        try {
            await AsyncStorage.setItem('app_locale', locale);
            if (user) {
                await updateProfile({ locale });
            }
        } catch (error) {
            log.error('Failed to set locale:', error);
        }
    };

    const resetProfile = async () => {
        try {
            // Delete from Firestore if authenticated user
            if (firebaseUser) {
                const userDocRef = doc(db, 'userProfiles', firebaseUser.uid);
                await deleteDoc(userDocRef);
                await signOut(auth);
            }

            // NEW: Cancel native ghost notifications
            try {
                await cancelAllNotifications();
            } catch (err) {
                log.warn('[AuthContext] ⚠️ Failed to cancel notifications:', err);
            }

            // NEW-01 FIX: Purge ALL private keys including reminder/task data
            await AsyncStorage.multiRemove([...PRIVATE_STORAGE_KEYS]);
            // U-FIX-11: also purge dynamic-suffix keys (per-uid weights, completions, daily checklist)
            await purgeDynamicPrivateKeys();

            // U-FIX-8: also clear the in-memory content cache (articles, supplements)
            // so the next session for a different account doesn't see cached docs.
            clearContentCache();

            // Reset states
            setUser(null);
            setFirebaseUser(null);

            log.debug('[AuthContext] ✅ Profile reset complete — all local data purged');
        } catch (error) {
            log.error('Failed to reset profile:', error);
            throw error;
        }
    };

    const deleteAccount = async () => {
        try {
            if (firebaseUser) {
                const uid = firebaseUser.uid;
                log.debug('[AuthContext] Starting account deletion for:', uid);

                // GDPR purge (RGPD Art. 17) — extracted to gdprPurge.ts so the delete path is
                // behaviorally tested (gdprPurge.test.ts), not just statically grepped. Profile doc
                // + every top-level collection (by user_id) + legacy subcollections, batched at 400.
                // Runs BEFORE the Auth user delete so Firestore owner rules still authorize it.
                await purgeUserFirestoreData(db, uid);

                // 2. Delete Firebase Auth User (Must happen LAST so Firestore rules still apply)
                // F4: Firebase requires a recent login for `auth.delete()`. If the session
                // is too old we surface a typed error so the UI can prompt for the password
                // and call `reauthenticateAndDelete()`. We DO NOT roll back the Firestore
                // purge above — that is the documented design (data is gone, only the auth
                // user remains to be removed after fresh credentials).
                try {
                    await firebaseUser.delete();
                } catch (authErr: any) {
                    if (authErr?.code === 'auth/requires-recent-login') {
                        const e = new Error('REAUTH_REQUIRED');
                        (e as any).code = 'REAUTH_REQUIRED';
                        throw e;
                    }
                    throw authErr;
                }
                log.debug('[AuthContext] Firebase Auth user deleted');

                // NEW: Cancel native ghost notifications
                try {
                    await cancelAllNotifications();
                } catch (err) {
                    log.warn('[AuthContext] ⚠️ Failed to cancel notifications:', err);
                }

                // 3. Clear Local Storage (use shared constant — no key is missed)
                await AsyncStorage.multiRemove([...PRIVATE_STORAGE_KEYS]);
                // U-FIX-11: also purge dynamic-suffix keys
                await purgeDynamicPrivateKeys();

                // U-FIX-8: also clear in-memory content cache (consistency with logout/reset)
                clearContentCache();

                // 4. Reset State
                setUser(null);
                setFirebaseUser(null);
                logger.setUser(null);
            }
        } catch (error) {
            log.error('Failed to delete account:', error);
            throw error;
        }
    };

    // F4: Finish account deletion after a `auth/requires-recent-login` rejection.
    // Firestore data was already purged by `deleteAccount()`; here we only need to
    // re-authenticate, delete the Firebase Auth user, then clean up local state.
    const reauthenticateAndDelete = async (password: string) => {
        if (!firebaseUser || !firebaseUser.email) {
            throw new Error('No authenticated user with email to reauthenticate');
        }
        const credential = EmailAuthProvider.credential(firebaseUser.email, password);
        await reauthenticateWithCredential(firebaseUser, credential);

        await firebaseUser.delete();
        log.debug('[AuthContext] Firebase Auth user deleted (after reauth)');

        try {
            await cancelAllNotifications();
        } catch (err) {
            log.warn('[AuthContext] Failed to cancel notifications:', err);
        }

        await AsyncStorage.multiRemove([...PRIVATE_STORAGE_KEYS]);
        await purgeDynamicPrivateKeys();
        clearContentCache();

        setUser(null);
        setFirebaseUser(null);
        logger.setUser(null);
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
