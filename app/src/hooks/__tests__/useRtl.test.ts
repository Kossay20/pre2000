/**
 * Unit tests for useRtl (single source for RTL/direction — finding D7-04).
 *
 * The repo's Jest config uses `testEnvironment: 'node'` and ships NO React
 * renderer (`@testing-library/react`, `react-test-renderer`). `useRtl` has no
 * React state/effects — it only reads `useTranslation().i18n.language` — so we
 * drive it by mocking `react-i18next` per test and calling the hook directly
 * (same approach as the other hook tests in this repo).
 */

let currentLang = 'fr';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ i18n: { language: currentLang } }),
}));

import { useRtl, isRtlLang } from '../useRtl';

beforeEach(() => {
    currentLang = 'fr';
});

describe('isRtlLang (pure helper)', () => {
    it('returns true for "ar"', () => {
        expect(isRtlLang('ar')).toBe(true);
    });

    it('returns true for "tn"', () => {
        expect(isRtlLang('tn')).toBe(true);
    });

    it('returns false for "fr"', () => {
        expect(isRtlLang('fr')).toBe(false);
    });

    it('returns false for "en"', () => {
        expect(isRtlLang('en')).toBe(false);
    });

    it('returns false for an unknown language', () => {
        expect(isRtlLang('de')).toBe(false);
    });

    it('returns false for an empty string', () => {
        expect(isRtlLang('')).toBe(false);
    });
});

describe('useRtl (hook output)', () => {
    it('returns RTL shape for "ar"', () => {
        currentLang = 'ar';
        expect(useRtl()).toEqual({
            isRTL: true,
            direction: 'rtl',
            textAlign: 'right',
            flexRowDirection: 'row-reverse',
        });
    });

    it('returns RTL shape for "tn"', () => {
        currentLang = 'tn';
        expect(useRtl()).toEqual({
            isRTL: true,
            direction: 'rtl',
            textAlign: 'right',
            flexRowDirection: 'row-reverse',
        });
    });

    it('returns LTR shape for "fr"', () => {
        currentLang = 'fr';
        expect(useRtl()).toEqual({
            isRTL: false,
            direction: 'ltr',
            textAlign: 'left',
            flexRowDirection: 'row',
        });
    });

    it('returns LTR shape for "en"', () => {
        currentLang = 'en';
        expect(useRtl()).toEqual({
            isRTL: false,
            direction: 'ltr',
            textAlign: 'left',
            flexRowDirection: 'row',
        });
    });

    it('matches the legacy inline semantics (isRTL = lang === "ar" || lang === "tn")', () => {
        for (const lang of ['ar', 'tn', 'fr', 'en', 'de', '']) {
            currentLang = lang;
            const expected = lang === 'ar' || lang === 'tn';
            expect(useRtl().isRTL).toBe(expected);
        }
    });
});
