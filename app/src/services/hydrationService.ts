import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from '../utils/logger';
import * as Notifications from 'expo-notifications';
import { isSameDay } from 'date-fns';
import { Platform } from 'react-native';
import i18n from '../i18n';
import { REMINDERS_CHANNEL_ID } from './notificationChannels';

const log = createLogger('HydrationService');
const STORAGE_KEY = 'hydration_data_v1';

export interface HydrationData {
    currentIntake: number; // ml
    dailyGoal: number; // ml
    lastUpdated: string; // ISO date
    reminderEnabled: boolean;
    reminderFrequency: number; // times per day
    reminderStartHour: number; // 0-23
    reminderEndHour: number; // 0-23
}

const DEFAULT_DATA: HydrationData = {
    currentIntake: 0,
    dailyGoal: 3000, // 3L
    lastUpdated: new Date().toISOString(),
    reminderEnabled: true,
    reminderFrequency: 8,
    reminderStartHour: 8, // 8 AM
    reminderEndHour: 22, // 10 PM
};

export const loadHydrationData = async (): Promise<HydrationData> => {
    try {
        const json = await AsyncStorage.getItem(STORAGE_KEY);
        let data: HydrationData = json ? JSON.parse(json) : DEFAULT_DATA;

        // Check for daily reset
        const lastDate = new Date(data.lastUpdated);
        const today = new Date();

        if (!isSameDay(lastDate, today)) {
            log.debug('[HydrationService] 🔄 New day detected, resetting counter');
            data = {
                ...data,
                currentIntake: 0,
                lastUpdated: today.toISOString(),
            };
            await saveHydrationData(data);
        }

        return data;
    } catch (error) {
        log.error('Error loading hydration data:', error);
        return DEFAULT_DATA;
    }
};

export const saveHydrationData = async (data: HydrationData): Promise<void> => {
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        // If settings changed, reschedule reminders
        if (data.reminderEnabled) {
            // Not awaited (the save must not wait on the OS), but a scheduling
            // failure is logged instead of becoming an unhandled rejection.
            scheduleHydrationReminders(data).catch(e => log.error('Error scheduling hydration reminders:', e));
        } else {
            cancelHydrationReminders().catch(e => log.error('Error cancelling hydration reminders:', e));
        }
    } catch (error) {
        log.error('Error saving hydration data:', error);
    }
};

export const addIntake = async (amount: number): Promise<HydrationData> => {
    const data = await loadHydrationData();
    const newData = {
        ...data,
        currentIntake: data.currentIntake + amount,
        lastUpdated: new Date().toISOString(),
    };
    await saveHydrationData(newData);
    return newData;
};

// Notifications
const NOTIFICATION_ID_PREFIX = 'hydration_reminder_';

export const cancelHydrationReminders = async () => {
    if (Platform.OS === 'web') return;

    log.debug('[HydrationService] 🔕 Cancelling all hydration reminders');
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
        if (notif.identifier.startsWith(NOTIFICATION_ID_PREFIX)) {
            await Notifications.cancelScheduledNotificationAsync(notif.identifier);
        }
    }
};

export const scheduleHydrationReminders = async (data: HydrationData) => {
    if (Platform.OS === 'web') return;

    await cancelHydrationReminders();

    if (!data.reminderEnabled || data.reminderFrequency <= 0) return;

    log.debug(`[HydrationService] 🔔 Scheduling ${data.reminderFrequency} reminders`);

    const interval = (data.reminderEndHour - data.reminderStartHour) / data.reminderFrequency;

    for (let i = 0; i < data.reminderFrequency; i++) {
        const hour = data.reminderStartHour + (i * interval);
        const triggerHour = Math.floor(hour);
        const triggerMinute = Math.floor((hour - triggerHour) * 60);

        // Pick a random hydration message from the localized array
        // U-FIX-12: dot-path (no `notifications:` namespace registered)
        const hydrationMessages = i18n.t('notifications.hydration', { returnObjects: true }) as Array<{ title: string; body: string }>;
        const msg = Array.isArray(hydrationMessages) && hydrationMessages.length > 0
            ? hydrationMessages[Math.floor(Math.random() * hydrationMessages.length)]
            : { title: '💧 Hydration reminder', body: 'Drink a glass of water for you and baby! 👶' };

        await Notifications.scheduleNotificationAsync({
            identifier: `${NOTIFICATION_ID_PREFIX}${i}`,
            content: {
                title: msg.title,
                body: msg.body,
                sound: 'default',
            },
            // DAILY, not CALENDAR: Android has no calendar trigger and throws for it.
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DAILY,
                hour: triggerHour,
                minute: triggerMinute,
                // Without a channel these landed on the generic fallback channel at
                // default importance, unlike every other reminder.
                ...(Platform.OS === 'android' ? { channelId: REMINDERS_CHANNEL_ID } : {}),
            },
        });
    }
};
