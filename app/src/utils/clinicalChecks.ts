/**
 * @fileoverview Clinical safety checks for pregnancy health inputs.
 *
 * SAFETY-CRITICAL: this module is consumed by HealthDashboardScreen to surface
 * clinically meaningful alerts when the user enters dangerous values for blood
 * glucose, blood pressure, or weight.
 *
 * Design principles:
 * - PURE functions, no I/O, no React, easily unit-tested.
 * - NEVER produce a diagnostic label ("you have X"). Always direct the user to
 *   their healthcare professional ("mention to" / "contact" your provider).
 * - The user remains AUTONOMOUS — the screen layer is responsible for offering
 *   a "save anyway" path. These functions only describe risk.
 * - Threshold rationale (gestational guidance, indicative — see references in
 *   clinical literature: WHO/HAS/ACOG):
 *     • Fasting plasma glucose normal range: 3.5 – 5.5 mmol/L.
 *     • Severe hypertension (pre-eclampsia red flag): sys ≥ 160 OR dia ≥ 110.
 *     • Sudden weight loss > 3 kg between two close entries warrants follow-up.
 *
 * If thresholds need to change for medical or regulatory reasons, update them
 * here AND update the test suite — both must move together.
 */

export type AlertSeverity = 'info' | 'warning' | 'severe' | 'critical';

export interface ClinicalAlert {
    /** Severity drives UI affordances (color, emergency button, etc.). */
    severity: AlertSeverity;
    /** i18n key for the alert title (must exist in dashboard.json `alerts.*`). */
    titleKey: string;
    /** i18n key for the alert body. */
    messageKey: string;
    /**
     * If set, the UI may surface a quick-action button (e.g. "Call emergency
     * services"). Only emitted for `critical` severity.
     */
    emergencyAction?: 'call';
}

// ────────────────────────────────────────────────────────────────────────────
// Glucose (fasting, mmol/L)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a fasting blood glucose reading (mmol/L).
 * Returns null when the value is in the normal range (3.5 – 5.5 inclusive).
 *
 * Thresholds:
 *   < 3.5            → critical (hypoglycemia)
 *   3.5 – 5.5        → null (normal)
 *   5.6 – 6.9        → warning (surveillance)
 *   7.0 – 10.0       → severe (elevated)
 *   > 10.0           → critical (very elevated)
 */
export const checkGlucose = (mmolL: number): ClinicalAlert | null => {
    if (!Number.isFinite(mmolL) || mmolL <= 0) {
        return null;
    }

    if (mmolL < 3.5) {
        return {
            severity: 'critical',
            titleKey: 'dashboard.alerts.glucoseLow.title',
            messageKey: 'dashboard.alerts.glucoseLow.message',
            emergencyAction: 'call',
        };
    }

    if (mmolL <= 5.5) {
        return null;
    }

    if (mmolL <= 6.9) {
        return {
            severity: 'warning',
            titleKey: 'dashboard.alerts.glucoseSurveillance.title',
            messageKey: 'dashboard.alerts.glucoseSurveillance.message',
        };
    }

    if (mmolL <= 10.0) {
        return {
            severity: 'severe',
            titleKey: 'dashboard.alerts.glucoseHigh.title',
            messageKey: 'dashboard.alerts.glucoseHigh.message',
        };
    }

    return {
        severity: 'critical',
        titleKey: 'dashboard.alerts.glucoseVeryHigh.title',
        messageKey: 'dashboard.alerts.glucoseVeryHigh.message',
        emergencyAction: 'call',
    };
};

// ────────────────────────────────────────────────────────────────────────────
// Blood pressure (mmHg) — pre-eclampsia is the red flag.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a blood pressure reading.
 *
 * Severe hypertension (sys ≥ 160 OR dia ≥ 110) is a RED FLAG for pre-eclampsia
 * and is reported as `critical` with an emergency action.
 *
 * Order of checks (highest severity first):
 *   sys ≥ 160 OR dia ≥ 110 → critical (severe hypertension)
 *   sys 140–159 OR dia 90–109 → severe (hypertension)
 *   sys 130–139 OR dia 80–89  → warning (pre-hypertension)
 *   sys < 90 OR dia < 60      → warning (hypotension)
 *   otherwise                 → null
 */
export const checkBloodPressure = (
    systolic: number,
    diastolic: number,
): ClinicalAlert | null => {
    if (
        !Number.isFinite(systolic) ||
        !Number.isFinite(diastolic) ||
        systolic <= 0 ||
        diastolic <= 0
    ) {
        return null;
    }

    if (systolic >= 160 || diastolic >= 110) {
        return {
            severity: 'critical',
            titleKey: 'dashboard.alerts.bpSevere.title',
            messageKey: 'dashboard.alerts.bpSevere.message',
            emergencyAction: 'call',
        };
    }

    if (systolic >= 140 || diastolic >= 90) {
        return {
            severity: 'severe',
            titleKey: 'dashboard.alerts.bpHigh.title',
            messageKey: 'dashboard.alerts.bpHigh.message',
        };
    }

    if (systolic < 90 || diastolic < 60) {
        return {
            severity: 'warning',
            titleKey: 'dashboard.alerts.bpLow.title',
            messageKey: 'dashboard.alerts.bpLow.message',
        };
    }

    if (systolic >= 130 || diastolic >= 80) {
        return {
            severity: 'warning',
            titleKey: 'dashboard.alerts.bpPreHyp.title',
            messageKey: 'dashboard.alerts.bpPreHyp.message',
        };
    }

    return null;
};

// ────────────────────────────────────────────────────────────────────────────
// Weight change between two close entries.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Evaluate a new weight against the previous entry.
 *
 * Thresholds:
 *   loss > 3 kg          → severe (rapid loss — possible complication)
 *   |variation| > 2 kg   → warning (large variation, ask user to confirm)
 *   otherwise            → null
 *
 * Returns null when there is no previous weight to compare against (first
 * entry — the screen layer should still allow the save).
 */
export const checkWeightChange = (
    newWeight: number,
    lastWeight?: number,
): ClinicalAlert | null => {
    if (!Number.isFinite(newWeight) || newWeight <= 0) {
        return null;
    }
    if (lastWeight === undefined || lastWeight === null) {
        return null;
    }
    if (!Number.isFinite(lastWeight) || lastWeight <= 0) {
        return null;
    }

    const loss = lastWeight - newWeight;
    if (loss > 3) {
        return {
            severity: 'severe',
            titleKey: 'dashboard.alerts.weightLossRapid.title',
            messageKey: 'dashboard.alerts.weightLossRapid.message',
        };
    }

    const variation = Math.abs(newWeight - lastWeight);
    if (variation > 2) {
        return {
            severity: 'warning',
            titleKey: 'dashboard.alerts.weightVariation.title',
            messageKey: 'dashboard.alerts.weightVariation.message',
        };
    }

    return null;
};

// ────────────────────────────────────────────────────────────────────────────
// Emergency phone numbers per country.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Country (ISO-2 or common name uppercased) → local medical emergency number.
 *
 * SAFETY-VERIFIED 2026-05-04 against official sources:
 * - Tunisia (190): SAMU — verified via U.S. Embassy in Tunis emergency services page
 *   and SAMU Tunis directory (allo-docteur.com.tn). 197 = POLICE, NOT medical.
 * - Morocco (141): SAMU — verified via Portail de la Santé Marocaine (srh4all.ma)
 *   and ministère de la santé. 150 covers rural areas (kept simple: 141 only).
 * - Algeria (16): SAMU — verified via French embassy in Algeria (dz.diplomatie.gouv.fr).
 *   14 = Protection Civile (firefighters/ambulance ground service); 16 routes to
 *   medical decision authority — preferred for our medical-emergency context
 *   (consistent with FR=15 SAMU, TN=190 SAMU, MA=141 SAMU pattern).
 *
 * Intentionally conservative: only countries we know with a high-confidence
 * dispatch number for medical emergencies are included. For any other country
 * resolveEmergencyNumber falls back to 112 — never to another country's
 * national number.
 */
export const EMERGENCY_NUMBERS: Readonly<Record<string, string>> = Object.freeze({
    FR: '15',
    FRANCE: '15',
    TN: '190',
    TUNISIA: '190',
    TUNISIE: '190',
    MA: '141',
    MOROCCO: '141',
    MAROC: '141',
    BE: '112',
    BELGIUM: '112',
    BELGIQUE: '112',
    CH: '144',
    SWITZERLAND: '144',
    SUISSE: '144',
    DZ: '16',
    ALGERIA: '16',
    ALGERIE: '16',
    US: '911',
    USA: '911',
    CA: '911',
    CANADA: '911',
    UK: '999',
    GB: '999',
});

/**
 * Look up the emergency number for a country.
 * Returns null when the country is unknown or empty — the UI should NOT show
 * a call button in that case (we never make up a number).
 */
export const getEmergencyNumber = (country?: string | null): string | null => {
    if (!country || typeof country !== 'string') {
        return null;
    }
    const key = country.trim().toUpperCase();
    if (!key) {
        return null;
    }
    return EMERGENCY_NUMBERS[key] ?? null;
};

/**
 * The countries a user can pick for her profile (onboarding + profile edit),
 * stored as these lowercase values. Every one except 'other' resolves through
 * EMERGENCY_NUMBERS, so whatever she picks, the call button dials that
 * country's number. Keep this list and EMERGENCY_NUMBERS in step: a country
 * that has a number but cannot be picked is a user who gets the wrong one.
 */
export const COUNTRY_OPTIONS = [
    'tunisia',
    'france',
    'belgium',
    'switzerland',
    'morocco',
    'algeria',
    'canada',
    'usa',
    'uk',
    'other',
] as const;

/** Device region (ISO 3166-1 alpha-2) → profile country value. */
const REGION_TO_COUNTRY: Readonly<Record<string, string>> = Object.freeze({
    TN: 'tunisia',
    FR: 'france',
    BE: 'belgium',
    CH: 'switzerland',
    MA: 'morocco',
    DZ: 'algeria',
    CA: 'canada',
    US: 'usa',
    GB: 'uk',
});

/**
 * Map the device region to a profile country, or null when the region is not
 * one we have a number for. Used to preselect the country in onboarding —
 * an unmapped region leaves the choice empty rather than defaulting to a
 * country the user is not in.
 */
export const countryFromRegion = (region?: string | null): string | null => {
    if (!region || typeof region !== 'string') return null;
    return REGION_TO_COUNTRY[region.trim().toUpperCase()] ?? null;
};

/**
 * Used when we do not know the user's country. 112 is the emergency number
 * every GSM/3G/4G handset must recognise (3GPP TS 22.101) — the handset places
 * an emergency call and the network routes it to the local emergency service,
 * whatever the national number is. A national number guessed from the UI
 * language (the previous fallback: Arabic → Tunisia's 190, French → France's
 * 15) reaches nobody in Egypt, Lebanon or Canada.
 */
export const INTERNATIONAL_EMERGENCY_NUMBER = '112';

/**
 * Resolve the emergency number to show and dial:
 *   1. the profile country, when we have its number;
 *   2. otherwise — profile country empty (accounts created via login, older
 *      profiles) — the device region, when we have its number;
 *   3. otherwise 112.
 * An explicit 'other' skips step 2: the user told us she is not in any of the
 * listed countries, and the device region is a settings choice, not a location.
 */
export const resolveEmergencyNumber = (
    country?: string | null,
    deviceRegion?: string | null,
): string => resolveEmergencyContact(country, deviceRegion).number;

/**
 * Where the number came from. Anything but 'profile' is a guess the screen must
 * own up to: the call button used to show "(112)" with nothing saying it was a
 * fallback, and the user never learned that the country question mattered — on a
 * labour/emergency CTA, in a market (Tunisia, SAMU 190) where 112 is the fallback
 * for every phone without a mapped region.
 */
export type EmergencyNumberSource = 'profile' | 'region' | 'fallback';

export const resolveEmergencyContact = (
    country?: string | null,
    deviceRegion?: string | null,
): { number: string; source: EmergencyNumberSource } => {
    const fromCountry = getEmergencyNumber(country);
    if (fromCountry) return { number: fromCountry, source: 'profile' };
    const saidOther = typeof country === 'string' && country.trim().toLowerCase() === 'other';
    if (!saidOther) {
        const fromRegion = getEmergencyNumber(countryFromRegion(deviceRegion));
        if (fromRegion) return { number: fromRegion, source: 'region' };
    }
    return { number: INTERNATIONAL_EMERGENCY_NUMBER, source: 'fallback' };
};
