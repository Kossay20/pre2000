import i18n from '../i18n';

/**
 * French puts a space before ":", ";", "?" and "!" and inside « ». With a plain space
 * the mark wraps alone to the next line ("… désolé pour tes côtes" / "!"), so the space
 * becomes a no-break one (U+00A0). The fr locale files carry it in the strings
 * themselves; the content data (weeks, articles, baby messages, tips) is written with
 * plain spaces and mostly served from Firestore, so it is fixed here, where it is read
 * for display, rather than in each copy of the data.
 *
 * The mark must be followed by a space, closing punctuation or the end of the text:
 * that leaves markdown table rules ("| :--- |") and anything glued to a colon alone.
 */
export const frenchSpacing = (text: string): string =>
    text
        .replace(/(\S) ([:;?!]+)(?=[\s)»"*_]|$)/g, '$1\u00a0$2')
        .replace(/« /g, '«\u00a0')
        .replace(/ »/g, '\u00a0»');

/**
 * Generic type for objects with localized fields
 * e.g., name_fr, name_ar, name_en
 *
 * French text comes back with no-break spaces before its punctuation (frenchSpacing).
 * Pass `plainSpaces` when the text is matched against the data rather than shown — a
 * tapped chatbot chip is recognised by comparing it with the stored label.
 */
export const getLocalizedContent = <T>(
    data: T,
    fieldPrefix: string, // e.g. 'name' or 'baby_dev_text'
    language: string = i18n.language,
    options?: { stripMarkdown?: boolean; plainSpaces?: boolean }
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
    let isFrench = langCode === 'fr';

    if (data[targetKey]) content = String(data[targetKey]);
    else if (langCode === 'tn' && data[arKey]) content = String(data[arKey]); // Fallback TN -> AR
    else if (data[enKey]) { content = String(data[enKey]); isFrench = false; } // Fallback EN
    else if (data[frKey]) { content = String(data[frKey]); isFrench = true; } // Fallback FR
    // If no specific language key found, maybe the field itself is the key (legacy support)
    else if (data[fieldPrefix as keyof T]) content = String(data[fieldPrefix as keyof T]);

    if (isFrench && !options?.plainSpaces) content = frenchSpacing(content);

    if (options?.stripMarkdown && content) {
        // A bundled summary is "# Title  First sentence…" (the heading's newline became a
        // double space). Dropping only the "#" glued the title to the body in a card preview
        // ("how to recognize them  Pregnancy is…"), so close the title as its own sentence.
        content = content.replace(
            /^\s*#{1,6}[ \t]*([^\n]*?)(?:[ \t]*\n+[ \t]*|[ \t]{2,})(?=\S)/,
            (_m, title: string) => (/[.!?:;…؟]$/.test(title) ? `${title} ` : `${title}. `),
        );
        return content
            .replace(/#{1,6}\s?/g, '') // Headers
            .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
            .replace(/\*(.*?)\*/g, '$1') // Italic
            .replace(/__(.*?)__/g, '$1') // Underline
            .replace(/`(.*?)`/g, '$1') // Code
            .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Links
            .replace(/[ \t]{2,}/g, ' ')
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
    if (langCode === 'fr' && trilang.fr) return frenchSpacing(trilang.fr);

    // 2. TN Fallback -> AR
    if (langCode === 'tn' && trilang.ar) return trilang.ar;

    // 3. General Fallback -> FR (Default)
    return frenchSpacing(trilang.fr || '');
};
