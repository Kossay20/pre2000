import { normalizeForSearch, matchesSearch } from '../searchNormalize';

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

describe('matchesSearch (article search)', () => {
    const nausea = ['Nausées matinales', 'Comment soulager les nausées du 1er trimestre'];

    it('finds "Nausées" from an unaccented, lowercase query', () => {
        expect(matchesSearch('nausees', nausea)).toBe(true);
        expect(matchesSearch('NAUSÉES', nausea)).toBe(true);
    });

    it('matches any of the fields', () => {
        expect(matchesSearch('trimestre', nausea)).toBe(true);
        expect(matchesSearch('allaitement', nausea)).toBe(false);
    });

    it('matches Arabic text regardless of harakat and alef forms', () => {
        expect(matchesSearch('غثيان', ['غَثَيَان الصباح'])).toBe(true);
        expect(matchesSearch('اعراض', ['أعراض الحمل'])).toBe(true);
    });

    it('treats an empty or blank query as matching everything, and tolerates missing fields', () => {
        expect(matchesSearch('  ', nausea)).toBe(true);
        expect(matchesSearch(undefined, [])).toBe(true);
        expect(matchesSearch('x', [null, undefined])).toBe(false);
    });
});
