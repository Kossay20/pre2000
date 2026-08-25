/**
 * Pure helpers extracted from AuthContext.tsx for unit-testability.
 *
 * Kept in a `.ts` (no JSX) file so tests can import these helpers without
 * loading AuthContext.tsx — which pulls in Firebase, Sentry, RN persistence,
 * and a JSX Provider, all of which crash under Jest/Node.
 */

import { UserProfile } from '../types';

/**
 * Result of resolving the post-login profile from a Firestore snapshot.
 * `isMinimal` is `true` when the Firestore `userProfiles/{uid}` doc is missing
 * and we synthesised a placeholder so the app can still render (F4 fix).
 */
export interface ResolvedLoginProfile {
    profile: UserProfile;
    isMinimal: boolean;
}

/**
 * Build the post-login `UserProfile` from a Firestore docSnap + Firebase user.
 *
 * Two branches:
 *  - docSnap.exists() === true  → spread Firestore data, inject uid (Firestore docs
 *    don't carry their own id), and fall back `pregnancyStartDate` to `lmp` for
 *    backward-compat with old profile shapes.
 *  - docSnap.exists() === false → return a minimal placeholder (uid + email only,
 *    isGuest: false) so the app can render MainTabs and prompt the user to
 *    complete onboarding. This is the F4 fix: previously `setUser` was never
 *    called in this branch and the user got stuck on AuthStack with an open
 *    Firebase session.
 *
 * Pure: no I/O, no React state, no globals. Safe to unit-test.
 */
export const resolveLoginProfile = (
    docSnap: { exists: () => boolean; data: () => any },
    firebaseUser: { uid: string; email: string | null | undefined },
    /**
     * The locally cached profile, when there is one.
     *
     * This is load-bearing the moment Anonymous Auth is switched on, which guest
     * mode requires. `loginAsGuest` writes to Firestore only for a PERMANENT
     * account, so an anonymous guest finishes onboarding with no
     * `userProfiles/{uid}` document at all. On the next launch her anonymous
     * session restores, the lookup misses, and the minimal placeholder below
     * would be installed over the real cached profile — blank name, no LMP, and
     * `isGuest: false`. She would lose her pregnancy on the first restart.
     *
     * The whole audit campaign ran with Anonymous Auth OFF, where an anonymous
     * session never exists and this branch is unreachable for guests. Turning it
     * on is an operator action on the deployment checklist.
     */
    cachedProfile?: UserProfile | null
): ResolvedLoginProfile => {
    if (docSnap.exists()) {
        const data = docSnap.data();
        const profile = {
            ...data,
            uid: firebaseUser.uid,
            pregnancyStartDate: data.pregnancyStartDate || data.lmp,
        } as UserProfile;
        return { profile, isMinimal: false };
    }
    // Same uid only. A cached profile from a different account must never be
    // adopted — that would hand one user another's pregnancy data.
    if (
        cachedProfile &&
        cachedProfile.uid === firebaseUser.uid &&
        (cachedProfile.pregnancyStartDate || cachedProfile.lmp)
    ) {
        return { profile: cachedProfile, isMinimal: false };
    }
    const minimal = {
        uid: firebaseUser.uid,
        email: firebaseUser.email ?? undefined,
        firstName: '',
        country: '',
        isGuest: false,
    } as unknown as UserProfile;
    return { profile: minimal, isMinimal: true };
};

/**
 * W1 #3 (re-onboarding data-loss guard).
 *
 * `loginAsGuest` is the single sink every onboarding flow (pregnant / TTC / curious)
 * uses to persist the collected profile. On the `auth/email-already-in-use` recovery
 * path (a RETURNING user re-runs onboarding and re-enters their existing credentials),
 * it would `setDoc(merge)` the fresh form values over the stored profile — overwriting
 * their real `lmp` / `firstName` and resetting `createdAt`.
 *
 * This predicate tells `loginAsGuest` to ADOPT the stored profile instead of overwriting
 * it: true iff a Firestore doc already exists AND carries a real pregnancy anchor
 * (`lmp` or `pregnancyStartDate`). A missing doc, or an orphan/partial doc with no anchor,
 * returns false → the normal create path runs (correct for fresh signup + partial-signup
 * recovery, where there is nothing to preserve).
 *
 * Pure: no I/O. Mirrors `resolveLoginProfile`'s docSnap shape so it unit-tests the same way.
 */
export const shouldPreserveExistingProfile = (
    docSnap: { exists: () => boolean; data: () => any }
): boolean => {
    if (!docSnap || !docSnap.exists()) return false;
    const data = docSnap.data() || {};
    return !!(data.lmp || data.pregnancyStartDate);
};
