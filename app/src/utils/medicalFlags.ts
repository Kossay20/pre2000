/**
 * The declared-condition flags that drive the context rules in REMINDERS_V2.json.
 *
 * The catalogue has carried rules keyed on these since it was written — the
 * glucose-check reminder is authored to be offered only to users with
 * gestational diabetes — but nothing ever collected the answers, so every
 * production profile left them undefined and the whole class of rules was dead.
 * See `contextMatcher.buildContextProfile`.
 *
 * Three states matter and they are not two:
 *   `true`       — declared
 *   `false`      — asked, answered no
 *   `undefined`  — never asked, or asked and skipped
 *
 * The rule engine collapses the last two to "not declared", which is the
 * conservative direction for every rule in the catalogue: an undeclared
 * condition can neither switch on a condition-specific reminder nor raise a
 * reminder's intensity. The distinction is still worth storing, because it is
 * what tells the app whether asking again is a repeat or a first time.
 */
export interface MedicalFlags {
    hasGestationalDiabetes?: boolean;
    hasHypertension?: boolean;
    isTwinPregnancy?: boolean;
    /** ISO timestamp of the answer — set even when every answer was skipped. */
    medicalProfileAnsweredAt?: string;
}

/** The keys a caller may write. Anything else must not reach the profile. */
export const MEDICAL_FLAG_KEYS = [
    'hasGestationalDiabetes',
    'hasHypertension',
    'isTwinPregnancy',
] as const;

export type MedicalFlagKey = (typeof MEDICAL_FLAG_KEYS)[number];

/**
 * Translate the profile's camelCase flags into the snake_case shape
 * `buildContextProfile` expects.
 *
 * This mapping is the only place the two vocabularies meet. It exists as its own
 * function because the previous arrangement — every caller passing an object
 * literal — is exactly how `dailyChecklistService` ended up passing `{}` with a
 * TODO on top of it for the life of the feature.
 */
export function toContextUserFlags(flags?: MedicalFlags | null): {
    has_gestational_diabetes?: boolean;
    has_hypertension?: boolean;
    is_twins?: boolean;
} {
    return {
        has_gestational_diabetes: flags?.hasGestationalDiabetes,
        has_hypertension: flags?.hasHypertension,
        is_twins: flags?.isTwinPregnancy,
    };
}

/**
 * Keep only real booleans, and only for the three known keys.
 *
 * These land in `userProfiles/{uid}` in Firestore, where the rules cap free-text
 * names but do not type every field. A screen that hands through a string or an
 * unexpected key would persist it, and the rule engine's strict equality would
 * then compare a string against a boolean and quietly match nothing — the same
 * failure that made the glucose rule inert, arriving by a different door.
 */
export function sanitizeMedicalFlags(input: unknown): MedicalFlags {
    const out: MedicalFlags = {};
    if (!input || typeof input !== 'object') return out;
    const src = input as Record<string, unknown>;
    for (const key of MEDICAL_FLAG_KEYS) {
        if (typeof src[key] === 'boolean') out[key] = src[key] as boolean;
    }
    // 40 is the cap firestore.rules enforces. Dropping an over-long value here
    // rather than letting it reach setDoc keeps the failure visible in one place:
    // a rejected write surfaces as a silent { ok: false } the UI never shows.
    if (
        typeof src.medicalProfileAnsweredAt === 'string' &&
        src.medicalProfileAnsweredAt.length > 0 &&
        src.medicalProfileAnsweredAt.length <= 40
    ) {
        out.medicalProfileAnsweredAt = src.medicalProfileAnsweredAt;
    }
    return out;
}

/** True once the question has been put to the user, whatever they answered. */
export function hasAnsweredMedicalProfile(flags?: MedicalFlags | null): boolean {
    return typeof flags?.medicalProfileAnsweredAt === 'string' && flags.medicalProfileAnsweredAt.length > 0;
}
