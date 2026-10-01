/**
 * Reminders V2 Service
 * 
 * Load catalogue, manage user settings, apply context rules.
 * Single source of truth for reminder data.
 */

import { createLogger } from '../utils/logger';
import { parseLocalDateKey, toLocalDateKey } from '../utils/localDate';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

import {
    RemindersCatalogue,
    ReminderDefinition,
    ReminderUserSetting,
    ReminderCategory,
    ContextProfile,
    SourceUI,
} from '../types/remindersV2';
import { applyContextRules, buildContextProfile } from '../utils/contextMatcher';

// @ts-ignore - JSON import
import REMINDERS_V2_DATA from '../data/REMINDERS_V2.json';

const log = createLogger('RemindersV2Service');
const STORAGE_KEY_SETTINGS = 'reminders_v2_settings_guest';

// ============================================
// CATALOGUE ACCESS
// ============================================

let cachedCatalogue: RemindersCatalogue | null = null;

/**
 * Load the reminders catalogue (cached after first load)
 */
export function getCatalogue(): RemindersCatalogue {
    if (!cachedCatalogue) {
        cachedCatalogue = REMINDERS_V2_DATA as unknown as RemindersCatalogue;
    }
    return cachedCatalogue;
}

/**
 * Get all categories
 */
export function getCategories(): ReminderCategory[] {
    return getCatalogue().categories.sort((a, b) => a.order - b.order);
}

/**
 * Get all reminder definitions
 */
export function getAllReminders(): ReminderDefinition[] {
    return getCatalogue().reminders;
}

/**
 * Get a specific reminder definition by ID
 */
export function getReminderById(id: string): ReminderDefinition | undefined {
    return getCatalogue().reminders.find(r => r.id === id);
}

/**
 * Get reminders by source_ui filter
 */
export function getRemindersBySourceUI(sourceUI: SourceUI | SourceUI[]): ReminderDefinition[] {
    const sources = Array.isArray(sourceUI) ? sourceUI : [sourceUI];
    return getCatalogue().reminders.filter(r => sources.includes(r.source_ui));
}

/**
 * Get reminders for a specific category
 */
export function getRemindersByCategory(categoryId: string): ReminderDefinition[] {
    return getCatalogue().reminders.filter(r => r.category_id === categoryId);
}

/**
 * Get essential reminders (have essential_rank)
 * P0.1: Now context-aware - applies context_rules filtering
 */
export function getEssentialReminders(profile?: ContextProfile): ReminderDefinition[] {
    let essentials = getCatalogue().reminders
        .filter(r => r.ui?.essential_rank !== undefined)
        .filter(r => r.id !== 'rem_hyd_water') // Exclude legacy water reminder
        .sort((a, b) => (a.ui?.essential_rank || 99) - (b.ui?.essential_rank || 99));

    // Apply context rules if profile provided
    if (profile) {
        essentials = essentials.filter(reminder => {
            const ruleResult = applyContextRules(reminder, profile);
            return ruleResult !== null; // null means disabled by context
        });
    }

    return essentials;
}

/**
 * Get visible reminders for RemindersTab (exclude tasks_only)
 */
export function getRemindersForRemindersTab(): ReminderDefinition[] {
    return getRemindersBySourceUI(['reminders_only', 'both_but_single_entry'])
        .filter(r => r.id !== 'rem_hyd_water'); // Exclude legacy water reminder
}

/**
 * Get visible reminders for TasksTab (only both_but_single_entry essentials)
 */
export function getRemindersForTasksTab(): ReminderDefinition[] {
    return getRemindersBySourceUI('both_but_single_entry')
        .filter(r => r.ui?.essential_rank !== undefined)
        .filter(r => r.id !== 'rem_hyd_water'); // Exclude legacy water reminder
}

// ============================================
// CONTEXT FILTERING
// ============================================

/**
 * Filter reminders based on user's context profile
 * (e.g., hide fetal movement counter before week 24)
 */
/**
 * Reminders the catalogue offers for this profile.
 *
 * `keepEnabledIds` grandfathers anything the user has explicitly switched on. A
 * context rule decides what to OFFER; it must not take away a choice already
 * made. Without this, tightening a rule strands the user: remindersScheduler
 * honours the stored `enabled` flag and never consults the context rules, so the
 * notification keeps firing while the card that would switch it off has vanished
 * from the list. That is strictly worse than showing one row too many.
 */
export function getAvailableReminders(
    profile: ContextProfile,
    sourceUI?: SourceUI | SourceUI[],
    keepEnabledIds?: ReadonlySet<string>
): ReminderDefinition[] {
    let reminders = sourceUI
        ? getRemindersBySourceUI(sourceUI)
        : getRemindersForRemindersTab();

    return reminders.filter(reminder => {
        if (keepEnabledIds?.has(reminder.id)) return true;
        const ruleResult = applyContextRules(reminder, profile);
        return ruleResult !== null; // null means disabled
    });
}

// ============================================
// USER SETTINGS - GUEST MODE
// ============================================

async function loadSettingsGuest(): Promise<Record<string, ReminderUserSetting>> {
    try {
        const data = await AsyncStorage.getItem(STORAGE_KEY_SETTINGS);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        log.error('Error loading guest settings:', error);
        return {};
    }
}

async function saveSettingsGuest(settings: Record<string, ReminderUserSetting>): Promise<void> {
    try {
        await AsyncStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (error) {
        log.error('Error saving guest settings:', error);
    }
}

// ============================================
// USER SETTINGS - AUTHENTICATED MODE
// ============================================

async function loadSettingsAuth(userId: string): Promise<Record<string, ReminderUserSetting>> {
    try {
        const q = query(
            collection(db, 'reminder_settings_v2'),
            where('user_id', '==', userId)
        );
        const snapshot = await getDocs(q);
        const settings: Record<string, ReminderUserSetting> = {};
        snapshot.forEach(doc => {
            const data = doc.data() as ReminderUserSetting;
            settings[data.reminder_id] = data;
        });
        return settings;
    } catch (error) {
        log.error('Error loading auth settings:', error);
        return {};
    }
}

async function saveSettingAuth(userId: string, setting: ReminderUserSetting): Promise<void> {
    try {
        const docId = `${userId}_${setting.reminder_id}`;
        // Filter out undefined values - Firestore doesn't accept undefined
        const cleanedSetting = Object.fromEntries(
            Object.entries(setting).filter(([_, value]) => value !== undefined)
        );
        await setDoc(doc(db, 'reminder_settings_v2', docId), cleanedSetting);
    } catch (error) {
        log.error('Error saving auth setting:', error);
    }
}

// ============================================
// PUBLIC API - USER SETTINGS
// ============================================

/**
 * Load all user's reminder settings
 */
export async function loadUserSettings(userId?: string): Promise<Record<string, ReminderUserSetting>> {
    if (!userId || userId.startsWith('guest_')) {
        return loadSettingsGuest();
    }
    return loadSettingsAuth(userId);
}

/**
 * Get a specific user setting, or create default if not exists
 */
export async function getUserSetting(
    reminderId: string,
    userId?: string
): Promise<ReminderUserSetting | null> {
    const settings = await loadUserSettings(userId);
    return settings[reminderId] || null;
}

/**
 * Enable a reminder with default or specified intensity
 */
export async function enableReminder(
    reminderId: string,
    userId: string | undefined,
    intensity?: number
): Promise<ReminderUserSetting | null> {
    const definition = getReminderById(reminderId);
    if (!definition) {
        log.error('Reminder not found:', reminderId);
        return null;
    }

    const chosenIntensity = intensity ?? definition.intensity_options[0];
    const times = definition.preset_times[chosenIntensity] || [];
    const days = definition.preset_days?.[chosenIntensity];

    const setting: ReminderUserSetting = {
        reminder_id: reminderId,
        user_id: userId || 'guest',
        enabled: true,
        intensity: chosenIntensity,
        times,
        days,
        origin: 'preset',
        priority: 'normal',
        last_modified_at: new Date().toISOString(),
    };

    if (userId && !userId.startsWith('guest_')) {
        await saveSettingAuth(userId, setting);
    } else {
        const settings = await loadSettingsGuest();
        settings[reminderId] = setting;
        await saveSettingsGuest(settings);
    }

    return setting;
}

/**
 * Disable a reminder
 */
export async function disableReminder(
    reminderId: string,
    userId?: string
): Promise<void> {
    const setting = await getUserSetting(reminderId, userId);
    if (setting) {
        setting.enabled = false;
        setting.last_modified_at = new Date().toISOString();

        if (userId && !userId.startsWith('guest_')) {
            await saveSettingAuth(userId, setting);
        } else {
            const settings = await loadSettingsGuest();
            settings[reminderId] = setting;
            await saveSettingsGuest(settings);
        }
    }
}

/**
 * Update reminder intensity (applies preset times if origin=preset)
 */
export async function updateReminderIntensity(
    reminderId: string,
    newIntensity: number,
    userId?: string
): Promise<ReminderUserSetting | null> {
    const definition = getReminderById(reminderId);
    const setting = await getUserSetting(reminderId, userId);

    if (!definition || !setting) return null;

    setting.intensity = newIntensity;
    setting.last_modified_at = new Date().toISOString();

    // If origin is preset, update times/days to new preset
    if (setting.origin === 'preset') {
        setting.times = definition.preset_times[newIntensity] || setting.times;
        setting.days = definition.preset_days?.[newIntensity] || setting.days;
    }

    if (userId && !userId.startsWith('guest_')) {
        await saveSettingAuth(userId, setting);
    } else {
        const settings = await loadSettingsGuest();
        settings[reminderId] = setting;
        await saveSettingsGuest(settings);
    }

    return setting;
}

/**
 * Update reminder with custom times (sets origin to custom)
 */
export async function updateReminderCustom(
    reminderId: string,
    times: string[],
    days?: number[],
    userId?: string
): Promise<ReminderUserSetting | null> {
    const setting = await getUserSetting(reminderId, userId);
    if (!setting) return null;

    setting.times = times;
    if (days) setting.days = days;
    setting.origin = 'custom';
    setting.last_modified_at = new Date().toISOString();

    if (userId && !userId.startsWith('guest_')) {
        await saveSettingAuth(userId, setting);
    } else {
        const settings = await loadSettingsGuest();
        settings[reminderId] = setting;
        await saveSettingsGuest(settings);
    }

    return setting;
}

/**
 * Update reminder settings (intensity and/or times)
 * Used by ReminderEditModal
 */
export async function updateReminderSettings(
    reminderId: string,
    updates: { intensity?: number; times?: string[]; days?: number[] },
    userId?: string
): Promise<ReminderUserSetting | null> {
    let setting = await getUserSetting(reminderId, userId);
    if (!setting) {
        // Enable first if not exists
        setting = await enableReminder(reminderId, userId, updates.intensity);
        if (!setting) return null;
    }

    // Update intensity if provided
    if (updates.intensity !== undefined && updates.intensity !== setting.intensity) {
        setting.intensity = updates.intensity;
        // If using custom times, keep them; otherwise update to preset
        if (setting.origin === 'preset') {
            const definition = getReminderById(reminderId);
            if (definition) {
                setting.times = definition.preset_times[updates.intensity] || setting.times;
                setting.days = definition.preset_days?.[updates.intensity] || setting.days;
            }
        }
    }

    // Update times if provided
    if (updates.times !== undefined) {
        setting.times = updates.times;
        setting.origin = 'custom'; // Mark as custom since user modified times
    }

    // Update days if provided
    if (updates.days !== undefined) {
        setting.days = updates.days;
    }

    setting.last_modified_at = new Date().toISOString();

    if (userId && !userId.startsWith('guest_')) {
        await saveSettingAuth(userId, setting);
    } else {
        const settings = await loadSettingsGuest();
        settings[reminderId] = setting;
        await saveSettingsGuest(settings);
    }

    log.info(`Updated reminder settings: ${reminderId}`, updates);
    return setting;
}

/**
 * Initialize default enabled reminders for a new user
 */
export async function initializeDefaultReminders(userId?: string): Promise<void> {
    const defaultReminders = getAllReminders().filter(r => r.default_enabled);

    for (const reminder of defaultReminders) {
        await enableReminder(reminder.id, userId);
    }

    log.info(`Initialized ${defaultReminders.length} default reminders`);
}

/**
 * Mark a reminder as completed for today — NOTIF-06 FIX: real persistence.
 * Stores a list of ISO-date strings (YYYY-MM-DD) per reminder_id in AsyncStorage.
 * This enables streak calculation and prevents double-completion on the same day.
 */
const COMPLETION_STORAGE_KEY = 'reminders_v2_completions';

export async function markReminderAsCompleted(
    reminderId: string,
    completed: boolean = true,
    userId?: string
): Promise<void> {
    log.info(`Marking reminder ${reminderId} as ${completed ? 'completed' : 'incomplete'}`);

    try {
        // The LOCAL day (YYYY-MM-DD): the UTC day credited an evening completion in New York
        // to tomorrow, and the streak then broke.
        const today = toLocalDateKey();
        const storageKey = userId && !userId.startsWith('guest_')
            ? `${COMPLETION_STORAGE_KEY}_${userId}`
            : COMPLETION_STORAGE_KEY;

        const raw = await AsyncStorage.getItem(storageKey);
        const allCompletions: Record<string, string[]> = raw ? JSON.parse(raw) : {};

        if (!allCompletions[reminderId]) {
            allCompletions[reminderId] = [];
        }

        if (completed) {
            // Add today if not already present
            if (!allCompletions[reminderId].includes(today)) {
                allCompletions[reminderId].push(today);
                // Keep only last 90 days to avoid unbounded growth
                allCompletions[reminderId] = allCompletions[reminderId]
                    .sort()
                    .slice(-90);
            }
        } else {
            // Remove today
            allCompletions[reminderId] = allCompletions[reminderId].filter(d => d !== today);
        }

        await AsyncStorage.setItem(storageKey, JSON.stringify(allCompletions));
        log.info(`[RemindersV2] ✅ Completion saved for ${reminderId} on ${today}`);
    } catch (error) {
        log.error('[RemindersV2] ❌ Failed to persist completion:', error);
    }
}

/**
 * Get completion dates for a reminder (for streak calculation).
 * Returns sorted array of YYYY-MM-DD strings.
 */
export async function getReminderCompletions(
    reminderId: string,
    userId?: string
): Promise<string[]> {
    try {
        const storageKey = userId && !userId.startsWith('guest_')
            ? `${COMPLETION_STORAGE_KEY}_${userId}`
            : COMPLETION_STORAGE_KEY;

        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) return [];
        const allCompletions: Record<string, string[]> = JSON.parse(raw);
        return allCompletions[reminderId] || [];
    } catch (error) {
        log.error('[RemindersV2] ❌ Failed to load completions:', error);
        return [];
    }
}

/**
 * Calculate current streak (consecutive days) for a reminder.
 *
 * U-FIX-4: previous algorithm `diff === streak` broke after 2 days. The check should
 * be against the PREVIOUS calendar day relative to the cursor (always 1-day step),
 * not against the streak length. Streak survives if today OR yesterday is completed
 * (1-day grace period — common UX pattern, day not yet over for late completions).
 */
export function calculateStreak(completionDates: string[]): number {
    if (completionDates.length === 0) return 0;

    // Normalize input dates to midnight-day timestamps and dedupe via Set.
    const dayStamps = new Set<number>();
    for (const dateStr of completionDates) {
        // A bare YYYY-MM-DD is a local day; new Date() would read it as UTC midnight, which
        // is the previous local day west of UTC.
        const d = parseLocalDateKey(dateStr) ?? new Date(dateStr);
        if (Number.isNaN(d.getTime())) continue;
        d.setHours(0, 0, 0, 0);
        dayStamps.add(d.getTime());
    }
    if (dayStamps.size === 0) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let cursor = today.getTime();
    const ONE_DAY = 86400000;

    // Streak survives if today is checked, OR if yesterday was the last check (grace).
    if (!dayStamps.has(cursor)) {
        const yesterday = cursor - ONE_DAY;
        if (!dayStamps.has(yesterday)) return 0;
        cursor = yesterday;
    }

    let streak = 0;
    while (dayStamps.has(cursor)) {
        streak++;
        cursor -= ONE_DAY;
    }
    return streak;
}

// ============================================
// V1-MIGRATION: Task list from local JSON
// ============================================

/**
 * Fetch weekly tasks from local WEEKLY_TASKS.json (replaces V1 reminderService.fetchTasksForWeek).
 * Pure local — no Firestore dependency. Safe for guest + offline use.
 */
export const fetchTasksForWeekV2 = async (weekNumber: number): Promise<import('../types').WeeklyTask[]> => {
    try {
        const weeklyTasksData = require('../data/WEEKLY_TASKS.json');
        const allTasks: import('../types').WeeklyTask[] = weeklyTasksData.tasks || [];
        const tasksForWeek = allTasks.filter(
            (task: import('../types').WeeklyTask) =>
                task.week_min <= weekNumber && task.week_max >= weekNumber
        );
        const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
        tasksForWeek.sort(
            (a: import('../types').WeeklyTask, b: import('../types').WeeklyTask) =>
                priorityOrder[b.priority] - priorityOrder[a.priority]
        );
        return tasksForWeek;
    } catch (error) {
        log.error('[remindersV2Service] fetchTasksForWeekV2 error:', error);
        return [];
    }
};

/**
 * Fetch reminders + tasks for a week (replaces V1 reminderService.fetchWeekRemindersAndTasks).
 */
export const fetchWeekRemindersAndTasksV2 = async (weekNumber: number) => {
    const tasks = await fetchTasksForWeekV2(weekNumber);
    const reminders = getRemindersForRemindersTab();
    return { reminders, tasks };
};
