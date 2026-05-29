/**
 * N3 — syncRemindersToNotifications is the REAL entry point that runs when a user
 * enables/changes a reminder (RemindersTab → syncRemindersToNotifications). It had ZERO
 * coverage and early-returns on web, so the Playwright E2E never exercised it either.
 * A bug here = toggling a daily "take-a-pill" reminder silently schedules nothing.
 */
import { Platform } from 'react-native';

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(), success: jest.fn() }),
}));
jest.mock('../../i18n', () => ({ __esModule: true, default: { language: 'fr' } }));
jest.mock('../remindersV2Service', () => ({ loadUserSettings: jest.fn(), getAllReminders: jest.fn() }));
jest.mock('../notificationService', () => ({ scheduleReminderNotification: jest.fn().mockResolvedValue('notif-id') }));
jest.mock('../babyMessageService', () => ({ scheduleTodaysBabyMessage: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../utils/notificationMessages', () => ({ getReminderMessage: jest.fn(() => ({ title: 'T', body: 'B' })) }));
jest.mock('expo-notifications', () => ({
  getAllScheduledNotificationsAsync: jest.fn().mockResolvedValue([]),
  cancelScheduledNotificationAsync: jest.fn(),
}));

import { syncRemindersToNotifications } from '../remindersScheduler';
import { loadUserSettings, getAllReminders } from '../remindersV2Service';
import { scheduleReminderNotification } from '../notificationService';
import { scheduleTodaysBabyMessage } from '../babyMessageService';
import * as Notifications from 'expo-notifications';

describe('syncRemindersToNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([]);
  });

  it('schedules every enabled reminder time + the daily baby message on native', async () => {
    (getAllReminders as jest.Mock).mockReturnValue([
      { id: 'rem_hyd', default_enabled: true, preset_times: { '1': ['09:00', '14:00'] } },
      { id: 'rem_vit', default_enabled: true, preset_times: { '1': ['08:00'] } },
      { id: 'rem_off', default_enabled: false, preset_times: { '1': ['10:00'] } },
    ]);
    (loadUserSettings as jest.Mock).mockResolvedValue({}); // no overrides → defaults

    await syncRemindersToNotifications(20, 'fr', 'user-1');

    expect(scheduleReminderNotification).toHaveBeenCalledTimes(3); // 2 + 1, rem_off disabled
    expect(scheduleReminderNotification).toHaveBeenCalledWith('rem_hyd', 'T', 'B', 9, 0);
    expect(scheduleReminderNotification).toHaveBeenCalledWith('rem_hyd', 'T', 'B', 14, 0);
    expect(scheduleReminderNotification).toHaveBeenCalledWith('rem_vit', 'T', 'B', 8, 0);
    expect(scheduleTodaysBabyMessage).toHaveBeenCalledWith(20, 'fr');
  });

  it('honors an explicit user setting that disables a default-on reminder', async () => {
    (getAllReminders as jest.Mock).mockReturnValue([
      { id: 'rem_hyd', default_enabled: true, preset_times: { '1': ['09:00'] } },
    ]);
    (loadUserSettings as jest.Mock).mockResolvedValue({ rem_hyd: { enabled: false } });

    await syncRemindersToNotifications(10, 'en', 'user-2');
    expect(scheduleReminderNotification).not.toHaveBeenCalled();
  });

  it('uses explicit user times over preset times', async () => {
    (getAllReminders as jest.Mock).mockReturnValue([
      { id: 'rem_med', default_enabled: false, preset_times: { '1': ['08:00'] } },
    ]);
    (loadUserSettings as jest.Mock).mockResolvedValue({ rem_med: { enabled: true, times: ['07:30', '19:30'] } });

    await syncRemindersToNotifications(15, 'fr');
    expect(scheduleReminderNotification).toHaveBeenCalledTimes(2);
    expect(scheduleReminderNotification).toHaveBeenCalledWith('rem_med', 'T', 'B', 7, 30);
    expect(scheduleReminderNotification).toHaveBeenCalledWith('rem_med', 'T', 'B', 19, 30);
  });

  it('is a no-op on web (expo-notifications unavailable)', async () => {
    Platform.OS = 'web';
    await syncRemindersToNotifications(20, 'fr', 'u');
    expect(getAllReminders).not.toHaveBeenCalled();
    expect(scheduleReminderNotification).not.toHaveBeenCalled();
  });

  it('cancels only owned (reminder/baby_message) notifications, preserving RDV notifications', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue([
      { identifier: 'a', content: { data: { type: 'reminder' } } },
      { identifier: 'b', content: { data: { type: 'rdv' } } },
      { identifier: 'c', content: { data: { type: 'baby_message' } } },
    ]);
    (getAllReminders as jest.Mock).mockReturnValue([]);
    (loadUserSettings as jest.Mock).mockResolvedValue({});

    await syncRemindersToNotifications(20, 'fr');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('a');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('c');
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith('b');
  });
});
