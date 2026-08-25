/**
 * The declared conditions have to survive a restart.
 *
 * The first cut of this feature spread the flags into the in-memory profile and
 * into AsyncStorage, but `loginAsGuest` builds its Firestore payload field by
 * field — firstName, lmp, country, then a run of `if (x !== undefined)` lines —
 * and the four medical fields were not among them. That alone would have been a
 * sync gap. What made it data loss is the cold start: `onAuthStateChanged`
 * rebuilds the profile from the Firestore document alone, with no merge against
 * the cached copy, and writes the result back over AsyncStorage. A woman would
 * have declared gestational diabetes, seen the glucose reminder appear, restarted
 * the app once, and lost both.
 *
 * These tests pin the payload shape rather than the happy path, because the happy
 * path passed.
 */
import { sanitizeMedicalFlags, toContextUserFlags } from '../../utils/medicalFlags';

describe('sanitizeMedicalFlags', () => {
    it('keeps the three booleans and the timestamp', () => {
        const at = '2026-08-25T10:00:00.000Z';
        expect(
            sanitizeMedicalFlags({
                hasGestationalDiabetes: true,
                hasHypertension: false,
                isTwinPregnancy: true,
                medicalProfileAnsweredAt: at,
            }),
        ).toEqual({
            hasGestationalDiabetes: true,
            hasHypertension: false,
            isTwinPregnancy: true,
            medicalProfileAnsweredAt: at,
        });
    });

    it('drops anything that is not a real boolean', () => {
        // A string "true" would reach the rule engine, be compared by strict
        // equality against a rule's boolean, and quietly match nothing — the same
        // inert-rule defect this feature exists to close, by a different door.
        expect(
            sanitizeMedicalFlags({
                hasGestationalDiabetes: 'true',
                hasHypertension: 1,
                isTwinPregnancy: { yes: true },
            }),
        ).toEqual({});
    });

    it('drops unknown keys instead of passing them through to the profile', () => {
        expect(sanitizeMedicalFlags({ hasDiabetes: true, isPregnant: true })).toEqual({});
    });

    it('survives junk input without throwing', () => {
        for (const junk of [null, undefined, 0, 'x', [], true]) {
            expect(sanitizeMedicalFlags(junk)).toEqual({});
        }
    });

    it('caps the timestamp at what the Firestore rule accepts', () => {
        // firestore.rules caps medicalProfileAnsweredAt at 40 chars. A longer value
        // reaching setDoc surfaces as a silent { ok: false } the UI never shows.
        expect(sanitizeMedicalFlags({ medicalProfileAnsweredAt: 'x'.repeat(200) }))
            .toEqual({});
        expect(
            sanitizeMedicalFlags({ medicalProfileAnsweredAt: new Date().toISOString() })
                .medicalProfileAnsweredAt,
        ).toBeDefined();
    });
});

describe('the Firestore payload carries the flags', () => {
    // loginAsGuest whitelists fields into `profileData` one at a time. A field that
    // is not named there never leaves the device, and the cold start then
    // overwrites the local copy from the server document. This asserts the
    // whitelist by reading the source, which is the only place the omission was
    // visible — every unit test of the in-memory profile passed while the bug was
    // live.
    const src = require('fs').readFileSync(
        require('path').join(__dirname, '..', 'AuthContext.tsx'),
        'utf8',
    ) as string;
    const payload = src.slice(
        src.indexOf('const profileData: Record<string, any> = {'),
        src.indexOf("await setDoc(doc(db, 'userProfiles', uid), profileData"),
    );

    it.each([
        'hasGestationalDiabetes',
        'hasHypertension',
        'isTwinPregnancy',
        'medicalProfileAnsweredAt',
    ])('%s is written to userProfiles, not only to AsyncStorage', (field) => {
        expect(payload).toContain(field);
    });

    it('still writes the field it always wrote — the guard is not vacuous', () => {
        expect(payload).toContain('isFirstPregnancy');
    });
});

describe('toContextUserFlags', () => {
    it('maps the profile vocabulary onto the rule-engine vocabulary', () => {
        expect(toContextUserFlags({ hasGestationalDiabetes: true, isTwinPregnancy: false }))
            .toEqual({
                has_gestational_diabetes: true,
                has_hypertension: undefined,
                is_twins: false,
            });
    });

    it('returns undefineds for a null profile rather than throwing', () => {
        expect(toContextUserFlags(null)).toEqual({
            has_gestational_diabetes: undefined,
            has_hypertension: undefined,
            is_twins: undefined,
        });
    });
});
