/**
 * Normalize a string for diacritic- and case-insensitive substring search (W5).
 *
 * Pregnancy food/content search must be forgiving across the app's 4 languages:
 *  - FR: a user typing "pate" matches "pâté" regardless of accents (é/è/ê→e, â→a, ç→c).
 *  - AR/TN: matches regardless of harakat/tashkeel and alef variants (أ/إ/آ → ا).
 *
 * Order matters: NFD first decomposes both Latin accented letters AND the Arabic alef-hamza/madda
 * forms (أ → ا + combining-hamza U+0654, آ → ا + combining-madda U+0653, …). Stripping the combining
 * ranges afterwards then collapses BOTH scripts — so the alef variants need no separate replace.
 * (A naive `.replace(/[أإآ]/g,'ا')` AFTER normalize is a no-op — the chars are already decomposed.)
 */
export const normalizeForSearch = (s: string | null | undefined): string =>
    (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')        // Latin combining diacritics (é→e, â→a, ç→c)
        .replace(/[ً-ٰٕ]/g, '')  // Arabic harakat/tashkeel + combining hamza/madda + superscript alef
        .trim();

/** True when the normalized query is a substring of any field (an empty query matches everything). */
export const matchesSearch = (query: string | null | undefined, fields: (string | null | undefined)[]): boolean => {
    const q = normalizeForSearch(query);
    return !q || fields.some(f => normalizeForSearch(f).includes(q));
};
