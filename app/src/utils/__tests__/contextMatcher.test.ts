/**
 * Unit Tests for contextMatcher.ts
 * 
 * Tests the context matching logic for Reminders V2.1.1
 */

import {
    matchContext,
    applyContextRules,
    isHotSeason,
    isRamadan,
    ramadanTableHorizon,
    buildContextProfile
} from '../contextMatcher';
import { ContextProfile, ReminderDefinition, ContextRule } from '../../types/remindersV2';

// ============================================
// TEST: matchContext
// ============================================

describe('matchContext', () => {
    const baseProfile: ContextProfile = {
        trimester: 2,
        week_of_pregnancy: 20,
        is_hot_season: false,
        is_ramadan: false,
    };

    test('should match exact trimester', () => {
        expect(matchContext({ trimester: 2 }, baseProfile)).toBe(true);
        expect(matchContext({ trimester: 1 }, baseProfile)).toBe(false);
    });

    // baseProfile declares no diagnosis, which is the shape every production
    // profile had. A boolean condition must read that absence as `false` rather
    // than as a value that matches nothing.
    test('an absent boolean flag reads as false', () => {
        expect(matchContext({ has_gestational_diabetes: false }, baseProfile)).toBe(true);
        expect(matchContext({ has_gestational_diabetes: true }, baseProfile)).toBe(false);
        expect(matchContext({ has_hypertension: false }, baseProfile)).toBe(true);
        expect(matchContext({ is_twins: true }, baseProfile)).toBe(false);
    });

    test('an absent non-boolean flag still matches nothing', () => {
        expect(matchContext({ work_schedule: 'office' }, baseProfile)).toBe(false);
    });

    test('should match week with exact value', () => {
        expect(matchContext({ week_of_pregnancy: 20 }, baseProfile)).toBe(true);
        expect(matchContext({ week_of_pregnancy: 21 }, baseProfile)).toBe(false);
    });

    test('should match week with comparator gte', () => {
        expect(matchContext({ week_of_pregnancy: { gte: 20 } }, baseProfile)).toBe(true);
        expect(matchContext({ week_of_pregnancy: { gte: 21 } }, baseProfile)).toBe(false);
    });

    test('should match week with comparator lt', () => {
        expect(matchContext({ week_of_pregnancy: { lt: 24 } }, baseProfile)).toBe(true);
        expect(matchContext({ week_of_pregnancy: { lt: 20 } }, baseProfile)).toBe(false);
    });

    test('should match week with comparator range', () => {
        expect(matchContext({ week_of_pregnancy: { gte: 15, lte: 25 } }, baseProfile)).toBe(true);
        expect(matchContext({ week_of_pregnancy: { gte: 21, lte: 25 } }, baseProfile)).toBe(false);
    });

    test('should match boolean flags', () => {
        expect(matchContext({ is_hot_season: false }, baseProfile)).toBe(true);
        expect(matchContext({ is_hot_season: true }, baseProfile)).toBe(false);
    });

    test('should match multiple conditions (AND logic)', () => {
        expect(matchContext({ trimester: 2, is_hot_season: false }, baseProfile)).toBe(true);
        expect(matchContext({ trimester: 2, is_hot_season: true }, baseProfile)).toBe(false);
    });

    test('should return true for empty conditions', () => {
        expect(matchContext({}, baseProfile)).toBe(true);
    });
});

// ============================================
// TEST: applyContextRules
// ============================================

describe('applyContextRules', () => {
    const profile: ContextProfile = {
        trimester: 1,
        week_of_pregnancy: 8,
        is_hot_season: false,
        is_ramadan: false,
    };

    // Create a minimal valid ReminderDefinition for testing
    const createTestReminder = (overrides: Partial<ReminderDefinition> = {}): ReminderDefinition => ({
        id: 'test-reminder',
        category_id: 'test',
        title: { fr: 'Test', ar: 'Test', en: 'Test' },
        description: { fr: 'Desc', ar: 'Desc', en: 'Desc' },
        default_enabled: true,
        frequency_type: 'per_day',
        intensity_options: [1, 2, 3],
        preset_times: { 1: ['09:00'], 2: ['09:00', '15:00'], 3: ['09:00', '13:00', '19:00'] },
        source_ui: 'reminders_only',
        ...overrides
    });

    test('should return empty object when no rules', () => {
        const reminder = createTestReminder({ context_rules: undefined });
        const result = applyContextRules(reminder, profile);
        expect(result).toEqual({});
    });

    test('should return null when rule disables reminder', () => {
        const reminder = createTestReminder({
            context_rules: [
                {
                    priority: 1,
                    when: { week_of_pregnancy: { lt: 24 } },
                    then: { disable: true }
                }
            ]
        });
        const result = applyContextRules(reminder, profile);
        expect(result).toBeNull();
    });

    test('should return override_intensity when rule matches', () => {
        const reminder = createTestReminder({
            context_rules: [
                {
                    priority: 1,
                    when: { trimester: 1 },
                    then: { override_intensity: 1 }
                }
            ]
        });
        const result = applyContextRules(reminder, profile);
        expect(result).toEqual({ override_intensity: 1 });
    });

    test('should merge multiple matching rules', () => {
        const reminder = createTestReminder({
            context_rules: [
                {
                    priority: 1,
                    when: { trimester: 1 },
                    then: { override_intensity: 1 }
                },
                {
                    priority: 2,
                    when: { is_hot_season: false },
                    then: { add_note: { fr: 'Note', ar: 'Note', en: 'Note' } }
                }
            ]
        });
        const result = applyContextRules(reminder, profile);
        expect(result?.override_intensity).toBe(1);
        expect(result?.add_note).toBeDefined();
    });

    test('should respect priority order (higher priority wins)', () => {
        const reminder = createTestReminder({
            context_rules: [
                {
                    priority: 2, // Lower priority
                    when: { trimester: 1 },
                    then: { override_intensity: 2 }
                },
                {
                    priority: 1, // Higher priority
                    when: { trimester: 1 },
                    then: { override_intensity: 1 }
                }
            ]
        });
        const result = applyContextRules(reminder, profile);
        expect(result?.override_intensity).toBe(1); // Priority 1 wins
    });
});

// ============================================
// TEST: buildContextProfile
// ============================================

describe('buildContextProfile', () => {
    test('should correctly calculate trimester 1', () => {
        const profile = buildContextProfile(8);
        expect(profile.trimester).toBe(1);
        expect(profile.week_of_pregnancy).toBe(8);
    });

    test('week 13 is still trimester 1 (same SSOT as Home)', () => {
        expect(buildContextProfile(13).trimester).toBe(1);
        expect(buildContextProfile(14).trimester).toBe(2);
    });

    test('should correctly calculate trimester 2', () => {
        const profile = buildContextProfile(20);
        expect(profile.trimester).toBe(2);
    });

    test('should correctly calculate trimester 3', () => {
        const profile = buildContextProfile(32);
        expect(profile.trimester).toBe(3);
    });

    test('should include is_hot_season', () => {
        const profile = buildContextProfile(20);
        expect(typeof profile.is_hot_season).toBe('boolean');
    });

    // is_hot_season called isHotSeason(); is_ramadan sat at a hardcoded `false`
    // while isRamadan() went uncalled from anywhere in the app, so the flag could
    // never be true and the docstring's "the user flag overrides this
    // calculation" described a calculation that never ran.
    //
    // The Ramadan rule is fasting guidance and waits for the clinical sign-off
    // (RAMADAN_GUIDANCE_CLINICALLY_REVIEWED, see __tests__/unreviewedContent.test.ts),
    // so this describes the behaviour once the flag is flipped.
    test('is_ramadan comes from the calendar, and the user flag overrides it (once signed off)', () => {
        jest.isolateModules(() => {
            jest.doMock('../../config/featureFlags', () => ({ RAMADAN_GUIDANCE_CLINICALLY_REVIEWED: true }));
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const signed = require('../contextMatcher') as { buildContextProfile: typeof buildContextProfile };

            jest.useFakeTimers().setSystemTime(new Date('2026-03-01T12:00:00Z'));
            try {
                expect(signed.buildContextProfile(20).is_ramadan).toBe(true);
                expect(signed.buildContextProfile(20, { is_ramadan: false }).is_ramadan).toBe(false);
            } finally {
                jest.useRealTimers();
            }

            jest.useFakeTimers().setSystemTime(new Date('2026-08-25T12:00:00Z'));
            try {
                expect(signed.buildContextProfile(20).is_ramadan).toBe(false);
                expect(signed.buildContextProfile(20, { is_ramadan: true }).is_ramadan).toBe(true);
            } finally {
                jest.useRealTimers();
            }
        });
        jest.dontMock('../../config/featureFlags');
    });

    test('is_ramadan stays false until the Ramadan guidance is signed off', () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-03-01T12:00:00Z'));
        try {
            expect(buildContextProfile(20).is_ramadan).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });

    test('should include optional user flags', () => {
        const profile = buildContextProfile(20, {
            has_gestational_diabetes: true,
            is_twins: true
        });
        expect(profile.has_gestational_diabetes).toBe(true);
        expect(profile.is_twins).toBe(true);
    });

    // The app has no screen that collects a gestational-diabetes or hypertension
    // diagnosis, so every production caller invokes buildContextProfile without
    // flags. Leaving them `undefined` breaks the rule engine's strict equality:
    // `when: { has_gestational_diabetes: false }` never matched, so the glucose
    // reminder authored for diabetic users only was offered to everyone.
    // Undeclared means not declared, and the profile must say so.
    test('undeclared medical flags default to false, not undefined', () => {
        const profile = buildContextProfile(20);
        expect(profile.has_gestational_diabetes).toBe(false);
        expect(profile.has_hypertension).toBe(false);
        expect(profile.is_twins).toBe(false);
    });

    test('an explicit false is preserved, not overwritten by the default', () => {
        const profile = buildContextProfile(20, {
            has_gestational_diabetes: false,
            has_hypertension: true
        });
        expect(profile.has_gestational_diabetes).toBe(false);
        expect(profile.has_hypertension).toBe(true);
    });

    test('a disable rule keyed on an undeclared flag fires', () => {
        const glucoseOnlyForDiabetics: ReminderDefinition = {
            id: 'rem_follow_glucose',
            category_id: 'follow',
            title: { fr: 'Contrôle glycémie', ar: '', tn: '', en: 'Glucose check' },
            source_ui: 'reminders_only',
            context_rules: [
                { when: { has_gestational_diabetes: false }, then: { disable: true }, priority: 1 }
            ]
        } as unknown as ReminderDefinition;

        expect(applyContextRules(glucoseOnlyForDiabetics, buildContextProfile(20))).toBeNull();
        expect(
            applyContextRules(
                glucoseOnlyForDiabetics,
                buildContextProfile(20, { has_gestational_diabetes: true })
            )
        ).not.toBeNull();
    });
});

// ============================================
// TEST: isHotSeason
// ============================================

describe('isHotSeason', () => {
    test('should return boolean', () => {
        expect(typeof isHotSeason()).toBe('boolean');
    });
});

// ============================================
// TEST: the Ramadan window table
// ============================================

describe('isRamadan', () => {
    const on = (iso: string) => isRamadan(new Date(`${iso}T12:00:00Z`));

    it('is true inside a window and false on either side of it', () => {
        expect(on('2026-02-17')).toBe(false);
        expect(on('2026-02-18')).toBe(true);   // first day
        expect(on('2026-03-01')).toBe(true);
        expect(on('2026-03-19')).toBe(true);   // last day
        expect(on('2026-03-20')).toBe(false);
    });

    it('sees both of the two Ramadans that fall in 2030', () => {
        // The old Record<year, window> shape could hold only one window per
        // Gregorian year. It kept January's and silently lost December's.
        expect(on('2030-01-20')).toBe(true);
        expect(on('2030-06-01')).toBe(false);
        expect(on('2030-12-28')).toBe(true);
    });

    it('sees a window that starts in one year and ends in the next', () => {
        // A January 2031 date found no 2031 entry at all and returned false, even
        // though the fast that began 26 December 2030 was still running.
        expect(on('2031-01-10')).toBe(true);
        expect(on('2031-01-24')).toBe(true);
        expect(on('2031-01-25')).toBe(false);
    });

    it('returns false past the horizon rather than guessing', () => {
        // A wrong "yes" shifts a pregnant woman's hydration reminders into the
        // middle of the night. Silence is the safe failure.
        expect(on('2099-01-01')).toBe(false);
    });
});

describe('the Ramadan table cannot rot quietly', () => {
    it('still covers at least three years ahead', () => {
        // The previous table expired in 2030 with nothing to announce it — the
        // function just started returning false forever. This fails loudly while
        // there is still time to extend it.
        const horizon = new Date(`${ramadanTableHorizon()}T00:00:00Z`);
        const threeYearsOut = new Date();
        threeYearsOut.setUTCFullYear(threeYearsOut.getUTCFullYear() + 3);
        expect(horizon.getTime()).toBeGreaterThan(threeYearsOut.getTime());
    });
});
