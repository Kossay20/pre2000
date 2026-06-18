import i18n from '../i18n';

/**
 * Localized size/weight unit formatting (findings D7-03, D4-03, W1-units).
 *
 * Size and weight unit *symbols* are localized to Arabic script for the
 * Arabic-script locales (ar, tn) and kept as-is for the Latin-script
 * locales (fr, en). The numeric value itself always keeps Western digits
 * (per project i18n convention — see i18nHelpers.ts / pickerLocale.ts).
 *
 * NOTE: this map holds unit *symbols*, not translatable copy, so it lives
 * internally in this util by design (see CLUSTER spec / repo i18n policy).
 */
const ARABIC_UNIT_SYMBOLS: Record<string, string> = {
    cm: 'سم',
    mm: 'مم',
    g: 'غ',
    kg: 'كغ',
};

/**
 * Map a size/weight unit symbol to its localized form.
 *
 * - ar / tn  -> Arabic-script symbol (cm->سم, mm->مم, g->غ, kg->كغ); unknown
 *               units pass through unchanged.
 * - fr / en  -> identity (symbol returned as-is).
 */
export const localizeUnit = (unit: string, language: string = i18n.language): string => {
    if (!unit) return '';
    const langCode = language.split('-')[0]; // 'fr', 'en', 'ar', 'tn'
    const useArabic = langCode === 'ar' || langCode === 'tn';
    if (!useArabic) return unit;
    return ARABIC_UNIT_SYMBOLS[unit] ?? unit;
};

/**
 * Format a measure (value + unit) for display.
 *
 * The numeric value keeps Western digits, the unit is localized via
 * {@link localizeUnit}, and the two are joined by a single space.
 * e.g. formatMeasure(14.2, 'cm', 'ar') -> "14.2 سم"
 *      formatMeasure(14.2, 'cm', 'fr') -> "14.2 cm"
 */
export const formatMeasure = (
    value: number | string,
    unit: string,
    language: string = i18n.language
): string => {
    const localizedUnit = localizeUnit(unit, language);
    return localizedUnit ? `${value} ${localizedUnit}` : `${value}`;
};
