/**
 * Non-regression tests for W1 #3 — re-onboarding must not overwrite an existing profile.
 *
 * BUG: `loginAsGuest` (the single sink for every onboarding flow: pregnant / TTC / curious)
 * unconditionally `setDoc(merge)`-wrote the freshly-collected form (firstName / lmp /
 * pregnancyStartDate / createdAt) for any authenticated uid. On the `auth/email-already-in-use`
 * recovery path a RETURNING user who re-runs onboarding and re-enters their existing credentials
 * therefore had their real pregnancy date + name overwritten and `createdAt` reset.
 *
 * FIX: `shouldPreserveExistingProfile(docSnap)` gates an adopt-instead-of-overwrite branch.
 * Same Option-C strategy + `fakeDocSnap` shape as resolveLoginProfile (AuthContext.login.test.ts):
 * lock the pure predicate — the only branch where the data-loss could regress. The side effects
 * (adopt + setUser + migrate + early return) live in loginAsGuest around it.
 */

import { shouldPreserveExistingProfile } from '../loginHelpers';

const fakeDocSnap = (exists: boolean, data: Record<string, unknown> = {}) => ({
    exists: () => exists,
    data: () => data,
});

describe('shouldPreserveExistingProfile — W1 #3 re-onboard guard', () => {
    it('PRESERVES when a doc exists with an lmp anchor (the data-loss case)', () => {
        expect(shouldPreserveExistingProfile(fakeDocSnap(true, { lmp: '2026-01-01T00:00:00.000Z', firstName: 'Sara' }))).toBe(true);
    });

    it('PRESERVES when a doc exists with pregnancyStartDate but no lmp (old profile shape)', () => {
        expect(shouldPreserveExistingProfile(fakeDocSnap(true, { pregnancyStartDate: '2026-01-01T00:00:00.000Z' }))).toBe(true);
    });

    it('PRESERVES a TTC profile (cycle anchor stored as pregnancyStartDate)', () => {
        expect(shouldPreserveExistingProfile(fakeDocSnap(true, { isTTC: true, pregnancyStartDate: '2026-02-01T00:00:00.000Z' }))).toBe(true);
    });

    it('does NOT preserve when the doc is missing (fresh signup — nothing to lose)', () => {
        expect(shouldPreserveExistingProfile(fakeDocSnap(false))).toBe(false);
    });

    it('does NOT preserve an orphan/partial doc with no pregnancy anchor (partial-signup recovery)', () => {
        expect(shouldPreserveExistingProfile(fakeDocSnap(true, { firstName: '', country: '' }))).toBe(false);
    });

    it('is defensive against a null/undefined snapshot (read failure handled by caller)', () => {
        // @ts-expect-error — exercising the runtime guard
        expect(shouldPreserveExistingProfile(null)).toBe(false);
        // @ts-expect-error
        expect(shouldPreserveExistingProfile(undefined)).toBe(false);
    });

    it('tolerates a docSnap whose data() returns null/undefined', () => {
        expect(shouldPreserveExistingProfile({ exists: () => true, data: () => null })).toBe(false);
        expect(shouldPreserveExistingProfile({ exists: () => true, data: () => undefined })).toBe(false);
    });
});
