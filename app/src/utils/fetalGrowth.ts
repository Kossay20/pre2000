import weeksData from '../data/weeks_db.json';
import { formatDecimal, localizeUnit } from './localizedFormat';

/**
 * Fetal size and weight per week — the single source every screen reads from.
 *
 * Reference table: the length/weight columns of the bundled `src/data/weeks_db.json`.
 * From week 8 they match, rounded, the widely published BabyCenter fetal length and
 * weight chart (week 16 ≈ 11.6 cm / 100 g, week 32 ≈ 42.4 cm / 1.7 kg, week 40 ≈
 * 51.2 cm / 3.4 kg). The monthly figures that used to live in babyGrowthData.ts (e.g.
 * 32 cm for weeks 32-35) followed no chart and contradicted the weekly ones, so they
 * were dropped rather than reconciled.
 *
 * Week numbering: `week` is the week in progress counted from the first day of the last
 * menstrual period — amenorrhoea weeks (SA), the convention the app computes and the one
 * the chart is indexed by. Week N covers N-1 SA + 0 to 6 days, which is what onboarding
 * prints as "Soit N-1 SA + d jours". The weekly content in weeks_db.json is written for
 * that same index (week 1 is the week of the last period, week 40 the due date), so no
 * SA/SG shift is applied anywhere.
 *
 * Length convention: up to week 20 the chart gives crown-to-rump length (the legs are
 * folded and hard to measure); from week 21 it gives crown-to-heel length. That is why
 * the figure jumps from 16.4 cm to 26.7 cm between weeks 20 and 21, and why the size
 * label names the convention.
 *
 * Firestore `weeks` documents can lag behind the bundle (they were seeded from an older
 * export that had kilograms in the grams field), so the numbers are always read from the
 * bundle, never from the fetched document.
 */

export type LengthConvention = 'crownRump' | 'crownHeel';

/** First week the chart reports a length; before it the embryo is microscopic. */
export const FIRST_MEASURED_LENGTH_WEEK = 4;
/** First week the chart reports a weight; before it the embryo weighs well under 1 g. */
export const FIRST_WEIGHED_WEEK = 8;
/** From this week the chart switches from crown-rump to crown-heel length. */
export const CROWN_HEEL_FROM_WEEK = 21;

export interface FetalGrowth {
    week: number;
    /** null before FIRST_MEASURED_LENGTH_WEEK (microscopic). */
    lengthCm: number | null;
    /** null before FIRST_WEIGHED_WEEK (under 1 g). */
    weightG: number | null;
    lengthConvention: LengthConvention;
    emoji: string;
}

interface WeekRow {
    week_number: number;
    emoji: string;
    baby_size_cm: number;
    baby_weight_g: number;
    baby_size_label_fr: string;
    baby_size_label_en?: string;
    baby_size_label_ar?: string;
    baby_size_label_tn?: string;
}

const rows = new Map<number, WeekRow>(
    (weeksData as unknown as WeekRow[]).map((w) => [w.week_number, w]),
);

export const clampWeek = (week: number): number =>
    Math.max(1, Math.min(40, Math.round(Number.isFinite(week) ? week : 1)));

export const getFetalGrowth = (week: number): FetalGrowth => {
    const w = clampWeek(week);
    const row = rows.get(w)!;
    return {
        week: w,
        lengthCm: w >= FIRST_MEASURED_LENGTH_WEEK ? row.baby_size_cm : null,
        weightG: w >= FIRST_WEIGHED_WEEK ? row.baby_weight_g : null,
        lengthConvention: w >= CROWN_HEEL_FROM_WEEK ? 'crownHeel' : 'crownRump',
        emoji: row.emoji,
    };
};

type Translate = (key: string) => string;

/** i18n key of the size caption, which names the length convention. */
export const fetalLengthLabelKey = (growth: FetalGrowth): string =>
    growth.lengthConvention === 'crownHeel' ? 'common.sizeCrownHeel' : 'common.sizeCrownRump';

/** "8 mm", "42,4 cm" (fr/tn) / "42.4 cm" (en/ar), unit in Arabic script for ar/tn. */
export const formatFetalLength = (growth: FetalGrowth, language: string, t: Translate): string => {
    if (growth.lengthCm === null) return t('common.fetalLengthMicroscopic');
    if (growth.lengthCm < 1) {
        return `${formatDecimal(Math.round(growth.lengthCm * 10), language)} ${localizeUnit('mm', language)}`;
    }
    return `${formatDecimal(growth.lengthCm, language, 1)} ${localizeUnit('cm', language)}`;
};

/** "660 g", "1,7 kg" (fr/tn) / "1.7 kg" (en/ar); the unit is localized for ar/tn. */
export const formatFetalWeight = (growth: FetalGrowth, language: string, t: Translate): string => {
    if (growth.weightG === null) return t('common.fetalWeightUnderOneGram');
    if (growth.weightG >= 1000) {
        return `${formatDecimal(growth.weightG / 1000, language, 2)} ${localizeUnit('kg', language)}`;
    }
    return `${formatDecimal(Math.round(growth.weightG), language)} ${localizeUnit('g', language)}`;
};

/** The comparison item alone ("Concombre"), without the size the stored label carries. */
export const getFetalComparisonName = (week: number, language: string): string => {
    const row = rows.get(clampWeek(week))!;
    const lang = language.split('-')[0];
    const label =
        (lang === 'tn' && (row.baby_size_label_tn || row.baby_size_label_ar)) ||
        (lang === 'ar' && row.baby_size_label_ar) ||
        (lang === 'en' && row.baby_size_label_en) ||
        row.baby_size_label_fr;
    return label.replace(/\s*\([^)]*\)\s*$/, '').trim();
};

/**
 * "Concombre (42,4 cm)". The number is re-printed from the table rather than taken from
 * the stored label, so the comparison can never disagree with the size stat beside it.
 */
export const formatFetalComparison = (week: number, language: string, t: Translate): string => {
    const growth = getFetalGrowth(week);
    const name = getFetalComparisonName(week, language);
    if (growth.lengthCm === null) return name;
    return `${name} (${formatFetalLength(growth, language, t)})`;
};

/**
 * Which week a month card of the evolution screen describes: the user's own week when it
 * falls in that month (so the card repeats what Home shows), otherwise the month's last week.
 */
export const monthComparisonWeek = (weekStart: number, weekEnd: number, currentWeek: number): number =>
    currentWeek >= weekStart && currentWeek <= weekEnd ? currentWeek : weekEnd;
