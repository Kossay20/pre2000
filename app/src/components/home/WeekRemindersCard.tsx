import { createLogger } from '../../utils/logger';
const log = createLogger('WeekRemindersCard');
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../theme';
import { useNavigation } from '@react-navigation/native';
import { getShadowStyle } from '../../utils/styleUtils';
import { fetchWeekRemindersAndTasksV2 } from '../../services/remindersV2Service';
import { ReminderDefinition } from '../../types/remindersV2';
import { WeeklyTask } from '../../types';
import { useTranslation } from 'react-i18next';
import { getLocalizedContent } from '../../utils/i18nHelpers';
import { getLocalizedTrilang } from '../../utils/i18nHelpers';

interface WeekRemindersCardProps {
    weekNumber: number;
    onViewAll?: () => void;
}

/**
 * WeekRemindersCard - Displays top reminders and tasks for the current week
 * Shows 2-3 items max with "Voir tout" button to navigate to full RemindersScreen
 */
export const WeekRemindersCard: React.FC<WeekRemindersCardProps> = ({
    weekNumber,
    onViewAll
}) => {
    const [reminders, setReminders] = useState<ReminderDefinition[]>([]);
    const [tasks, setTasks] = useState<WeeklyTask[]>([]);
    const [loading, setLoading] = useState(true);
    const { t, i18n } = useTranslation();

    log.debug('[WeekRemindersCard] Rendering for week:', weekNumber);

    useEffect(() => {
        const loadData = async () => {
            log.debug('[WeekRemindersCard] Loading data for week:', weekNumber);
            setLoading(true);

            try {
                const data = await fetchWeekRemindersAndTasksV2(weekNumber);

                // Take top 2 reminders and top 2 tasks (prioritized)
                setReminders(data.reminders.slice(0, 2));
                setTasks(data.tasks.slice(0, 2));

                log.debug('[WeekRemindersCard] Loaded:', {
                    reminders: data.reminders.length,
                    tasks: data.tasks.length,
                    showing_reminders: Math.min(2, data.reminders.length),
                    showing_tasks: Math.min(2, data.tasks.length),
                });
            } catch (error) {
                log.error('[WeekRemindersCard] Error loading data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [weekNumber]);

    // Don't render if no data
    if (!loading && reminders.length === 0 && tasks.length === 0) {
        log.debug('[WeekRemindersCard] No data, skipping render');
        return null;
    }

    if (loading) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={[theme.colors.surfaceOrangeTint, theme.colors.surfaceCreamWarm, theme.colors.white]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradient}
                >
                    <ActivityIndicator size="small" color={theme.colors.orangeDeepAccent} />
                </LinearGradient>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={[theme.colors.surfaceOrangeTint, theme.colors.surfaceCreamWarm, theme.colors.white]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
            >
                {/* Header with View All button */}
                <View style={styles.header}>
                    <View style={styles.titleRow}>
                        <Text style={styles.emoji}>⏰</Text>
                        <Text style={styles.title}>{t('reminders.card.weekTitle')}</Text>
                    </View>
                    {onViewAll && (
                        <TouchableOpacity onPress={onViewAll} style={styles.viewAllButton}>
                            <Text style={styles.viewAllText}>{t('reminders.card.viewAll')}</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Reminders */}
                {reminders.length > 0 && (
                    <View style={styles.section}>
                        {reminders.map((reminder, index) => (
                            <View key={reminder.id} style={styles.item}>
                                <View style={styles.iconContainer}>
                                    <Text style={styles.itemIcon}>🔔</Text>
                                </View>
                                <View style={styles.itemContent}>
                                    <Text style={styles.itemTitle}>
                                        {reminder.title
                                            ? (typeof reminder.title === 'string'
                                                ? reminder.title
                                                : getLocalizedTrilang(reminder.title as any, i18n.language))
                                            : reminder.id}
                                    </Text>
                                    {reminder.description && (
                                        <Text style={styles.itemDesc} numberOfLines={2}>
                                            {typeof reminder.description === 'string'
                                                ? reminder.description
                                                : getLocalizedTrilang(reminder.description as any, i18n.language)}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Tasks */}
                {tasks.length > 0 && (
                    <View style={[styles.section, reminders.length > 0 && { marginTop: 12 }]}>
                        {tasks.map((task, index) => (
                            <View key={task.task_id} style={styles.item}>
                                <View style={styles.iconContainer}>
                                    <Text style={styles.itemIcon}>
                                        {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                                    </Text>
                                </View>
                                <View style={styles.itemContent}>
                                    <Text style={styles.itemTitle}>{getLocalizedContent(task, 'label', i18n.language)}</Text>
                                    <Text style={styles.itemMeta}>
                                        {t('reminders.card.priorityLabel', {
                                            level: task.priority === 'high'
                                                ? t('reminders.card.priorityHigh')
                                                : task.priority === 'medium'
                                                    ? t('reminders.card.priorityMedium')
                                                    : t('reminders.card.priorityLow')
                                        })}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </LinearGradient>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginVertical: 12,
        marginHorizontal: 16,
        borderRadius: 16,
        overflow: 'hidden',
        ...getShadowStyle(3, theme.colors.black, 0.1, 4, { width: 0, height: 2 }),
    },
    gradient: {
        padding: 20,
    },
    header: {
        marginBottom: 16,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    emoji: {
        fontSize: 28,
        marginEnd: 10,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.deepOrange900,
        flex: 1,
    },
    viewAllButton: {
        alignSelf: 'flex-start',
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: theme.colors.orangeDeepAlpha10,
        borderRadius: 12,
    },
    viewAllText: {
        fontSize: 14,
        color: theme.colors.orangeDeepAccent,
        fontWeight: '600',
    },
    section: {
        gap: 12,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: theme.colors.whiteAlpha50,
        borderRadius: 12,
        padding: 12,
        borderStartWidth: 3,
        borderStartColor: theme.colors.primary,
    },
    iconContainer: {
        marginEnd: 12,
        marginTop: 2,
    },
    itemIcon: {
        fontSize: 20,
    },
    itemContent: {
        flex: 1,
    },
    itemTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: theme.colors.deepOrange900,
        marginBottom: 4,
    },
    itemDesc: {
        fontSize: 13,
        color: theme.colors.brownText800,
        lineHeight: 18,
        marginBottom: 4,
    },
    itemMeta: {
        fontSize: 12,
        color: theme.colors.textLight,
        fontStyle: 'italic',
    },
});
