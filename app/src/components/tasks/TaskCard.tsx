import { theme } from '../../theme';
import { createLogger } from '../../utils/logger';
import { getShadowStyle } from '../../utils/styleUtils';
const log = createLogger('TaskCard');
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { usePregnancy } from '../../context/PregnancyContext';
import { useTranslation } from 'react-i18next';
import { WeeklyTask } from '../../types';
import { getLocalizedContent } from '../../utils/i18nHelpers';
import {
    loadTaskStatusesGuest,
    loadTaskStatusesAuth,
    saveTaskStatusGuest,
    saveTaskStatusAuth,
} from '../../services/reminderPersistence';

interface TaskCardProps {
    task: WeeklyTask;
}

export const TaskCard: React.FC<TaskCardProps> = React.memo(({ task }) => {
    const { user } = useAuth();
    const { t, i18n } = useTranslation();
    const { pregnancyInfo } = usePregnancy();
    const [completed, setCompleted] = useState(false);
    const [loading, setLoading] = useState(false);

    // Load saved status on mount
    useEffect(() => {
        loadStatus();
    }, [task.task_id, user]);

    const loadStatus = async () => {
        if (!pregnancyInfo) return;

        try {
            const statuses = user
                ? await loadTaskStatusesAuth(user.uid, pregnancyInfo.week)
                : await loadTaskStatusesGuest();

            const key = `${task.task_id}_w${pregnancyInfo.week}`;
            const saved = statuses[key];

            if (saved) {
                setCompleted(saved.completed);
            }
        } catch (error) {
            log.error('[TaskCard] Error loading status:', error);
        }
    };

    const handleToggle = async () => {
        if (!pregnancyInfo) return;

        const newStatus = !completed;
        setCompleted(newStatus); // Optimistic update
        setLoading(true);

        try {
            // Save to persistence
            if (user) {
                await saveTaskStatusAuth(user.uid, task.task_id, pregnancyInfo.week, newStatus);
            } else {
                await saveTaskStatusGuest(task.task_id, pregnancyInfo.week, newStatus);
            }
        } catch (error) {
            setCompleted(!newStatus); // Revert on error
            log.error('[TaskCard] Error toggling:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <TouchableOpacity
            style={[styles.taskCard, completed && styles.taskCardCompleted]}
            onPress={handleToggle}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: completed }}
            // react-native-web does not map accessibilityState.checked to aria-checked, so
            // a screen reader heard every weekly task as an unchecked checkbox.
            {...(Platform.OS === 'web' ? { 'aria-checked': completed } : {})}
            accessibilityLabel={getLocalizedContent(task, 'label', i18n.language) || t('tasks.suggestedTask')}
        >
            <View style={[styles.taskCheckbox, completed && styles.taskCheckboxCheckedContainer]}>
                {completed ? (
                    <Text style={styles.taskCheckboxChecked}>✓</Text>
                ) : (
                    <View style={styles.taskCheckboxEmpty} />
                )}
            </View>
            <View style={styles.taskContent}>
                <Text style={[styles.taskTitle, completed && styles.taskTitleCompleted]}>
                    {getLocalizedContent(task, 'label', i18n.language) || t('tasks.suggestedTask')}
                </Text>
            </View>
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    taskCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: theme.colors.white,
        borderRadius: 16,
        marginBottom: 12,
        ...getShadowStyle(4, theme.colors.black, 0.08, 8, { width: 0, height: 2 }),
        borderWidth: 1,
        borderColor: 'transparent',
    },
    taskCardCompleted: {
        opacity: 0.8,
        backgroundColor: theme.colors.neutral25,
        ...getShadowStyle(0, theme.colors.black, 0, 0, { width: 0, height: 0 }),
        borderWidth: 1,
        borderColor: theme.colors.neutral150,
    },
    taskCheckbox: {
        width: 24,
        height: 24,
        marginEnd: 16,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.white,
        borderWidth: 2,
        borderColor: theme.colors.disabled,
    },
    taskCheckboxCheckedContainer: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    taskCheckboxEmpty: {
        width: 0,
        height: 0,
    },
    taskCheckboxChecked: {
        fontSize: 14,
        fontWeight: 'bold',
        color: theme.colors.white,
    },
    taskContent: {
        flex: 1,
    },
    taskTitle: {
        fontSize: 16,
        color: theme.colors.neutral900,
        fontWeight: '600',
    },
    taskTitleCompleted: {
        textDecorationLine: 'line-through',
        color: theme.colors.textMuted,
    },
});
