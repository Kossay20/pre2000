/**
 * #12 babyevo-units — fruit-comparison size unit localization.
 *
 * The BabyEvolutionScreen localizes the unit suffix of the comparison size
 * (e.g. "14cm", "2mm") for the Arabic-script locales (ar/tn) while leaving the
 * Latin-script locales (fr/en) byte-identical. This test pins that contract via
 * the same `localizeUnit` helper + regex the screen uses, exercised over the real
 * size strings shipped in babyGrowthData.ts.
 *
 * NOTE: the size strings are inlined (not imported from babyGrowthData) on purpose:
 * that module `require()`s PNG assets which this Jest config does not transform.
 * Keep this fixture in sync with BABY_GROWTH_MONTHS[*].comparison.size.
 */
import { localizeUnit } from '../../utils/localizedFormat';

// Frozen snapshot of BABY_GROWTH_MONTHS[*].comparison.size (months 1..9).
const SHIPPED_SIZES = ['2mm', '1.5cm', '3cm', '9cm', '14cm', '20cm', '26cm', '32cm', '48cm'];

// Mirror of the screen-local helper (kept in sync with BabyEvolutionScreen.tsx).
const localizeComparisonSize = (size: string, language: string): string =>
    size.replace(/^([\d.,\s]+)(mm|cm)$/, (_, value, unit) => `${value}${localizeUnit(unit, language)}`);

describe('babyevo comparison size localization (#12)', () => {
    it('all shipped size shapes parse to a known unit', () => {
        expect(SHIPPED_SIZES).toHaveLength(9);
        for (const s of SHIPPED_SIZES) {
            expect(s).toMatch(/^[\d.,\s]+(mm|cm)$/);
        }
    });

    it('leaves fr/en strings byte-identical', () => {
        for (const s of SHIPPED_SIZES) {
            expect(localizeComparisonSize(s, 'fr')).toBe(s);
            expect(localizeComparisonSize(s, 'en')).toBe(s);
        }
    });

    it('localizes cm->سم and mm->مم for ar, keeping Western digits', () => {
        expect(localizeComparisonSize('2mm', 'ar')).toBe('2مم');
        expect(localizeComparisonSize('14cm', 'ar')).toBe('14سم');
        expect(localizeComparisonSize('48cm', 'ar')).toBe('48سم');
        expect(localizeComparisonSize('1.5cm', 'ar')).toBe('1.5سم');
    });

    it('localizes for tn the same as ar', () => {
        for (const s of SHIPPED_SIZES) {
            expect(localizeComparisonSize(s, 'tn')).toBe(localizeComparisonSize(s, 'ar'));
        }
    });

    it('passes unknown shapes through untouched', () => {
        expect(localizeComparisonSize('?', 'ar')).toBe('?');
        expect(localizeComparisonSize('14 cm tall', 'ar')).toBe('14 cm tall');
    });
});
