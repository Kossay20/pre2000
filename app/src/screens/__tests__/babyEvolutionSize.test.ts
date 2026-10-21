/**
 * #12 babyevo-units — fruit-comparison size unit localization.
 *
 * The BabyEvolutionScreen month card prints the size of one week of the weekly table
 * (utils/fetalGrowth). Its unit reads in Arabic script (سم / مم) for ar/tn and stays
 * Latin for fr/en; the digits stay Western in every locale (localizedFormat convention).
 */
import { formatFetalLength, getFetalGrowth } from '../../utils/fetalGrowth';

const t = (key: string) => key;
const MEASURED_WEEKS = Array.from({ length: 37 }, (_, i) => i + 4); // 4..40

describe('babyevo comparison size localization (#12)', () => {
    it('uses Latin units for fr/en', () => {
        for (const w of MEASURED_WEEKS) {
            for (const lang of ['fr', 'en']) {
                expect(formatFetalLength(getFetalGrowth(w), lang, t)).toMatch(/^[\d.,]+ (mm|cm)$/);
            }
        }
    });

    it('uses Arabic-script units with Western digits for ar/tn', () => {
        for (const w of MEASURED_WEEKS) {
            for (const lang of ['ar', 'tn']) {
                expect(formatFetalLength(getFetalGrowth(w), lang, t)).toMatch(/^[\d.,]+ (مم|سم)$/);
            }
        }
        expect(formatFetalLength(getFetalGrowth(5), 'ar', t)).toBe('2 مم');
        expect(formatFetalLength(getFetalGrowth(18), 'ar', t)).toBe('14.2 سم');
        expect(formatFetalLength(getFetalGrowth(18), 'tn', t)).toBe('14,2 سم');
    });
});
