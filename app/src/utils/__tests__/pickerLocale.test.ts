import { getPickerLocale } from '../pickerLocale';

/**
 * Unit tests for getPickerLocale — pure locale-mapping helper.
 *
 * Source: src/utils/pickerLocale.ts
 * Behavior: maps an i18n language code to a BCP47 locale string for
 * @react-native-community/datetimepicker.
 *
 *   'ar'  -> 'ar-DZ-u-nu-latn'   (Algerian Arabic, Latin digits)
 *   'tn'  -> 'ar-TN-u-nu-latn'   (Tunisian Arabic, Latin digits)
 *   'en'  -> 'en-US'
 *   'fr'  -> 'fr-FR'
 *   default (anything else) -> 'fr-FR'
 *
 * Pure function, no dependencies — no mocks required.
 */
describe('getPickerLocale', () => {
    describe('supported app languages (FR/EN/AR/TN)', () => {
        it("maps 'fr' to 'fr-FR'", () => {
            expect(getPickerLocale('fr')).toBe('fr-FR');
        });

        it("maps 'en' to 'en-US'", () => {
            expect(getPickerLocale('en')).toBe('en-US');
        });

        it("maps 'ar' to 'ar-DZ-u-nu-latn' (Algerian Arabic with Latin digits)", () => {
            expect(getPickerLocale('ar')).toBe('ar-DZ-u-nu-latn');
        });

        it("maps 'tn' to 'ar-TN-u-nu-latn' (Tunisian Arabic with Latin digits)", () => {
            expect(getPickerLocale('tn')).toBe('ar-TN-u-nu-latn');
        });
    });

    describe('Arabic variants carry the Latin-numbering BCP47 extension', () => {
        it("'ar' result requests Latin digits via the '-u-nu-latn' extension", () => {
            expect(getPickerLocale('ar')).toContain('-u-nu-latn');
        });

        it("'tn' result requests Latin digits via the '-u-nu-latn' extension", () => {
            expect(getPickerLocale('tn')).toContain('-u-nu-latn');
        });

        it("'ar' targets the Algerian (DZ) region", () => {
            expect(getPickerLocale('ar')).toMatch(/^ar-DZ/);
        });

        it("'tn' targets the Tunisian (TN) region", () => {
            expect(getPickerLocale('tn')).toMatch(/^ar-TN/);
        });

        it("'fr' and 'en' results do NOT carry the Latin-numbering extension", () => {
            expect(getPickerLocale('fr')).not.toContain('-u-nu-latn');
            expect(getPickerLocale('en')).not.toContain('-u-nu-latn');
        });
    });

    describe('default / fallback branch', () => {
        it("falls back to 'fr-FR' for an unknown language code", () => {
            expect(getPickerLocale('de')).toBe('fr-FR');
        });

        it("falls back to 'fr-FR' for an empty string", () => {
            expect(getPickerLocale('')).toBe('fr-FR');
        });

        it("falls back to 'fr-FR' for a full BCP47 tag that is not an exact key match", () => {
            // Only the bare 'fr' key matches; 'fr-FR' as input is not a case label.
            expect(getPickerLocale('fr-FR')).toBe('fr-FR');
        });

        it("falls back to 'fr-FR' for an uppercase 'FR' (switch is case-sensitive)", () => {
            expect(getPickerLocale('FR')).toBe('fr-FR');
        });

        it("falls back to 'fr-FR' for uppercase 'EN' (no case-insensitive match)", () => {
            // EN is not 'en', so it must NOT resolve to 'en-US'.
            expect(getPickerLocale('EN')).toBe('fr-FR');
            expect(getPickerLocale('EN')).not.toBe('en-US');
        });

        it("falls back to 'fr-FR' for uppercase 'AR' (no case-insensitive match)", () => {
            expect(getPickerLocale('AR')).toBe('fr-FR');
            expect(getPickerLocale('AR')).not.toBe('ar-DZ-u-nu-latn');
        });

        it("falls back to 'fr-FR' for a code with surrounding whitespace", () => {
            // No trimming is performed, so ' fr' is not the 'fr' key.
            expect(getPickerLocale(' fr')).toBe('fr-FR');
            expect(getPickerLocale('fr ')).toBe('fr-FR');
        });

        it("falls back to 'fr-FR' for an arbitrary garbage string", () => {
            expect(getPickerLocale('xyz-not-a-locale')).toBe('fr-FR');
        });
    });

    describe('edge cases / defensive input handling', () => {
        it("returns 'fr-FR' for null cast to string-like input", () => {
            // Not a declared key -> default branch.
            expect(getPickerLocale(null as unknown as string)).toBe('fr-FR');
        });

        it("returns 'fr-FR' for undefined input", () => {
            expect(getPickerLocale(undefined as unknown as string)).toBe('fr-FR');
        });

        it("returns 'fr-FR' for a numeric value coerced as language", () => {
            expect(getPickerLocale(42 as unknown as string)).toBe('fr-FR');
        });
    });

    describe('output contract', () => {
        const KNOWN = ['ar', 'tn', 'en', 'fr'];

        it.each(KNOWN)("returns a non-empty string for known code '%s'", (code) => {
            const result = getPickerLocale(code);
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
        });

        it('returns a string for every input (never throws / never returns undefined)', () => {
            const inputs = ['fr', 'en', 'ar', 'tn', '', 'zz', 'EN', ' '];
            for (const input of inputs) {
                const result = getPickerLocale(input);
                expect(typeof result).toBe('string');
                expect(result).not.toBeUndefined();
            }
        });

        it('every known code resolves to a well-formed BCP47-style language-region tag', () => {
            // Starts with a 2-letter language subtag followed by '-'.
            for (const code of KNOWN) {
                expect(getPickerLocale(code)).toMatch(/^[a-z]{2}-[A-Z]{2}/);
            }
        });

        it('is deterministic — repeated calls yield identical results', () => {
            expect(getPickerLocale('ar')).toBe(getPickerLocale('ar'));
            expect(getPickerLocale('zzz')).toBe(getPickerLocale('zzz'));
        });

        it('distinct known codes map to distinct locales (no collisions among ar/tn/en/fr)', () => {
            const results = KNOWN.map((c) => getPickerLocale(c));
            const unique = new Set(results);
            expect(unique.size).toBe(KNOWN.length);
        });
    });
});
