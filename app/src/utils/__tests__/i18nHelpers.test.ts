/**
 * Comprehensive unit tests for src/utils/i18nHelpers.ts
 *
 * Exports under test:
 *  1. getLocalizedContent<T>(data, fieldPrefix, language?, options?)
 *       Fallback chain: requested lang -> (tn->ar) -> en -> fr -> legacy(field) -> ''
 *       + optional markdown stripping.
 *  2. getDateLocale(language?)  -> date-fns locale (ar | arTN | enUS | fr default).
 *  3. getLocalizedTrilang(trilang?, language?)
 *       { fr, ar?, en?, tn? } object resolver.
 *
 * The module reads `i18n.language` as the *default parameter value* of each
 * function, so it is evaluated at call time. We mock `../../i18n` (resolved from
 * src/utils/__tests__ -> src/i18n) with a `language: 'fr'` field so the default
 * branch works AND so we can flip it to test the default-param path.
 */

// ────────────────────────────────────────────────────────────────────────────
// MOCK i18n — mutable `language` so we can exercise the default-param branch.
// ────────────────────────────────────────────────────────────────────────────
const mockI18n = { language: 'fr', t: jest.fn((k: string) => k), changeLanguage: jest.fn() };

jest.mock('../../i18n', () => ({
    __esModule: true,
    default: mockI18n,
}));

import {
    getLocalizedContent,
    getDateLocale,
    getLocalizedTrilang,
    formatTime,
} from '../i18nHelpers';
import { fr, enUS, ar, arTN } from 'date-fns/locale';

beforeEach(() => {
    mockI18n.language = 'fr';
});

// ════════════════════════════════════════════════════════════════════════════
// 1. getLocalizedContent
// ════════════════════════════════════════════════════════════════════════════
describe('getLocalizedContent', () => {
    const full = {
        name_fr: 'Pomme',
        name_en: 'Apple',
        name_ar: 'تفاحة',
        name_tn: 'تفاحة تونسية',
    };

    // ── falsy / empty data guard ────────────────────────────────────────────
    describe('falsy data guard', () => {
        it('returns "" for null', () => {
            expect(getLocalizedContent(null as any, 'name', 'fr')).toBe('');
        });
        it('returns "" for undefined', () => {
            expect(getLocalizedContent(undefined as any, 'name', 'fr')).toBe('');
        });
        it('returns "" for empty string data', () => {
            expect(getLocalizedContent('' as any, 'name', 'fr')).toBe('');
        });
        it('returns "" for 0 data', () => {
            expect(getLocalizedContent(0 as any, 'name', 'fr')).toBe('');
        });
        it('returns "" for false data', () => {
            expect(getLocalizedContent(false as any, 'name', 'fr')).toBe('');
        });
    });

    // ── exact language match ─────────────────────────────────────────────────
    describe('exact language match', () => {
        it('fr -> name_fr', () => {
            expect(getLocalizedContent(full, 'name', 'fr')).toBe('Pomme');
        });
        it('en -> name_en', () => {
            expect(getLocalizedContent(full, 'name', 'en')).toBe('Apple');
        });
        it('ar -> name_ar', () => {
            expect(getLocalizedContent(full, 'name', 'ar')).toBe('تفاحة');
        });
        it('tn -> name_tn', () => {
            expect(getLocalizedContent(full, 'name', 'tn')).toBe('تفاحة تونسية');
        });
    });

    // ── region-stripping of the language code ────────────────────────────────
    describe('region code stripping (xx-YY -> xx)', () => {
        it('en-US -> uses name_en', () => {
            expect(getLocalizedContent(full, 'name', 'en-US')).toBe('Apple');
        });
        it('fr-FR -> uses name_fr', () => {
            expect(getLocalizedContent(full, 'name', 'fr-FR')).toBe('Pomme');
        });
        it('ar-TN -> uses name_ar (langCode is "ar", not "tn")', () => {
            // 'ar-TN'.split('-')[0] === 'ar' -> exact name_ar match
            expect(getLocalizedContent(full, 'name', 'ar-TN')).toBe('تفاحة');
        });
    });

    // ── default language param (reads i18n.language at call time) ─────────────
    describe('default language param', () => {
        it('omitted language uses i18n.language (fr)', () => {
            mockI18n.language = 'fr';
            expect(getLocalizedContent(full, 'name')).toBe('Pomme');
        });
        it('omitted language follows i18n.language change to en', () => {
            mockI18n.language = 'en';
            expect(getLocalizedContent(full, 'name')).toBe('Apple');
        });
        it('omitted language follows i18n.language change to tn', () => {
            mockI18n.language = 'tn';
            expect(getLocalizedContent(full, 'name')).toBe('تفاحة تونسية');
        });
    });

    // ── TN fallback chain: tn -> ar -> en -> fr -> legacy ─────────────────────
    describe('TN fallback chain', () => {
        it('tn missing -> falls back to name_ar', () => {
            const data = { name_ar: 'AR', name_en: 'EN', name_fr: 'FR' };
            expect(getLocalizedContent(data, 'name', 'tn')).toBe('AR');
        });
        it('tn + ar missing -> falls back to name_en', () => {
            const data = { name_en: 'EN', name_fr: 'FR' };
            expect(getLocalizedContent(data, 'name', 'tn')).toBe('EN');
        });
        it('tn + ar + en missing -> falls back to name_fr', () => {
            const data = { name_fr: 'FR' };
            expect(getLocalizedContent(data, 'name', 'tn')).toBe('FR');
        });
        it('tn present is preferred over ar (no fallback when target exists)', () => {
            const data = { name_tn: 'TN', name_ar: 'AR' };
            expect(getLocalizedContent(data, 'name', 'tn')).toBe('TN');
        });
    });

    // ── EN fallback (non-tn languages) ───────────────────────────────────────
    describe('EN fallback', () => {
        it('ar missing -> falls back to name_en', () => {
            const data = { name_en: 'EN', name_fr: 'FR' };
            expect(getLocalizedContent(data, 'name', 'ar')).toBe('EN');
        });
        it('en requested but missing -> falls back to name_fr', () => {
            // langCode 'en': targetKey === enKey, both empty -> frKey
            const data = { name_fr: 'FR' };
            expect(getLocalizedContent(data, 'name', 'en')).toBe('FR');
        });
    });

    // ── FR fallback ──────────────────────────────────────────────────────────
    describe('FR fallback', () => {
        it('fr requested but only fr exists -> name_fr', () => {
            const data = { name_fr: 'FR' };
            expect(getLocalizedContent(data, 'name', 'fr')).toBe('FR');
        });
        it('ar requested, only fr exists -> falls back through to name_fr', () => {
            const data = { name_fr: 'FR' };
            expect(getLocalizedContent(data, 'name', 'ar')).toBe('FR');
        });
    });

    // ── legacy: field itself holds the value ──────────────────────────────────
    describe('legacy field support', () => {
        it('no lang keys -> uses data[fieldPrefix]', () => {
            const data = { name: 'LegacyValue' };
            expect(getLocalizedContent(data, 'name', 'fr')).toBe('LegacyValue');
        });
        it('lang key takes precedence over legacy field', () => {
            const data = { name: 'Legacy', name_fr: 'FR' };
            expect(getLocalizedContent(data, 'name', 'fr')).toBe('FR');
        });
        it('legacy fallback works for ar requested with only legacy field', () => {
            const data = { name: 'Legacy' };
            expect(getLocalizedContent(data, 'name', 'ar')).toBe('Legacy');
        });
    });

    // ── no match -> '' ────────────────────────────────────────────────────────
    describe('no matching key', () => {
        it('returns "" when no key matches', () => {
            const data = { unrelated: 'x' };
            expect(getLocalizedContent(data, 'name', 'fr')).toBe('');
        });
        it('returns "" when matching keys are empty strings', () => {
            const data = { name_fr: '', name_en: '', name_ar: '' };
            expect(getLocalizedContent(data, 'name', 'fr')).toBe('');
        });
    });

    // ── value coercion via String() ───────────────────────────────────────────
    describe('non-string value coercion', () => {
        it('numeric value coerced to string', () => {
            const data = { count_fr: 42 } as any;
            expect(getLocalizedContent(data, 'count', 'fr')).toBe('42');
        });
        it('boolean true coerced to string', () => {
            const data = { flag_fr: true } as any;
            expect(getLocalizedContent(data, 'flag', 'fr')).toBe('true');
        });
        it('falsy numeric 0 is NOT picked (treated as missing) -> falls through', () => {
            // data[targetKey] === 0 is falsy, so it is skipped; nothing else matches -> ''
            const data = { num_fr: 0 } as any;
            expect(getLocalizedContent(data, 'num', 'fr')).toBe('');
        });
    });

    // ── custom field prefix ────────────────────────────────────────────────────
    describe('custom field prefix', () => {
        it('respects a different prefix (baby_dev_text)', () => {
            const data = {
                baby_dev_text_fr: 'Développement FR',
                baby_dev_text_en: 'Dev EN',
            };
            expect(getLocalizedContent(data, 'baby_dev_text', 'en')).toBe('Dev EN');
            expect(getLocalizedContent(data, 'baby_dev_text', 'fr')).toBe('Développement FR');
        });
    });

    // ── stripMarkdown option ───────────────────────────────────────────────────
    describe('stripMarkdown option', () => {
        it('strips H1-H6 headers', () => {
            const data = { name_fr: '# Titre' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: true })).toBe('Titre');
        });
        it('strips a deep header (###)', () => {
            const data = { name_fr: '### Sous-titre' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: true })).toBe('Sous-titre');
        });
        it('strips bold (**x**)', () => {
            const data = { name_fr: '**gras**' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: true })).toBe('gras');
        });
        it('strips italic (*x*)', () => {
            const data = { name_fr: '*italique*' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: true })).toBe('italique');
        });
        it('strips underline (__x__)', () => {
            const data = { name_fr: '__souligne__' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: true })).toBe('souligne');
        });
        it('strips inline code (`x`)', () => {
            const data = { name_fr: '`code`' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: true })).toBe('code');
        });
        it('strips links keeping the label', () => {
            const data = { name_fr: '[label](https://x.com)' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: true })).toBe('label');
        });
        it('strips a combined markdown string', () => {
            const data = { name_fr: '# T **b** *i* `c` [l](u)' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: true })).toBe('T b i c l');
        });
        it('trims surrounding whitespace after stripping', () => {
            const data = { name_fr: '   ## Header   ' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: true })).toBe('Header');
        });
        it('does NOT strip markdown when option absent', () => {
            const data = { name_fr: '**gras**' };
            expect(getLocalizedContent(data, 'name', 'fr')).toBe('**gras**');
        });
        it('does NOT strip markdown when stripMarkdown is false', () => {
            const data = { name_fr: '# Titre' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: false })).toBe('# Titre');
        });
        it('stripMarkdown=true with no matching content returns "" (content guard)', () => {
            const data = { unrelated: 'x' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: true })).toBe('');
        });
        it('plain text with no markdown is returned unchanged (just trimmed)', () => {
            const data = { name_fr: 'Plain text' };
            expect(getLocalizedContent(data, 'name', 'fr', { stripMarkdown: true })).toBe('Plain text');
        });
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. getDateLocale
// ════════════════════════════════════════════════════════════════════════════
describe('getDateLocale', () => {
    it('ar -> date-fns ar locale', () => {
        expect(getDateLocale('ar')).toBe(ar);
    });
    it('tn -> date-fns ar-TN locale', () => {
        expect(getDateLocale('tn')).toBe(arTN);
    });
    it('en -> date-fns en-US locale', () => {
        expect(getDateLocale('en')).toBe(enUS);
    });
    it('fr -> date-fns fr locale', () => {
        expect(getDateLocale('fr')).toBe(fr);
    });
    it('unknown language (de) -> default fr locale', () => {
        expect(getDateLocale('de')).toBe(fr);
    });
    it('empty string -> default fr locale', () => {
        expect(getDateLocale('')).toBe(fr);
    });
    it('region code stripped: en-US -> en-US locale', () => {
        expect(getDateLocale('en-US')).toBe(enUS);
    });
    it('region code stripped: ar-TN -> ar locale (langCode "ar", not "tn")', () => {
        // 'ar-TN'.split('-')[0] === 'ar'
        expect(getDateLocale('ar-TN')).toBe(ar);
    });
    it('default param uses i18n.language (fr)', () => {
        mockI18n.language = 'fr';
        expect(getDateLocale()).toBe(fr);
    });
    it('default param follows i18n.language change to ar', () => {
        mockI18n.language = 'ar';
        expect(getDateLocale()).toBe(ar);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. getLocalizedTrilang
// ════════════════════════════════════════════════════════════════════════════
describe('getLocalizedTrilang', () => {
    const full = { fr: 'FR', ar: 'AR', en: 'EN', tn: 'TN' };

    // ── undefined guard ────────────────────────────────────────────────────────
    describe('undefined guard', () => {
        it('returns "" for undefined trilang', () => {
            expect(getLocalizedTrilang(undefined, 'fr')).toBe('');
        });
    });

    // ── exact matches ────────────────────────────────────────────────────────
    describe('exact match', () => {
        it('fr -> trilang.fr', () => {
            expect(getLocalizedTrilang(full, 'fr')).toBe('FR');
        });
        it('en -> trilang.en', () => {
            expect(getLocalizedTrilang(full, 'en')).toBe('EN');
        });
        it('ar -> trilang.ar', () => {
            expect(getLocalizedTrilang(full, 'ar')).toBe('AR');
        });
        it('tn -> trilang.tn', () => {
            expect(getLocalizedTrilang(full, 'tn')).toBe('TN');
        });
    });

    // ── region code stripping ────────────────────────────────────────────────
    describe('region code stripping', () => {
        it('en-US -> trilang.en', () => {
            expect(getLocalizedTrilang(full, 'en-US')).toBe('EN');
        });
        it('ar-TN -> trilang.ar (langCode "ar")', () => {
            expect(getLocalizedTrilang(full, 'ar-TN')).toBe('AR');
        });
    });

    // ── default param ──────────────────────────────────────────────────────────
    describe('default language param', () => {
        it('omitted language uses i18n.language (fr)', () => {
            mockI18n.language = 'fr';
            expect(getLocalizedTrilang(full)).toBe('FR');
        });
        it('omitted language follows i18n.language change to tn', () => {
            mockI18n.language = 'tn';
            expect(getLocalizedTrilang(full)).toBe('TN');
        });
    });

    // ── TN -> AR fallback ────────────────────────────────────────────────────
    describe('TN fallback to AR', () => {
        it('tn missing but ar present -> trilang.ar', () => {
            const t = { fr: 'FR', ar: 'AR' };
            expect(getLocalizedTrilang(t, 'tn')).toBe('AR');
        });
        it('tn + ar missing -> falls back to trilang.fr', () => {
            const t = { fr: 'FR', en: 'EN' };
            expect(getLocalizedTrilang(t, 'tn')).toBe('FR');
        });
        it('tn present is preferred over ar', () => {
            const t = { fr: 'FR', ar: 'AR', tn: 'TN' };
            expect(getLocalizedTrilang(t, 'tn')).toBe('TN');
        });
    });

    // ── General FR fallback (NO en fallback — asymmetry vs getLocalizedContent) ─
    describe('general FR fallback', () => {
        it('ar requested, only {fr, en} -> returns FR (NOT EN: trilang has no ->en fallback)', () => {
            const t = { fr: 'FR', en: 'EN' };
            expect(getLocalizedTrilang(t, 'ar')).toBe('FR');
        });
        it('en requested but missing -> returns FR', () => {
            const t = { fr: 'FR' };
            expect(getLocalizedTrilang(t, 'en')).toBe('FR');
        });
        it('unknown language (de) -> returns FR', () => {
            expect(getLocalizedTrilang(full, 'de')).toBe('FR');
        });
    });

    // ── empty fr -> '' via (trilang.fr || '') ──────────────────────────────────
    describe('empty fr fallback', () => {
        it('ar requested, only en present, fr empty -> "" (no en fallback, fr falsy)', () => {
            const t = { fr: '', en: 'EN' } as any;
            expect(getLocalizedTrilang(t, 'ar')).toBe('');
        });
        it('en requested but only en is empty and fr empty -> ""', () => {
            const t = { fr: '', en: '' } as any;
            expect(getLocalizedTrilang(t, 'en')).toBe('');
        });
        it('fr requested but empty -> ""', () => {
            const t = { fr: '' } as any;
            expect(getLocalizedTrilang(t, 'fr')).toBe('');
        });
        it('tn requested, tn empty + ar empty + fr empty -> ""', () => {
            const t = { fr: '', ar: '', tn: '' } as any;
            expect(getLocalizedTrilang(t, 'tn')).toBe('');
        });
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. formatTime — locale-aware "HH:mm" reminder-time formatter
//    FR/TN -> "09h00" (Maghreb/French convention), EN/AR -> "09:00".
// ════════════════════════════════════════════════════════════════════════════
describe('formatTime', () => {
    describe('explicit language argument', () => {
        it("fr -> 'h' separator", () => {
            expect(formatTime('09:00', 'fr')).toBe('09h00');
        });
        it("tn -> 'h' separator (follows FR/Maghreb)", () => {
            expect(formatTime('09:00', 'tn')).toBe('09h00');
        });
        it("en -> ':' separator (unchanged)", () => {
            expect(formatTime('09:00', 'en')).toBe('09:00');
        });
        it("ar -> ':' separator (unchanged)", () => {
            expect(formatTime('09:00', 'ar')).toBe('09:00');
        });
        it('only replaces the first colon (HH:mm has one)', () => {
            expect(formatTime('21:30', 'fr')).toBe('21h30');
        });
        it('region-suffixed code is normalized (fr-FR behaves like fr)', () => {
            expect(formatTime('08:15', 'fr-FR')).toBe('08h15');
        });
        it('unknown language falls back to colon (no h)', () => {
            expect(formatTime('09:00', 'de')).toBe('09:00');
        });
    });

    describe('default-param branch (reads i18n.language)', () => {
        it("uses i18n.language when omitted ('fr' -> h)", () => {
            mockI18n.language = 'fr';
            expect(formatTime('07:45')).toBe('07h45');
        });
        it("uses i18n.language when omitted ('en' -> colon)", () => {
            mockI18n.language = 'en';
            expect(formatTime('07:45')).toBe('07:45');
        });
    });

    describe('edge cases', () => {
        it('empty string -> ""', () => {
            expect(formatTime('', 'fr')).toBe('');
        });
        it('string without a colon is returned unchanged', () => {
            expect(formatTime('0900', 'fr')).toBe('0900');
        });
    });
});
