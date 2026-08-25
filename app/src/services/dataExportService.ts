import { Alert, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { createLogger } from '../utils/logger';
import { getWeightHistory as getWeightEntriesHistory } from './weightService';
import { loadUserSettings } from './remindersV2Service';
import { loadUserEvents } from './calendarService';
import { getUserTasks } from './taskService';
import {
    getWeightHistory as getWeightHealthMetrics,
    getBloodPressureHistory,
    getGlucoseHistory,
    getSymptomsHistory,
} from './healthService';
import {
    loadReminderSettingsAuth,
} from './reminderPersistence';
// W8 export-completeness (GDPR Art.20 portability): include the local tool histories that were
// purged on delete (W8 #1) but missing from the export bundle. All AsyncStorage-backed (guest+auth).
import { loadState as loadKickState } from './kickCounterService';
import { loadState as loadContractionState } from './contractionTimerService';
import { loadState as loadHospitalBagState } from './hospitalBagService';
import { getBookmarks } from './bookmarkService';

const log = createLogger('DataExportService');

/**
 * Schema version for the JSON export envelope. Bump when structure changes.
 * - v2: RGPD parity with deleteAccount — all 9 collections covered.
 * - v3 (C10/F14): `reminders.taskStatuses` shape changed.
 *   Before: keyed by `${task_id}_w${week_number}` with values
 *           `{ completed, completedAt }` (transformed by loadTaskStatusesAuth).
 *   After:  keyed by raw Firestore doc.id `${userId}_${task_id}_w${week_number}`
 *           with values = full UserTaskStatus document
 *           (`{ user_id, task_id, week_number, completed, completed_at }`).
 *   Reason: collapsed 46 per-week round-trips into 1 query for cost/perf.
 * - v4 (W8 GDPR Art.20): added `tools` { kickCounter, contractionTimer, hospitalBag, bookmarks } —
 *   local AsyncStorage histories that were purged on delete but missing from the export bundle.
 * - v5: added the declared conditions (gestational diabetes / hypertension / twin
 *   pregnancy) and the timestamp of the answer. These live on the AUTH profile, and
 *   the export spreads PregnancyContext's `profile`, which is a hand-written
 *   whitelist that does not carry them — so a health diagnosis was absent from a
 *   subject-access export. GDPR Art. 15 / Art. 20.
 */
const EXPORT_SCHEMA_VERSION = 5;

// Symptoms history helper takes a look-back in days. Use ~11 years so every
// entry the user ever created is exported (RGPD Art. 15 / Art. 20 — full data).
const SYMPTOMS_LOOKBACK_DAYS = 4000;

/**
 * Safely unwrap a Promise.allSettled result. On rejection we log a warning
 * with the field name and fall back to the provided default so one failing
 * service never aborts the whole RGPD export.
 */
const unwrap = <T>(
    result: PromiseSettledResult<T>,
    fieldName: string,
    fallback: T
): T => {
    if (result.status === 'fulfilled') {
        return result.value;
    }
    log.warn(`[DataExportService] Failed to fetch "${fieldName}"`, result.reason);
    return fallback;
};

/**
 * Generate a complete JSON export of user data.
 *
 * P3.7 — RGPD parity with `AuthContext.deleteAccount`. Every top-level
 * collection the app writes for a user is fetched here so the user can
 * download a portable copy of all their data before deleting the account
 * (GDPR Art. 15 — right of access, Art. 20 — right to data portability).
 *
 * Data is fetched in parallel via `Promise.allSettled` so a single failing
 * service only produces an empty section, never a broken export.
 */
export const generateExportData = async (user: any, profile: any) => {
    try {
        const userId: string = user?.uid || 'guest';
        const isGuest: boolean = !!user?.isGuest || userId.startsWith('guest');

        // C10/F14: collapse the previous 46-week per-week loop into a single
        // `where('user_id','==',uid)` query on `userTaskStatuses`. Saves ~45
        // Firestore round-trips per export. Shape change documented in
        // EXPORT_SCHEMA_VERSION JSDoc above (bumped 2 → 3).
        const taskStatusesPromise = isGuest
            ? Promise.resolve({} as Record<string, any>)
            : (async () => {
                try {
                    const q = query(
                        collection(db, 'userTaskStatuses'),
                        where('user_id', '==', userId),
                    );
                    const snap = await getDocs(q);
                    const merged: Record<string, any> = {};
                    snap.docs.forEach(d => { merged[d.id] = d.data(); });
                    return merged;
                } catch (err) {
                    log.warn('[DataExportService] Failed to fetch userTaskStatuses (1-query)', err);
                    return {} as Record<string, any>;
                }
            })();

        const settled = await Promise.allSettled([
            loadUserEvents(userId),              // 0 userEvents → appointments
            getUserTasks(userId),                // 1 userTasks → tasks
            getWeightHealthMetrics(userId),      // 2 healthMetrics (weight)
            getWeightEntriesHistory(userId),     // 3 weight_entries
            getBloodPressureHistory(userId),     // 4 healthMetrics (blood_pressure)
            getGlucoseHistory(userId),           // 5 glucoseMetrics
            getSymptomsHistory(userId, SYMPTOMS_LOOKBACK_DAYS), // 6 symptomsLog
            loadReminderSettingsAuth(userId),    // 7 userReminderSettings (V1)
            taskStatusesPromise,                 // 8 userTaskStatuses (merged)
            loadUserSettings(userId),            // 9 reminder_settings_v2
            loadKickState(),                     // 10 kick counter history
            loadContractionState(),              // 11 contraction timer history
            loadHospitalBagState(),              // 12 hospital bag checklist
            getBookmarks(),                      // 13 saved articles/supplements
        ]);

        const appointments = unwrap(settled[0], 'appointments', [] as any[]);
        const tasks = unwrap(settled[1], 'tasks', [] as any[]);
        const weightHistoryHealthMetrics = unwrap(
            settled[2],
            'weightHistoryHealthMetrics',
            [] as any[]
        );
        const weightHistoryEntries = unwrap(
            settled[3],
            'weightHistoryEntries',
            [] as any[]
        );
        const bloodPressure = unwrap(settled[4], 'bloodPressure', [] as any[]);
        const glucose = unwrap(settled[5], 'glucose', [] as any[]);
        const symptomsLog = unwrap(settled[6], 'symptomsLog', [] as any[]);
        const settingsV1 = unwrap(
            settled[7],
            'reminders.settingsV1',
            {} as Record<string, any>
        );
        const taskStatuses = unwrap(
            settled[8],
            'reminders.taskStatuses',
            {} as Record<string, any>
        );
        const settingsV2 = unwrap(
            settled[9],
            'reminders.settingsV2',
            {} as Record<string, any>
        );
        // W8 export-completeness (GDPR Art.20)
        const kickCounter = unwrap(settled[10], 'kickCounter', {} as Record<string, any>);
        const contractionTimer = unwrap(settled[11], 'contractionTimer', {} as Record<string, any>);
        const hospitalBag = unwrap(settled[12], 'hospitalBag', {} as Record<string, any>);
        const bookmarks = unwrap(settled[13], 'bookmarks', [] as any[]);

        // P0 GDPR FIX: Anonymize userId — raw Firebase UID must never appear in shared exports
        const anonymizedId = isGuest
            ? 'guest'
            : `user_${userId.slice(0, 4)}***`;

        const exportData = {
            metadata: {
                exportedAt: new Date().toISOString(),
                appVersion: '1.0.0',
                platform: Platform.OS,
                userId: anonymizedId, // Anonymized — raw UID never exported
                schemaVersion: EXPORT_SCHEMA_VERSION,
            },
            profile: {
                ...profile,
                // P0 GDPR FIX: Only include email if user is authenticated (not guest)
                email: isGuest ? undefined : user?.email,
                isGuest,
                // Declared conditions — read from the auth profile, which is where
                // they are persisted. PregnancyContext's `profile` is a whitelist
                // that predates them.
                hasGestationalDiabetes: user?.hasGestationalDiabetes,
                hasHypertension: user?.hasHypertension,
                isTwinPregnancy: user?.isTwinPregnancy,
                medicalProfileAnsweredAt: user?.medicalProfileAnsweredAt,
            },
            appointments,
            tasks,
            health: {
                weightHistoryHealthMetrics,
                weightHistoryEntries,
                bloodPressure,
                glucose,
                symptomsLog,
            },
            reminders: {
                settingsV1,
                taskStatuses,
                settingsV2,
            },
            // W8 export-completeness (GDPR Art.20): local tool histories + saved content.
            tools: {
                kickCounter,
                contractionTimer,
                hospitalBag,
                bookmarks,
            },
        };

        return exportData;
    } catch (error) {
        log.error('Error generating export data', error);
        throw error;
    }
};

/**
 * Share the exported data as a JSON file (RGPD C3 / F6).
 *
 * Writes the export to the app's cache directory and hands the file URI to
 * the OS share sheet. Avoids `Share.share({ message })` because that path
 * passes the full PII payload as plain text — share-targets on Android may
 * log it, and iOS surfaces it inline in the share sheet.
 */
export const exportUserData = async (user: any, profile: any, t: any) => {
    try {
        const data = await generateExportData(user, profile);
        const jsonString = JSON.stringify(data, null, 2);

        const dateStamp = new Date().toISOString().split('T')[0];
        const fileName = `mama-bebe-export-${dateStamp}.json`;
        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

        await FileSystem.writeAsStringAsync(fileUri, jsonString, {
            encoding: FileSystem.EncodingType.UTF8,
        });

        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
            Alert.alert(t('common.error'), t('export.errorMessage') || t('common.error'));
            return;
        }

        await Sharing.shareAsync(fileUri, {
            mimeType: 'application/json',
            dialogTitle: t('common.privacyData.export'),
            UTI: 'public.json',
        });

        log.info('Data shared via file');
    } catch (error) {
        log.error('Error exporting data', error);
        Alert.alert(t('common.error'), t('export.errorMessage') || t('common.error'));
    }
};
