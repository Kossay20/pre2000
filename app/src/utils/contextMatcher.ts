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
import { trimesterFromWeek } from './pregnancyCalculator';

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
 * Approximate Ramadan windows (start/end inclusive, UTC date strings, sorted).
 *
 * A LIST, not a map keyed by Gregorian year. The previous shape —
 * `Record<year, [start, end]>` — could hold only one window per year, and that is
 * not how the Hijri calendar falls: Ramadan moves ~11 days earlier each Gregorian
 * year, so **2030 has two of them**, one starting 5 January and one starting 26
 * December that runs into January 2031. Under the old shape a date in late
 * December 2030 looked up 2030, found the January window, and returned false; a
 * date in January 2031 found nothing at all. The table was not merely due to
 * expire in 2030 — it was already wrong across the back half of its own range.
 *
 * These are Umm al-Qura arithmetic approximations and can be a day out either
 * way; the real start is settled by moon sighting and announced locally. Nothing
 * here may drive a medical determination — the only consumer is a hydration
 * reminder's time-shift, and being a day early or late on that is harmless.
 * Anything with clinical weight must come from the user's own declaration
 * (`userFlags.is_ramadan`), which overrides this in `buildContextProfile`.
 *
 * `ramadanTableHorizonYears()` reports how far this reaches; a unit test fails
 * while there are fewer than three years left, so the table cannot rot quietly
 * the way the old one did.
 */
const RAMADAN_WINDOWS: ReadonlyArray<readonly [string, string]> = [
    ['2024-03-11', '2024-04-09'],
    ['2025-03-01', '2025-03-30'],
    ['2026-02-18', '2026-03-19'],
    ['2027-02-08', '2027-03-09'],
    ['2028-01-28', '2028-02-26'],
    ['2029-01-16', '2029-02-14'],
    ['2030-01-05', '2030-02-03'],
    ['2030-12-26', '2031-01-24'],
    ['2031-12-15', '2032-01-13'],
    ['2032-12-04', '2033-01-02'],
    ['2033-11-23', '2033-12-22'],
    ['2034-11-12', '2034-12-11'],
    ['2035-11-01', '2035-11-30'],
    ['2036-10-20', '2036-11-18'],
    ['2037-10-10', '2037-11-08'],
    ['2038-09-29', '2038-10-28'],
    ['2039-09-19', '2039-10-18'],
    ['2040-09-07', '2040-10-06'],
];

/** Last date the table covers — the guard against silent rot. */
export function ramadanTableHorizon(): string {
    return RAMADAN_WINDOWS[RAMADAN_WINDOWS.length - 1][1];
}

export function isRamadan(now: Date = new Date()): boolean {
    const todayStr = now.toISOString().split('T')[0];
    // Past the horizon, return false rather than guess. A wrong "yes" would shift
    // a pregnant woman's hydration reminders into the middle of the night.
    return RAMADAN_WINDOWS.some(([from, to]) => todayStr >= from && todayStr <= to);
}

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
    const trimester: 1 | 2 | 3 = trimesterFromWeek(weekOfPregnancy);

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
