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
import { DailyChecklistItem, UserEvent, UserTask } from '../types';
import { createLogger } from '../utils/logger';
import { isOnLocalDay, toLocalDateKey } from '../utils/localDate';
import {
    getRemindersForTasksTab,
    loadUserSettings,
    getAvailableReminders
} from './remindersV2Service';
import { ReminderDefinition, ReminderUserSetting } from '../types/remindersV2';
import { getLocalizedTrilang } from '../utils/i18nHelpers';
import { MedicalFlags, toContextUserFlags } from '../utils/medicalFlags';
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
    locale: string = 'fr',
    medicalFlags?: MedicalFlags | null
): Promise<DailyChecklistItem[]> => {
    log.info('Generating daily checklist', { pregnancyWeek, userId: userId || 'guest' });

    const items: DailyChecklistItem[] = [];
    const todayStr = toLocalDateKey();

    // 1. Appointments for today. event.date is a UTC ISO instant: comparing its first ten
    // characters with the local day dropped an appointment whose UTC day differs (an
    // evening one in New York, a morning one east of UTC+12).
    const todayAppointments = userEvents.filter(event => isOnLocalDay(event.date, todayStr));

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

        // Build context profile for filtering. The flags come from the caller's
        // user profile — passing `{}` here, as this did for the life of the
        // feature, made every condition-keyed rule in the catalogue inert.
        const profile = buildContextProfile(pregnancyWeek, toContextUserFlags(medicalFlags));

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

// ============================================
// "MA JOURNÉE" — ONE LIST FOR HOME AND TASKS
// ============================================

const toTaskDate = (value: unknown): Date =>
    value instanceof Date ? value
        : (value && typeof (value as any).toDate === 'function') ? (value as any).toDate()
            : new Date(value as any);

/**
 * Today's "Ma Journée" list: the generated checklist (appointments + reminders, with the
 * saved progress already merged) plus the user's own tasks that are due today, sorted by
 * time then priority, skipped items removed. The Tasks tab lists exactly these items and
 * the Home pill counts them, so the two can no longer disagree (Home used to drop today's
 * appointments and keep skipped items, and showed 1/2 while Tasks showed 1 of 3).
 */
export const buildMyDayItems = (
    checklist: DailyChecklistItem[],
    userTasks: UserTask[],
    now: Date = new Date(),
    tomorrowLabel: string = ''
): DailyChecklistItem[] => {
    const todayStr = format(now, 'yyyy-MM-dd');

    const taskItems: DailyChecklistItem[] = userTasks.flatMap(task => {
        let subtitle: string | undefined;
        let sortTimestamp = now.getTime();
        let shouldShowToday = true;
        let isCompletedToday = task.completed;

        if (task.recurrence) {
            const rule = task.recurrence;
            if (rule.type === 'specific_days' && rule.days) {
                shouldShowToday = rule.days.includes(now.getDay());
            } else if (rule.type === 'interval' && rule.interval && task.created_at) {
                const createdDate = toTaskDate(task.created_at);
                const diffDays = Math.floor(Math.abs(now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
                shouldShowToday = diffDays % rule.interval === 0;
            }
            if (shouldShowToday) {
                isCompletedToday = task.completed_dates ? task.completed_dates.includes(todayStr) : false;
            }
        }
        // A one-off task stays on the list until it is done (it is today's to-do), whatever
        // its reminder day — the statistics count it the same way (taskStatsByDay).

        if (!shouldShowToday) return [];

        let slotTime: string | undefined;
        if (task.reminder_time) {
            const date = toTaskDate(task.reminder_time);
            if (!isNaN(date.getTime())) {
                sortTimestamp = date.getTime();
                slotTime = format(date, 'HH:mm');
                const tomorrow = new Date(now);
                tomorrow.setDate(now.getDate() + 1);
                if (format(date, 'yyyy-MM-dd') === todayStr) {
                    subtitle = slotTime;
                } else if (format(date, 'yyyy-MM-dd') === format(tomorrow, 'yyyy-MM-dd')) {
                    subtitle = `${tomorrowLabel} ${slotTime}`.trim();
                } else {
                    subtitle = format(date, 'dd/MM HH:mm');
                }
            }
        }

        return [{
            id: task.task_id,
            type: 'custom' as const,
            title: task.title,
            subtitle,
            completed: !!isCompletedToday,
            icon: task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢',
            priority: task.priority === 'high' ? 0 : task.priority === 'medium' ? 50 : 100,
            slotTime,
            reminderId: undefined,
            sortTimestamp
        }];
    });

    // Checklist items are for today: they sort on their slot time, else on "now".
    const checklistWithSort = checklist.map(item => {
        let time = now.getTime();
        if (item.slotTime) {
            const [h, m] = item.slotTime.split(':').map(Number);
            const d = new Date(now);
            d.setHours(h, m, 0, 0);
            time = d.getTime();
        }
        return { ...item, sortTimestamp: time };
    });

    return [...checklistWithSort, ...taskItems]
        .sort((a, b) => {
            const timeA = a.sortTimestamp || 0;
            const timeB = b.sortTimestamp || 0;
            if (Math.abs(timeA - timeB) > 60000) return timeA - timeB;
            return a.priority - b.priority;
        })
        .filter(item => !item.skipped);
};

/** Done / total for a "Ma Journée" list — the Home pill and the Tasks percentage. */
export const myDayProgress = (items: DailyChecklistItem[]): { done: number; total: number } => ({
    done: items.filter(item => item.completed
        || (item.type === 'hydration' && item.current !== undefined && item.target !== undefined && item.current >= item.target)).length,
    total: items.length,
});

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
 * Per local day, the user's own tasks as [done, total] for the statistics: a one-off task
 * counts on the day it was completed, a recurring one on each day in completed_dates, and
 * today also carries the one-off tasks still open (they are on today's list).
 */
export const taskStatsByDay = (tasks: UserTask[], todayStr: string = toLocalDateKey()): Record<string, [number, number]> => {
    const byDay: Record<string, [number, number]> = {};
    const add = (day: string, done: boolean) => {
        const entry = byDay[day] ?? (byDay[day] = [0, 0]);
        if (done) entry[0] += 1;
        entry[1] += 1;
    };
    for (const task of tasks) {
        if (task.recurrence) {
            for (const day of task.completed_dates ?? []) add(day, true);
        } else if (task.completed) {
            const at = task.completed_at ? new Date(task.completed_at as any) : null;
            add(at && !isNaN(at.getTime()) ? toLocalDateKey(at) : todayStr, true);
        } else {
            add(todayStr, false);
        }
    }
    return byDay;
};

/**
 * Get historical data for statistics
 * @param days Number of days to look back (default 30)
 * @param tasks The user's own tasks (server-backed). The checklist progress kept on the
 *   device only covers reminders and appointments, so completing a task still showed
 *   "Pas encore de données" — and a fresh install showed nothing at all.
 */
export const getHistoricalData = async (days: number = 30, tasks: UserTask[] = []) => {
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

        const checklistByDay: Record<string, any[]> = {};
        for (const key of relevantKeys) {
            const dataStr = await AsyncStorage.getItem(key);
            if (dataStr) checklistByDay[key.replace(DAILY_CHECKLIST_KEY_PREFIX, '')] = JSON.parse(dataStr);
        }
        const tasksByDay = taskStatsByDay(tasks, todayStr);
        const allDays = new Set([
            ...Object.keys(checklistByDay),
            ...Object.keys(tasksByDay).filter((day) => day >= cutoffStr && day <= todayStr),
        ]);

        for (const dateStr of [...allDays].sort()) {
            const items = checklistByDay[dateStr] ?? [];
            const [tasksDone, tasksTotal] = tasksByDay[dateStr] ?? [0, 0];

            // Calculate daily stats
            // F-HS-03 FIX: exclude SKIPPED tasks from both numerator and denominator.
            // The Tasks UI hides skipped items, so counting them in the denominator
            // under-reported the completion rate (a skipped task is not a missed task).
            const active = items.filter((i: any) => !i.skipped);
            const total = active.length + tasksTotal;
            const completed = active.filter((i: any) => i.completed).length + tasksDone;
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
