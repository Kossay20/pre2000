import { Alert, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { createLogger } from '../utils/logger';
import { toLocalDateKey } from '../utils/localDate';
import { EXPORT_FILE_PREFIX, sweepExportFiles } from './exportFileSweep';
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
// Hydration intake is erased on delete, so it belongs in the export too. The Ramadan log only
// while its screen is reachable (feature-flagged until clinically reviewed).
import { loadHydrationData } from './hydrationService';
import { loadState as loadRamadanState } from './ramadanService';
import { RAMADAN_GUIDANCE_CLINICALLY_REVIEWED } from '../config/featureFlags';

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
 * - v7 (D-024): `tools` also carries the TTC snapshot (`ttcProfile`), the daily checklist
 *   progress by day (`dailyChecklist`) and the reminder completion history (`completions`) —
 *   the three AsyncStorage records wiped on delete that the export still left out. Each is
 *   present only when the device holds something for it.
 */
const EXPORT_SCHEMA_VERSION = 7;

// AsyncStorage keys listed in context/storageKeys.ts (the erasure list), read here so what is
// wiped on delete is what is exported.
const TTC_PROFILE_KEY = 'ttcProfile';
const DAILY_CHECKLIST_PREFIX = '@daily_checklist_v2_';
const COMPLETIONS_KEY = 'reminders_v2_completions';

const readJson = async (key: string): Promise<any> => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

/** Daily checklist progress, keyed by the day in the storage key (YYYY-MM-DD). */
const loadDailyChecklistProgress = async (): Promise<Record<string, any>> => {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(DAILY_CHECKLIST_PREFIX));
    const out: Record<string, any> = {};
    for (const key of keys) {
        const value = await readJson(key);
        if (value) out[key.slice(DAILY_CHECKLIST_PREFIX.length)] = value;
    }
    return out;
};

/** Reminder completion days per reminder; an account's history is stored under its own key. */
const loadCompletionHistory = (userId: string, isGuest: boolean): Promise<Record<string, string[]> | null> =>
    readJson(isGuest ? COMPLETIONS_KEY : `${COMPLETIONS_KEY}_${userId}`);

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

        // D-067: a section that could not be read falls back to empty so the rest still
        // exports, but its name is kept: a file with "appointments": [] must not pass for
        // complete when she may keep it as her only copy.
        const failedSections: string[] = [];
        const take = <T>(result: PromiseSettledResult<T>, fieldName: string, fallback: T): T => {
            if (result.status === 'rejected') failedSections.push(fieldName);
            return unwrap(result, fieldName, fallback);
        };

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
                    failedSections.push('reminders.taskStatuses');
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
            // With an account these also hold what is only on the server (another phone,
            // or this one before a logout): loadState(uid) merges it in first.
            loadKickState(isGuest ? null : userId),        // 10 kick counter history
            loadContractionState(isGuest ? null : userId), // 11 contraction timer history
            loadHospitalBagState(isGuest ? null : userId), // 12 hospital bag checklist
            getBookmarks(),                      // 13 saved articles/supplements
            loadHydrationData(),                 // 14 hydration goal + daily intake
            RAMADAN_GUIDANCE_CLINICALLY_REVIEWED ? loadRamadanState() : Promise.resolve(null), // 15
            readJson(TTC_PROFILE_KEY),           // 16 TTC snapshot
            loadDailyChecklistProgress(),        // 17 daily checklist progress by day
            loadCompletionHistory(userId, isGuest), // 18 reminder completion days
        ]);

        const appointments = take(settled[0], 'appointments', [] as any[]);
        const tasks = take(settled[1], 'tasks', [] as any[]);
        const weightHistoryHealthMetrics = take(
            settled[2],
            'weightHistoryHealthMetrics',
            [] as any[]
        );
        const weightHistoryEntries = take(
            settled[3],
            'weightHistoryEntries',
            [] as any[]
        );
        const bloodPressure = take(settled[4], 'bloodPressure', [] as any[]);
        const glucose = take(settled[5], 'glucose', [] as any[]);
        const symptomsLog = take(settled[6], 'symptomsLog', [] as any[]);
        const settingsV1 = take(
            settled[7],
            'reminders.settingsV1',
            {} as Record<string, any>
        );
        const taskStatuses = take(
            settled[8],
            'reminders.taskStatuses',
            {} as Record<string, any>
        );
        const settingsV2 = take(
            settled[9],
            'reminders.settingsV2',
            {} as Record<string, any>
        );
        // W8 export-completeness (GDPR Art.20)
        const kickCounter = take(settled[10], 'kickCounter', {} as Record<string, any>);
        const contractionTimer = take(settled[11], 'contractionTimer', {} as Record<string, any>);
        const hospitalBag = take(settled[12], 'hospitalBag', {} as Record<string, any>);
        const bookmarks = take(settled[13], 'bookmarks', [] as any[]);
        const hydration = take(settled[14], 'hydration', {} as Record<string, any>);
        const ramadan = take(settled[15], 'ramadan', null as any);
        const ttcProfile = take(settled[16], 'ttcProfile', null as any);
        const dailyChecklist = take(settled[17], 'dailyChecklist', {} as Record<string, any>);
        const completions = take(settled[18], 'completions', null as any);

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
                // Only present when a section could not be read: the file is then incomplete.
                ...(failedSections.length > 0 ? { incompleteSections: [...failedSections].sort() } : {}),
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
                // Profile answers the privacy policy lists as exported (GDPR Art. 15/20).
                ageRange: user?.ageRange,
                isFirstPregnancy: user?.isFirstPregnancy,
                // `??`: a guest has no auth-profile value, and the spread `profile` may carry it (D-083).
                height: user?.height ?? (profile as any)?.height,
                prePregnancyWeight: user?.prePregnancyWeight ?? (profile as any)?.prePregnancyWeight,
                cycleLength: user?.cycleLength,
                language: user?.locale,
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
                hydration,
                ...(ramadan ? { ramadan } : {}),
                ...(ttcProfile ? { ttcProfile } : {}),
                ...(Object.keys(dailyChecklist).length > 0 ? { dailyChecklist } : {}),
                ...(completions && Object.keys(completions).length > 0 ? { completions } : {}),
            },
        };

        return exportData;
    } catch (error) {
        log.error('Error generating export data', error);
        throw error;
    }
};

/**
 * D-067: some sections could not be read, so the file would be incomplete. Say so and let her
 * choose, instead of sharing a file that looks whole. Resolves true to export anyway.
 */
const askToExportIncomplete = (t: any, sections: string[]): Promise<boolean> => {
    const title = t('export.incompleteTitle');
    const message = t('export.incompleteMessage', { sections: sections.join(', ') });
    if (Platform.OS === 'web') {
        return Promise.resolve(window.confirm(`${title}\n\n${message}`));
    }
    return new Promise((resolve) => {
        Alert.alert(
            title,
            message,
            [
                { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
                { text: t('export.exportAnyway'), onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
        );
    });
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
        const incomplete: string[] = (data.metadata as { incompleteSections?: string[] }).incompleteSections ?? [];
        if (incomplete.length > 0) {
            const goOn = await askToExportIncomplete(t, incomplete);
            if (!goOn) return;
        }
        const jsonString = JSON.stringify(data, null, 2);

        // The user's calendar day (zero-padded), not the UTC day: toISOString() stamped the
        // evening before for the first hours of a Paris/Tunis day.
        const dateStamp = toLocalDateKey();
        const fileName = `${EXPORT_FILE_PREFIX}${dateStamp}.json`;

        // A browser has neither expo-file-system nor a share sheet: the write threw and the
        // native-only Alert below showed nothing, so the export silently did nothing. Hand
        // the file to the browser as a download instead.
        if (Platform.OS === 'web') {
            const blobUrl = URL.createObjectURL(new Blob([jsonString], { type: 'application/json' }));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
            log.info('Data downloaded as a file (web)');
            return;
        }

        const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

        await FileSystem.writeAsStringAsync(fileUri, jsonString, {
            encoding: FileSystem.EncodingType.UTF8,
        });

        try {
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
        } finally {
            // The file is her whole medical record in plain text. Once the share sheet has
            // handed it on, the app's copy has no use, and nothing else ever removed it —
            // it outlived even an account deletion.
            await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch((e: unknown) =>
                log.warn('Could not remove the temporary export file', e),
            );
        }
    } catch (error) {
        log.error('Error exporting data', error);
        Alert.alert(t('common.error'), t('export.errorMessage') || t('common.error'));
    }
};

// The cache sweep lives in exportFileSweep.ts so the local wipe can call it cheaply.
export { sweepExportFiles };
