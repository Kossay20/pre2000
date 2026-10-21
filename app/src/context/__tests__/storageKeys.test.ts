import { PRIVATE_STORAGE_KEYS, PRIVATE_STORAGE_KEY_PREFIXES } from '../storageKeys';

/**
 * W8 #1 — GDPR Art. 17 erasure-surface guard.
 *
 * Every AsyncStorage key holding per-user data MUST be purged on logout / resetProfile /
 * deleteAccount — either listed exactly in PRIVATE_STORAGE_KEYS or covered by a dynamic prefix.
 * A miss = personal data surviving account deletion and leaking to the next user on a shared
 * device (the bookmark leak this test was written for). This pins the known service keys so a
 * new persistent key can't ship un-purged unnoticed.
 */
const isPurged = (key: string): boolean =>
    PRIVATE_STORAGE_KEYS.includes(key as any) ||
    PRIVATE_STORAGE_KEY_PREFIXES.some(p => key.startsWith(p));

describe('Private storage purge coverage (GDPR Art. 17)', () => {
    // Exact keys each service persists (verified at their STORAGE_KEY definitions).
    const SERVICE_KEYS: Record<string, string> = {
        bookmarkService: '@bookmarks_v1',
        kickCounterService: 'kick_counter_v1',
        contractionTimerService: 'contraction_timer_v1',
        hospitalBagService: 'hospital_bag_v1',
        userProfile: 'user_profile',
        pregnancyContext: '@pregnancy_context',
        pendingAppointmentDraft: '@pending_appointment_draft',
    };

    for (const [service, key] of Object.entries(SERVICE_KEYS)) {
        it(`purges ${service}'s key "${key}"`, () => {
            expect(isPurged(key)).toBe(true);
        });
    }

    it('covers per-uid dynamic keys via prefix (weight history)', () => {
        expect(isPurged('@weight_entries_uid123')).toBe(true);
        expect(isPurged('@daily_checklist_v2_2026-06-23')).toBe(true);
    });

    it('does NOT purge the device-level language preference', () => {
        expect(isPurged('app_locale')).toBe(false);
    });
});
