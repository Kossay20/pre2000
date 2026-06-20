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
    // W2 #2: guard missing/invalid values (a Firestore week doc with no baby_size_cm, a NaN, etc.)
    // so the hero stat never renders the literal "null cm" / "undefined غ" / "NaN kg". The numeric
    // value keeps Western digits + dot separator BY DESIGN here (see localizedFormat.test.ts) —
    // measures are dot, unlike formatDecimal's locale-aware separator for user-entered quantities.
    if (
        value === null ||
        value === undefined ||
        (typeof value === 'number' && !Number.isFinite(value)) ||
        (typeof value === 'string' && value.trim() === '')
    ) {
        return '—';
    }
    const localizedUnit = localizeUnit(unit, language);
    return localizedUnit ? `${value} ${localizedUnit}` : `${value}`;
};

// fr + tn follow the French convention (comma decimal); en + ar use the dot.
// (Same grouping as formatTime/getDateLocale in i18nHelpers.ts.)
const COMMA_DECIMAL_LANGS = ['fr', 'tn'];

/**
 * Locale-aware decimal formatting for display (e.g. liters, weights).
 * - Integers render without a fractional part ("0", not "0.00").
 * - Non-integers are rounded to `maxFractionDigits` with trailing zeros trimmed.
 * - fr/tn use a comma decimal separator; en/ar use a dot.
 * e.g. formatDecimal(0,'fr')->"0" · formatDecimal(1.5,'fr')->"1,5" · formatDecimal(3,'en')->"3"
 */
export const formatDecimal = (
    value: number,
    language: string = i18n.language,
    maxFractionDigits: number = 1
): string => {
    const lang = language.split('-')[0];
    if (!Number.isFinite(value)) return '0';
    let s: string;
    if (Number.isInteger(value)) {
        s = String(value);
    } else {
        s = value.toFixed(maxFractionDigits).replace(/\.?0+$/, '');
    }
    return COMMA_DECIMAL_LANGS.includes(lang) ? s.replace('.', ',') : s;
};
