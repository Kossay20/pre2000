/**
 * Fetal size/weight: one table, one unit, one dating convention.
 *
 * Home, the baby-evolution month cards, onboarding and the stored comparison labels all
 * state "how big is the baby this week". These tests pin that they read the same table
 * (weeks_db.json via utils/fetalGrowth), that the table is in grams and centimetres and
 * grows every week, and that the weekly text is indexed in amenorrhoea weeks like the
 * week number the app computes.
 */
// babyGrowthData require()s the month PNGs, which this Jest setup does not transform.
jest.mock('../../../assets/images/baby-3d/month-1.png', () => 1);
jest.mock('../../../assets/images/baby-3d/month-2.png', () => 2);
jest.mock('../../../assets/images/baby-3d/month-3.png', () => 3);
jest.mock('../../../assets/images/baby-3d/month-4.png', () => 4);
jest.mock('../../../assets/images/baby-3d/month-5.png', () => 5);
jest.mock('../../../assets/images/baby-3d/month-6.png', () => 6);
jest.mock('../../../assets/images/baby-3d/month-7.png', () => 7);
jest.mock('../../../assets/images/baby-3d/month-8.png', () => 8);
jest.mock('../../../assets/images/baby-3d/month-9.png', () => 9);

import weeks from '../../data/weeks_db.json';
import fr from '../../i18n/locales/fr/common.json';
import en from '../../i18n/locales/en/common.json';
import ar from '../../i18n/locales/ar/common.json';
import tn from '../../i18n/locales/tn/common.json';
import {
    CROWN_HEEL_FROM_WEEK,
    FIRST_MEASURED_LENGTH_WEEK,
    FIRST_WEIGHED_WEEK,
    fetalLengthLabelKey,
    formatFetalComparison,
    formatFetalLength,
    formatFetalWeight,
    getFetalComparisonName,
    getFetalGrowth,
    monthComparisonWeek,
} from '../fetalGrowth';
import { WEEK_COMPARISONS } from '../../screens/onboardingConstants';
import { BABY_GROWTH_MONTHS } from '../../config/babyGrowthData';

const t = (key: string) => key;
const ALL_WEEKS = Array.from({ length: 40 }, (_, i) => i + 1);
type Row = (typeof weeks)[number];

describe('fetal growth table', () => {
    it('has one row per week 1..40', () => {
        expect(weeks.map((w: Row) => w.week_number)).toEqual(ALL_WEEKS);
    });

    it('stores weight in grams, strictly increasing from the first weighed week', () => {
        let previous = 0;
        for (let w = FIRST_WEIGHED_WEEK; w <= 40; w++) {
            const g = getFetalGrowth(w).weightG!;
            expect(g).toBeGreaterThan(previous);
            // A fetus is never under 1 g once weighed, nor over 5 kg by 40 weeks.
            expect(g).toBeGreaterThanOrEqual(1);
            expect(g).toBeLessThan(5000);
            previous = g;
        }
        // Third trimester in grams, not kilograms (the week-28+ rows used to hold 1..3.4).
        for (let w = 28; w <= 40; w++) expect(getFetalGrowth(w).weightG!).toBeGreaterThanOrEqual(1000);
        expect(getFetalGrowth(40).weightG!).toBeGreaterThanOrEqual(2500);
    });

    it('stores length in centimetres, strictly increasing from the first measured week', () => {
        let previous = 0;
        for (let w = FIRST_MEASURED_LENGTH_WEEK; w <= 40; w++) {
            const cm = getFetalGrowth(w).lengthCm!;
            expect(cm).toBeGreaterThan(previous);
            expect(cm).toBeLessThan(60);
            previous = cm;
        }
    });

    it('matches the reference chart at its anchor weeks', () => {
        expect(getFetalGrowth(16)).toMatchObject({ lengthCm: 11.6, weightG: 100 });
        expect(getFetalGrowth(32)).toMatchObject({ lengthCm: 42.4, weightG: 1700 });
        expect(getFetalGrowth(40)).toMatchObject({ lengthCm: 51.2, weightG: 3400 });
    });

    it('reports nothing measurable before the chart starts', () => {
        expect(getFetalGrowth(3)).toMatchObject({ lengthCm: null, weightG: null });
        expect(getFetalGrowth(7).weightG).toBeNull();
    });

    it('names crown-rump length up to week 20 and crown-heel length after', () => {
        expect(fetalLengthLabelKey(getFetalGrowth(CROWN_HEEL_FROM_WEEK - 1))).toBe('common.sizeCrownRump');
        expect(fetalLengthLabelKey(getFetalGrowth(CROWN_HEEL_FROM_WEEK))).toBe('common.sizeCrownHeel');
        for (const dict of [fr, en, ar, tn] as Record<string, unknown>[]) {
            for (const key of ['sizeCrownRump', 'sizeCrownHeel', 'fetalLengthMicroscopic', 'fetalWeightUnderOneGram']) {
                expect(typeof dict[key]).toBe('string');
            }
        }
    });

    it('keeps the size printed inside every stored label equal to the table', () => {
        for (const row of weeks as Row[]) {
            const growth = getFetalGrowth(row.week_number);
            for (const label of [row.baby_size_label_fr, row.baby_size_label_en, row.baby_size_label_ar, row.baby_size_label_tn]) {
                const m = /\(([\d.,]+)\s*(mm|cm|مم|سم)\)/.exec(label ?? '');
                if (!m) continue;
                const value = parseFloat(m[1].replace(',', '.'));
                const cm = m[2] === 'mm' || m[2] === 'مم' ? value / 10 : value;
                expect([row.week_number, cm]).toEqual([row.week_number, growth.lengthCm]);
            }
        }
    });
});

describe('fetal growth formatting', () => {
    it('switches to kilograms at 1000 g with the locale decimal separator', () => {
        const w32 = getFetalGrowth(32);
        expect(formatFetalWeight(w32, 'fr', t)).toBe('1,7 kg');
        expect(formatFetalWeight(w32, 'en', t)).toBe('1.7 kg');
        expect(formatFetalWeight(w32, 'ar', t)).toBe('1.7 كغ');
        expect(formatFetalWeight(w32, 'tn', t)).toBe('1,7 كغ');
        expect(formatFetalWeight(getFetalGrowth(29), 'fr', t)).toBe('1,15 kg');
        expect(formatFetalWeight(getFetalGrowth(25), 'fr', t)).toBe('660 g');
        expect(formatFetalWeight(getFetalGrowth(5), 'fr', t)).toBe('common.fetalWeightUnderOneGram');
    });

    it('prints lengths under 1 cm in millimetres', () => {
        expect(formatFetalLength(getFetalGrowth(7), 'fr', t)).toBe('8 mm');
        expect(formatFetalLength(getFetalGrowth(7), 'ar', t)).toBe('8 مم');
        expect(formatFetalLength(getFetalGrowth(32), 'fr', t)).toBe('42,4 cm');
        expect(formatFetalLength(getFetalGrowth(32), 'en', t)).toBe('42.4 cm');
        expect(formatFetalLength(getFetalGrowth(2), 'fr', t)).toBe('common.fetalLengthMicroscopic');
    });

    it('re-prints the comparison with the table size, never the stored one', () => {
        expect(formatFetalComparison(32, 'fr', t)).toBe('Concombre (42,4 cm)');
        expect(formatFetalComparison(16, 'fr', t)).toBe('Avocat (11,6 cm)');
        expect(formatFetalComparison(32, 'ar', t)).toBe('خيار (42.4 سم)');
        expect(formatFetalComparison(1, 'fr', t)).toBe('Microscopique');
    });
});

describe('every surface reads the same week', () => {
    it('onboarding uses the table emoji for each week', () => {
        for (const w of ALL_WEEKS) expect([w, WEEK_COMPARISONS[w].emoji]).toEqual([w, getFetalGrowth(w).emoji]);
    });

    it('month cards cover weeks 1..40 without gaps and repeat the current week', () => {
        const covered = BABY_GROWTH_MONTHS.flatMap(m =>
            Array.from({ length: m.weekEnd - m.weekStart + 1 }, (_, i) => m.weekStart + i));
        expect(covered).toEqual(ALL_WEEKS);
        const month8 = BABY_GROWTH_MONTHS[7];
        // A user at week 32 sees the week-32 fruit and size on the month-8 card, as on Home.
        expect(monthComparisonWeek(month8.weekStart, month8.weekEnd, 32)).toBe(32);
        expect(getFetalComparisonName(monthComparisonWeek(month8.weekStart, month8.weekEnd, 32), 'fr')).toBe('Concombre');
        // Other months show their last week.
        expect(monthComparisonWeek(month8.weekStart, month8.weekEnd, 20)).toBe(month8.weekEnd);
        // The month cards no longer carry sizes of their own.
        for (const m of BABY_GROWTH_MONTHS) expect(m).not.toHaveProperty('comparison');
    });
});

describe('dating convention of the weekly text', () => {
    it('is amenorrhoea weeks: week 1 is the week of the last period', () => {
        const w1 = (weeks as Row[])[0];
        expect(w1.mom_body_text_fr).toMatch(/dernières règles/);
        expect(w1.mom_body_text_en).toMatch(/last period/);
    });

    it('never restates the week in another convention', () => {
        // The "(N+2 SA)" / "(N+2 weeks LMP)" asides turned week 32 into "34 SA" next to
        // an onboarding screen that says "31 SA + d jours" for the same user.
        for (const row of weeks as Row[]) {
            for (const text of [row.mom_body_text_fr, row.mom_body_text_en, row.mom_body_text_ar, row.mom_body_text_tn,
                row.baby_dev_text_fr, row.baby_dev_text_en, row.baby_dev_text_ar, row.baby_dev_text_tn]) {
                expect([row.week_number, /\(\d+ SA\)|weeks LMP|أسبوع انقطاع طمث/.test(text ?? '')]).toEqual([row.week_number, false]);
            }
        }
    });
});
