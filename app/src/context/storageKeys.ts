/**
 * Canonical list of per-user private AsyncStorage keys (GDPR Art. 17 erasure surface).
 *
 * Extracted to a pure (no-JSX) module so it can be unit-tested without loading AuthContext.tsx
 * (whose JSX trips ts-jest) — same precedent as ./loginHelpers. EVERY key holding user data must
 * appear here (exact) or be covered by PRIVATE_STORAGE_KEY_PREFIXES (dynamic suffixes), so it is
 * purged on logout / resetProfile / deleteAccount. A miss = data surviving deletion + leaking to
 * the next user on a shared device.
 *
 * NOTE: 'app_locale' is intentionally NOT purged — language is a device preference, not per-session.
 */
export const PRIVATE_STORAGE_KEYS = [
    'user_profile',
    'guestProfile',
    '@pregnancy_context',
    '@reminder_settings_v1',
    '@task_statuses_v1',
    '@baby_message_enabled_v1',
    '@baby_message_hour_v1',
    'reminder_settings_v2',
    'reminders_v2_settings_guest',       // RemindersV2Service guest settings
    'reminders_v2_completions',          // NOTIF-06: streak/completion data
    '@rdv_reminders',                    // RDV notification records (@ prefix required)
    '@rdv_preferences',                  // RDV user preferences (@ prefix required)
    'in_app_review_actions_count',       // Review trigger count
    'in_app_review_last_prompt',         // Last review prompt date
    'in_app_review_install_date',        // App install date for review
    'hydration_data_v1',                 // Hydration tracking (preferences + daily intake)
    'ttcProfile',                        // TTC snapshot (lastPeriodDate, cycleLength, fertile window)
    'kick_counter_v1',                   // Cycle 8 Epic 1: kick session history (pregnancy-stage data)
    'contraction_timer_v1',              // Cycle 8 Epic 1: contraction history (labor-timing data)
    'hospital_bag_v1',                   // Cycle 8 Epic 1: bag checklist + custom items
    'ramadan_pregnancy_v1',              // Cycle 8 Epic 2: GDPR Art. 9 (religion + health) — must purge
    '@bookmarks_v1',                     // W8 #1: saved articles/supplements — personal data (reveals
                                         // health interests). Was a GLOBAL key absent from BOTH lists →
                                         // survived logout + delete + leaked across users (GDPR Art. 17).
    '@pending_appointment_draft',        // guest's unsaved appointment (title, place, notes) kept
                                         // across sign-up — an erase must not leave it behind
] as const;

/**
 * Prefixes for keys with dynamic suffixes (e.g. `@weight_entries_${uid}`). Purged by scanning
 * AsyncStorage.getAllKeys() and removing any key that startsWith one of these.
 */
export const PRIVATE_STORAGE_KEY_PREFIXES = [
    '@weight_entries_',                  // weightService — guest weight history per uid
    'reminders_v2_completions_',         // remindersV2Service — per-user streak data
    '@daily_checklist_v2_',              // dailyChecklistService — per-day progress
] as const;
