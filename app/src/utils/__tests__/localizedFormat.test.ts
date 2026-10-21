import { localizeUnit, formatMeasure, formatDecimal } from '../localizedFormat';

describe('formatDecimal', () => {
    it('renders integers with no fractional part (fixes "0.00")', () => {
        expect(formatDecimal(0, 'fr')).toBe('0');
        expect(formatDecimal(3, 'en')).toBe('3');
        expect(formatDecimal(3, 'ar')).toBe('3');
    });
    it('uses a comma decimal for fr/tn and a dot for en/ar', () => {
        expect(formatDecimal(1.5, 'fr')).toBe('1,5');
        expect(formatDecimal(1.5, 'tn')).toBe('1,5');
        expect(formatDecimal(1.5, 'en')).toBe('1.5');
        expect(formatDecimal(1.5, 'ar')).toBe('1.5');
    });
    it('trims trailing zeros and rounds to maxFractionDigits', () => {
        expect(formatDecimal(2.0, 'fr')).toBe('2');
        expect(formatDecimal(1.25, 'en', 1)).toBe('1.3');
        expect(formatDecimal(1.04, 'fr', 1)).toBe('1');
    });
    it('guards non-finite input', () => {
        expect(formatDecimal(NaN, 'fr')).toBe('0');
        expect(formatDecimal(Infinity, 'en')).toBe('0');
    });
});

describe('localizeUnit', () => {
    describe('Arabic-script locales (ar, tn)', () => {
        it.each([
            ['cm', 'سم'],
            ['mm', 'مم'],
            ['g', 'غ'],
            ['kg', 'كغ'],
        ])('maps %s -> %s for ar', (unit, expected) => {
            expect(localizeUnit(unit, 'ar')).toBe(expected);
        });

        it.each([
            ['cm', 'سم'],
            ['mm', 'مم'],
            ['g', 'غ'],
            ['kg', 'كغ'],
        ])('maps %s -> %s for tn', (unit, expected) => {
            expect(localizeUnit(unit, 'tn')).toBe(expected);
        });

        it('passes unknown units through unchanged for ar', () => {
            expect(localizeUnit('ml', 'ar')).toBe('ml');
        });

        it('handles region-suffixed lang codes (ar-EG)', () => {
            expect(localizeUnit('cm', 'ar-EG')).toBe('سم');
        });
    });

    describe('Latin-script locales (fr, en)', () => {
        it.each(['cm', 'mm', 'g', 'kg'])('returns %s unchanged for fr', (unit) => {
            expect(localizeUnit(unit, 'fr')).toBe(unit);
        });

        it.each(['cm', 'mm', 'g', 'kg'])('returns %s unchanged for en', (unit) => {
            expect(localizeUnit(unit, 'en')).toBe(unit);
        });
    });

    it('returns empty string for empty unit', () => {
        expect(localizeUnit('', 'ar')).toBe('');
        expect(localizeUnit('', 'fr')).toBe('');
    });
});

describe('formatMeasure', () => {
    it('localizes unit and keeps Western digits for ar', () => {
        expect(formatMeasure(14.2, 'cm', 'ar')).toBe('14.2 سم');
    });

    it('localizes unit and keeps Western digits for tn', () => {
        expect(formatMeasure(500, 'g', 'tn')).toBe('500 غ');
    });

    it('keeps Latin unit for fr', () => {
        expect(formatMeasure(14.2, 'cm', 'fr')).toBe('14.2 cm');
    });

    it('keeps Latin unit for en', () => {
        expect(formatMeasure(3.5, 'kg', 'en')).toBe('3.5 kg');
    });

    it('accepts a string value', () => {
        expect(formatMeasure('14.2', 'cm', 'ar')).toBe('14.2 سم');
    });

    it('uses a single space separator', () => {
        const out = formatMeasure(14.2, 'cm', 'ar');
        expect(out.split(' ')).toHaveLength(2);
    });

    // W2 #2: missing/invalid Firestore values must never leak as "null cm" / "NaN kg".
    it('returns a dash for null/undefined/NaN/empty instead of leaking the literal', () => {
        expect(formatMeasure(null as any, 'cm', 'fr')).toBe('—');
        expect(formatMeasure(undefined as any, 'cm', 'ar')).toBe('—');
        expect(formatMeasure(NaN, 'kg', 'en')).toBe('—');
        expect(formatMeasure(Infinity, 'g', 'tn')).toBe('—');
        expect(formatMeasure('   ', 'cm', 'fr')).toBe('—');
    });

    it('still formats a real zero (not treated as missing)', () => {
        expect(formatMeasure(0, 'kg', 'en')).toBe('0 kg');
    });
});
