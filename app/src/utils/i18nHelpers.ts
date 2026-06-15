import i18n from '../i18n';

/**
 * Generic type for objects with localized fields
 * e.g., name_fr, name_ar, name_en
 */
export const getLocalizedContent = <T>(
    data: T,
    fieldPrefix: string, // e.g. 'name' or 'baby_dev_text'
    language: string = i18n.language,
    options?: { stripMarkdown?: boolean }
): string => {
    if (!data) return '';

    // Fallback chain: Requested Lang -> English -> French -> Empty String
    const langCode = language.split('-')[0]; // 'fr', 'ar', 'en'

    // keys: field_fr, field_ar, field_en, field_tn
    const targetKey = `${fieldPrefix}_${langCode}` as keyof T;
    const enKey = `${fieldPrefix}_en` as keyof T;
    const frKey = `${fieldPrefix}_fr` as keyof T;
    const arKey = `${fieldPrefix}_ar` as keyof T;

    let content = '';

    if (data[targetKey]) content = String(data[targetKey]);
    else if (langCode === 'tn' && data[arKey]) content = String(data[arKey]); // Fallback TN -> AR
    else if (data[enKey]) content = String(data[enKey]); // Fallback EN
    else if (data[frKey]) content = String(data[frKey]); // Fallback FR
    // If no specific language key found, maybe the field itself is the key (legacy support)
    else if (data[fieldPrefix as keyof T]) content = String(data[fieldPrefix as keyof T]);

    if (options?.stripMarkdown && content) {
        return content
            .replace(/#{1,6}\s?/g, '') // Headers
            .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
            .replace(/\*(.*?)\*/g, '$1') // Italic
            .replace(/__(.*?)__/g, '$1') // Underline
            .replace(/`(.*?)`/g, '$1') // Code
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
            .trim();
    }

    return content;
};

import { fr, enUS, ar, arTN } from 'date-fns/locale';

export const getDateLocale = (language: string = i18n.language) => {
    const langCode = language.split('-')[0];
    switch (langCode) {
        case 'ar': return ar;
        case 'tn': return arTN;
        case 'en': return enUS;
        default: return fr;
    }
};

/**
 * Locale-aware time formatter for reminder times stored as "HH:mm".
 *
 * FR (and TN, which follows the Maghreb/French convention — see pickerLocale.ts)
 * display "09h00"; EN and AR keep the standard "09:00" colon separator.
 * Falls back to the original string when there is no ':' to format.
 */
export const formatTime = (
    time: string,
    language: string = i18n.language
): string => {
    if (!time) return '';
    const langCode = language.split('-')[0];
    const useH = langCode === 'fr' || langCode === 'tn';
    return useH ? time.replace(':', 'h') : time;
};

/**
 * Helper for Trilang objects (Reminders V2)
 * { fr: "...", ar: "...", en: "...", tn: "..." }
 */
export const getLocalizedTrilang = (
    trilang: { fr: string, ar?: string, en?: string, tn?: string } | undefined,
    language: string = i18n.language
): string => {
    if (!trilang) return '';

    const langCode = language.split('-')[0];

    // 1. Exact match
    if (langCode === 'tn' && trilang.tn) return trilang.tn;
    if (langCode === 'ar' && trilang.ar) return trilang.ar;
    if (langCode === 'en' && trilang.en) return trilang.en;
    if (langCode === 'fr' && trilang.fr) return trilang.fr;

    // 2. TN Fallback -> AR
    if (langCode === 'tn' && trilang.ar) return trilang.ar;

    // 3. General Fallback -> FR (Default)
    return trilang.fr || '';
};
