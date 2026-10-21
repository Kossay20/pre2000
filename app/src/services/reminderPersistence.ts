import { createLogger } from '../utils/logger';
const log = createLogger('reminderPersistence');

import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, doc, setDoc, getDocs, query, where, deleteDoc, deleteField } from 'firebase/firestore';
import { db } from '../config/firebase';
import { pushPendingSessions } from './kickCounterService';
import { pushPendingContractions } from './contractionTimerService';
import { pushPendingBag } from './hospitalBagService';
import { UserReminderSettings, UserTaskStatus } from '../types';
import { ReminderUserSetting } from '../types/remindersV2';

// Storage keys for the V2 reminders subsystem (must mirror remindersV2Service.ts)
const REMINDERS_V2_GUEST_SETTINGS_KEY = 'reminders_v2_settings_guest';
const REMINDERS_V2_COMPLETIONS_GUEST_KEY = 'reminders_v2_completions';
const REMINDERS_V2_FIRESTORE_COLLECTION = 'reminder_settings_v2';

// Storage key prefix for the daily checklist V2 (must mirror dailyChecklistService.ts)
const DAILY_CHECKLIST_V2_PREFIX = '@daily_checklist_v2_';
// Matches a YYYY-MM-DD date suffix → guest/legacy key shape
const DAILY_CHECKLIST_GUEST_SUFFIX_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Persistence Layer for V1.2 Reminders & Tasks
 * Handles both Guest (AsyncStorage) and Auth (Firestore) users
 */

// AsyncStorage keys
const STORAGE_KEYS = {
    REMINDER_SETTINGS: '@reminder_settings_v1',
    TASK_STATUSES: '@task_statuses_v1',
    BABY_MESSAGE_ENABLED: '@baby_message_enabled_v1',
    BABY_MESSAGE_HOUR: '@baby_message_hour_v1',
};

// ============================================================================
// REMINDER SETTINGS
// ============================================================================

/**
 * Reminder settings structure (Guest)
 */
export interface ReminderSettingsData {
    [reminderId: string]: {
        enabled: boolean;
        timesPerDay: number;
        customHours?: string[];
        lastModified: string; // ISO date
    };
}

/**
 * Save reminder setting (Guest - AsyncStorage)
 */
export const saveReminderSettingGuest = async (
    reminderId: string,
    enabled: boolean,
    timesPerDay: number,
    customHours?: string[]
): Promise<void> => {
    log.info('[reminderPersistence] Saving reminder (Guest):', {
        reminderId,
        enabled,
        timesPerDay,
    });

    try {
        // Load existing settings
        const existing = await loadReminderSettingsGuest();

        // Update
        existing[reminderId] = {
            enabled,
            timesPerDay,
            customHours,
            lastModified: new Date().toISOString(),
        };

        // Save
        await AsyncStorage.setItem(
            STORAGE_KEYS.REMINDER_SETTINGS,
            JSON.stringify(existing)
        );

        log.info('[reminderPersistence] ✅ Saved reminder (Guest)');
    } catch (error) {
        log.error('[reminderPersistence] Error saving reminder (Guest):', error);
        throw error;
    }
};

/**
 * Load all reminder settings (Guest - AsyncStorage)
 */
export const loadReminderSettingsGuest = async (): Promise<ReminderSettingsData> => {
    log.info('[reminderPersistence] Loading reminders (Guest)...');

    try {
        const data = await AsyncStorage.getItem(STORAGE_KEYS.REMINDER_SETTINGS);

        if (!data) {
            log.info('[reminderPersistence] No Guest settings found');
            return {};
        }

        const parsed = JSON.parse(data);
        log.info('[reminderPersistence] Loaded', Object.keys(parsed).length, 'reminders (Guest)');

        return parsed;
    } catch (error) {
        log.error('[reminderPersistence] Error loading reminders (Guest):', error);
        return {};
    }
};

/**
 * Save reminder setting (Auth - Firestore)
 */
export const saveReminderSettingAuth = async (
    userId: string,
    reminderId: string,
    enabled: boolean,
    timesPerDay: number,
    customHours?: string[]
): Promise<void> => {
    log.info('[reminderPersistence] Saving reminder (Auth):', {
        userId,
        reminderId,
        enabled,
        timesPerDay,
    });

    try {
        const docId = `${userId}_${reminderId}`;
        const docRef = doc(db, 'userReminderSettings', docId);

        const data: UserReminderSettings = {
            user_id: userId,
            reminder_id: reminderId,
            enabled,
            times_per_day: timesPerDay,
            custom_hours: customHours,
            last_modified: new Date(),
        };

        await setDoc(docRef, data, { merge: true });

        log.info('[reminderPersistence] ✅ Saved reminder (Auth)');
    } catch (error) {
        log.error('[reminderPersistence] Error saving reminder (Auth):', error);
        throw error;
    }
};

/**
 * Load all reminder settings (Auth - Firestore)
 */
export const loadReminderSettingsAuth = async (userId: string): Promise<ReminderSettingsData> => {
    log.info('[reminderPersistence] Loading reminders (Auth) for:', userId);

    if (!userId) {
        log.warn('[reminderPersistence] No userId provided for loading reminders');
        return {};
    }

    try {
        const q = query(
            collection(db, 'userReminderSettings'),
            where('user_id', '==', userId)
        );

        const snapshot = await getDocs(q);
        const settings: ReminderSettingsData = {};

        snapshot.docs.forEach(doc => {
            const data = doc.data() as UserReminderSettings;
            settings[data.reminder_id] = {
                enabled: data.enabled,
                timesPerDay: data.times_per_day,
                customHours: data.custom_hours,
                lastModified: data.last_modified.toString(),
            };
        });

        log.info('[reminderPersistence] Loaded', Object.keys(settings).length, 'reminders (Auth)');

        return settings;
    } catch (error) {
        log.error('[reminderPersistence] Error loading reminders (Auth):', error);
        return {};
    }
};

/**
 * Migrate Guest settings to Auth on login
 */
export const migrateReminderSettingsToAuth = async (userId: string): Promise<void> => {
    log.info('[reminderPersistence] Migrating reminders Guest → Auth for:', userId);

    try {
        // Load Guest settings
        const guestSettings = await loadReminderSettingsGuest();
        const count = Object.keys(guestSettings).length;

        if (count === 0) {
            log.info('[reminderPersistence] No Guest settings to migrate');
            return;
        }

        // Migrate each setting
        let migrated = 0;
        for (const [reminderId, setting] of Object.entries(guestSettings)) {
            await saveReminderSettingAuth(
                userId,
                reminderId,
                setting.enabled,
                setting.timesPerDay,
                setting.customHours
            );
            migrated++;
        }

        log.info('[reminderPersistence] ✅ Migrated', migrated, 'reminders to Auth');

        // Clear Guest storage after migration
        await AsyncStorage.removeItem(STORAGE_KEYS.REMINDER_SETTINGS);
    } catch (error) {
        log.error('[reminderPersistence] Error migrating reminders:', error);
    }
};

// ============================================================================
// TASK STATUSES
// ============================================================================

/**
 * Task status structure (Guest)
 */
export interface TaskStatusData {
    [key: string]: { // key = `${taskId}_w${weekNumber}`
        completed: boolean;
        completedAt?: string; // ISO date
    };
}

/**
 * Save task status (Guest - AsyncStorage)
 */
export const saveTaskStatusGuest = async (
    taskId: string,
    weekNumber: number,
    completed: boolean
): Promise<void> => {
    log.info('[reminderPersistence] Saving task (Guest):', {
        taskId,
        weekNumber,
        completed,
    });

    try {
        // Load existing
        const existing = await loadTaskStatusesGuest();

        // Update
        const key = `${taskId}_w${weekNumber}`;
        existing[key] = {
            completed,
            completedAt: completed ? new Date().toISOString() : undefined,
        };

        // Save
        await AsyncStorage.setItem(
            STORAGE_KEYS.TASK_STATUSES,
            JSON.stringify(existing)
        );

        log.info('[reminderPersistence] ✅ Saved task (Guest)');
    } catch (error) {
        log.error('[reminderPersistence] Error saving task (Guest):', error);
        throw error;
    }
};

/**
 * Load all task statuses (Guest - AsyncStorage)
 */
export const loadTaskStatusesGuest = async (): Promise<TaskStatusData> => {
    log.info('[reminderPersistence] Loading tasks (Guest)...');

    try {
        const data = await AsyncStorage.getItem(STORAGE_KEYS.TASK_STATUSES);

        if (!data) {
            log.info('[reminderPersistence] No Guest task statuses found');
            return {};
        }

        const parsed = JSON.parse(data);
        log.info('[reminderPersistence] Loaded', Object.keys(parsed).length, 'task statuses (Guest)');

        return parsed;
    } catch (error) {
        log.error('[reminderPersistence] Error loading tasks (Guest):', error);
        return {};
    }
};

/**
 * Save task status (Auth - Firestore)
 */
export const saveTaskStatusAuth = async (
    userId: string,
    taskId: string,
    weekNumber: number,
    completed: boolean
): Promise<void> => {
    log.info('[reminderPersistence] Saving task (Auth):', {
        userId,
        taskId,
        weekNumber,
        completed,
    });

    try {
        const docId = `${userId}_${taskId}_w${weekNumber}`;
        const docRef = doc(db, 'userTaskStatuses', docId);

        const data: UserTaskStatus = {
            user_id: userId,
            task_id: taskId,
            week_number: weekNumber,
            completed,
            completed_at: completed ? new Date() : (deleteField() as any),
        };

        await setDoc(docRef, data, { merge: true });

        log.info('[reminderPersistence] ✅ Saved task (Auth)');
    } catch (error) {
        log.error('[reminderPersistence] Error saving task (Auth):', error);
        throw error;
    }
};

/**
 * Load task statuses for a specific week (Auth - Firestore)
 */
export const loadTaskStatusesAuth = async (
    userId: string,
    weekNumber: number
): Promise<TaskStatusData> => {
    log.info('[reminderPersistence] Loading tasks (Auth) for week:', weekNumber);

    if (!userId) {
        log.warn('[reminderPersistence] No userId provided for loading tasks');
        return {};
    }

    try {
        const q = query(
            collection(db, 'userTaskStatuses'),
            where('user_id', '==', userId),
            where('week_number', '==', weekNumber)
        );

        const snapshot = await getDocs(q);
        const statuses: TaskStatusData = {};

        snapshot.docs.forEach(doc => {
            const data = doc.data() as UserTaskStatus;
            const key = `${data.task_id}_w${data.week_number}`;
            statuses[key] = {
                completed: data.completed,
                completedAt: data.completed_at?.toString(),
            };
        });

        log.info('[reminderPersistence] Loaded', Object.keys(statuses).length, 'task statuses (Auth)');

        return statuses;
    } catch (error) {
        log.error('[reminderPersistence] Error loading tasks (Auth):', error);
        return {};
    }
};

/**
 * Migrate Guest task statuses to Auth on login
 */
export const migrateTaskStatusesToAuth = async (userId: string): Promise<void> => {
    log.info('[reminderPersistence] Migrating task statuses Guest → Auth for:', userId);

    try {
        // Load Guest statuses
        const guestStatuses = await loadTaskStatusesGuest();
        const count = Object.keys(guestStatuses).length;

        if (count === 0) {
            log.info('[reminderPersistence] No Guest task statuses to migrate');
            return;
        }

        // Migrate each status
        let migrated = 0;
        for (const [key, status] of Object.entries(guestStatuses)) {
            // Parse key: taskId_wWeekNumber
            const match = key.match(/(.+)_w(\d+)/);
            if (!match) continue;

            const taskId = match[1];
            const weekNumber = parseInt(match[2]);

            await saveTaskStatusAuth(
                userId,
                taskId,
                weekNumber,
                status.completed
            );
            migrated++;
        }

        log.info('[reminderPersistence] ✅ Migrated', migrated, 'task statuses to Auth');

        // Clear Guest storage after migration
        await AsyncStorage.removeItem(STORAGE_KEYS.TASK_STATUSES);
    } catch (error) {
        log.error('[reminderPersistence] Error migrating task statuses:', error);
    }
};

// ============================================================================
// BABY MESSAGE SETTINGS
// ============================================================================

/**
 * Save baby message enabled setting
 */
export const saveBabyMessageEnabled = async (enabled: boolean): Promise<void> => {
    log.info('[reminderPersistence] Saving baby message enabled:', enabled);

    try {
        await AsyncStorage.setItem(
            STORAGE_KEYS.BABY_MESSAGE_ENABLED,
            JSON.stringify(enabled)
        );
        log.info('[reminderPersistence] ✅ Saved baby message setting');
    } catch (error) {
        log.error('[reminderPersistence] Error saving baby message setting:', error);
    }
};

/**
 * Load baby message enabled setting
 */
export const loadBabyMessageEnabled = async (): Promise<boolean> => {
    log.info('[reminderPersistence] Loading baby message enabled...');

    try {
        const data = await AsyncStorage.getItem(STORAGE_KEYS.BABY_MESSAGE_ENABLED);
        const enabled = data ? JSON.parse(data) : true; // Default: true

        log.info('[reminderPersistence] Baby message enabled:', enabled);
        return enabled;
    } catch (error) {
        log.error('[reminderPersistence] Error loading baby message setting:', error);
        return true; // Default: true
    }
};

/**
 * Save baby message hour
 */
export const saveBabyMessageHour = async (hour: number): Promise<void> => {
    log.info('[reminderPersistence] Saving baby message hour:', hour);

    try {
        await AsyncStorage.setItem(
            STORAGE_KEYS.BABY_MESSAGE_HOUR,
            JSON.stringify(hour)
        );
        log.info('[reminderPersistence] ✅ Saved baby message hour');
    } catch (error) {
        log.error('[reminderPersistence] Error saving baby message hour:', error);
    }
};

/**
 * Load baby message hour
 */
export const loadBabyMessageHour = async (): Promise<number> => {
    log.info('[reminderPersistence] Loading baby message hour...');

    try {
        const data = await AsyncStorage.getItem(STORAGE_KEYS.BABY_MESSAGE_HOUR);
        const hour = data ? JSON.parse(data) : 10; // Default: 10:00

        log.info('[reminderPersistence] Baby message hour:', hour);
        return hour;
    } catch (error) {
        log.error('[reminderPersistence] Error loading baby message hour:', error);
        return 10; // Default: 10:00
    }
};

// ============================================================================
// REMINDERS V2 — GUEST → AUTH MIGRATION
// ============================================================================

/**
 * Migrate Reminders V2 user settings from AsyncStorage (guest)
 * to Firestore collection `reminder_settings_v2` (authenticated user).
 *
 * Idempotent: if no guest payload is present, returns silently.
 * Mirrors the docId / cleaning conventions of remindersV2Service.saveSettingAuth.
 */
const migrateRemindersV2SettingsToAuth = async (userId: string): Promise<void> => {
    log.info('[reminderPersistence] Migrating Reminders V2 settings Guest → Auth for:', userId);

    if (!userId) {
        log.warn('[reminderPersistence] migrateRemindersV2SettingsToAuth: missing userId, skipping');
        return;
    }

    try {
        const raw = await AsyncStorage.getItem(REMINDERS_V2_GUEST_SETTINGS_KEY);

        if (!raw) {
            log.info('[reminderPersistence] No Reminders V2 guest settings to migrate');
            return;
        }

        let parsed: Record<string, ReminderUserSetting>;
        try {
            parsed = JSON.parse(raw) as Record<string, ReminderUserSetting>;
        } catch (parseError) {
            log.error('[reminderPersistence] Reminders V2 guest payload is not valid JSON:', parseError);
            return;
        }

        const entries = Object.entries(parsed || {});
        if (entries.length === 0) {
            log.info('[reminderPersistence] Reminders V2 guest payload is empty, nothing to migrate');
            // Clean the empty key to avoid future re-processing
            await AsyncStorage.removeItem(REMINDERS_V2_GUEST_SETTINGS_KEY);
            return;
        }

        let migrated = 0;
        for (const [reminderId, setting] of entries) {
            if (!setting || typeof setting !== 'object') {
                log.warn('[reminderPersistence] Skipping invalid Reminders V2 entry:', reminderId);
                continue;
            }

            // Force user_id and reminder_id to canonical values
            const normalized: ReminderUserSetting = {
                ...setting,
                reminder_id: reminderId,
                user_id: userId,
                last_modified_at: setting.last_modified_at || new Date().toISOString(),
            };

            // Firestore rejects undefined values — strip them as remindersV2Service does
            const cleaned = Object.fromEntries(
                Object.entries(normalized).filter(([_, value]) => value !== undefined)
            );

            const docId = `${userId}_${reminderId}`;
            await setDoc(doc(db, REMINDERS_V2_FIRESTORE_COLLECTION, docId), cleaned, { merge: true });
            migrated++;
        }

        log.info('[reminderPersistence] ✅ Migrated', migrated, 'Reminders V2 settings to Auth');

        // Drop the guest key only after a successful Firestore write loop
        await AsyncStorage.removeItem(REMINDERS_V2_GUEST_SETTINGS_KEY);
    } catch (error) {
        log.error('[reminderPersistence] Error migrating Reminders V2 settings:', error);
        // Do not rethrow — migration is best-effort
    }
};

/**
 * Migrate Reminders V2 completion history from the guest AsyncStorage key
 * (`reminders_v2_completions`) to the user-scoped key
 * (`reminders_v2_completions_${userId}`).
 *
 * Completions are stored locally by design (no Firestore). We merge by union of
 * YYYY-MM-DD date strings per reminder_id and dedup/sort to stay aligned with
 * remindersV2Service.markReminderAsCompleted.
 */
const migrateRemindersV2CompletionsToAuth = async (userId: string): Promise<void> => {
    log.info('[reminderPersistence] Migrating Reminders V2 completions Guest → Auth for:', userId);

    if (!userId) {
        log.warn('[reminderPersistence] migrateRemindersV2CompletionsToAuth: missing userId, skipping');
        return;
    }

    try {
        const guestRaw = await AsyncStorage.getItem(REMINDERS_V2_COMPLETIONS_GUEST_KEY);

        if (!guestRaw) {
            log.info('[reminderPersistence] No Reminders V2 guest completions to migrate');
            return;
        }

        let guestCompletions: Record<string, string[]>;
        try {
            guestCompletions = JSON.parse(guestRaw) as Record<string, string[]>;
        } catch (parseError) {
            log.error('[reminderPersistence] Reminders V2 completions guest payload is not valid JSON:', parseError);
            return;
        }

        const userKey = `${REMINDERS_V2_COMPLETIONS_GUEST_KEY}_${userId}`;
        const userRaw = await AsyncStorage.getItem(userKey);
        let userCompletions: Record<string, string[]> = {};

        if (userRaw) {
            try {
                userCompletions = JSON.parse(userRaw) as Record<string, string[]>;
            } catch (parseError) {
                log.warn('[reminderPersistence] Existing Reminders V2 user completions are not valid JSON, overwriting:', parseError);
                userCompletions = {};
            }
        }

        const merged: Record<string, string[]> = { ...userCompletions };
        let mergedReminders = 0;

        for (const [reminderId, dates] of Object.entries(guestCompletions || {})) {
            if (!Array.isArray(dates)) continue;

            const existing = Array.isArray(merged[reminderId]) ? merged[reminderId] : [];
            // Union + dedup + sort, then keep last 90 days like markReminderAsCompleted
            const unionSorted = Array.from(new Set([...existing, ...dates])).sort().slice(-90);
            merged[reminderId] = unionSorted;
            mergedReminders++;
        }

        if (mergedReminders === 0) {
            log.info('[reminderPersistence] Reminders V2 guest completions empty, removing legacy key');
            await AsyncStorage.removeItem(REMINDERS_V2_COMPLETIONS_GUEST_KEY);
            return;
        }

        await AsyncStorage.setItem(userKey, JSON.stringify(merged));
        await AsyncStorage.removeItem(REMINDERS_V2_COMPLETIONS_GUEST_KEY);

        log.info('[reminderPersistence] ✅ Merged completions for', mergedReminders, 'reminders into', userKey);
    } catch (error) {
        log.error('[reminderPersistence] Error migrating Reminders V2 completions:', error);
    }
};

/**
 * "Migrate" daily-checklist V2 progress entries on guest → auth transition.
 *
 * Note on schema: dailyChecklistService stores progress under
 * `@daily_checklist_v2_${YYYY-MM-DD}` (date-only suffix, no userId). The same
 * key shape is used in both guest and authenticated mode. Renaming entries to
 * include `${userId}` would actively break loadDailyProgress / getHistoricalData
 * which both read date-only keys.
 *
 * Therefore this function is intentionally a safe no-op: it inspects the
 * existing `@daily_checklist_v2_*` keys, classifies them, and logs the outcome
 * for traceability. It is included in the migration pipeline so future schema
 * changes have a single touch point.
 */
const migrateDailyChecklistProgressToAuth = async (userId: string): Promise<void> => {
    log.info('[reminderPersistence] Inspecting daily-checklist V2 keys for:', userId);

    if (!userId) {
        log.warn('[reminderPersistence] migrateDailyChecklistProgressToAuth: missing userId, skipping');
        return;
    }

    try {
        const allKeys = await AsyncStorage.getAllKeys();
        const checklistKeys = allKeys.filter(k => k.startsWith(DAILY_CHECKLIST_V2_PREFIX));

        if (checklistKeys.length === 0) {
            log.info('[reminderPersistence] No daily-checklist V2 keys present');
            return;
        }

        let dateOnly = 0;
        let userScoped = 0;
        let unknown = 0;

        for (const key of checklistKeys) {
            const suffix = key.slice(DAILY_CHECKLIST_V2_PREFIX.length);

            if (DAILY_CHECKLIST_GUEST_SUFFIX_RE.test(suffix)) {
                // Date-only key (current schema for both guest + auth) — leave as-is
                dateOnly++;
            } else if (suffix.startsWith(`${userId}_`)) {
                userScoped++;
            } else {
                unknown++;
            }
        }

        log.info(
            '[reminderPersistence] Daily-checklist V2 inspection:',
            { total: checklistKeys.length, dateOnly, userScoped, unknown }
        );
        // No rename performed: dailyChecklistService still reads date-only keys.
    } catch (error) {
        log.error('[reminderPersistence] Error inspecting daily-checklist V2 keys:', error);
    }
};

// ============================================================================
// MIGRATION ON LOGIN
// ============================================================================

/**
 * Migrate all Guest data to Auth on login
 */
export const migrateAllGuestDataToAuth = async (userId: string): Promise<void> => {
    log.info('[reminderPersistence] 🚀 Starting full migration Guest → Auth for:', userId);

    // Kick sessions, contractions and the hospital bag recorded as a guest are still marked
    // unsynced on the device; send them to the new account now rather than on the next
    // visit to each screen, which a logout in between would wipe. Not awaited: these writes
    // wait for the network, and signing up must not.
    void Promise.allSettled([
        pushPendingSessions(userId),
        pushPendingContractions(userId),
        pushPendingBag(userId),
    ]);

    try {
        // V1 migrations are best-effort; V2 migrations added below run in parallel
        // via Promise.allSettled so a single failure does not abort the others.
        const results = await Promise.allSettled([
            migrateReminderSettingsToAuth(userId),
            migrateTaskStatusesToAuth(userId),
            migrateRemindersV2SettingsToAuth(userId),
            migrateRemindersV2CompletionsToAuth(userId),
            migrateDailyChecklistProgressToAuth(userId),
        ]);

        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            log.warn('[reminderPersistence] Migration completed with', failures.length, 'failure(s)');
            failures.forEach((f, idx) => {
                if (f.status === 'rejected') {
                    log.error(`[reminderPersistence] Migration step #${idx} failed:`, f.reason);
                }
            });
        }

        log.info('[reminderPersistence] ✅ Full migration complete');
    } catch (error) {
        log.error('[reminderPersistence] Error during full migration:', error);
    }
};
