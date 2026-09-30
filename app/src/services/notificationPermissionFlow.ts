/**
 * Notification permission → reminders sync.
 *
 * The background reminders sync (launch, week change, language change) never
 * asks for permission, so until the user says yes nothing is scheduled. Every
 * place that can obtain that yes — the Home invitation card, the Settings row,
 * the Reminders tab banner, turning a reminder or an appointment alert on — goes
 * through requestNotificationsAndResync, so the reminders she already has are
 * scheduled the moment she grants, not at the next week change.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../utils/logger';
import {
    hasNotificationPermission,
    requestNotificationPermissions,
    NotificationPermissionState,
} from './notificationService';
import { syncRemindersToNotifications } from './remindersScheduler';

const log = createLogger('NotificationPermissionFlow');

/** What the reminders sync needs to know about the user. */
export interface ReminderSyncContext {
    week?: number | null;
    locale: string;
    userId?: string;
}

/**
 * Reschedule every enabled reminder. Without a known week (no profile yet) the
 * sync still runs for week 1, as the Reminders tab always did.
 */
export const resyncReminders = async (ctx: ReminderSyncContext): Promise<void> => {
    const week = ctx.week && ctx.week > 0 ? ctx.week : 1;
    try {
        await syncRemindersToNotifications(week, ctx.locale, ctx.userId);
    } catch (error) {
        log.error('Reminders sync failed:', error);
    }
};

/**
 * Show the OS dialog if the answer is not known yet, and when this call is what
 * turned permission on, schedule the reminders right away. When permission was
 * already there the background sync has scheduled them, so nothing is redone.
 * Call only from a tap whose purpose is obvious to the user.
 */
export const requestNotificationsAndResync = async (
    ctx: ReminderSyncContext
): Promise<{ granted: boolean; resynced: boolean }> => {
    const hadPermission = await hasNotificationPermission();
    const granted = hadPermission || (await requestNotificationPermissions());
    if (granted && !hadPermission) {
        await resyncReminders(ctx);
        return { granted, resynced: true };
    }
    return { granted, resynced: false };
};

// Device-level, like the Home welcome flag: it records that this phone has
// already shown the invitation, not anything about the user.
export const NOTIFICATION_PRIMER_DISMISSED_KEY = '@notification_primer_dismissed_v1';

/**
 * The Home invitation is shown once, only while the OS can still show its
 * dialog: not on web or a simulator, not once granted, and not once refused for
 * good (then the Settings row, which opens the system settings, is the way back).
 */
export const shouldShowNotificationPrimer = (
    state: NotificationPermissionState | null,
    dismissed: boolean | null
): boolean => state === 'askable' && dismissed === false;

export const isNotificationPrimerDismissed = async (): Promise<boolean> => {
    try {
        return (await AsyncStorage.getItem(NOTIFICATION_PRIMER_DISMISSED_KEY)) === '1';
    } catch {
        // Unreadable storage: stay quiet rather than risk showing it on every launch.
        return true;
    }
};

export const dismissNotificationPrimer = async (): Promise<void> => {
    try {
        await AsyncStorage.setItem(NOTIFICATION_PRIMER_DISMISSED_KEY, '1');
    } catch (error) {
        log.error('Could not persist the primer dismissal:', error);
    }
};

/**
 * "Turn on" on the Home card. Whatever she answers, the card has done its job
 * and is not shown again.
 */
export const acceptNotificationPrimer = async (ctx: ReminderSyncContext): Promise<boolean> => {
    const { granted } = await requestNotificationsAndResync(ctx);
    await dismissNotificationPrimer();
    return granted;
};
