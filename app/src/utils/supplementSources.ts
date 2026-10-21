import type { TFunction } from 'i18next';

/**
 * The "Source" line under a supplement.
 *
 * supplements_db.json stores its citations as one French string ("OMS 2023, ACOG, NHS"),
 * and the screen printed it as-is behind a French-spaced "Source :" in every locale — so
 * English read "OMS" and the Arabic screens carried a Latin "OMS" inside an Arabic line.
 * Bodies that have a name in the reader's language are translated through
 * `common.sourceAuthorities`; international acronyms with no usual translation (ACOG, NHS,
 * NIH, EFSA…) are kept as written. A year after a name stays attached to it.
 */
const AUTHORITY_KEYS: Readonly<Record<string, string>> = {
    OMS: 'who',
    WHO: 'who',
    'Revue Cochrane': 'cochrane',
};

const RTL_LIST_LANGS = new Set(['ar', 'tn']);

export function formatSupplementSources(raw: string, t: TFunction, lang: string): string {
    const items = raw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .map(item => {
            const m = item.match(/^(.*?)(\s+\d{4})?$/);
            const name = m ? m[1] : item;
            const year = m && m[2] ? m[2] : '';
            const key = AUTHORITY_KEYS[name];
            return key ? `${t(`common.sourceAuthorities.${key}`)}${year}` : item;
        });
    const separator = RTL_LIST_LANGS.has(lang) ? '، ' : ', ';
    return t('common.sourceLine', { sources: items.join(separator) });
}
