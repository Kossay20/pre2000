import { theme } from '../theme';
/**
 * @fileoverview Notification Service
 * Handles all local push notifications including:
 * - Permission management (iOS/Android)
 * - Reminder scheduling (hydration, medication, etc.)
 * - Baby message daily notifications
 * - Notification cancellation and management
 * 
 * @module services/notificationService
 * @note 100% local notifications - no server/API costs
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { createLogger } from '../utils/logger';
import { getReminderMessage } from '../utils/notificationMessages';
import i18n from '../i18n';
import { REMINDERS_CHANNEL_ID } from './notificationChannels';

// Create scoped logger for this service
const log = createLogger('NotificationService');

/** Local notifications are native-only. On web, expo-notifications throws CodedError. */
export const nativeNotificationsSupported = (os: string = Platform.OS): boolean => os !== 'web';

// Configure notification handler
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,    // NOTIF-02 FIX: badge-count requires iOS entitlement; keep false to avoid store rejection
        shouldShowBanner: true,   // Required by NotificationBehavior type
        shouldShowList: true,     // Required by NotificationBehavior type
    }),
});

export { REMINDERS_CHANNEL_ID };

/**
 * Create (or rename) the Android notification channels.
 *
 * Android 8+ drops a notification whose channel does not exist, and the channel
 * name is what the user sees under the app in system settings. These used to be
 * created only inside the permission request — so nothing existed until the user
 * had been asked — and the fallback channel was named "General" in every
 * language. Called once at startup and again on every language change:
 * re-registering an existing channel id only updates its name, the user's
 * importance and sound choices are kept.
 */
export const ensureNotificationChannels = async (os: string = Platform.OS): Promise<void> => {
    if (os !== 'android') return;
    try {
        await Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL_ID, {
            name: i18n.t('notifications.channelName'),
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: theme.colors.primary,
            sound: 'default',
            enableVibrate: true,
            showBadge: true,
        });
        // 'default' is the channel expo-notifications' config plugin declares for
        // anything posted without a channelId (app.json `defaultChannel`).
        await Notifications.setNotificationChannelAsync('default', {
            name: i18n.t('notifications.channelNameGeneral'),
            importance: Notifications.AndroidImportance.DEFAULT,
        });
        log.debug('Android channels configured');
    } catch (error) {
        log.error('Error configuring Android channels:', error);
    }
};

/**
 * Whether local notifications are allowed right now. NEVER shows a system
 * dialog — this is what scheduling code calls.
 *
 * Scheduling runs from background syncs (app launch, week change, language
 * change) as well as from taps. When it requested permission itself, the very
 * first Home render after onboarding put the OS dialog in front of the user with
 * no explanation. The request now happens only from a tap where the user can see
 * what it is for — see requestNotificationPermissions.
 */
export const hasNotificationPermission = async (): Promise<boolean> => {
    if (!Device.isDevice) return false;
    try {
        const { status } = await Notifications.getPermissionsAsync();
        return status === 'granted';
    } catch (error) {
        log.error('Error reading notification permission:', error);
        return false;
    }
};

/**
 * - granted: notifications can be scheduled.
 * - askable: not granted yet, and the OS will still show its dialog.
 * - blocked: refused for good — only the system settings can change it.
 * - unavailable: web or simulator, where local notifications do not exist.
 */
export type NotificationPermissionState = 'granted' | 'askable' | 'blocked' | 'unavailable';

/**
 * Read-only, like hasNotificationPermission, but tells "can still ask" apart
 * from "refused for good", which decides whether an in-app invitation to turn
 * notifications on makes sense or would lead to a dialog that never appears.
 */
export const getNotificationPermissionState = async (
    os: string = Platform.OS
): Promise<NotificationPermissionState> => {
    if (!nativeNotificationsSupported(os) || !Device.isDevice) return 'unavailable';
    try {
        const { status, canAskAgain } = await Notifications.getPermissionsAsync();
        if (status === 'granted') return 'granted';
        return canAskAgain ? 'askable' : 'blocked';
    } catch (error) {
        log.error('Error reading notification permission:', error);
        return 'unavailable';
    }
};

/**
 * Ask the user for notification permission — shows the OS dialog when the answer
 * is not yet known.
 *
 * Call only from a user action that makes the purpose obvious (the Reminders tab
 * banner, turning a reminder or appointment alert on, the Settings button) —
 * and from screens, through requestNotificationsAndResync, so a grant schedules
 * the reminders right away. Scheduling code uses hasNotificationPermission instead.
 * @returns Promise resolving to true if permissions granted
 */
export const requestNotificationPermissions = async (): Promise<boolean> => {
    log.info('Requesting permissions...');

    // Check if physical device
    if (!Device.isDevice) {
        log.warn('Notifications only work on physical devices');
        return false;
    }

    try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        log.debug('Existing permission status:', existingStatus);

        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
            log.debug('New permission status:', finalStatus);
        }

        if (finalStatus !== 'granted') {
            log.warn('Notification permissions denied');
            return false;
        }

        log.success('Permissions granted');
        return true;
    } catch (error) {
        log.error('Error requesting permissions:', error);
        return false;
    }
};

/**
 * Schedule a single reminder notification at a specific time
 * @param reminderId - Unique identifier for the reminder
 * @param title - Notification title
 * @param body - Notification body text
 * @param hour - Hour to trigger (0-23)
 * @param minute - Minute to trigger (0-59)
 * @returns Promise resolving to notification ID or null on failure
 */
export const scheduleReminderNotification = async (
    reminderId: string,
    title: string,
    body: string,
    hour: number,
    minute: number = 0
): Promise<string | null> => {
    log.info('Scheduling reminder:', { reminderId, title, hour, minute });

    // F13 FIX: Verify permissions before scheduling. Without this, scheduleNotificationAsync
    // could silently fail on iOS / log an error that's hard to track in prod.
    // Checked, never requested: this runs from background syncs too.
    const hasPermission = await hasNotificationPermission();
    if (!hasPermission) {
        log.warn(`Skipping schedule for ${reminderId}: notification permission denied`);
        return null;
    }

    try {
        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data: {
                    type: 'reminder',
                    reminderId,
                    // P-FIX (deep-link): payload consumed by global listener in App.tsx (AppInitializer).
                    // `screen` tells AppInitializer which tab to navigate to; `highlightId` is read
                    // from route.params by TasksTab to flash the matching item. Without these fields,
                    // the global listener silently dropped the tap when TasksTab had never been mounted.
                    screen: 'TasksTab',
                    highlightId: reminderId,
                },
                sound: 'default',
            },
            // DAILY, not CALENDAR: the Android scheduler has no calendar trigger and
            // throws for it, so every recurring reminder was silently never scheduled
            // there. DAILY repeats at hour:minute on both platforms.
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour,
                minute,
                // NOTIF-01 FIX: channelId required on Android 8+ or notification is dropped silently
                ...(Platform.OS === 'android' ? { channelId: REMINDERS_CHANNEL_ID } : {}),
            } as Notifications.DailyTriggerInput,
        });

        log.success('Scheduled notification:', notificationId);
        return notificationId;
    } catch (error) {
        log.error('Error scheduling notification:', error);
        return null;
    }
};

/**
 * Schedule a one-time notification at a specific date and time
 * @param reminderId - Unique identifier for the reminder
 * @param title - Notification title
 * @param body - Notification body text
 * @param date - Date object for the notification trigger
 * @returns Promise resolving to notification ID or null on failure
 */
export const scheduleOneTimeNotification = async (
    reminderId: string,
    title: string,
    body: string,
    date: Date
): Promise<string | null> => {
    log.info('Scheduling one-time notification:', { reminderId, title, date });

    if (date <= new Date()) {
        log.warn('Cannot schedule notification in the past');
        return null;
    }

    try {
        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data: {
                    type: 'one_time_task',
                    reminderId,
                },
                sound: 'default',
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date,
                // Same localized, high-importance channel as the recurring reminders
                // rather than the generic fallback.
                ...(Platform.OS === 'android' ? { channelId: REMINDERS_CHANNEL_ID } : {}),
            } as Notifications.DateTriggerInput,
        });

        log.success('Scheduled one-time notification:', notificationId);
        return notificationId;
    } catch (error) {
        log.error('Error scheduling one-time notification:', error);
        return null;
    }
};

/**
 * Schedule multiple reminder notifications at different times
 * Uses varied, personalized messages to avoid repetition
 * @param reminderId - Base reminder identifier (used to get personalized messages)
 * @param title - Fallback notification title
 * @param bodyTemplate - Fallback notification body text
 * @param hours - Array of hours to schedule (e.g., [8, 12, 18])
 * @returns Promise resolving to array of notification IDs
 */
export const scheduleMultipleReminders = async (
    reminderId: string,
    title: string,
    bodyTemplate: string,
    hours: number[]
): Promise<string[]> => {
    log.info('Scheduling multiple reminders:', { reminderId, count: hours.length, hours });

    const notificationIds: string[] = [];

    for (const hour of hours) {
        // Get a varied, personalized message for each notification
        const msg = getReminderMessage(reminderId);
        const id = await scheduleReminderNotification(
            `${reminderId}_${hour}`,
            msg.title,
            msg.body,
            hour,
            0
        );

        if (id) {
            notificationIds.push(id);
        }
    }

    log.success(`Scheduled ${notificationIds.length} notifications`);
    return notificationIds;
};

/**
 * Cancel all notifications for a specific reminder
 * @param reminderId - Reminder identifier to cancel
 */
export const cancelReminderNotifications = async (reminderId: string): Promise<void> => {
    log.info('Canceling notifications for:', reminderId);

    if (!nativeNotificationsSupported()) {
        log.debug('Skipping reminder cancel: native notifications unavailable on web');
        return;
    }

    try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();

        // Filter notifications for this reminder
        const toCancel = scheduled.filter(
            notif => {
                const data = notif.content.data as any;
                return data?.reminderId === reminderId ||
                    (typeof data?.reminderId === 'string' && data.reminderId.startsWith(reminderId));
            }
        );

        log.debug('Found', toCancel.length, 'notifications to cancel');

        for (const notif of toCancel) {
            await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }

        log.success('Canceled notifications for:', reminderId);
    } catch (error) {
        log.error('Error canceling notifications:', error);
    }
};

/**
 * Cancel all scheduled notifications
 */
export const cancelAllNotifications = async (): Promise<void> => {
    log.info('Canceling ALL notifications...');

    try {
        await Notifications.cancelAllScheduledNotificationsAsync();
        log.success('All notifications canceled');
    } catch (error) {
        log.error('Error canceling all notifications:', error);
    }
};

/**
 * Get all scheduled notifications (for debugging)
 * @returns Array of simplified notification objects
 */
export const getScheduledNotifications = async () => {
    log.debug('Fetching scheduled notifications...');

    try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        log.debug('Found', scheduled.length, 'scheduled notifications');

        return scheduled.map(notif => ({
            id: notif.identifier,
            title: notif.content.title,
            body: notif.content.body,
            trigger: notif.trigger,
            data: notif.content.data,
        }));
    } catch (error) {
        log.error('Error fetching notifications:', error);
        return [];
    }
};

/**
 * Schedule daily baby message notification
 * @param message - Baby message text
 * @param emoji - Emoji to display with message
 * @param hour - Hour to send (default: 10)
 * @param minute - Minute to send (default: 0)
 * @returns Promise resolving to notification ID or null
 */
export const scheduleBabyMessage = async (
    message: string,
    emoji: string,
    hour: number = 10,
    minute: number = 0
): Promise<string | null> => {
    log.info('Scheduling baby message:', {
        message: message.substring(0, 50) + '...',
        hour,
        minute,
    });

    if (!nativeNotificationsSupported()) {
        log.debug('Skipping baby-message schedule: native notifications unavailable on web');
        return null;
    }

    try {
        // Cancel existing baby message
        await cancelBabyMessage();

        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: `${emoji} ${i18n.t('home.babyMessage', { defaultValue: 'Message de bébé' })}`,
                body: message,
                data: {
                    type: 'baby_message',
                    // P-FIX (deep-link): tap on baby-message notif opens the Home tab where the
                    // baby-message card lives. No highlightId — there is no per-item anchor.
                    screen: 'Home',
                },
                sound: 'default',
            },
            // DAILY for the same reason as scheduleReminderNotification: Android rejects CALENDAR.
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour,
                minute,
                // NOTIF-01 FIX: channelId required on Android or notification is silently dropped
                ...(Platform.OS === 'android' ? { channelId: REMINDERS_CHANNEL_ID } : {}),
            } as Notifications.DailyTriggerInput,
        });

        log.success('Baby message scheduled:', notificationId);
        return notificationId;
    } catch (error) {
        log.error('Error scheduling baby message:', error);
        return null;
    }
};

/**
 * Cancel baby message notification
 */
export const cancelBabyMessage = async (): Promise<void> => {
    log.debug('Canceling baby message...');

    if (!nativeNotificationsSupported()) {
        log.debug('Skipping baby-message cancel: native notifications unavailable on web');
        return;
    }

    try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        const babyMessages = scheduled.filter(
            notif => notif.content.data?.type === 'baby_message'
        );

        for (const notif of babyMessages) {
            await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }

        log.success('Baby message canceled');
    } catch (error) {
        log.error('Error canceling baby message:', error);
    }
};

/**
 * Send a test notification (for debugging)
 * Triggers in 2 seconds
 */
export const sendTestNotification = async (): Promise<void> => {
    log.info('Sending test notification...');

    try {
        await Notifications.scheduleNotificationAsync({
            content: {
                title: "Test Notification 🧪",
                body: "Maman, c'est un test ! Les notifications fonctionnent 💕",
                data: { type: 'test' },
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: 2,
            } as Notifications.TimeIntervalTriggerInput,
        });

        log.success('Test notification scheduled');
    } catch (error) {
        log.error('Error sending test notification:', error);
    }
};

/**
 * Register a listener for notification responses (clicks)
 * Used for Deep Linking to specific screens
 */
export const registerNotificationResponseListener = (
    onReminderClick: (reminderId: string) => void
) => {
    log.info('Registering notification response listener');

    return Notifications.addNotificationResponseReceivedListener(response => {
        const data = response.notification.request.content.data;
        log.info('Notification received:', data);

        if (data?.reminderId) {
            log.info('Deep linking to reminder:', data.reminderId);
            onReminderClick(data.reminderId as string);
        }
    });
};
