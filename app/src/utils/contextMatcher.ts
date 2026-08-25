/**
 * Context Matcher for Reminders V2.1.1
 * 
 * Evaluates context rules against user's profile
 * to determine adaptive behavior (intensity, times, disable).
 */

import {
    NumComparator,
    ContextRuleWhen,
    ContextProfile,
    ContextRule,
    ReminderDefinition,
    ContextRuleThen
} from '../types/remindersV2';

/**
 * Match a number against a comparator or exact value
 */
function matchNum(value: number, cond: number | NumComparator): boolean {
    if (typeof cond === 'number') return value === cond;

    if (cond.eq !== undefined && value !== cond.eq) return false;
    if (cond.lt !== undefined && !(value < cond.lt)) return false;
    if (cond.lte !== undefined && !(value <= cond.lte)) return false;
    if (cond.gt !== undefined && !(value > cond.gt)) return false;
    if (cond.gte !== undefined && !(value >= cond.gte)) return false;
    if (cond.in && !cond.in.includes(value)) return false;

    return true;
}

/**
 * Check if a rule's "when" condition matches the user's profile
 *
 * A boolean condition compared against a profile key that is absent reads the
 * absence as `false`: the flags are diagnoses, and one that was never declared
 * was not declared. Without this, `buildContextProfile` was the only thing
 * standing between a hand-built profile and the bug where
 * `when: { has_gestational_diabetes: false } → disable` silently never fired.
 * Both directions stay conservative — an undeclared diagnosis cannot switch on a
 * condition-specific reminder, nor raise a reminder's intensity.
 */
export function matchContext(rule: ContextRuleWhen, profile: ContextProfile): boolean {
    for (const key of Object.keys(rule) as (keyof ContextRuleWhen)[]) {
        const expected = rule[key];
        const actual = profile[key as keyof ContextProfile];

        if (expected === undefined) continue;

        if (key === 'week_of_pregnancy') {
            if (!matchNum(actual as number, expected as number | NumComparator)) {
                return false;
            }
        } else {
            const resolved =
                actual === undefined && typeof expected === 'boolean' ? false : actual;
            if (resolved !== expected) return false;
        }
    }
    return true;
}

/**
 * Apply all matching context rules to a reminder
 * Returns the merged "then" actions, or null if reminder should be disabled
 */
export function applyContextRules(
    reminder: ReminderDefinition,
    profile: ContextProfile
): ContextRuleThen | null {
    if (!reminder.context_rules || reminder.context_rules.length === 0) {
        return {}; // No rules, use defaults
    }

    // Sort rules by priority (1 = highest)
    const sortedRules = [...reminder.context_rules].sort(
        (a, b) => a.priority - b.priority
    );

    const mergedThen: ContextRuleThen = {};

    for (const rule of sortedRules) {
        if (matchContext(rule.when, profile)) {
            // Check for disable first
            if (rule.then.disable) {
                return null; // Reminder should be hidden/disabled
            }

            // Merge other actions (higher priority = applied first)
            if (rule.then.override_intensity !== undefined && mergedThen.override_intensity === undefined) {
                mergedThen.override_intensity = rule.then.override_intensity;
            }
            if (rule.then.override_times !== undefined && mergedThen.override_times === undefined) {
                mergedThen.override_times = rule.then.override_times;
            }
            if (rule.then.add_note !== undefined && mergedThen.add_note === undefined) {
                mergedThen.add_note = rule.then.add_note;
            }
        }
    }

    return mergedThen;
}

/**
 * Check if current date is in hot season (for Maghreb)
 * Hot season: June 1 - September 30
 */
export function isHotSeason(): boolean {
    const month = new Date().getMonth(); // 0-indexed
    return month >= 5 && month <= 8; // June (5) to September (8)
}

/**
 * Approximate Ramadan window per Gregorian year (start/end inclusive, UTC dates).
 *
 * MS6: previously this function was a hardcoded `return false` with TODO. We now use
 * a static table covering 2024-2030 (Umm al-Qura calendar approximations). The table
 * needs to be extended once a year. For a long-term fix, switch to a Hijri library
 * (e.g. `hijri-converter` or `@umalqura/core`) — kept minimal here to avoid bundle bloat.
 *
 * If the user sets `is_ramadan: true` manually in their profile (userFlags), it
 * overrides this calculation in `buildContextProfile`.
 */
const RAMADAN_WINDOWS: Record<number, [string, string]> = {
    2024: ['2024-03-11', '2024-04-09'],
    2025: ['2025-03-01', '2025-03-30'],
    2026: ['2026-02-18', '2026-03-19'],
    2027: ['2027-02-08', '2027-03-08'],
    2028: ['2028-01-28', '2028-02-26'],
    2029: ['2029-01-16', '2029-02-14'],
    2030: ['2030-01-05', '2030-02-03'],
};

export function isRamadan(now: Date = new Date()): boolean {
    const year = now.getFullYear();
    const window = RAMADAN_WINDOWS[year];
    if (!window) {
        // Unknown year (table not extended) — return false rather than guess
        return false;
    }
    const todayStr = now.toISOString().split('T')[0];
    return todayStr >= window[0] && todayStr <= window[1];
}

/**
 * Build a ContextProfile from user data
 *
 * The medical booleans default to `false`, not `undefined`. `matchContext`
 * compares with strict equality, so an undefined flag silently fails to match a
 * rule written as `when: { has_gestational_diabetes: false }` — the disable rule
 * never fired, and the glucose-check reminder authored for diabetic users only
 * was listed for every user. No screen collects these diagnoses yet, so every
 * production caller passes no flags at all and the whole class of rules was
 * dead. Undeclared means not declared, and the profile has to say so rather than
 * leave a hole for the rule engine to trip over.
 */
export function buildContextProfile(
    weekOfPregnancy: number,
    userFlags?: {
        has_gestational_diabetes?: boolean;
        has_hypertension?: boolean;
        is_twins?: boolean;
        work_schedule?: 'home' | 'office' | 'shift';
        is_ramadan?: boolean;
    }
): ContextProfile {
    const trimester: 1 | 2 | 3 = weekOfPregnancy <= 12 ? 1 : weekOfPregnancy <= 27 ? 2 : 3;

    return {
        trimester,
        week_of_pregnancy: weekOfPregnancy,
        is_hot_season: isHotSeason(),
        is_ramadan: userFlags?.is_ramadan ?? isRamadan(),
        has_gestational_diabetes: userFlags?.has_gestational_diabetes ?? false,
        has_hypertension: userFlags?.has_hypertension ?? false,
        is_twins: userFlags?.is_twins ?? false,
        work_schedule: userFlags?.work_schedule,
    };
}
