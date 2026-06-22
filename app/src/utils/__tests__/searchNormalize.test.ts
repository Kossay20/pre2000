import { normalizeForSearch } from '../searchNormalize';

describe('normalizeForSearch (W5 — diacritic/case/script-insensitive food search)', () => {
    it('lowercases', () => {
        expect(normalizeForSearch('Fromage')).toBe('fromage');
    });

    it('strips French accents so "pate" matches "pâté"', () => {
        expect(normalizeForSearch('Pâté')).toBe('pate');
        expect(normalizeForSearch('Pâté').includes(normalizeForSearch('pate'))).toBe(true);
        expect(normalizeForSearch('crème fraîche')).toBe('creme fraiche');
        expect(normalizeForSearch('œuf à la coque')).toContain('uf a la coque');
    });

    it('normalizes Arabic alef variants (أ/إ/آ → ا) via NFD + combining-mark strip', () => {
        // The bug this guards: a naive alef .replace AFTER normalize is a no-op (already decomposed).
        expect(normalizeForSearch('أكل').includes(normalizeForSearch('اكل'))).toBe(true);
        expect(normalizeForSearch('إجاص').includes(normalizeForSearch('اجاص'))).toBe(true);
        expect(normalizeForSearch('آمن').includes(normalizeForSearch('امن'))).toBe(true);
    });

    it('strips Arabic harakat/tashkeel so a query without vowels still matches', () => {
        // سَمَك (with fatha marks) vs سمك (bare)
        expect(normalizeForSearch('سَمَك')).toBe(normalizeForSearch('سمك'));
    });

    it('is null/undefined/empty safe', () => {
        expect(normalizeForSearch(null)).toBe('');
        expect(normalizeForSearch(undefined)).toBe('');
        expect(normalizeForSearch('   ')).toBe('');
    });
});
