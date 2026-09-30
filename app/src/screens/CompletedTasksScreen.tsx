import { createLogger } from '../utils/logger';
const log = createLogger('CompletedTasksScreen');
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { confirmAction } from '../utils/uiUtils';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { getUserTasks, updateTaskStatus, deleteTask } from '../services/taskService';
import { UserTask } from '../types';
import { format } from 'date-fns';
import { useToast } from '../context/ToastContext';
import { useDateLocale } from '../hooks/useDateLocale';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

/**
 * CompletedTasksScreen - Dedicated screen for completed tasks
 * Shows all tasks marked as completed with options to restore or delete permanently
 */
export const CompletedTasksScreen = () => {
    useScreenAnalytics('CompletedTasksScreen');
    const { user } = useAuth();
    const navigation = useNavigation();
    const { t } = useTranslation();
    const [completedTasks, setCompletedTasks] = useState<UserTask[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const dateLocale = useDateLocale();

    log.debug('[CompletedTasksScreen] Rendering...');

    useEffect(() => {
        loadCompletedTasks();
    }, [user]);

    const loadCompletedTasks = async () => {
        if (!user?.uid) return;

        log.debug('[CompletedTasksScreen] Loading completed tasks...');
        setLoading(true);

        try {
            const allTasks = await getUserTasks(user.uid);
            const completed = allTasks.filter(t => t.completed);
            setCompletedTasks(completed);
            log.debug('[CompletedTasksScreen] ✅ Loaded', completed.length, 'completed tasks');
        } catch (error) {
            log.error('[CompletedTasksScreen] ❌ Error loading tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (taskId: string, title: string) => {
        log.debug('[CompletedTasksScreen] Restoring task:', taskId);

        try {
            // 1. Optimistic update
            setCompletedTasks(prev => prev.filter(t => t.task_id !== taskId));

            // 2. Perform update
            await updateTaskStatus(taskId, false);

            // 3. Show success
            showToast(t('common.taskRestored'), 'success');
            log.debug('[CompletedTasksScreen] ✅ Task restored');

            // 4. Navigate back after a short delay to allow toast to be seen
            setTimeout(() => {
                navigation.goBack();
            }, 500);
        } catch (error) {
            log.error('[CompletedTasksScreen] ❌ Error restoring task:', error);
            showToast(t('common.taskRestoreError'), 'error');
            // Revert optimistic update
            loadCompletedTasks();
        }
    };

    const handleDelete = async (taskId: string, title: string) => {
        log.debug('[CompletedTasksScreen] Deleting task permanently:', taskId);

        confirmAction(
            t('common.deleteForever'),
            t('common.deleteForeverConfirm', { title }),
            async () => {
                try {
                    // Optimistic update
                    setCompletedTasks(prev => prev.filter(t => t.task_id !== taskId));

                    await deleteTask(taskId);
                    showToast(t('common.taskDeleted'), 'info');
                    log.debug('[CompletedTasksScreen] ✅ Task deleted permanently');
                } catch (error) {
                    log.error('[CompletedTasksScreen] ❌ Error deleting task:', error);
                    showToast(t('common.taskDeleteError'), 'error');
                }
            },
            undefined,
            t('ui.cancel'),
            t('ui.confirm')
        );
    };

    const getPriorityLabel = (priority: string): string => {
        switch (priority) {
            case 'high': return t('common.priorityHigh');
            case 'medium': return t('common.priorityMedium');
            case 'low': return t('common.priorityLow');
            default: return priority;
        }
    };

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={theme.colors.accent} />
                <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
        );
    }

    if (completedTasks.length === 0) {
        return (
            <View style={styles.container}>
                <LinearGradient
                    colors={[theme.colors.primaryStrong, theme.colors.accent]}
                    style={styles.headerGradient}
                >
                    <Text style={styles.headerTitle}>✓ {t('common.completedTasks')}</Text>
                    <Text style={styles.headerSubtitle}>{t('common.taskCount', { count: 0 })}</Text>
                </LinearGradient>

                <View style={styles.centerContainer}>
                    <Text style={styles.emptyEmoji}>📋</Text>
                    <Text style={styles.emptyTitle}>{t('common.noCompletedTasks')}</Text>
                    <Text style={styles.emptyText}>
                        {t('common.completedTasksAppearHere')}
                    </Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={[theme.colors.primaryStrong, theme.colors.accent]}
                style={styles.headerGradient}
            >
                <Text style={styles.headerTitle}>✓ {t('common.completedTasks')}</Text>
                <Text style={styles.headerSubtitle}>{t('common.taskCount', { count: completedTasks.length })}</Text>
            </LinearGradient>

            <ScrollView style={styles.scrollView}>
                {completedTasks.map(task => (
                    <View key={task.task_id} style={styles.taskCard}>
                        <View style={styles.taskHeader}>
                            <View style={styles.taskInfo}>
                                <Text style={styles.taskTitle}>✓ {task.title}</Text>
                                <Text style={styles.taskMeta}>
                                    {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢'}
                                    {' '}{t('common.priority')}: {getPriorityLabel(task.priority)}
                                </Text>
                                {task.completed_at && (
                                    <Text style={styles.completedDate}>
                                        {t('common.completedOn', { date: format(task.completed_at, 'dd MMMM yyyy', { locale: dateLocale }) })}
                                    </Text>
                                )}
                            </View>
                        </View>

                        <View style={styles.taskActions}>
                            <TouchableOpacity
                                style={styles.restoreButton}
                                onPress={() => handleRestore(task.task_id, task.title)}
                            >
                                <Text style={styles.restoreButtonText}>↩️ {t('common.restore')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.deleteButton}
                                onPress={() => handleDelete(task.task_id, task.title)}
                            >
                                <Text style={styles.deleteButtonText}>🗑️ {t('common.delete')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.neutral100,
    },
    headerGradient: {
        paddingTop: 60,
        paddingBottom: 20,
        paddingHorizontal: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.colors.white,
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 16,
        color: theme.colors.white,
        opacity: 0.9,
    },
    scrollView: {
        flex: 1,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: theme.colors.textSecondary,
    },
    emptyEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: theme.colors.neutral900,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyText: {
        fontSize: 15,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        lineHeight: 22,
    },
    taskCard: {
        backgroundColor: theme.colors.white,
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 12,
        padding: 16,
        shadowColor: theme.colors.black,
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    taskHeader: {
        marginBottom: 12,
    },
    taskInfo: {
        flex: 1,
    },
    taskTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.neutral900,
        marginBottom: 6,
        textDecorationLine: 'line-through',
        opacity: 0.7,
    },
    taskMeta: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginBottom: 4,
    },
    completedDate: {
        fontSize: 12,
        color: theme.colors.textMuted,
        fontStyle: 'italic',
    },
    taskActions: {
        flexDirection: 'row',
        gap: 12,
    },
    restoreButton: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.green500,
        alignItems: 'center',
    },
    restoreButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.success,
    },
    deleteButton: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.red600,
        alignItems: 'center',
    },
    deleteButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.red600,
    },
});
