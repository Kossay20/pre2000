/**
 * Unit tests for clinicalChecks — SAFETY-CRITICAL.
 *
 * Every threshold is a boundary in clinical guidance (gestational diabetes,
 * pre-eclampsia, weight-loss complication). A regression here can mean a
 * dangerous value gets saved silently. Each boundary is therefore tested
 * just-below / at / just-above.
 */

import {
    AlertSeverity,
    checkBloodPressure,
    checkGlucose,
    checkWeightChange,
    COUNTRY_OPTIONS,
    EMERGENCY_NUMBERS,
    INTERNATIONAL_EMERGENCY_NUMBER,
    countryFromRegion,
    getEmergencyNumber,
    resolveEmergencyNumber,
    GDM_FASTING_THRESHOLD_MMOL,
    summarizeGlucoseMonth,
    glucoseLooksLikeGramsPerLitre,
    gramsPerLitreToMmol,
} from '../clinicalChecks';

const expectSeverity = (
    alert: ReturnType<typeof checkGlucose>,
    severity: AlertSeverity,
) => {
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe(severity);
};

describe('checkGlucose (mmol/L, fasting)', () => {
    it('returns null for normal value (3.5)', () => {
        expect(checkGlucose(3.5)).toBeNull();
    });

    it('returns null just below the pregnancy fasting criterion (5.0)', () => {
        expect(checkGlucose(5.0)).toBeNull();
    });

    it('flags 5.1 — the IADPSG 2010 / WHO 2013 fasting criterion — and everything up to 6.9', () => {
        expect(GDM_FASTING_THRESHOLD_MMOL).toBe(5.1);
        for (const v of [5.1, 5.2, 5.5]) {
            const a = checkGlucose(v);
            expectSeverity(a, 'warning');
            expect(a!.titleKey).toContain('glucoseSurveillance');
        }
    });

    it('returns critical for hypoglycemia (3.4 — just below threshold)', () => {
        const a = checkGlucose(3.4);
        expectSeverity(a, 'critical');
        expect(a!.emergencyAction).toBe('call');
        expect(a!.titleKey).toContain('glucoseLow');
    });

    it('returns warning for surveillance (5.6 — no emergency action)', () => {
        const a = checkGlucose(5.6);
        expectSeverity(a, 'warning');
        expect(a!.emergencyAction).toBeUndefined();
    });

    it('returns warning for surveillance upper bound (6.9)', () => {
        expectSeverity(checkGlucose(6.9), 'warning');
    });

    it('returns severe for elevated (7.0 — boundary)', () => {
        const a = checkGlucose(7.0);
        expectSeverity(a, 'severe');
        expect(a!.titleKey).toContain('glucoseHigh');
        expect(a!.emergencyAction).toBeUndefined();
    });

    it('returns severe at upper bound (10.0)', () => {
        expectSeverity(checkGlucose(10.0), 'severe');
    });

    it('returns critical for very high (10.1 — just above 10)', () => {
        const a = checkGlucose(10.1);
        expectSeverity(a, 'critical');
        expect(a!.emergencyAction).toBe('call');
        expect(a!.titleKey).toContain('glucoseVeryHigh');
    });

    it('returns critical for extreme value (15)', () => {
        expectSeverity(checkGlucose(15), 'critical');
    });

    it('returns null for invalid input (NaN, 0, negative)', () => {
        expect(checkGlucose(Number.NaN)).toBeNull();
        expect(checkGlucose(0)).toBeNull();
        expect(checkGlucose(-1)).toBeNull();
    });
});

// B-009: the Glycémie card said "Glycémie normale ce mois-ci" with no reading at all, and
// next to an out-of-range one. What it says now comes from the month's readings.
describe('SAFETY: a glucose typed in g/L is not read as mmol/L (B-057)', () => {
    // French and Tunisian labs print fasting glucose in g/L: 0,92 g/L is the 5,1 mmol/L
    // gestational-diabetes criterion, and read as mmol/L it raised the hypoglycaemia alert.
    it.each([[0.4], [0.92], [1.26], [1.99]])('%s is asked about (plausible g/L, implausible fasting mmol/L)', (v) => {
        expect(glucoseLooksLikeGramsPerLitre(v)).toBe(true);
    });

    it.each([[0], [-1], [2], [3.4], [5.1], [Number.NaN]])('%s is taken as mmol/L', (v) => {
        expect(glucoseLooksLikeGramsPerLitre(v)).toBe(false);
    });

    it('converts with the molar mass of glucose (1 g/L = 5.551 mmol/L), to one decimal', () => {
        expect(gramsPerLitreToMmol(0.92)).toBe(5.1);
        expect(gramsPerLitreToMmol(1.26)).toBe(7);
        expect(gramsPerLitreToMmol(0.63)).toBe(3.5);
        // the converted value lands on the same alerts as a reading typed in mmol/L
        expect(checkGlucose(gramsPerLitreToMmol(0.92))?.severity).toBe('warning');
        expect(checkGlucose(gramsPerLitreToMmol(0.8))).toBeNull();
    });
});

describe('summarizeGlucoseMonth', () => {
    const now = new Date(2026, 9, 15, 12, 0, 0);
    const on = (day: number, value: number, month = 9) => ({ value, date: new Date(2026, month, day, 8).toISOString() });

    it('no reading at all → empty, never "normal"', () => {
        expect(summarizeGlucoseMonth([], now)).toBe('empty');
    });

    it('readings only in other months → empty', () => {
        expect(summarizeGlucoseMonth([on(28, 4.6, 8), on(1, 9.0, 10)], now)).toBe('empty');
        expect(summarizeGlucoseMonth([{ value: 4.6, date: new Date(2025, 9, 15).toISOString() }], now)).toBe('empty');
    });

    it('every reading of the month in the target → inRange', () => {
        expect(summarizeGlucoseMonth([on(1, 4.2), on(8, 5.0)], now)).toBe('inRange');
    });

    it('one reading at the criterion (5.1) or beyond → outOfRange, whatever the others are', () => {
        expect(summarizeGlucoseMonth([on(1, 4.2), on(8, 5.1)], now)).toBe('outOfRange');
        expect(summarizeGlucoseMonth([on(2, 5.2)], now)).toBe('outOfRange');
        expect(summarizeGlucoseMonth([on(3, 9.0), on(4, 4.5)], now)).toBe('outOfRange');
    });

    it('a low reading (below 3.5) is out of range too', () => {
        expect(summarizeGlucoseMonth([on(5, 3.2)], now)).toBe('outOfRange');
    });

    it('an out-of-range reading from last month does not colour this month', () => {
        expect(summarizeGlucoseMonth([on(20, 8.0, 8), on(3, 4.4)], now)).toBe('inRange');
    });

    it('an unreadable date is ignored', () => {
        expect(summarizeGlucoseMonth([{ value: 9, date: 'not a date' }], now)).toBe('empty');
    });
});

describe('checkBloodPressure (mmHg)', () => {
    it('returns null for normal BP (120/75)', () => {
        expect(checkBloodPressure(120, 75)).toBeNull();
    });

    it('returns null for low-normal BP (110/70)', () => {
        expect(checkBloodPressure(110, 70)).toBeNull();
    });

    it('returns warning for pre-hypertension (130/80 — sys boundary)', () => {
        expectSeverity(checkBloodPressure(130, 80), 'warning');
    });

    it('returns warning for pre-hypertension via diastolic alone (125/85)', () => {
        expectSeverity(checkBloodPressure(125, 85), 'warning');
    });

    it('returns severe for hypertension (140/85 — sys boundary)', () => {
        const a = checkBloodPressure(140, 85);
        expectSeverity(a, 'severe');
        expect(a!.titleKey).toContain('bpHigh');
        expect(a!.emergencyAction).toBeUndefined();
    });

    it('returns severe for hypertension via diastolic alone (135/95)', () => {
        expectSeverity(checkBloodPressure(135, 95), 'severe');
    });

    it('140/90 is the hypertension tier, 139/89 is not', () => {
        const at = checkBloodPressure(140, 90);
        expectSeverity(at, 'severe');
        expect(at!.messageKey).toBe('dashboard.alerts.bpHigh.message');
        const below = checkBloodPressure(139, 89);
        expectSeverity(below, 'warning');
        expect(below!.titleKey).toContain('bpPreHyp');
    });

    it('the 140/90 copy asks for an assessment within 24 h in every locale, not "next appointment"', () => {
        const locales: Record<string, any> = {
            fr: require('../../i18n/locales/fr/dashboard.json'),
            en: require('../../i18n/locales/en/dashboard.json'),
            ar: require('../../i18n/locales/ar/dashboard.json'),
            tn: require('../../i18n/locales/tn/dashboard.json'),
        };
        for (const [lang, strings] of Object.entries(locales)) {
            const message: string = strings.alerts.bpHigh.message;
            expect({ lang, has24: /24/.test(message) }).toEqual({ lang, has24: true });
        }
        expect(locales.fr.alerts.bpHigh.message).not.toMatch(/prochain rendez-vous/);
        expect(locales.en.alerts.bpHigh.message).not.toMatch(/next appointment/i);
    });

    it('the fasting target printed on the Health card states the 5.1 criterion, not 5.5', () => {
        for (const lang of ['fr', 'en', 'ar', 'tn']) {
            const target: string = require(`../../i18n/locales/${lang}/dashboard.json`).glucoseTarget;
            expect({ lang, target, ok: /5[.,]1/.test(target) && !/5[.,]5/.test(target) })
                .toEqual({ lang, target, ok: true });
        }
    });

    it('returns severe at the upper bound (159/109)', () => {
        expectSeverity(checkBloodPressure(159, 109), 'severe');
    });

    it('returns critical for severe hypertension (160/100 — sys boundary)', () => {
        const a = checkBloodPressure(160, 100);
        expectSeverity(a, 'critical');
        expect(a!.emergencyAction).toBe('call');
        expect(a!.titleKey).toContain('bpSevere');
    });

    it('returns critical for severe hypertension via diastolic (140/110)', () => {
        // dia >= 110 alone triggers critical even if sys is in the severe band.
        expectSeverity(checkBloodPressure(140, 110), 'critical');
    });

    it('returns warning for hypotension (85/60)', () => {
        const a = checkBloodPressure(85, 60);
        expectSeverity(a, 'warning');
        expect(a!.titleKey).toContain('bpLow');
    });

    it('returns warning for hypotension via diastolic alone (95/55)', () => {
        expectSeverity(checkBloodPressure(95, 55), 'warning');
    });

    it('returns null for invalid inputs', () => {
        expect(checkBloodPressure(0, 80)).toBeNull();
        expect(checkBloodPressure(120, 0)).toBeNull();
        expect(checkBloodPressure(Number.NaN, 80)).toBeNull();
    });
});

describe('checkWeightChange (kg)', () => {
    it('returns null when there is no previous weight (first entry)', () => {
        expect(checkWeightChange(65)).toBeNull();
        expect(checkWeightChange(65, undefined)).toBeNull();
    });

    it('returns null for stable weight (no variation)', () => {
        expect(checkWeightChange(65, 65)).toBeNull();
    });

    it('returns null for small gain (+1.5 kg)', () => {
        expect(checkWeightChange(66.5, 65)).toBeNull();
    });

    it('returns null at the variation boundary (exactly 2 kg gain)', () => {
        // Threshold is strictly greater than 2 kg.
        expect(checkWeightChange(67, 65)).toBeNull();
    });

    it('returns warning for large gain (>2 kg, e.g. +2.5 kg)', () => {
        const a = checkWeightChange(67.5, 65);
        expectSeverity(a, 'warning');
        expect(a!.titleKey).toContain('weightVariation');
    });

    it('returns warning for moderate loss (-2.5 kg)', () => {
        const a = checkWeightChange(62.5, 65);
        expectSeverity(a, 'warning');
    });

    it('returns severe for rapid loss (-3.5 kg)', () => {
        const a = checkWeightChange(61.5, 65);
        expectSeverity(a, 'severe');
        expect(a!.titleKey).toContain('weightLossRapid');
    });

    it('falls back to warning at the loss boundary (exactly -3 kg)', () => {
        // loss of exactly 3 is NOT > 3 → not severe; variation > 2 → warning.
        const a = checkWeightChange(62, 65);
        expectSeverity(a, 'warning');
    });

    it('returns null for invalid inputs', () => {
        expect(checkWeightChange(0, 65)).toBeNull();
        expect(checkWeightChange(Number.NaN, 65)).toBeNull();
        expect(checkWeightChange(65, 0)).toBeNull();
        expect(checkWeightChange(65, Number.NaN)).toBeNull();
    });
});

describe('getEmergencyNumber', () => {
    it('returns the right number for known countries', () => {
        expect(getEmergencyNumber('FR')).toBe('15');
        expect(getEmergencyNumber('fr')).toBe('15');
        expect(getEmergencyNumber('France')).toBe('15');
        expect(getEmergencyNumber('TN')).toBe('190');
        expect(getEmergencyNumber('Tunisia')).toBe('190');
        expect(getEmergencyNumber('MA')).toBe('141');
        expect(getEmergencyNumber('US')).toBe('911');
    });

    it('returns null for unknown / empty country (NEVER guess)', () => {
        expect(getEmergencyNumber('')).toBeNull();
        expect(getEmergencyNumber('   ')).toBeNull();
        expect(getEmergencyNumber(undefined)).toBeNull();
        expect(getEmergencyNumber(null)).toBeNull();
        expect(getEmergencyNumber('Atlantis')).toBeNull();
    });
});

describe('SAFETY: medical emergency numbers (verified 2026-05-04)', () => {
    it('returns SAMU 190 for Tunisia (NOT 197 = police)', () => {
        expect(getEmergencyNumber('TN')).toBe('190');
        expect(getEmergencyNumber('TUNISIA')).toBe('190');
        expect(getEmergencyNumber('TUNISIE')).toBe('190');
    });

    it('returns SAMU 141 for Morocco', () => {
        expect(getEmergencyNumber('MA')).toBe('141');
        expect(getEmergencyNumber('MOROCCO')).toBe('141');
        expect(getEmergencyNumber('MAROC')).toBe('141');
    });

    it('returns SAMU 16 for Algeria (NOT 14 = protection civile)', () => {
        expect(getEmergencyNumber('DZ')).toBe('16');
        expect(getEmergencyNumber('ALGERIA')).toBe('16');
        expect(getEmergencyNumber('ALGERIE')).toBe('16');
    });

    it('returns SAMU 15 for France (unchanged)', () => {
        expect(getEmergencyNumber('FR')).toBe('15');
        expect(getEmergencyNumber('FRANCE')).toBe('15');
    });

    it('returns null for unknown countries (never guesses)', () => {
        expect(getEmergencyNumber('XX')).toBeNull();
        expect(getEmergencyNumber('JP')).toBeNull();
        expect(getEmergencyNumber(undefined)).toBeNull();
        expect(getEmergencyNumber(null)).toBeNull();
        expect(getEmergencyNumber('')).toBeNull();
    });

    it('country wins over the device region', () => {
        expect(resolveEmergencyNumber('FR', 'TN')).toBe('15');
        expect(resolveEmergencyNumber('tunisia', 'FR')).toBe('190');
        expect(resolveEmergencyNumber('usa', 'GB')).toBe('911');
    });
});

// F-002: the call button used to dial a national number guessed from the UI
// language (Arabic → Tunisia's 190, French → France's 15) for anyone whose
// country was unset or 'other', and onboarding preselected Tunisia for every
// device region it did not know.
describe('SAFETY: emergency number never comes from another country', () => {
    it('with neither a country nor a known device region, the number is 112 — not 190 or 15', () => {
        // The second argument used to be the UI language, so an Arabic-speaking user
        // in Egypt with no country saw Tunisia's 190. It is now the device region.
        expect(resolveEmergencyNumber(null, null)).toBe('112');
        expect(resolveEmergencyNumber('', 'EG')).toBe('112');
        expect(resolveEmergencyNumber(undefined, 'LB')).toBe('112');
    });

    it("an explicit 'other' gets 112, even when the device region is a listed country", () => {
        expect(resolveEmergencyNumber('other', null)).toBe(INTERNATIONAL_EMERGENCY_NUMBER);
        expect(resolveEmergencyNumber('other', 'TN')).toBe('112');
        expect(resolveEmergencyNumber('Other', 'FR')).toBe('112');
    });

    it('an unset country falls back to the device region, then 112', () => {
        expect(resolveEmergencyNumber('', 'US')).toBe('911');
        expect(resolveEmergencyNumber(undefined, 'GB')).toBe('999');
        expect(resolveEmergencyNumber(null, 'CH')).toBe('144');
        expect(resolveEmergencyNumber(null, 'EG')).toBe('112');
        expect(resolveEmergencyNumber(null, 'SA')).toBe('112');
        expect(resolveEmergencyNumber(null, null)).toBe('112');
    });

    it('every selectable country except other resolves to its own number', () => {
        const expected: Record<string, string> = {
            tunisia: '190',
            france: '15',
            belgium: '112',
            switzerland: '144',
            morocco: '141',
            algeria: '16',
            canada: '911',
            usa: '911',
            uk: '999',
        };
        for (const c of COUNTRY_OPTIONS) {
            if (c === 'other') continue;
            expect({ c, n: getEmergencyNumber(c) }).toEqual({ c, n: expected[c] });
        }
        expect(COUNTRY_OPTIONS).toContain('other');
    });

    it('every ISO country with a number is selectable and detected from the device region', () => {
        // UK is not an ISO 3166 code (GB is), and USA is an alias of US.
        const isoKeys = Object.keys(EMERGENCY_NUMBERS).filter(k => k.length === 2 && k !== 'UK');
        for (const iso of isoKeys) {
            const country = countryFromRegion(iso);
            expect({ iso, country: country !== null }).toEqual({ iso, country: true });
            expect(COUNTRY_OPTIONS).toContain(country);
            expect(getEmergencyNumber(country)).toBe(EMERGENCY_NUMBERS[iso]);
        }
    });

    it('an unknown device region preselects nothing (no Tunisia default)', () => {
        expect(countryFromRegion('US')).toBe('usa');
        expect(countryFromRegion('us')).toBe('usa');
        expect(countryFromRegion('EG')).toBeNull();
        expect(countryFromRegion('JP')).toBeNull();
        expect(countryFromRegion('')).toBeNull();
        expect(countryFromRegion(null)).toBeNull();
    });
});
