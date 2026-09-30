/**
 * Permission granted → reminders scheduled.
 *
 * The background sync never asks for permission, so a grant is the moment the
 * reminders have to be scheduled — otherwise they wait for the next week change,
 * up to seven days. These tests hold the shared function to that, and a source
 * scan holds every screen that can obtain a grant to going through it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Platform } from 'react-native';

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn(async (k: string) => (k in mockStore ? mockStore[k] : null)),
        setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
    },
}));
jest.mock('expo-notifications');
jest.mock('expo-device');
jest.mock('../../utils/logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));
jest.mock('../../i18n', () => ({ __esModule: true, default: { t: (k: string) => k, language: 'fr' } }));
jest.mock('../remindersScheduler', () => ({ syncRemindersToNotifications: jest.fn().mockResolvedValue(undefined) }));

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { getNotificationPermissionState } from '../notificationService';
import { syncRemindersToNotifications } from '../remindersScheduler';
import {
    requestNotificationsAndResync,
    resyncReminders,
    shouldShowNotificationPrimer,
    acceptNotificationPrimer,
    dismissNotificationPrimer,
    isNotificationPrimerDismissed,
    NOTIFICATION_PRIMER_DISMISSED_KEY,
} from '../notificationPermissionFlow';

const ctx = { week: 24, locale: 'ar', userId: 'uid-1' };
const permission = (status: string, canAskAgain = true) =>
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status, canAskAgain });

beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(mockStore)) delete mockStore[k];
    (Device as any).isDevice = true;
    Platform.OS = 'ios';
});

describe('requestNotificationsAndResync', () => {
    it('schedules the reminders as soon as the dialog is answered yes', async () => {
        permission('undetermined');
        (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

        await expect(requestNotificationsAndResync(ctx)).resolves.toEqual({ granted: true, resynced: true });

        expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
        expect(syncRemindersToNotifications).toHaveBeenCalledTimes(1);
        expect(syncRemindersToNotifications).toHaveBeenCalledWith(24, 'ar', 'uid-1');
    });

    it('does nothing more when permission was already there — the background sync has run', async () => {
        permission('granted');

        await expect(requestNotificationsAndResync(ctx)).resolves.toEqual({ granted: true, resynced: false });

        expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
        expect(syncRemindersToNotifications).not.toHaveBeenCalled();
    });

    it('schedules nothing when she says no', async () => {
        permission('undetermined');
        (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

        await expect(requestNotificationsAndResync(ctx)).resolves.toEqual({ granted: false, resynced: false });
        expect(syncRemindersToNotifications).not.toHaveBeenCalled();
    });

    it('falls back to week 1 when no week is known yet, as the Reminders tab always did', async () => {
        await resyncReminders({ week: undefined, locale: 'fr' });
        await resyncReminders({ week: 0, locale: 'fr' });
        expect(syncRemindersToNotifications).toHaveBeenNthCalledWith(1, 1, 'fr', undefined);
        expect(syncRemindersToNotifications).toHaveBeenNthCalledWith(2, 1, 'fr', undefined);
    });

    it('a failing sync does not break the tap that granted permission', async () => {
        permission('undetermined');
        (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        (syncRemindersToNotifications as jest.Mock).mockRejectedValueOnce(new Error('firestore down'));

        await expect(requestNotificationsAndResync(ctx)).resolves.toEqual({ granted: true, resynced: true });
    });
});

describe('getNotificationPermissionState', () => {
    it('is unavailable on web and on a simulator', async () => {
        await expect(getNotificationPermissionState('web')).resolves.toBe('unavailable');
        (Device as any).isDevice = false;
        await expect(getNotificationPermissionState('ios')).resolves.toBe('unavailable');
        expect(Notifications.getPermissionsAsync).not.toHaveBeenCalled();
    });

    it('tells a dialog that can still appear from a refusal for good', async () => {
        permission('granted', false);
        await expect(getNotificationPermissionState('ios')).resolves.toBe('granted');
        permission('undetermined', true);
        await expect(getNotificationPermissionState('android')).resolves.toBe('askable');
        permission('denied', false);
        await expect(getNotificationPermissionState('ios')).resolves.toBe('blocked');
    });

    it('never shows the dialog itself', async () => {
        permission('undetermined');
        await getNotificationPermissionState('ios');
        expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    });
});

describe('Home primer', () => {
    it('shows only while the OS can still ask and she has not dismissed it', () => {
        expect(shouldShowNotificationPrimer('askable', false)).toBe(true);

        expect(shouldShowNotificationPrimer('askable', true)).toBe(false);      // dismissed
        expect(shouldShowNotificationPrimer('granted', false)).toBe(false);     // nothing to ask
        expect(shouldShowNotificationPrimer('blocked', false)).toBe(false);     // dialog would never appear
        expect(shouldShowNotificationPrimer('unavailable', false)).toBe(false); // web / simulator
        expect(shouldShowNotificationPrimer(null, false)).toBe(false);          // still reading
        expect(shouldShowNotificationPrimer('askable', null)).toBe(false);      // still reading
    });

    it('is shown until dismissed, and stays dismissed', async () => {
        await expect(isNotificationPrimerDismissed()).resolves.toBe(false);
        await dismissNotificationPrimer();
        expect(mockStore[NOTIFICATION_PRIMER_DISMISSED_KEY]).toBe('1');
        await expect(isNotificationPrimerDismissed()).resolves.toBe(true);
    });

    it('"turn on" asks, schedules the reminders on a yes, and is not shown again', async () => {
        permission('undetermined');
        (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });

        await expect(acceptNotificationPrimer(ctx)).resolves.toBe(true);

        expect(syncRemindersToNotifications).toHaveBeenCalledWith(24, 'ar', 'uid-1');
        await expect(isNotificationPrimerDismissed()).resolves.toBe(true);
    });

    it('is not shown again after a no either', async () => {
        permission('undetermined');
        (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

        await expect(acceptNotificationPrimer(ctx)).resolves.toBe(false);

        expect(syncRemindersToNotifications).not.toHaveBeenCalled();
        await expect(isNotificationPrimerDismissed()).resolves.toBe(true);
    });
});

describe('every grant path goes through requestNotificationsAndResync', () => {
    const SRC = path.resolve(__dirname, '../..');
    const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

    it.each([
        ['Home primer', 'components/home/NotificationPrimerCard.tsx', 'acceptNotificationPrimer('],
        ['Settings row', 'screens/SettingsScreen.tsx', 'requestNotificationsAndResync('],
        ['Reminders banner + toggle', 'screens/reminders/RemindersTab.tsx', 'requestNotificationsAndResync('],
        ['Appointment alerts', 'screens/AddAppointmentScreen.tsx', 'requestNotificationsAndResync('],
    ])('%s', (_name, file, call) => {
        expect(read(file)).toContain(call);
    });

    it('no screen or component asks for permission without resyncing', () => {
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, e.name);
                if (e.isDirectory()) { if (e.name !== '__tests__') walk(full); continue; }
                if (!/\.tsx?$/.test(e.name)) continue;
                if (/requestNotificationPermissions|requestPermissionsAsync/.test(fs.readFileSync(full, 'utf8'))) {
                    offenders.push(path.relative(SRC, full));
                }
            }
        };
        walk(path.join(SRC, 'screens'));
        walk(path.join(SRC, 'components'));
        expect(offenders).toEqual([]);
    });
});
