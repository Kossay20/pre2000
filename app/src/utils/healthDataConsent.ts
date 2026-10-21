/**
 * Explicit consent to the processing of pregnancy and health data.
 *
 * Everything the profile holds — the last period date, the week, declared conditions,
 * weights, blood pressure — is health data (GDPR art. 9), and processing it needs the
 * user's explicit consent (art. 9(2)(a)); Apple 5.1.1 and Play's health-apps policy ask
 * the same. Registration only linked to the policy and onboarding only showed the
 * medical disclaimer, so nobody was ever asked. The question is now asked once, on the
 * step that first saves the profile, and the answer is stored on the profile itself so
 * it travels with it: Firestore for an account, the device for a guest, and the
 * account's document when a guest upgrades (loginHelpers.toServerProfile).
 */

/**
 * The policy text the consent was given against — the privacy policy's "last updated"
 * date (privacy.lastUpdated). Stored with each consent so that what a user agreed to
 * can be traced to a version of the policy.
 */
export const HEALTH_DATA_CONSENT_VERSION = '2026-10-16';

export interface HealthDataConsent {
    /** HEALTH_DATA_CONSENT_VERSION at the time of consent. */
    version: string;
    /** ISO timestamp of the tick. */
    at: string;
}

// firestore.rules bounds both strings the same way (validHealthDataConsent).
const MAX_LEN = 40;

const isBoundedString = (v: unknown): v is string =>
    typeof v === 'string' && v.length > 0 && v.length <= MAX_LEN;

/** The record written when she ticks the box. */
export const recordHealthDataConsent = (now: Date = new Date()): HealthDataConsent => ({
    version: HEALTH_DATA_CONSENT_VERSION,
    at: now.toISOString(),
});

export const isValidHealthDataConsent = (value: unknown): value is HealthDataConsent => {
    if (!value || typeof value !== 'object') return false;
    const c = value as Record<string, unknown>;
    return isBoundedString(c.version) && isBoundedString(c.at) && !Number.isNaN(Date.parse(c.at));
};

/**
 * Routing predicate: a finished profile (it has a pregnancy anchor — see
 * loginHelpers.needsProfileSetup) that carries no consent. Only profiles saved before
 * the question existed are in that state; the root navigator shows them the consent
 * sheet before Home. A profile without an anchor is still in onboarding, where the same
 * question is asked on the last step.
 */
export const needsHealthDataConsent = (
    user: { pregnancyStartDate?: string; lmp?: string; healthDataConsent?: unknown } | null | undefined,
): boolean =>
    !!user && !!(user.pregnancyStartDate || user.lmp) && !isValidHealthDataConsent(user.healthDataConsent);
