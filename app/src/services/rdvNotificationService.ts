import { createLogger } from '../utils/logger';
const log = createLogger('rdvNotificationService');

import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createDateAtTimeInTimezone, getTimezoneFromCountry } from './timezoneService';
import { getRDVMessage, getHydrationMessage, getTaskMessage } from '../utils/notificationMessages';
import i18n from '../i18n'; // F3: pass current locale to notif messages so AR/EN/TN users don't get FR fallback
// P2 FIX: Import shared permission helper from notificationService (single source of truth)
import { requestNotificationPermissions } from './notificationService';
import { REMINDERS_CHANNEL_ID } from './notificationChannels';

// RDV-FIX-01: Keys prefixed with '@' to match PRIVATE_STORAGE_KEYS purge list in AuthContext.
// Without the @ prefix, logout/deleteAccount did NOT purge RDV data → data leak between users.
const RDV_REMINDERS_KEY = '@rdv_reminders';
const RDV_PREFERENCES_KEY = '@rdv_preferences'; // Store user's preference (what they wanted)

export interface RDVReminder {
    eventId: string;
    eventTitle: string;
    eventDate: string;
    reminderType: 'J-1' | 'J' | 'H-2';
    notificationId?: string;
    reminderTime: string; // ISO string
}

// User's preference for reminders (what they WANTED, not what was actually scheduled)
export interface RDVPreference {
    eventId: string;
    reminderJ1: boolean;
    reminderJ: boolean;
    reminderH2: boolean;
}

// P2 FIX: requestNotificationPermissions is now imported from notificationService above.
// The duplicate local definition has been removed to establish a single source of truth.

/**
 * @deprecated RDV-FIX-02: This function is a no-op and kept only for backward compatibility.
 * The global notification handler is centralized in notificationService.ts.
 * Android channels are set up at startup by ensureNotificationChannels() in notificationService.
 * Safe to remove in a future cleanup pass.
 */
export const configureNotifications = () => {
    // Intentionally empty — see JSDoc above.
};

/**
 * Schedule reminders for a RDV
 * Default: J-1 at 8h00 and J at 8h00
 * Optional: H-2 (2 hours before)
 * Uses user's timezone for accurate local time scheduling
 */
export const scheduleRDVReminders = async (
    eventId: string,
    eventTitle: string,
    eventDate: Date,
    options: {
        reminderJ1?: boolean; // Day before at 8am
        reminderJ?: boolean;  // Day of at 8am
        reminderH2?: boolean; // 2 hours before
        customReminderTime?: number; // Hours before (e.g., 2 for H-2)
        countryCode?: string; // User's country for timezone
    } = { reminderJ1: true, reminderJ: true }
): Promise<RDVReminder[]> => {
    const scheduledReminders: RDVReminder[] = [];

    // FIRST: Save user's preference (what they WANTED) - this persists even if reminders can't be scheduled
    await saveRDVPreference({
        eventId,
        reminderJ1: options.reminderJ1 ?? true,
        reminderJ: options.reminderJ ?? true,
        reminderH2: options.reminderH2 ?? false,
    });

    // Get user's timezone (default to Algeria if not provided)
    const timezone = options.countryCode
        ? getTimezoneFromCountry(options.countryCode)
        : 'Africa/Algiers';

    // Cancel any existing reminders for this event
    await cancelRDVReminders(eventId);

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
        log.warn('[rdvNotificationService] No notification permission');
        return [];
    }

    // J-1 Reminder (day before at 8am local time)
    if (options.reminderJ1 !== false) {
        const dayBefore = new Date(eventDate);
        dayBefore.setDate(dayBefore.getDate() - 1);
        const j1Date = createDateAtTimeInTimezone(dayBefore, 8, 0, timezone);

        // Validate date before scheduling
        if (isNaN(j1Date.getTime())) {
            log.error('[rdvNotificationService] Invalid J-1 date, skipping');
        } else if (j1Date > new Date()) {
            try {
                const msg = getRDVMessage('J-1', eventTitle, i18n.language);
                log.debug(`[Audit] Scheduling J-1 reminder for ${eventTitle} at ${j1Date.toISOString()}`);
                const notificationId = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: msg.title,
                        body: msg.body,
                        data: { eventId, type: 'rdv', reminderType: 'J-1' },
                        sound: 'default',
                    },
                    // RDV-FIX-03: the channel belongs on the trigger. It used to sit in `content.android`,
                    // which expo-notifications ignores, so appointments landed on the fallback channel.
                    trigger: { type: 'date', date: j1Date, ...(Platform.OS === 'android' ? { channelId: REMINDERS_CHANNEL_ID } : {}) } as any,
                });

                scheduledReminders.push({
                    eventId,
                    eventTitle,
                    eventDate: eventDate.toISOString(),
                    reminderType: 'J-1',
                    notificationId,
                    reminderTime: j1Date.toISOString(),
                });
            } catch (error) {
                log.error('[rdvNotificationService] Failed to schedule J-1:', error);
            }
        } else {
            log.warn(`[Audit] J-1 date ${j1Date.toISOString()} is in the past, skipping.`);
        }
    }

    // J Reminder (day of at 8am local time)
    if (options.reminderJ !== false) {
        const jDate = createDateAtTimeInTimezone(eventDate, 8, 0, timezone);

        // Validate date before scheduling
        if (isNaN(jDate.getTime())) {
            log.error('[rdvNotificationService] Invalid J date, skipping');
        } else if (jDate > new Date()) {
            try {
                const msg = getRDVMessage('J', eventTitle, i18n.language);
                log.debug(`[Audit] Scheduling J reminder for ${eventTitle} at ${jDate.toISOString()}`);
                const notificationId = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: msg.title,
                        body: msg.body,
                        data: { eventId, type: 'rdv', reminderType: 'J' },
                        sound: 'default',
                    },
                    trigger: { type: 'date', date: jDate, ...(Platform.OS === 'android' ? { channelId: REMINDERS_CHANNEL_ID } : {}) } as any,
                });

                scheduledReminders.push({
                    eventId,
                    eventTitle,
                    eventDate: eventDate.toISOString(),
                    reminderType: 'J',
                    notificationId,
                    reminderTime: jDate.toISOString(),
                });
            } catch (error) {
                log.error('[rdvNotificationService] Failed to schedule J:', error);
            }
        }
    }

    // H-2 Reminder (2 hours before or custom)
    // P3.2 FIX: Was using setHours on local JS Date (host machine timezone)
    // Now consistent with J-1 / J: build the event time in the USER's timezone first,
    // then subtract hoursBefore. The result is still a Date (absolute instant).
    if (options.reminderH2 || options.customReminderTime) {
        const hoursBefore = options.customReminderTime || 2;
        // Anchor the eventDate's HH:MM in the user's timezone (matches J-1/J behavior)
        const eventInTz = createDateAtTimeInTimezone(
            eventDate,
            eventDate.getHours(),
            eventDate.getMinutes(),
            timezone
        );
        const h2Date = new Date(eventInTz.getTime() - hoursBefore * 60 * 60 * 1000);

        // Validate date before scheduling
        if (isNaN(h2Date.getTime())) {
            log.error('[rdvNotificationService] Invalid H-2 date, skipping');
        } else if (h2Date > new Date()) {
            try {
                const msg = getRDVMessage('H-2', eventTitle, i18n.language);
                log.debug(`[Audit] Scheduling H-${hoursBefore} reminder for ${eventTitle} at ${h2Date.toISOString()}`);
                const notificationId = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: msg.title,
                        body: msg.body,
                        data: { eventId, type: 'rdv', reminderType: 'H-2' },
                        sound: 'default',
                    },
                    trigger: { type: 'date', date: h2Date, ...(Platform.OS === 'android' ? { channelId: REMINDERS_CHANNEL_ID } : {}) } as any,
                });

                scheduledReminders.push({
                    eventId,
                    eventTitle,
                    eventDate: eventDate.toISOString(),
                    reminderType: 'H-2',
                    notificationId,
                    reminderTime: h2Date.toISOString(),
                });
            } catch (error) {
                log.error('[rdvNotificationService] Failed to schedule H-2:', error);
            }
        }
    }

    // Save reminders to storage
    await saveRemindersToStorage(scheduledReminders);

    log.info(`[Audit] Successfully scheduled ${scheduledReminders.length} reminders for event: ${eventTitle} (${eventId})`);
    return scheduledReminders;
};

/**
 * Cancel all reminders for a specific event
 */
export const cancelRDVReminders = async (eventId: string): Promise<void> => {
    try {
        const allReminders = await loadRemindersFromStorage();
        const eventReminders = allReminders.filter(r => r.eventId === eventId);

        for (const reminder of eventReminders) {
            if (reminder.notificationId) {
                await Notifications.cancelScheduledNotificationAsync(reminder.notificationId);
            }
        }

        // Remove from storage
        const remainingReminders = allReminders.filter(r => r.eventId !== eventId);
        await AsyncStorage.setItem(RDV_REMINDERS_KEY, JSON.stringify(remainingReminders));

        log.info('[rdvNotificationService] Cancelled reminders for event:', eventId);
    } catch (error) {
        log.error('[rdvNotificationService] Error cancelling reminders:', error);
    }
};

/**
 * Get all scheduled reminders for an event
 */
export const getRDVReminders = async (eventId: string): Promise<RDVReminder[]> => {
    const allReminders = await loadRemindersFromStorage();
    return allReminders.filter(r => r.eventId === eventId);
};

/**
 * Save reminders to AsyncStorage
 */
const saveRemindersToStorage = async (newReminders: RDVReminder[]): Promise<void> => {
    try {
        const existingReminders = await loadRemindersFromStorage();

        // Add new reminders (avoiding duplicates by eventId + type)
        const combined = [...existingReminders];
        for (const newReminder of newReminders) {
            const existingIndex = combined.findIndex(
                r => r.eventId === newReminder.eventId && r.reminderType === newReminder.reminderType
            );
            if (existingIndex >= 0) {
                combined[existingIndex] = newReminder;
            } else {
                combined.push(newReminder);
            }
        }

        await AsyncStorage.setItem(RDV_REMINDERS_KEY, JSON.stringify(combined));
    } catch (error) {
        log.error('[rdvNotificationService] Error saving reminders:', error);
    }
};

/**
 * Load reminders from AsyncStorage
 */
const loadRemindersFromStorage = async (): Promise<RDVReminder[]> => {
    try {
        const data = await AsyncStorage.getItem(RDV_REMINDERS_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        log.error('[rdvNotificationService] Error loading reminders:', error);
        return [];
    }
};

/**
 * Clean up past reminders
 */
export const cleanupPastReminders = async (): Promise<void> => {
    try {
        const allReminders = await loadRemindersFromStorage();
        const now = new Date();
        const futureReminders = allReminders.filter(r => new Date(r.reminderTime) > now);

        await AsyncStorage.setItem(RDV_REMINDERS_KEY, JSON.stringify(futureReminders));
        log.info('[rdvNotificationService] Cleaned up', allReminders.length - futureReminders.length, 'past reminders');
    } catch (error) {
        log.error('[rdvNotificationService] Error cleaning reminders:', error);
    }
};

// ============ PREFERENCE STORAGE (User's DESIRED settings, not what was actually scheduled) ============

/**
 * Save user's reminder preference for an event
 */
const saveRDVPreference = async (preference: RDVPreference): Promise<void> => {
    try {
        const existingPrefs = await loadAllPreferences();
        const updatedPrefs = existingPrefs.filter(p => p.eventId !== preference.eventId);
        updatedPrefs.push(preference);
        await AsyncStorage.setItem(RDV_PREFERENCES_KEY, JSON.stringify(updatedPrefs));
        log.debug('[rdvNotificationService] Saved preference for event:', preference.eventId);
    } catch (error) {
        log.error('[rdvNotificationService] Error saving preference:', error);
    }
};

/**
 * Get user's reminder preference for an event
 */
export const getRDVPreference = async (eventId: string): Promise<RDVPreference | null> => {
    try {
        const allPrefs = await loadAllPreferences();
        return allPrefs.find(p => p.eventId === eventId) || null;
    } catch (error) {
        log.error('[rdvNotificationService] Error getting preference:', error);
        return null;
    }
};

/**
 * Load all preferences from storage
 */
const loadAllPreferences = async (): Promise<RDVPreference[]> => {
    try {
        const data = await AsyncStorage.getItem(RDV_PREFERENCES_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        log.error('[rdvNotificationService] Error loading preferences:', error);
        return [];
    }
};

/**
 * Send test notifications to verify the notification system works
 * Sends 3 different examples: RDV, Task, and Reminder
 * Messages are personalized to match the caring pregnancy app avatar
 * Returns true if scheduled successfully, false otherwise
 */
export const sendTestNotification = async (): Promise<boolean> => {
    try {
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
            log.warn('[rdvNotificationService] No permission for test notification');
            return false;
        }

        // 1. RDV Notification (in 3 seconds) - Uses varied message
        const rdvDate = new Date();
        rdvDate.setSeconds(rdvDate.getSeconds() + 3);
        // U-FIX-12 + F3: dot-path lookup + pass current locale
        const rdvMsg = getRDVMessage('J-1', i18n.t('notifications.test.rdv'), i18n.language);

        await Notifications.scheduleNotificationAsync({
            content: {
                title: rdvMsg.title,
                body: rdvMsg.body,
                data: { type: 'rdv', eventId: 'test-rdv' },
                sound: 'default',
            },
            trigger: { type: 'date', date: rdvDate } as any,
        });

        // 2. Task Notification (in 6 seconds) - Uses varied message
        const taskDate = new Date();
        taskDate.setSeconds(taskDate.getSeconds() + 6);
        const taskMsg = getTaskMessage(i18n.t('notifications.test.task'), i18n.language);

        await Notifications.scheduleNotificationAsync({
            content: {
                title: taskMsg.title,
                body: taskMsg.body,
                data: { type: 'task', taskId: 'test-task' },
                sound: 'default',
            },
            trigger: { type: 'date', date: taskDate } as any,
        });

        // 3. Reminder Notification (in 9 seconds) - Uses varied message
        const reminderDate = new Date();
        reminderDate.setSeconds(reminderDate.getSeconds() + 9);
        const hydrationMsg = getHydrationMessage(i18n.language);

        await Notifications.scheduleNotificationAsync({
            content: {
                title: hydrationMsg.title,
                body: hydrationMsg.body,
                data: { type: 'reminder', reminderId: 'hydration' },
                sound: 'default',
            },
            trigger: { type: 'date', date: reminderDate } as any,
        });

        log.info('[rdvNotificationService] 3 test notifications scheduled (3s, 6s, 9s)');
        return true;
    } catch (error) {
        log.error('[rdvNotificationService] Failed to send test notifications:', error);
        return false;
    }
};

/**
 * Get all currently scheduled notifications (for debugging)
 */
export const getScheduledNotifications = async (): Promise<Notifications.NotificationRequest[]> => {
    try {
        return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
        log.error('[rdvNotificationService] Error getting scheduled notifications:', error);
        return [];
    }
};
