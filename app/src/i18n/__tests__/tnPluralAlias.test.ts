/**
 * Tunisian (Derja) plural rules must follow Arabic, not Setswana.
 *
 * Our Derja locale ships under the code `tn`, which in CLDR is Setswana — a
 * two-form language. i18next resolves plurals via Intl.PluralRules on that code,
 * so every Arabic form authored for `tn` (`_zero`, `_two`, `_few`, `_many`) was
 * unreachable and counts 0/2/3/11 all fell through to `_other`: Tunisian
 * rendered "3 مهمة" where Arabic correctly renders "3 مهام".
 *
 * That the tn locale files contain a complete six-form Arabic set is the
 * evidence that Arabic rules were the authoring intent — those values existed
 * but could never be selected. `src/i18n/index.ts` aliases the resolver for
 * `tn` to `ar`; this locks that in.
 *
 * Note `pluralForms.test.ts` builds its OWN bare i18next instance, so it sees
 * the raw Setswana behaviour by design. This suite covers the app's configured
 * singleton, which is what actually ships.
 */
import i18n from '../index';

describe('tn plural rules are aliased to Arabic', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('tn');
    });

    afterAll(async () => {
        await i18n.changeLanguage('fr');
    });

    it('selects the Arabic few-form (3-10) instead of falling back to _other', () => {
        expect(i18n.t('taskCount', { count: 3 })).toBe('3 مهام');
    });

    it('still selects the singular for 1 and for 11+ (Arabic noun-number rule)', () => {
        expect(i18n.t('taskCount', { count: 1 })).toBe('1 مهمة');
        expect(i18n.t('taskCount', { count: 11 })).toBe('11 مهمة');
    });

    it('matches Arabic exactly across the full form set', async () => {
        const counts = [0, 1, 2, 3, 11];
        const tnValues = counts.map(count => i18n.t('taskCount', { count }));
        await i18n.changeLanguage('ar');
        const arValues = counts.map(count => i18n.t('taskCount', { count }));
        await i18n.changeLanguage('tn');
        expect(tnValues).toEqual(arValues);
    });
});
