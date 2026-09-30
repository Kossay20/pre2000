/**
 * A-009: the SA preview read one day ahead ("31 SA + 1 jours" on 31+0) and was not
 * pluralised ("1 jours", "1 أيام", "31 أسابيع"). formatGestationalAge renders
 * completed weeks + days through the app's configured i18n singleton, which is what
 * ships (tn plural rules aliased to Arabic — see tnPluralAlias.test.ts).
 */
import i18n from '../../i18n';
import { formatGestationalAge } from '../gestationalAge';
import { calculatePregnancyWeek } from '../pregnancyCalculator';

const ga = (lng: string, w: number, d: number) => formatGestationalAge(i18n.getFixedT(lng), w, d);

describe('formatGestationalAge', () => {
    it('fr: SA is invariable; jour agrees (0 and 1 are singular in French)', () => {
        expect(ga('fr', 31, 0)).toBe('31 SA + 0 jour');
        expect(ga('fr', 31, 1)).toBe('31 SA + 1 jour');
        expect(ga('fr', 31, 6)).toBe('31 SA + 6 jours');
    });

    it('en: both halves pluralise', () => {
        expect(ga('en', 1, 1)).toBe('1 week + 1 day');
        expect(ga('en', 31, 0)).toBe('31 weeks + 0 days');
        expect(ga('en', 40, 2)).toBe('40 weeks + 2 days');
    });

    it.each(['ar', 'tn'])('%s: Arabic number agreement (1, 2, 3-10, 11+)', (lng) => {
        expect(ga(lng, 1, 1)).toBe('أسبوع واحد + يوم واحد');
        expect(ga(lng, 2, 2)).toBe('أسبوعان + يومان');
        expect(ga(lng, 9, 3)).toBe('9 أسابيع + 3 أيام');
        expect(ga(lng, 31, 0)).toBe('31 أسبوعًا + 0 يوم');
    });

    it('the onboarding preview for LMP = today − 217 days reads 31 SA + 0 jour', () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-09-30T12:00:00.000Z'));
        try {
            const { completedWeeks, completedDays } = calculatePregnancyWeek(new Date('2026-02-25T00:00:00.000Z'));
            expect(i18n.getFixedT('fr')('onboarding.step2.saDays', { ga: ga('fr', completedWeeks, completedDays) }))
                .toBe('Soit 31 SA + 0 jour');
        } finally {
            jest.useRealTimers();
        }
    });
});
