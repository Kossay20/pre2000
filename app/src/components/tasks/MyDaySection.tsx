/**
 * MyDaySection V2
 * 
 * Displays daily checklist with:
 * - Appointments from calendar
 * - Enabled reminders from Reminders V2 (source_ui: both_but_single_entry)
 * - Local progress tracking with AsyncStorage
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { format } from 'date-fns';
import { showAlert } from '../../utils/alert';
import { confirmAction } from '../../utils/uiUtils';
import { useDateLocale } from '../../hooks/useDateLocale';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';
import { theme } from '../../theme';
import { getShadowStyle } from '../../utils/styleUtils';
import { DailyChecklistItem, UserEvent, UserTask } from '../../types';
import {
    generateDailyChecklist,
    loadDailyProgress,
    saveDailyProgress,
    cleanupOldProgress
} from '../../services/dailyChecklistService';
import { updateTaskStatus } from '../../services/taskService';
import { usePregnancy } from '../../context/PregnancyContext';
import { useAuth } from '../../context/AuthContext';
import { createLogger } from '../../utils/logger';

const log = createLogger('MyDaySection');

interface Props {
    userEvents: UserEvent[];
    userTasks: UserTask[];
    highlightReminderId?: string | null;
    onToggleTask?: (taskId: string, completed: boolean) => void;
    onEditTask?: (taskId: string) => void;
    onDeleteTask?: (taskId: string) => void;
}

export const MyDaySection: React.FC<Props> = React.memo(({
    userEvents,
    userTasks,
    highlightReminderId,
    onToggleTask,
    onEditTask,
    onDeleteTask
}) => {
    const { pregnancyInfo } = usePregnancy();
    const { user } = useAuth();
    const { t } = useTranslation();
    const dateLocale = useDateLocale();
    const [items, setItems] = useState<DailyChecklistItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
        cleanupOldProgress(); // Cleanup old entries
    }, [userEvents, userTasks, pregnancyInfo, user?.uid]);

    const loadData = async () => {
        const week = pregnancyInfo?.week ?? 1; // Default to week 1 for guests

        setLoading(true);

        try {
            // 1. Generate items from appointments + enabled reminders
            const generatedReminders = await generateDailyChecklist(
                userEvents,
                week,
                user?.uid,
                i18n.language
            );

            // 2. Load saved progress for reminders
            const mergedReminders = await loadDailyProgress(generatedReminders);

            // 3. Convert UserTasks to DailyChecklistItem format
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const now = new Date();

            const taskItems: DailyChecklistItem[] = userTasks.flatMap(task => {
                let subtitle = undefined;
                let sortTimestamp = now.getTime(); // Default to now for sorting if no time

                // --- Evaluate Recurrence ---
                let shouldShowToday = true;
                let isCompletedToday = task.completed;

                if (task.recurrence) {
                    const rule = task.recurrence;
                    const dayOfWeek = now.getDay();

                    if (rule.type === 'specific_days' && rule.days) {
                        shouldShowToday = rule.days.includes(dayOfWeek);
                    } else if (rule.type === 'interval' && rule.interval) {
                        // Calculate days since created
                        if (task.created_at) {
                            // created_at can be Firestore Timestamp or Date string
                            const createdDate = task.created_at instanceof Date ? task.created_at :
                                (task.created_at && typeof (task.created_at as any).toDate === 'function') ? (task.created_at as any).toDate() :
                                    new Date(task.created_at as any);

                            const diffTime = Math.abs(now.getTime() - createdDate.getTime());
                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                            shouldShowToday = diffDays % rule.interval === 0;
                        } else {
                            shouldShowToday = true;
                        }
                    } else if (rule.type === 'daily') {
                        shouldShowToday = true;
                    }

                    // Check completion for today
                    if (shouldShowToday) {
                        isCompletedToday = task.completed_dates ? task.completed_dates.includes(todayStr) : false;
                    }
                } else {
                    // One-off task. If it's completed and from yesterday, we might want to hide it
                    // but for now we follow the old logic and show all non-recurring tasks unless otherwise handled.
                }

                if (!shouldShowToday) return [];

                if (task.reminder_time) {
                    const date = task.reminder_time instanceof Date ? task.reminder_time :
                        (task.reminder_time && typeof (task.reminder_time as any).toDate === 'function') ? (task.reminder_time as any).toDate() :
                            new Date(task.reminder_time as any);

                    sortTimestamp = date.getTime();

                    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
                    const tomorrowDate = new Date(now);
                    tomorrowDate.setDate(now.getDate() + 1);
                    const isTomorrow = tomorrowDate.getDate() === date.getDate() && tomorrowDate.getMonth() === date.getMonth() && tomorrowDate.getFullYear() === date.getFullYear();

                    if (isToday) {
                        subtitle = format(date, 'HH:mm');
                    } else if (isTomorrow) {
                        // W4 #1: 'tomorrow' lives in the tasks namespace; common.tomorrow is undefined
                        // (was leaking the raw key in all 4 langs).
                        subtitle = `${t('tasks.modal.tomorrow')} ${format(date, 'HH:mm')}`;
                    } else {
                        subtitle = format(date, 'dd/MM HH:mm');
                    }
                }

                return [{
                    id: task.task_id,
                    type: 'custom',
                    title: task.title,
                    subtitle: subtitle,
                    completed: isCompletedToday,
                    icon: task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢',
                    priority: task.priority === 'high' ? 0 : task.priority === 'medium' ? 50 : 100,
                    slotTime: task.reminder_time ? format(new Date(task.reminder_time as any), 'HH:mm') : undefined,
                    reminderId: undefined,
                    sortTimestamp
                }];
            });

            // 4. Merge everything
            // For system reminders, we need to add sortTimestamp too
            const remindersWithSort = mergedReminders.map(r => {
                // System reminders are for "today"
                const now = new Date();
                let time = now.getTime();

                if (r.slotTime) {
                    const [h, m] = r.slotTime.split(':').map(Number);
                    const d = new Date();
                    d.setHours(h, m, 0, 0);
                    time = d.getTime();
                }

                return { ...r, sortTimestamp: time };
            });

            const allItems = [...remindersWithSort, ...taskItems];

            // 5. Sort by Date/Time then priority
            const sorted = allItems.sort((a, b) => {
                // Compare timestamps first (Date + Time)
                const timeA = a.sortTimestamp || 0;
                const timeB = b.sortTimestamp || 0;

                // If difference is significant (e.g. different days), sort by time
                // But actually, just sorting by timestamp handles both date and time!
                if (Math.abs(timeA - timeB) > 60000) { // If diff > 1 minute
                    return timeA - timeB;
                }

                // If same time (approx), sort by priority
                return a.priority - b.priority;
            });

            // Filter out skipped items
            const visibleItems = sorted.filter(i => !i.skipped);

            setItems(visibleItems);
            log.info(`Loaded ${visibleItems.length} unified items (hidden: ${sorted.length - visibleItems.length})`);
        } catch (error) {
            log.error('Error loading unified checklist:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleItem = async (id: string) => {
        log.debug('Toggling item:', id);

        // Find the item to know its type
        const itemToToggle = items.find(i => i.id === id);
        if (!itemToToggle) return;

        // Optimistic update
        const newItems = items.map(item => {
            if (item.id === id) {
                return { ...item, completed: !item.completed };
            }
            return item;
        });
        setItems(newItems);
        checkCompletion(newItems);

        if (itemToToggle.type === 'custom') {
            // Handle Manual Task
            if (onToggleTask) {
                onToggleTask(id, !itemToToggle.completed);
            } else {
                // Fallback if no callback provided
                await updateTaskStatus(id, !itemToToggle.completed);
            }
        } else {
            // Handle System Reminder
            // Save progress locally
            const reminderItems = newItems.filter(i => i.type !== 'custom');
            await saveDailyProgress(reminderItems);

            // Deep Sync
            if (itemToToggle.type === 'reminder' && itemToToggle.reminderId) {
                try {
                    const { markReminderAsCompleted } = require('../../services/remindersV2Service');
                    await markReminderAsCompleted(itemToToggle.reminderId, !itemToToggle.completed, user?.uid);
                } catch (error) {
                    log.error('Error syncing reminder completion:', error);
                }
            }
        }
    };

    const handleAddWater = async (id: string) => {
        log.debug('Adding water for item:', id);

        const newItems = items.map(item => {
            if (item.id === id && item.type === 'hydration') {
                const current = (item.current || 0) + 0.25; // +250ml
                const target = item.target || 2.0;
                const completed = current >= target;

                return {
                    ...item,
                    current,
                    completed,
                    subtitle: `${current.toFixed(2)}L / ${target}L`
                };
            }
            return item;
        });

        setItems(newItems);
        await saveDailyProgress(newItems);
        checkCompletion(newItems);
    };

    const checkCompletion = (currentItems: DailyChecklistItem[]) => {
        const allCompleted = currentItems.length > 0 && currentItems.every(i => i.completed);
        if (allCompleted) {
            log.info('All items completed! 🎉');
            setTimeout(() => {
                showAlert(t('common.success'), t('reminders.myDay.allDone'));
            }, 500);
        }
    };

    // Don't render if loading or no items
    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>{t('reminders.myDay.title')}</Text>
                </View>
                <Text style={styles.loadingText}>{t('reminders.myDay.loading')}</Text>
            </View>
        );
    }

    if (items.length === 0) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <Text style={styles.title}>{t('reminders.myDay.title')}</Text>
                    <Text style={styles.date}>
                        {format(new Date(), 'EEEE d MMMM', { locale: dateLocale }).replace(/^\w/, c => c.toUpperCase())}
                    </Text>
                </View>
                <Text style={styles.emptyText}>
                    {t('reminders.myDay.emptyTitle')}{'\n'}
                    {t('reminders.myDay.emptyMsg')}
                </Text>
            </View>
        );
    }

    const completedCount = items.filter(i => i.completed).length;
    const progress = items.length > 0 ? completedCount / items.length : 0;

    const handleSkipItem = async (id: string) => {
        log.debug('Skipping item:', id);

        // Optimistic update
        const newItems = items.map(item => {
            if (item.id === id) {
                return { ...item, skipped: true };
            }
            return item;
        });

        // Filter out skipped items immediately for UI
        const visibleItems = newItems.filter(i => !i.skipped);
        setItems(visibleItems);

        // Save progress (including skipped status)
        const itemsToSave = items.map(item =>
            item.id === id ? { ...item, skipped: true } : item
        );

        await saveDailyProgress(itemsToSave);

        // Now update local state to remove it
        setItems(items.filter(i => i.id !== id));
    };

    return (
        <View style={styles.container}>
            {/* Header Section */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>{t('reminders.myDay.title')}</Text>
                    <Text style={styles.date}>
                        {format(new Date(), 'EEEE d MMMM', { locale: dateLocale }).replace(/^\w/, c => c.toUpperCase())}
                    </Text>
                </View>
                <View style={styles.progressContainer}>
                    <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
                    <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
                    </View>
                </View>
            </View>

            {/* Tasks List */}
            <View style={styles.listContainer}>
                {items.map((item, index) => {
                    const isHighlighted = highlightReminderId && item.reminderId === highlightReminderId;
                    const displayTime = item.slotTime || (item.subtitle?.match(/^\d{2}:\d{2}$/) ? item.subtitle : null);

                    return (
                        <View
                            key={item.id}
                            style={[
                                styles.card,
                                item.completed && styles.cardCompleted,
                                isHighlighted && styles.cardHighlighted,
                                { zIndex: items.length - index }
                            ]}
                        >
                            <TouchableOpacity
                                style={styles.cardContent}
                                onPress={() => handleToggleItem(item.id)}
                                activeOpacity={0.7}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: item.completed }}
                                accessibilityLabel={item.title}
                            >
                                <View style={[styles.checkbox, item.completed && styles.checkboxChecked]}>
                                    {item.completed && <Text style={styles.checkmark}>✓</Text>}
                                </View>

                                <View style={styles.textContainer}>
                                    <View style={styles.titleRow}>
                                        <Text style={styles.icon}>{item.icon}</Text>
                                        <Text style={[styles.itemTitle, item.completed && styles.itemTitleCompleted]}>
                                            {item.title}
                                        </Text>
                                    </View>

                                    {/* Time Badge or Subtitle */}
                                    <View style={styles.metaRow}>
                                        {displayTime && (
                                            <View style={styles.timeBadge}>
                                                <Text style={styles.timeText}>⏰ {displayTime}</Text>
                                            </View>
                                        )}
                                        {item.subtitle && item.subtitle !== displayTime && (
                                            <Text style={styles.itemSubtitle}>{item.subtitle}</Text>
                                        )}
                                    </View>
                                </View>
                            </TouchableOpacity>

                            {/* Actions */}
                            <View style={styles.actionsContainer}>
                                {item.type === 'custom' && (
                                    <TouchableOpacity
                                        style={styles.actionIcon}
                                        onPress={() => onEditTask && onEditTask(item.id)}
                                    >
                                        <Text style={{ fontSize: 16 }}>✏️</Text>
                                    </TouchableOpacity>
                                )}

                                <TouchableOpacity
                                    style={styles.actionIcon}
                                    onPress={() => {
                                        if (item.type === 'custom') {
                                            onDeleteTask && onDeleteTask(item.id);
                                        } else {
                                            // For reminders/appointments: Skip for today
                                            confirmAction(
                                                t('reminders.myDay.hideTodayTitle'),
                                                t('reminders.myDay.hideTodayMsg'),
                                                () => handleSkipItem(item.id),
                                                undefined,
                                                t('reminders.myDay.cancel'),
                                                t('reminders.myDay.hide')
                                            );
                                        }
                                    }}
                                >
                                    <Text style={{ fontSize: 16 }}>🗑️</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Action for Hydration */}
                            {item.type === 'hydration' && !item.completed && (
                                <TouchableOpacity
                                    style={styles.actionButton}
                                    onPress={() => handleAddWater(item.id)}
                                >
                                    <Text style={styles.actionButtonText}>+ 250ml</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })}
            </View>

            {/* Footer / Summary */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>
                    {completedCount === items.length && items.length > 0
                        ? t('reminders.myDay.allDone')
                        : t('reminders.myDay.remainingTasks', { count: items.length - completedCount })}
                </Text>
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        marginBottom: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: theme.colors.neutral900,
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    date: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    progressContainer: {
        alignItems: 'flex-end',
        width: 100,
    },
    progressText: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.accent,
        marginBottom: 4,
    },
    progressBarBg: {
        width: '100%',
        height: 6,
        backgroundColor: theme.colors.borderLight,
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: theme.colors.primary,
        borderRadius: 3,
    },
    loadingText: {
        fontSize: 14,
        color: theme.colors.neutral400,
        textAlign: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 15,
        color: theme.colors.neutral350,
        textAlign: 'center',
        paddingVertical: 30,
        lineHeight: 24,
        backgroundColor: theme.colors.surfaceGrayStripe,
        borderRadius: 16,
        marginHorizontal: 4,
        borderWidth: 1,
        borderColor: theme.colors.neutral150,
        borderStyle: 'dashed',
    },
    listContainer: {
        gap: 12,
    },
    card: {
        backgroundColor: theme.colors.white,
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...getShadowStyle(4, theme.colors.black, 0.08, 8, { width: 0, height: 2 }),
        borderWidth: 1,
        borderColor: 'transparent',
    },
    cardCompleted: {
        opacity: 0.8,
        backgroundColor: theme.colors.neutral25,
        ...getShadowStyle(0, theme.colors.black, 0, 0, { width: 0, height: 0 }), // Remove shadow
        borderWidth: 1,
        borderColor: theme.colors.neutral150,
    },
    cardHighlighted: {
        backgroundColor: theme.colors.surfaceAmberTint, // Premium light gold/orange
        borderColor: theme.colors.surfacePeach,
        transform: [{ scale: 1.02 }],
    },
    cardContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: theme.colors.disabled,
        alignItems: 'center',
        justifyContent: 'center',
        marginEnd: 16,
        backgroundColor: theme.colors.white,
    },
    checkboxChecked: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    checkmark: {
        color: theme.colors.white,
        fontSize: 14,
        fontWeight: 'bold',
    },
    textContainer: {
        flex: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    icon: {
        fontSize: 18,
        marginEnd: 8,
    },
    itemTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.neutral900,
    },
    itemTitleCompleted: {
        textDecorationLine: 'line-through',
        color: theme.colors.gray500,
    },
    itemSubtitle: {
        fontSize: 13,
        color: theme.colors.neutral350,
        marginTop: 2,
    },
    actionButton: {
        backgroundColor: theme.colors.surfaceBlueTint,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        marginStart: 12,
    },
    actionButtonText: {
        color: theme.colors.info,
        fontSize: 12,
        fontWeight: '700',
    },
    footer: {
        marginTop: 20,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 13,
        color: theme.colors.neutral400,
        fontWeight: '500',
        fontStyle: 'italic',
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 8,
    },
    timeBadge: {
        backgroundColor: theme.colors.surfacePinkTint, // Light pink
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    timeText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.accent,
    },
    actionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginStart: 8,
    },
    actionIcon: {
        padding: 8,
        marginStart: 4,
    },
});
