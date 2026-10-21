import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import {
    requestNotificationPermissions,
    hasNotificationPermission,
    ensureNotificationChannels,
    scheduleOneTimeNotification,
    scheduleReminderNotification,
    cancelReminderNotifications,
    scheduleMultipleReminders,
    cancelBabyMessage,
    scheduleBabyMessage,
    nativeNotificationsSupported,
    cancelAllNotifications,
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
// Echo the key back, so a test can tell a translated name from a hard-coded one.
jest.mock('../../i18n', () => ({
    __esModule: true,
    default: { t: (key: string) => `t(${key})`, language: 'fr' },
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

    });

    describe('hasNotificationPermission — what scheduling code calls', () => {
        // The first Home render after onboarding used to put the OS dialog up with
        // no explanation, because the background reminder sync asked for permission
        // itself. Checking must never ask.
        it.each([['granted', true], ['undetermined', false], ['denied', false]])(
            'reads %s without ever showing the OS dialog',
            async (status, expected) => {
                (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status });
                await expect(hasNotificationPermission()).resolves.toBe(expected);
                expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
            },
        );

        it('is false off-device and on error', async () => {
            (Device as any).isDevice = false;
            await expect(hasNotificationPermission()).resolves.toBe(false);
            (Device as any).isDevice = true;
            (Notifications.getPermissionsAsync as jest.Mock).mockRejectedValueOnce(new Error('boom'));
            await expect(hasNotificationPermission()).resolves.toBe(false);
        });
    });

    describe('ensureNotificationChannels', () => {
        it('creates both Android channels with translated names', async () => {
            await ensureNotificationChannels('android');

            expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
                'pregnancy-reminders',
                expect.objectContaining({ name: 't(notifications.channelName)' }),
            );
            // Was hard-coded 'General' in every language.
            expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
                'default',
                expect.objectContaining({ name: 't(notifications.channelNameGeneral)' }),
            );
        });

        it('does not depend on permission having been asked', async () => {
            await ensureNotificationChannels('android');
            expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
            expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
        });

        it.each([['ios'], ['web']])('is a no-op on %s', async (os) => {
            await ensureNotificationChannels(os);
            expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
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
                // The trigger TYPE is the most regression-prone field. A daily reminder
                // must repeat, and must use DAILY: CALENDAR is iOS-only and the Android
                // scheduler throws for it, so the reminder never existed on Android.
                trigger: expect.objectContaining({
                    type: Notifications.SchedulableTriggerInputTypes.DAILY,
                    hour: 8,
                    minute: 30,
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
            // Android's NotificationScheduler accepts daily/weekly/date/… but throws for 'calendar'.
            expect(arg.trigger.type).toBe(Notifications.SchedulableTriggerInputTypes.DAILY);
            Platform.OS = 'ios';
        });

        it('never asks for permission itself — it runs from background syncs', async () => {
            (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
            (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

            const result = await scheduleReminderNotification('rem-4', 'T', 'B', 8, 30);

            expect(result).toBeNull();
            expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
            expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
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

    describe('scheduleOneTimeNotification', () => {
        it('posts on the reminders channel on Android, not the generic fallback', async () => {
            Platform.OS = 'android';
            (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('once-1');

            await scheduleOneTimeNotification('task-1', 'T', 'B', new Date(Date.now() + 60_000));

            const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
            expect(arg.trigger.channelId).toBe('pregnancy-reminders');
            Platform.OS = 'ios';
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

        it('cancelAllNotifications (every logout / erase) does not call expo-notifications on web', async () => {
            Platform.OS = 'web';
            await expect(cancelAllNotifications()).resolves.toBeUndefined();
            expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
        });

        it('scheduleBabyMessage returns null on web without calling the native scheduler', async () => {
            Platform.OS = 'web';
            const id = await scheduleBabyMessage('hello from baby', '👶', 10, 0);
            expect(id).toBeNull();
            expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
            expect(Notifications.getAllScheduledNotificationsAsync).not.toHaveBeenCalled();
        });

        it('scheduleBabyMessage uses a DAILY trigger on the reminders channel on Android', async () => {
            Platform.OS = 'android';
            (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
            (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('baby-1');

            await expect(scheduleBabyMessage('hello from baby', '👶', 10, 0)).resolves.toBe('baby-1');

            const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
            expect(arg.trigger).toEqual({
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: 10,
                minute: 0,
                channelId: 'pregnancy-reminders',
            });
            Platform.OS = 'ios';
        });
    });
});
