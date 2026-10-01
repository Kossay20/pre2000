import { createLogger } from '../utils/logger';
const log = createLogger('PregnancyContext');
// src/context/PregnancyContext.tsx
import React, { useMemo, createContext, useContext, useEffect, useState } from 'react';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { calculatePregnancyWeek } from '../utils/pregnancyCalculator';
import { calculateCycleDay } from '../utils/fertility';
import { guestLocalFields } from './profileSync';
// R3 FIX: EmergencyContact is now defined in types/ so it can be referenced by
// UserProfile without a circular import. Re-exported here for backward compat
// (existing imports `import { EmergencyContact } from '../context/PregnancyContext'`
// keep working).
import type { EmergencyContact } from '../types';
export type { EmergencyContact };

export type Profile = {
    firstName: string;
    lastName?: string;
    country: string;
    lmp?: string; // ISO date string
    dpa?: string; // ISO date string
    prePregnancyWeight?: number; // kg - for weight tracking
    height?: number; // cm - for BMI calculation
    emergencyContacts?: EmergencyContact[];
};

// MA7-FIX: PregnancyInfo now carries an explicit `mode` so consumers can
// distinguish a real pregnant user (week/day are valid) from a TTC user
// (week/day are 0 and must NOT be rendered as pregnancy progress).
export type PregnancyMode = 'pregnant' | 'ttc';

export type PregnancyInfo = {
    week: number;
    dayInWeek: number;
    isInvalid?: boolean;
    // 40+0..42+0 SA: past the due date, still a pregnancy. week/dayInWeek stay on
    // 40/7 (the last day the weeks content covers); the real age is below.
    isPostTerm?: boolean;
    // Completed weeks + days ("31 SA + 2 j"), unclamped — see calculatePregnancyWeek.
    completedWeeks?: number;
    completedDays?: number;
    mode: PregnancyMode;
};

// MA7-FIX: TTCInfo exposes the cycle data needed by future TTC-specific UI
// without requiring screens to recompute it from raw user fields. All values
// derive from `user.lmp` (= last period date in TTC mode), `user.cycleLength`,
// `user.ovulationDate`, `user.fertileWindowStart/End` (set by AuthContext
// during onboarding via `calculateFertileWindow`).
export type TTCInfo = {
    cycleDay: number | null;          // 1-based day of the current cycle, null if LMP missing/in-future
    daysToOvulation: number | null;   // negative = past, 0 = today, positive = future; null if no ovulationDate
    inFertileWindow: boolean;         // today ∈ [fertileWindowStart, fertileWindowEnd]
    cycleLength: number;              // clamped value (defaults to 28 if user.cycleLength missing)
};

type PregnancyContextType = {
    profile: Profile | null;
    setProfile: (p: Profile) => Promise<void>;
    pregnancyInfo: PregnancyInfo | null;
    ttcInfo: TTCInfo | null;
    loading: boolean;
};

const PregnancyContext = createContext<PregnancyContextType | undefined>(undefined);

export const PregnancyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, updateProfile: updateAuthProfile, firebaseUser } = useAuth();
    const [profile, setProfileState] = useState<Profile | null>(null);
    const [pregnancyInfo, setPregnancyInfo] = useState<PregnancyInfo | null>(null);
    const [ttcInfo, setTtcInfo] = useState<TTCInfo | null>(null);
    const [loading, setLoading] = useState(true);

    // Debug: Component mount
    useEffect(() => {
        log.debug('[PregnancyContext] 🚀 Component mounted, user:', user?.uid);
    }, []);

    // Load existing profile on mount or when user changes
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                if (user) {
                    // OPTIMIZATION: Use data from AuthContext if available (it's already loaded from AsyncStorage/Firestore)
                    // Guests also have their LMP saved in AuthContext when they do onboarding
                    if (user.lmp || user.pregnancyStartDate) {
                        const profileData: Profile = {
                            firstName: user.firstName,
                            lastName: user.lastName,
                            country: user.country,
                            lmp: user.lmp || user.pregnancyStartDate,
                            dpa: user.dpa,
                            // R3 FIX: hydrate emergencyContacts from the auth profile so
                            // they survive app restart (Firestore for auth users,
                            // AsyncStorage 'user_profile' for the cached snapshot).
                            emergencyContacts: user.emergencyContacts,
                            // PT-01 / F-PROF-01 FIX: carry physical data from the auth
                            // profile when present (auth users persist these via
                            // AuthContext.updateProfile → Firestore/'user_profile').
                            ...(user.height !== undefined ? { height: user.height } : {}),
                            ...(user.prePregnancyWeight !== undefined ? { prePregnancyWeight: user.prePregnancyWeight } : {}),
                        };
                        // PT-01 / F-PROF-01 FIX: for guests, height & prePregnancyWeight are
                        // written ONLY to the 'guestProfile' AsyncStorage entry (by
                        // WeightTracker setup / ProfileScreen via setProfile) and are NOT
                        // present on the AuthContext user object. Without merging them here
                        // the WeightTracker setup gate (profile.height/prePregnancyWeight)
                        // re-triggers on every reload and Profile inputs come back empty.
                        // The same holds for a guest's emergency contacts, which vanished
                        // from Profile on every reload.
                        if (user.isGuest) {
                            try {
                                const storedGuest = await AsyncStorage.getItem('guestProfile');
                                Object.assign(
                                    profileData,
                                    guestLocalFields(profileData, storedGuest ? (JSON.parse(storedGuest) as Profile) : null),
                                );
                            } catch (mergeErr) {
                                log.warn('[PregnancyContext] ⚠️ Failed to merge guestProfile data', mergeErr);
                            }
                        }
                        setProfileState(profileData);
                        computeInfo(profileData);
                        log.debug('[PregnancyContext] ⚡️ Used profile from AuthContext');
                    } else if (!user.isGuest) {
                        // Fallback to Firestore if AuthContext data is incomplete and not a guest
                        if (!user.uid) {
                            log.warn('[PregnancyContext] ⚠️ User object exists but has no UID, skipping Firestore load');
                            setLoading(false);
                            return;
                        }
                        const snap = await getDoc(doc(db, 'userProfiles', user.uid));
                        if (snap.exists()) {
                            const data = snap.data() as Profile;
                            setProfileState(data);
                            computeInfo(data);
                        }
                    }
                } else {
                    const stored = await AsyncStorage.getItem('guestProfile');
                    if (stored) {
                        const data = JSON.parse(stored) as Profile;
                        setProfileState(data);
                        computeInfo(data);
                    }
                }
            } catch (e) {
                log.error('[PregnancyContext] ❌ Error loading profile', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [user]);

    // 🚀 AUTO-SYNC: Recalculate pregnancy info every hour
    // MA7-FIX: also re-run when the TTC flag flips so a profile that becomes TTC
    // (or stops being TTC) immediately switches mode without waiting for an hour.
    useEffect(() => {
        log.debug('[PregnancyContext] 🔍 Auto-sync effect triggered, profile.lmp:', profile?.lmp, 'isTTC:', user?.isTTC);
        if (!profile) {
            log.debug('[PregnancyContext] ⚠️ No profile, skipping auto-sync setup');
            return;
        }

        log.debug('[PregnancyContext] 🔄 Setting up auto-sync interval');

        // Recalculate immediately
        computeInfo(profile);

        // Recalculate every hour (3600000 ms)
        const interval = setInterval(() => {
            log.debug('[PregnancyContext] ⏰ Auto-sync triggered');
            computeInfo(profile);
        }, 3600000); // 1 hour

        return () => {
            log.debug('[PregnancyContext] 🛑 Clearing auto-sync interval');
            clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile?.lmp, user?.isTTC, user?.cycleLength, user?.ovulationDate, user?.fertileWindowStart, user?.fertileWindowEnd]);

    // MA7-FIX: when the user is in TTC mode, the date stored in `lmp` is the
    // last period date — NOT a pregnancy LMP. We must NOT compute a pregnancy
    // week from it (would falsely render "semaine X de grossesse" for a
    // non-pregnant user). Instead we expose cycle-tracking data via `ttcInfo`.
    const computeInfo = (p: Profile) => {
        if (user?.isTTC === true) {
            const lmpDate = p.lmp ? new Date(p.lmp) : null;
            const cycleLength = user.cycleLength ?? 28;

            if (!lmpDate || isNaN(lmpDate.getTime())) {
                log.debug('[PregnancyContext] ⚠️ TTC mode but no valid LMP — exposing minimal TTC info');
                setPregnancyInfo({ week: 0, dayInWeek: 0, mode: 'ttc' });
                setTtcInfo({
                    cycleDay: null,
                    daysToOvulation: null,
                    inFertileWindow: false,
                    cycleLength,
                });
                return;
            }

            const today = new Date();
            const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());

            const cycleDay = calculateCycleDay(lmpDate, today);

            let daysToOvulation: number | null = null;
            if (user.ovulationDate) {
                const ov = new Date(user.ovulationDate);
                if (!isNaN(ov.getTime())) {
                    const ovUtc = Date.UTC(ov.getUTCFullYear(), ov.getUTCMonth(), ov.getUTCDate());
                    daysToOvulation = Math.round((ovUtc - todayUtc) / (1000 * 60 * 60 * 24));
                }
            }

            let inFertileWindow = false;
            if (user.fertileWindowStart && user.fertileWindowEnd) {
                const start = new Date(user.fertileWindowStart);
                const end = new Date(user.fertileWindowEnd);
                if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
                    const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
                    inFertileWindow = todayUtc >= startUtc && todayUtc <= endUtc;
                }
            }

            log.debug(`[PregnancyContext] 💕 TTC info: cycleDay=${cycleDay}, daysToOvulation=${daysToOvulation}, inFertileWindow=${inFertileWindow}`);
            setPregnancyInfo({ week: 0, dayInWeek: 0, mode: 'ttc' });
            setTtcInfo({ cycleDay, daysToOvulation, inFertileWindow, cycleLength });
            return;
        }

        // Pregnant mode (existing behavior preserved)
        let lmpDate: Date | null = null;

        if (p.lmp) {
            // Standard case: LMP is directly available
            lmpDate = new Date(p.lmp);
        } else if (p.dpa) {
            // NEW-03 FIX: DPA (Due Date) = LMP + 280 days → LMP = DPA - 280 days
            // CRITICAL: Using DPA directly as LMP would give ~week 80, a medical impossibility.
            const dpa = new Date(p.dpa);
            lmpDate = new Date(dpa.getTime() - 280 * 24 * 60 * 60 * 1000);
            log.debug('[PregnancyContext] 🔄 Derived LMP from DPA:', lmpDate.toISOString());
        }

        if (!lmpDate) {
            log.debug('[PregnancyContext] ⚠️ No LMP or DPA found');
            return;
        }

        const { week, day, isInvalid, isPostTerm, completedWeeks, completedDays } = calculatePregnancyWeek(lmpDate);
        log.debug(`[PregnancyContext] 📊 Week ${week}, Day ${day}, isInvalid=${isInvalid}`);
        // Bail out when nothing actually changed. This runs on an hourly interval,
        // and it used to hand back a NEW object every time regardless — invalidating
        // the whole consumer tree once an hour, forever, for no reason (the week and
        // day only change at midnight).
        setPregnancyInfo(prev =>
            prev
                && prev.mode === 'pregnant'
                && prev.week === week
                && prev.dayInWeek === day
                && prev.isInvalid === isInvalid
                && prev.isPostTerm === isPostTerm
                && prev.completedWeeks === completedWeeks
                && prev.completedDays === completedDays
                ? prev
                : { week, dayInWeek: day, isInvalid, isPostTerm, completedWeeks, completedDays, mode: 'pregnant' }
        );
        setTtcInfo(null);
    };

    const setProfile = async (p: Profile) => {
        setLoading(true);
        try {
            // NEW-05 FIX: PregnancyContext.setProfile only manages LOCAL state.
            // For authenticated users, Firestore is written by AuthContext.updateProfile (called by ProfileScreen).
            // This eliminates the double Firestore write to userProfiles.
            if (!user || user.isGuest) {
                await AsyncStorage.setItem('guestProfile', JSON.stringify(p));
            } else if (firebaseUser) {
                // R3 FIX: emergencyContacts is the only Profile field whose ONLY
                // write path is PregnancyContext.setProfile (called by
                // EmergencyContactsSection). All other Profile fields (firstName,
                // lastName, country, lmp, dpa, prePregnancyWeight, height) are
                // already persisted to Firestore via AuthContext.updateProfile by
                // ProfileScreen / OnboardingScreen. So for an authenticated
                // non-guest user we forward emergencyContacts (and only that)
                // to AuthContext.updateProfile so it survives app restart.
                // Without this the contacts were memory-only and lost on cold start.
                if (Array.isArray(p.emergencyContacts)) {
                    // updateProfile reports failure instead of throwing; a contact the
                    // account never received must not look saved.
                    const res = await updateAuthProfile({ emergencyContacts: p.emergencyContacts });
                    if (!res.ok) throw new Error(`emergencyContacts not saved: ${res.error}`);
                }
            }
            // For auth users: also update in-memory state. AuthContext owns Firestore for the rest.
            setProfileState(p);
            computeInfo(p);
        } catch (e) {
            log.error('[PregnancyContext] ❌ Error setting profile', e);
            // Rethrown: callers (WeightTracker setup, emergency contacts, a guest's Profile
            // save) tell her it was not saved. Swallowing it let those report success.
            throw e;
        } finally {
            setLoading(false);
        }
    };

    // Fresh object literal on every render meant all 17 consumers re-rendered
    // whenever this provider did — and since PregnancyProvider itself consumes
    // useAuth(), every AuthContext render cascaded through here.
    const contextValue = useMemo(
        () => ({ profile, setProfile, pregnancyInfo, ttcInfo, loading }),
        [profile, setProfile, pregnancyInfo, ttcInfo, loading],
    );

    return (
        <PregnancyContext.Provider value={contextValue}>
            {children}
        </PregnancyContext.Provider>
    );
};

export const usePregnancy = () => {
    const context = useContext(PregnancyContext);
    if (!context) throw new Error('usePregnancy must be used within PregnancyProvider');
    return context;
};
