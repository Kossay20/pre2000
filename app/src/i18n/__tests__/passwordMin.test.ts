/**
 * F1004 regression test.
 *
 * The translation key `passwordMin` lives in `auth.json` with the canonical
 * "10+ chars, 1 uppercase, 1 digit" text. A stale duplicate at the root of
 * `common.json` previously overrode it because `index.ts` spreads commonXx
 * after authXx. RegisterScreen reads `t('passwordMin')` (flat key, no
 * namespace) so the merged-object root is what users see.
 *
 * This test pins the merged value across all 4 locales so any future edit
 * that re-introduces a root-level `passwordMin` in common.json (or changes
 * the spread order) fails loudly.
 */

import en from '../locales/en';
import fr from '../locales/fr';
import ar from '../locales/ar';
import tn from '../locales/tn';

describe('i18n passwordMin — F1004 regression', () => {
    const locales = { en, fr, ar, tn } as const;

    it.each(Object.entries(locales))(
        'merged %s resource exposes the strict (10+ chars) passwordMin',
        (_lang, resource) => {
            const value = (resource as Record<string, unknown>).passwordMin;
            expect(typeof value).toBe('string');
            expect(value as string).toMatch(/10/);
        },
    );

    it('common.json has no root-level passwordMin (only nested a11y/privacyData)', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const enCommon = require('../locales/en/common.json');
        const frCommon = require('../locales/fr/common.json');
        const arCommon = require('../locales/ar/common.json');
        const tnCommon = require('../locales/tn/common.json');

        for (const [lang, common] of [
            ['en', enCommon],
            ['fr', frCommon],
            ['ar', arCommon],
            ['tn', tnCommon],
        ] as const) {
            expect({ lang, hasRootKey: 'passwordMin' in common }).toEqual({
                lang,
                hasRootKey: false,
            });
        }
    });
});
