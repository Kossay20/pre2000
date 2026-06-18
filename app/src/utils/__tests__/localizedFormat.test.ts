import { localizeUnit, formatMeasure } from '../localizedFormat';

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
});
