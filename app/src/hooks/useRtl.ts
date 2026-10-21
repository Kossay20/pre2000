import { useTranslation } from 'react-i18next';

/**
 * useRtl — single source of truth for language-derived RTL/direction.
 *
 * Finding D7-04: 11+ screens duplicated
 *   `const isRTL = i18n.language === 'ar' || i18n.language === 'tn';`
 *
 * RTL is derived from the active i18n language, NOT from `I18nManager.isRTL`.
 * On web, `I18nManager.forceRTL` is intentionally skipped (it triggers a reload
 * loop), so `I18nManager.isRTL` stays `false` for Arabic/Tunisian and breaks
 * absolute-positioned mirroring. The language is therefore the reliable signal.
 *
 * RTL languages: 'ar' (standard Arabic), 'tn' (Tunisian Arabic).
 */

/**
 * Pure helper for non-hook contexts (utils, services, conditionals outside a
 * component body). Returns true for the RTL languages 'ar' and 'tn'.
 */
export const isRtlLang = (lang: string): boolean => lang === 'ar' || lang === 'tn';

export interface UseRtlResult {
    isRTL: boolean;
    direction: 'rtl' | 'ltr';
    textAlign: 'right' | 'left';
    flexRowDirection: 'row-reverse' | 'row';
}

export const useRtl = (): UseRtlResult => {
    const { i18n } = useTranslation();
    const isRTL = isRtlLang(i18n.language);

    return {
        isRTL,
        direction: isRTL ? 'rtl' : 'ltr',
        textAlign: isRTL ? 'right' : 'left',
        flexRowDirection: isRTL ? 'row-reverse' : 'row',
    };
};
