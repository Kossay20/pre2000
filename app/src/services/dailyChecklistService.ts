/**
 * Daily Checklist Service V2
 * 
 * Generates daily checklist items from:
 * 1. User's calendar appointments
 * 2. Enabled reminders from Reminders V2 system (source_ui: both_but_single_entry)
 * 
 * No more hardcoded items - single source of truth!
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { DailyChecklistItem, UserEvent } from '../types';
import { createLogger } from '../utils/logger';
import {
    getRemindersForTasksTab,
    loadUserSettings,
    getAvailableReminders
} from './remindersV2Service';
import { ReminderDefinition, ReminderUserSetting } from '../types/remindersV2';
import { getLocalizedTrilang } from '../utils/i18nHelpers';
// F-HS-02-REGR: Statistics hydration must reflect the REAL water tracker
// (HydrationCard → hydrationService, 'hydration_data_v1'), not the herbal-tea
// checklist item (rem_hyd_herbal_tea, category 'hyd').
import { loadHydrationData } from './hydrationService';

const log = createLogger('DailyChecklistService');
const DAILY_CHECKLIST_KEY_PREFIX = '@daily_checklist_v2_';

// ============================================
// GENERATE DAILY CHECKLIST
// ============================================

/**
 * Generate the daily checklist from appointments + ALL enabled reminders
 * Creates separate items for each time slot (multi-slot support)
 */
export const generateDailyChecklist = async (
    userEvents: UserEvent[],
    pregnancyWeek: number,
    userId?: string,
    locale: string = 'fr'
): Promise<DailyChecklistItem[]> => {
    log.info('Generating daily checklist', { pregnancyWeek, userId: userId || 'guest' });

    const items: DailyChecklistItem[] = [];
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    // 1. Appointments for today
    const todayAppointments = userEvents.filter(event =>
        event.date.startsWith(todayStr)
    );

    log.debug(`Found ${todayAppointments.length} appointments for today`);

    todayAppointments.forEach(apt => {
        items.push({
            id: `apt-${apt.event_id}`,
            type: 'appointment',
            title: apt.title,
            subtitle: format(new Date(apt.date), 'HH:mm'),
            completed: false,
            icon: '📅',
            priority: 1
        });
    });

    // 2. Get enabled reminders from Reminders V2 (Context Aware)
    try {
        const { buildContextProfile } = require('../utils/contextMatcher');

        // Build context profile for filtering
        const profile = buildContextProfile(pregnancyWeek, {
            // TODO: Load user flags (diabetes, etc) from user profile if available
            // For now, we assume standard profile or what's in settings
        });

        const availableReminders: ReminderDefinition[] = getAvailableReminders(profile);
        const userSettings = await loadUserSettings(userId);

        log.debug(`Processing ${availableReminders.length} available reminders for checklist`);

        let priority = 2;

        for (const reminder of availableReminders) {
            const setting = userSettings[reminder.id];

            // Check if enabled: only if explicitly enabled in settings (no default fallbacks)
            const isEnabled = setting ? setting.enabled : false;

            if (isEnabled) {
                // Get the time slots for this reminder
                // Priority: 1. User setting times 2. Reminder default times 3. Fallback
                const times = setting?.times || reminder.preset_times?.['1'] || ['09:00'];
                const totalSlots = times.length;

                if (totalSlots === 1) {
                    // Single slot - simple item
                    const item = mapReminderToChecklistItem(reminder, setting, priority, 0, times[0], 1, locale);
                    items.push(item);
                    priority++;
                } else {
                    // Multi-slot - create item for each time slot
                    times.forEach((time: string, index: number) => {
                        const item = mapReminderToChecklistItem(
                            reminder,
                            setting,
                            priority + index,
                            index,
                            time,
                            totalSlots,
                            locale
                        );
                        items.push(item);
                    });
                    priority += totalSlots;
                }

                log.debug(`Added ${totalSlots} items for reminder: ${reminder.id}`);
            }
        }
    } catch (error) {
        log.error('Error loading reminders for checklist:', error);
    }

    log.info(`Generated ${items.length} daily checklist items`);
    return items.sort((a, b) => a.priority - b.priority);
};

/**
 * Map a ReminderDefinition to a DailyChecklistItem
 * Supports multi-slot reminders with unique IDs per slot
 * V2.3: Includes time_labels (notes) in subtitle
 */
const mapReminderToChecklistItem = (
    reminder: ReminderDefinition,
    setting: ReminderUserSetting,
    priority: number,
    slotIndex: number = 0,
    slotTime: string = '',
    totalSlots: number = 1,
    locale: string = 'fr'
): DailyChecklistItem => {
    // Create unique ID for each slot
    const slotSuffix = totalSlots > 1 ? `-slot-${slotIndex}` : '';

    // Use custom name if available, otherwise localized title
    const localizedTitle = getLocalizedTrilang(reminder.title, locale);

    const displayTitle = setting?.custom_name || localizedTitle;

    // V2.3: Get custom note/label for this time slot
    const timeLabel = setting?.time_labels?.[slotTime] || '';

    const baseItem: DailyChecklistItem = {
        id: `reminder-${reminder.id}${slotSuffix}`,
        type: 'reminder',
        title: displayTitle,
        completed: false,
        icon: reminder.ui?.icon || '📌',
        priority,
        reminderId: reminder.id,
        slotIndex,
        slotTime,
        totalSlots,
    };

    // V2.3: Build subtitle with time and note
    if (totalSlots > 1 && slotTime) {
        // Show time + note if available: "09:00 - Vitamine C"
        baseItem.subtitle = timeLabel ? `${slotTime} • ${timeLabel}` : slotTime;
    } else if (timeLabel) {
        // Single slot with note: just show the note
        baseItem.subtitle = timeLabel;
    }

    // Special handling for hydration type
    // NOTE: REMINDERS_V2 hydration reminders use category_id 'hyd' (canonical), not 'hydration'.
    if (reminder.category_id === 'hyd') {
        baseItem.type = 'hydration';
        baseItem.target = 2.0; // Default 2L
        baseItem.current = 0;
        baseItem.subtitle = `0.00L / 2.0L`;
    }

    return baseItem;
};

// ============================================
// PROGRESS TRACKING
// ============================================

/**
 * Save daily progress to AsyncStorage
 */
export const saveDailyProgress = async (items: DailyChecklistItem[]) => {
    try {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const key = `${DAILY_CHECKLIST_KEY_PREFIX}${todayStr}`;

        const progress = items.map(item => ({
            id: item.id,
            completed: item.completed,
            current: item.current, // For hydration
            skipped: item.skipped // New: Track skipped status
        }));

        await AsyncStorage.setItem(key, JSON.stringify(progress));
        log.debug(`Saved progress for ${items.length} items`);
    } catch (error) {
        log.error('Error saving daily progress:', error);
    }
};

/**
 * Load daily progress and merge with generated items
 */
export const loadDailyProgress = async (
    generatedItems: DailyChecklistItem[]
): Promise<DailyChecklistItem[]> => {
    try {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const key = `${DAILY_CHECKLIST_KEY_PREFIX}${todayStr}`;

        const stored = await AsyncStorage.getItem(key);

        if (!stored) {
            log.debug('No saved progress found for today');
            return generatedItems;
        }

        const progress = JSON.parse(stored);
        log.debug(`Loaded progress for ${progress.length} items`);

        return generatedItems.map(item => {
            const savedItem = progress.find((p: any) => p.id === item.id);
            if (savedItem) {
                return {
                    ...item,
                    completed: savedItem.completed,
                    skipped: savedItem.skipped, // New: Load skipped status
                    current: savedItem.current !== undefined ? savedItem.current : item.current,
                    // Re-calculate subtitle for hydration if loaded
                    subtitle: item.type === 'hydration' && savedItem.current !== undefined
                        ? `${Number(savedItem.current).toFixed(2)}L / ${item.target}L`
                        : item.subtitle
                };
            }
            return item;
        });
    } catch (error) {
        log.error('Error loading daily progress:', error);
        return generatedItems;
    }
};

/**
 * Clear old progress (keep only last 60 days)
 */
export const cleanupOldProgress = async () => {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const checklistKeys = keys.filter(k => k.startsWith(DAILY_CHECKLIST_KEY_PREFIX));

        const today = new Date();
        const cutoffDate = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days
        const cutoffStr = format(cutoffDate, 'yyyy-MM-dd');

        const keysToDelete = checklistKeys.filter(k => {
            const dateStr = k.replace(DAILY_CHECKLIST_KEY_PREFIX, '');
            return dateStr < cutoffStr;
        });

        if (keysToDelete.length > 0) {
            await AsyncStorage.multiRemove(keysToDelete);
            log.info(`Cleaned up ${keysToDelete.length} old progress entries`);
        }
    } catch (error) {
        log.error('Error cleaning up old progress:', error);
    }
};

/**
 * Get historical data for statistics
 * @param days Number of days to look back (default 30)
 */
export const getHistoricalData = async (days: number = 30) => {
    try {
        const keys = await AsyncStorage.getAllKeys();
        const checklistKeys = keys.filter(k => k.startsWith(DAILY_CHECKLIST_KEY_PREFIX)).sort();

        const today = new Date();
        const cutoffDate = new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
        const cutoffStr = format(cutoffDate, 'yyyy-MM-dd');

        const relevantKeys = checklistKeys.filter(k => {
            const dateStr = k.replace(DAILY_CHECKLIST_KEY_PREFIX, '');
            return dateStr >= cutoffStr;
        });

        const stats = {
            dates: [] as string[],
            completionRates: [] as number[],
            hydration: [] as number[],
            vitamins: [] as number[]
        };

        // F-HS-02-REGR: source today's hydration from the REAL water tracker.
        // hydrationService persists only the current day's intake (ml, daily-reset)
        // under 'hydration_data_v1' — this is what the big HydrationCard shows.
        // Past days have no real water history, so they report 0 rather than the
        // herbal-tea ('hyd') checklist value, which previously mislabeled cups of
        // tea as "liters of water".
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        let todayWaterLiters = 0;
        try {
            const water = await loadHydrationData();
            todayWaterLiters = (water.currentIntake || 0) / 1000;
        } catch (waterErr) {
            log.error('Error loading real water intake for stats:', waterErr);
        }

        for (const key of relevantKeys) {
            const dateStr = key.replace(DAILY_CHECKLIST_KEY_PREFIX, '');
            const dataStr = await AsyncStorage.getItem(key);
            if (!dataStr) continue;

            const items = JSON.parse(dataStr);

            // Calculate daily stats
            // F-HS-03 FIX: exclude SKIPPED tasks from both numerator and denominator.
            // The Tasks UI hides skipped items, so counting them in the denominator
            // under-reported the completion rate (a skipped task is not a missed task).
            const active = items.filter((i: any) => !i.skipped);
            const total = active.length;
            const completed = active.filter((i: any) => i.completed).length;
            const rate = total > 0 ? (completed / total) * 100 : 0;

            // F-HS-02-REGR: REAL water (liters) from hydrationService for today only.
            // The checklist 'hyd' item is herbal tea (rem_hyd_water is excluded from the
            // checklist), so it must NOT feed the "Hydration (L)" water chart.
            const hydrationLevel = dateStr === todayStr ? todayWaterLiters : 0;

            // Vitamins (assuming id contains 'vitamin')
            const vitaminItem = items.find((i: any) => i.id.includes('vitamin'));
            const vitaminTaken = vitaminItem ? (vitaminItem.completed ? 1 : 0) : 0;

            stats.dates.push(dateStr);
            stats.completionRates.push(Math.round(rate));
            stats.hydration.push(hydrationLevel);
            stats.vitamins.push(vitaminTaken);
        }

        return stats;
    } catch (error) {
        log.error('Error getting historical data:', error);
        return { dates: [], completionRates: [], hydration: [], vitamins: [] };
    }
};
