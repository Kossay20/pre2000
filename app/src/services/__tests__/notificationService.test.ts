import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import {
    requestNotificationPermissions,
    scheduleReminderNotification,
    cancelReminderNotifications,
    scheduleMultipleReminders,
    cancelBabyMessage,
    scheduleBabyMessage,
    nativeNotificationsSupported,
} from '../notificationService';

// Mock dependencies
jest.mock('expo-notifications');
jest.mock('expo-device');
jest.mock('../../utils/logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        success: jest.fn(),
    }),
}));
jest.mock('../../utils/notificationMessages', () => ({
    getReminderMessage: jest.fn(() => ({
        title: 'Test Title',
        body: 'Test Body',
    })),
}));

describe('NotificationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (Device as any).isDevice = true;
    });

    describe('requestNotificationPermissions', () => {
        it('should return false if not on a physical device', async () => {
            (Device as any).isDevice = false;
            const result = await requestNotificationPermissions();
            expect(result).toBe(false);
        });

        it('should return true if permissions are already granted', async () => {
            (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
            const result = await requestNotificationPermissions();
            expect(result).toBe(true);
            expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
        });

        it('should request permissions if status is undetermined', async () => {
            (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
            (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
            const result = await requestNotificationPermissions();
            expect(result).toBe(true);
            expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
        });

        it('should set notification channel on Android', async () => {
            Platform.OS = 'android';
            (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
            await requestNotificationPermissions();
            expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.any(Object));
            Platform.OS = 'ios'; // Reset
        });
    });

    describe('scheduleReminderNotification', () => {
        // N2-FIX: this block previously relied on getPermissionsAsync being left
        // mock-resolved to 'granted' by the requestNotificationPermissions block above
        // (jest.clearAllMocks does NOT reset mockResolvedValue impls). Run in isolation
        // the call returned null and the test silently failed. Stub permission explicitly
        // here so the test proves scheduling on its own.
        beforeEach(() => {
            (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
            Platform.OS = 'ios';
        });

        it('should schedule a notification with correct parameters', async () => {
            (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notif-123');
            const result = await scheduleReminderNotification('rem-1', 'Title', 'Body', 8, 30);

            expect(result).toBe('notif-123');
            expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.objectContaining({
                    title: 'Title',
                    body: 'Body',
                    // P-FIX (deep-link): payload now carries `screen` + `highlightId` so the
                    // global notification listener in App.tsx can navigate even when TasksTab
                    // has never been mounted (no per-screen focused listener).
                    data: {
                        type: 'reminder',
                        reminderId: 'rem-1',
                        screen: 'TasksTab',
                        highlightId: 'rem-1',
                    }
                }),
                // N2-FIX: assert the recurring trigger TYPE (CALENDAR) — the most
                // regression-prone field, previously unchecked. A daily "take-a-pill"
                // reminder must use a repeating CALENDAR trigger, not a one-shot date.
                trigger: expect.objectContaining({
                    type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
                    hour: 8,
                    minute: 30,
                    repeats: true
                })
            }));
        });

        it('should attach the Android channelId so notifications are not dropped on Android 8+', async () => {
            // NOTIF-01 regression net: without channelId, Android silently drops the notification.
            Platform.OS = 'android';
            (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notif-456');
            await scheduleReminderNotification('rem-2', 'T', 'B', 9, 0);

            const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
            expect(arg.trigger.channelId).toBe('pregnancy-reminders');
            Platform.OS = 'ios';
        });

        it('should return null if notification permission is denied', async () => {
            // N2-FIX: explicit proof of the deny path (was implicitly the only behavior in isolation).
            (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
            (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
            const result = await scheduleReminderNotification('rem-3', 'T', 'B', 8, 30);
            expect(result).toBeNull();
        });

        it('should return null on error', async () => {
            (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValue(new Error('Scheduling failed'));
            const result = await scheduleReminderNotification('rem-1', 'Title', 'Body', 8, 30);
            expect(result).toBeNull();
        });
    });

    describe('cancelReminderNotifications', () => {
        it('should cancel notifications matching the reminderId', async () => {
            const mockScheduled = [
                { identifier: '1', content: { data: { reminderId: 'rem-1' } } },
                { identifier: '2', content: { data: { reminderId: 'rem-2' } } },
                { identifier: '3', content: { data: { reminderId: 'rem-1_8' } } }, // Variant
            ];
            (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(mockScheduled);

            await cancelReminderNotifications('rem-1');

            expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
            expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('1');
            expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('3');
            expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('2');
        });
    });

    describe('web: native notifications are a no-op (not a console.error)', () => {
        const originalOS = Platform.OS;

        afterEach(() => {
            Platform.OS = originalOS;
        });

        it('nativeNotificationsSupported is false on web and true on ios', () => {
            expect(nativeNotificationsSupported('web')).toBe(false);
            expect(nativeNotificationsSupported('ios')).toBe(true);
            expect(nativeNotificationsSupported('android')).toBe(true);
        });

        it('cancelBabyMessage does not call expo-notifications on web', async () => {
            Platform.OS = 'web';
            (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockRejectedValue(
                new Error('Notifications.getAllScheduledNotificationsAsync is not available on web'),
            );
            await expect(cancelBabyMessage()).resolves.toBeUndefined();
            expect(Notifications.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
        });

        it('scheduleBabyMessage returns null on web without calling the native scheduler', async () => {
            Platform.OS = 'web';
            const id = await scheduleBabyMessage('hello from baby', '👶', 10, 0);
            expect(id).toBeNull();
            expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
            expect(Notifications.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
        });
    });
});
