/**
 * The regression guard for the defect found on 2026-08-25.
 *
 * REMINDERS_V2.json has always carried, on `rem_follow_glucose`, the rule
 * `when { has_gestational_diabetes: false } → disable`. It never fired: the rule
 * engine compares with strict equality, no screen collected the diagnosis, and
 * both production callers built a profile that left the flag undefined — so
 * `undefined !== false`, the disable never matched, and a glucose-monitoring
 * reminder was listed in the medical section for every user of a pregnancy app.
 *
 * These tests exercise the whole chain the defect ran through — profile flags →
 * buildContextProfile → applyContextRules → getAvailableReminders — rather than
 * the arithmetic of one comparison, because every individual link looked correct
 * on its own.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
}));
jest.mock('../../config/firebase', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
    doc: jest.fn(),
    getDoc: jest.fn(),
    setDoc: jest.fn(),
    collection: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    getDocs: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
    }),
}));

import { buildContextProfile } from '../../utils/contextMatcher';
import { toContextUserFlags } from '../../utils/medicalFlags';
import { getAvailableReminders } from '../remindersV2Service';

const WEEK = 24;

const idsFor = (flags?: Parameters<typeof toContextUserFlags>[0]) =>
    getAvailableReminders(buildContextProfile(WEEK, toContextUserFlags(flags))).map(r => r.id);

describe('rem_follow_glucose is offered only to users who declared gestational diabetes', () => {
    it('is absent when the question was never asked', () => {
        expect(idsFor(undefined)).not.toContain('rem_follow_glucose');
    });

    it('is absent when the user was asked and answered no', () => {
        expect(idsFor({ hasGestationalDiabetes: false })).not.toContain('rem_follow_glucose');
    });

    it('is present when the user declared gestational diabetes', () => {
        expect(idsFor({ hasGestationalDiabetes: true })).toContain('rem_follow_glucose');
    });

    it('is not switched on by a different declared condition', () => {
        expect(idsFor({ hasHypertension: true, isTwinPregnancy: true }))
            .not.toContain('rem_follow_glucose');
    });
});

describe('rem_follow_bp stays available to everyone', () => {
    // Its only rule raises intensity for declared hypertension; it has no disable
    // branch. Blood-pressure checks are standard in pregnancy, so the reminder
    // must survive the same profile shapes that hide the glucose one — otherwise
    // the fix for one rule silently suppressed a second.
    it.each([
        ['never asked', undefined],
        ['answered no', { hasHypertension: false }],
        ['declared', { hasHypertension: true }],
    ] as const)('%s', (_label, flags) => {
        expect(idsFor(flags)).toContain('rem_follow_bp');
    });
});

describe('a reminder the user already switched on is never taken away', () => {
    // remindersScheduler honours the stored `enabled` flag and never consults the
    // context rules. So hiding an enabled reminder from the list does not stop its
    // notification — it only removes the card that would switch it off. Anyone who
    // had enabled the glucose check before this rule started working would have
    // been left with a daily prompt and no way to silence it.
    const idsKeeping = (
        flags: Parameters<typeof toContextUserFlags>[0],
        enabled: string[],
    ) =>
        getAvailableReminders(
            buildContextProfile(WEEK, toContextUserFlags(flags)),
            undefined,
            new Set(enabled),
        ).map(r => r.id);

    it('keeps an enabled reminder a context rule would otherwise hide', () => {
        expect(idsKeeping(undefined, ['rem_follow_glucose'])).toContain('rem_follow_glucose');
    });

    it('does not resurrect one the user never enabled', () => {
        expect(idsKeeping(undefined, ['rem_follow_bp'])).not.toContain('rem_follow_glucose');
    });

    it('an empty keep-set behaves exactly like no keep-set', () => {
        const withEmpty = idsKeeping(undefined, []);
        const without = getAvailableReminders(
            buildContextProfile(WEEK, toContextUserFlags(undefined)),
        ).map(r => r.id);
        expect(withEmpty).toEqual(without);
    });
});

describe('the catalogue is not otherwise disturbed', () => {
    it('declaring a condition only ever adds reminders, never removes one', () => {
        const base = idsFor(undefined);
        const declared = idsFor({
            hasGestationalDiabetes: true,
            hasHypertension: true,
            isTwinPregnancy: true,
        });
        for (const id of base) expect(declared).toContain(id);
        expect(declared.length).toBeGreaterThan(base.length);
    });
});
