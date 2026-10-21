/**
 * Reminders Scheduler
 *
 * Bridges the gap between RemindersV2Service (Settings) and NotificationService (Expo).
 * Schedules local notifications based on enabled reminders and their times.
 */

import { createLogger } from '../utils/logger';
import { loadUserSettings, getAllReminders } from './remindersV2Service';
import { scheduleReminderNotification, hasNotificationPermission } from './notificationService';
import { getReminderMessage } from '../utils/notificationMessages';
import { scheduleTodaysBabyMessage } from './babyMessageService';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import i18n from '../i18n'; // ── FIX: read current locale dynamically

const log = createLogger('RemindersScheduler');

// NOTIF-07 FIX: Only cancel reminders we own (type:'reminder'|'baby_message').
// The old cancelAllNotifications() was wiping RDV/calendar notifications as a side-effect.
const cancelOwnedNotifications = async () => {
    try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        const ours = scheduled.filter(n => {
            const t = (n.content.data as any)?.type;
            return t === 'reminder' || t === 'baby_message';
        });
        await Promise.all(
            ours.map(n => Notifications.cancelScheduledNotificationAsync(n.identifier))
        );
        log.info(`[RemindersScheduler] 🗑 Cancelled ${ours.length} owned notifications`);
    } catch (error) {
        log.error('[RemindersScheduler] Error cancelling owned notifications:', error);
    }
};

/**
 * Get device timezone offset in hours (e.g. +1 for CET, +1 for Africa/Tunis).
 * Uses Intl.DateTimeFormat for reliable cross-platform detection.
 */
const getDeviceTimezoneOffsetHours = (): number => {
    try {
        // Use native JS Date offset (minutes behind UTC, so negate it)
        return -(new Date().getTimezoneOffset() / 60);
    } catch {
        return 0; // UTC fallback
    }
};

/**
 * Convert a local HH:MM time to UTC HH:MM for Expo's calendar-based trigger.
 * Expo schedules notifications based on UTC time internally on some platforms,
 * but expo-notifications' CalendarTrigger uses LOCAL time on iOS/Android.
 * We keep local time here and log the timezone for debugging.
 */
const resolveScheduleTime = (hour: number, minute: number): { hour: number; minute: number } => {
    // Expo-notifications on iOS/Android schedules in LOCAL device time.
    // No conversion needed — just log for debugging.
    const tzOffset = getDeviceTimezoneOffsetHours();
    log.debug(`[RemindersScheduler] Scheduling ${hour}:${String(minute).padStart(2,'0')} local (UTC${tzOffset >= 0 ? '+' : ''}${tzOffset})`);
    return { hour, minute };
};

export const syncRemindersToNotifications = async (
    weekNumber: number,
    locale?: string,       // Optional — falls back to i18n.language
    userId?: string        // FIX: pass userId so auth users load Firestore settings
) => {
    // ── FIX-1: Use current app language as notification locale (was hardcoded 'fr')
    const effectiveLocale = locale || i18n.language || 'fr';
    log.info(`🔄 Syncing reminders (locale: ${effectiveLocale}, user: ${userId || 'guest'})...`);

    if (Platform.OS === 'web') {
        log.info('[RemindersScheduler] Web — skip local notification sync (expo-notifications unavailable)');
        return;
    }

    // This sync runs on its own (launch, week change, language change), so it never
    // asks for permission: that dialog belongs to a tap the user understands — the
    // Reminders tab banner or turning a reminder on. Until then there is nothing
    // to schedule; the grant path runs this sync again.
    if (!(await hasNotificationPermission())) {
        log.info('[RemindersScheduler] Notification permission not granted — nothing scheduled');
        return;
    }

    try {
        // 1. Cancel ONLY reminder-type notifications (RDV notifications are preserved)
        await cancelOwnedNotifications();

        // 2. Load User Settings — FIX-2: pass userId so auth users get Firestore settings
        const settings = await loadUserSettings(userId);
        const definitions = getAllReminders();

        let scheduledCount = 0;

        // 3. Iterate through definitions
        for (const def of definitions) {
            const setting = settings[def.id];

            // Explicit setting > Default
            const isEnabled = setting ? setting.enabled : def.default_enabled;

            if (isEnabled) {
                // Setting times > Preset times for intensity 1 > Fallback
                const times = setting?.times || def.preset_times['1'] || [];

                for (const timeStr of times) {
                    const [hourStr, minuteStr] = timeStr.split(':');
                    const hour = parseInt(hourStr, 10);
                    const minute = parseInt(minuteStr, 10);

                    if (!isNaN(hour) && !isNaN(minute)) {
                        const msg = getReminderMessage(def.id, effectiveLocale);
                        const { hour: schedHour, minute: schedMinute } = resolveScheduleTime(hour, minute);

                        await scheduleReminderNotification(
                            def.id,
                            msg.title,
                            msg.body,
                            schedHour,
                            schedMinute
                        );
                        scheduledCount++;
                    }
                }
            }
        }

        // 4. Schedule Baby Message (Special Case)
        await scheduleTodaysBabyMessage(weekNumber, effectiveLocale);
        scheduledCount++;

        const tz = getDeviceTimezoneOffsetHours();
        log.success(`✅ Synced ${scheduledCount} notifications (device timezone: UTC${tz >= 0 ? '+' : ''}${tz})`);

    } catch (error) {
        log.error('❌ Error syncing reminders:', error);
    }
};

