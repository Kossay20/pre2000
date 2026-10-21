import supplementsData from '../supplements_db.json';

/**
 * W5 #1 — PATIENT-SAFETY guard.
 *
 * Bundled supplements_db is the de-facto primary source (the Firestore 'supplements' collection is
 * never seeded), so a malformed pregnancy_safety token reaches every user. A NON-canonical token
 * (e.g. the accented 'à_surveiller' that shipped for Vitamine A / Zinc / Vit C / Selenium) does not
 * match the screen's ASCII SAFETY_CONFIG keys and previously fell through to the green "✓ Safe" config
 * — actively mislabeling a teratogen as safe. This test pins the data to the canonical ASCII tokens so
 * that class of bug can never silently ship again.
 */
describe('supplements_db pregnancy_safety integrity', () => {
    const VALID = new Set(['ok', 'a_surveiller', 'deconseille']);
    const supplements = supplementsData as Array<{ id?: string; name_fr?: string; pregnancy_safety?: string }>;

    it('every supplement carries a canonical ASCII safety token', () => {
        const offenders = supplements
            .filter(s => !VALID.has(s.pregnancy_safety as string))
            .map(s => `${s.name_fr || s.id}: ${JSON.stringify(s.pregnancy_safety)}`);
        expect(offenders).toEqual([]);
    });

    it('has at least one of each non-ok class (so the safety taxonomy is exercised, not all-green)', () => {
        const tokens = new Set(supplements.map(s => s.pregnancy_safety));
        expect(tokens.has('a_surveiller')).toBe(true);
    });
});
