import { createLogger } from '../../utils/logger';
const log = createLogger('TasksTab');
import React, { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { RtlAwareChevron } from '../../components/common/RtlAwareChevron';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { confirmAction } from '../../utils/uiUtils';
import { getShadowStyle } from '../../utils/styleUtils';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { navigationRef } from '../../navigation/navigationRef';
import { useAuth } from '../../context/AuthContext';
import { usePregnancy } from '../../context/PregnancyContext';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from 'react-i18next';
import { WeeklyTask, UserTask, RecurrenceRule } from '../../types';
// V1-MIGRATION: Replaced reminderService V1 (Firestore-coupled) with V2 local-JSON functions
import { fetchTasksForWeekV2 } from '../../services/remindersV2Service';
import { getUserTasks, createTask, updateTaskStatus, deleteTask, updateTask } from '../../services/taskService';
import { AddTaskModal } from '../../components/tasks/AddTaskModal';
import { TaskCard } from '../../components/tasks/TaskCard';
import { MyDaySection } from '../../components/tasks/MyDaySection';
import { loadUserEvents } from '../../services/calendarService';
import { UserEvent } from '../../types';
import { format, isSameDay } from 'date-fns';
import { useDateLocale } from '../../hooks/useDateLocale';
import { trackPositiveAction } from '../../services/inAppReviewService';
import { useScreenAnalytics } from '../../hooks/useScreenAnalytics';

export const TasksTab = () => {
    useScreenAnalytics('TasksTab');
    const { user, firebaseUser } = useAuth();
    const { pregnancyInfo } = usePregnancy();
    const navigation = useNavigation();
    const route = useRoute();
    const { t } = useTranslation();
    const dateLocale = useDateLocale();
    const [weeklyTasks, setWeeklyTasks] = useState<WeeklyTask[]>([]);
    const [userTasks, setUserTasks] = useState<UserTask[]>([]);
    const [userEvents, setUserEvents] = useState<UserEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingTask, setEditingTask] = useState<UserTask | undefined>(undefined);
    const { showToast } = useToast();
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await loadTasks();
        setRefreshing(false);
    }, [pregnancyInfo?.week, user]);

    const completedCount = userTasks.filter(t => t.completed).length;

    const [highlightReminderId, setHighlightReminderId] = useState<string | null>(null);

    // P-FIX (deep-link): Notification tap is handled by the global listener in App.tsx
    // (AppInitializer). It calls navigationRef.navigate('Rappels', { screen: 'TasksTab',
    // params: { highlightId } }) — even before TasksTab has ever been mounted. We just
    // read that param here on focus, flash the row, then clear the param so re-focusing
    // the tab manually doesn't re-trigger the highlight.
    const highlightIdParam = (route.params as { highlightId?: string } | undefined)?.highlightId;
    // Home's "+ Tâche" quick action lands here with action='add': open the new-task modal,
    // then clear the param so coming back to the tab later does not reopen it.
    const actionParam = (route.params as { action?: string } | undefined)?.action;

    useFocusEffect(
        React.useCallback(() => {
            if (actionParam === 'add') {
                setEditingTask(undefined);
                setShowAddModal(true);
                navigation.setParams({ action: undefined } as never);
            }
        }, [actionParam])
    );

    useFocusEffect(
        React.useCallback(() => {
            loadTasks();

            if (highlightIdParam) {
                log.info('Deep link to reminder:', highlightIdParam);
                setHighlightReminderId(highlightIdParam);
                const timer = setTimeout(() => setHighlightReminderId(null), 3000);
                navigation.setParams({ highlightId: undefined } as never);
                return () => clearTimeout(timer);
            }
        }, [pregnancyInfo?.week, user, highlightIdParam])
    );

    const loadTasks = async () => {
        if (!pregnancyInfo?.week) return;

        setLoading(true);

        try {
            // Load weekly tasks from Firestore
            // V1-MIGRATION: fetchTasksForWeekV2 reads WEEKLY_TASKS.json locally (no Firestore, works offline/guest)
            const taskReminders = await fetchTasksForWeekV2(pregnancyInfo.week);
            setWeeklyTasks(taskReminders);

            // Load user's custom tasks
            if (user?.uid && !user.isGuest) {
                const [userTasksData, eventsData] = await Promise.all([
                    getUserTasks(user.uid),
                    loadUserEvents(user.uid)
                ]);
                setUserTasks(userTasksData);
                setUserEvents(eventsData);
            }
        } catch (error) {
            log.error('[TasksTab] Error loading tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleTaskCreated = (newTask: UserTask) => {
        // Optimistic update: Add to list immediately
        setUserTasks(prev => [newTask, ...prev]);
        showToast(t('tasks.added'), 'success');
    };

    const handleToggleTask = async (taskId: string, completed: boolean) => {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        // Find the task to determine if it is recurring
        const task = userTasks.find(t => t.task_id === taskId);
        const isRecurring = !!task?.recurrence;

        // Optimistic update: Update UI immediately
        const previousTasks = [...userTasks];
        setUserTasks(prev => prev.map(t => {
            if (t.task_id === taskId) {
                if (isRecurring) {
                    let dates = t.completed_dates || [];
                    if (completed && !dates.includes(todayStr)) dates = [...dates, todayStr];
                    if (!completed) dates = dates.filter(d => d !== todayStr);
                    return { ...t, completed_dates: dates };
                } else {
                    return { ...t, completed };
                }
            }
            return t;
        }));

        try {
            await updateTaskStatus(taskId, completed, isRecurring, isRecurring ? todayStr : undefined);
            // Success: No action needed, UI is already correct
            if (completed) {
                trackPositiveAction('complete_task');
            }
        } catch (error) {
            log.error('[TasksTab] Error toggling task:', error);
            // Revert on failure
            setUserTasks(previousTasks);
            showToast(t('common.error'), 'error');
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        confirmAction(
            t('tasks.deleteTitle'),
            t('tasks.deleteConfirm'),
            async () => {
                try {
                    await deleteTask(taskId);
                    setUserTasks(prev => prev.filter(t => t.task_id !== taskId));
                } catch (error) {
                    log.error('[TasksTab] Error deleting task:', error);
                }
            },
            undefined,
            t('ui.cancel'),
            t('ui.confirm')
        );
    };

    const handleEditTask = (taskId: string) => {
        const taskToEdit = userTasks.find(t => t.task_id === taskId);
        if (taskToEdit) {
            setEditingTask(taskToEdit);
            setShowAddModal(true);
        } else {
            log.warn('Task not found for editing:', taskId);
        }
    };

    const handleUpdateTask = async (taskId: string, title: string, priority: 'high' | 'medium' | 'low', reminderTime?: Date, recurrence?: RecurrenceRule | null) => {
        try {
            await updateTask(taskId, title, priority, reminderTime, recurrence);
            setUserTasks(prev => prev.map(t =>
                t.task_id === taskId
                    ? { ...t, title, priority, reminder_time: reminderTime, recurrence: recurrence !== undefined ? (recurrence || undefined) : t.recurrence }
                    : t
            ));
            showToast(t('tasks.updated'), 'success');
        } catch (error) {
            log.error('[TasksTab] Error updating task:', error);
            showToast(t('common.error'), 'error');
        }
    };

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <Text>{t('common.loading')}</Text>
            </View>
        );
    }

    // if (userTasks.length === 0 && weeklyTasks.length === 0) {
    //     // Logic moved to main render to ensure MyDaySection is always visible
    // }

    return (
        <ScrollView
            style={styles.tabContainer}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        >
            {/* Header with Add Button */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>{t('tasks.title')}</Text>
                <TouchableOpacity
                    style={styles.addTaskButton}
                    onPress={() => {
                        setEditingTask(undefined);
                        setShowAddModal(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('tasks.newTask')}
                    accessibilityHint={t('a11y.addNew')}
                >
                    {/* A vector icon: the "➕" emoji painted dark grey on the accent fill. */}
                    <Ionicons name="add" size={18} color={theme.colors.white} />
                    <Text style={styles.addTaskButtonText}>{t('tasks.newTask')}</Text>
                </TouchableOpacity>
            </View>

            {/* My Day Section (Unified List) */}
            <MyDaySection
                userEvents={userEvents}
                userTasks={userTasks}
                highlightReminderId={highlightReminderId}
                onToggleTask={handleToggleTask}
                onEditTask={handleEditTask}
                onDeleteTask={handleDeleteTask}
            />

            {/* Statistics Link */}
            <TouchableOpacity
                style={styles.completedTasksLink}
                onPress={() => navigation.navigate('Statistics')}
                accessibilityRole="button"
                accessibilityLabel={t('tasks.viewStats')}
                accessibilityHint={t('a11y.openItem')}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 20, marginEnd: 12 }}>📊</Text>
                    <Text style={styles.completedTasksText}>
                        {t('tasks.viewStats')}
                    </Text>
                </View>
                <RtlAwareChevron direction="forward" size={22} color={theme.colors.textLight} />
            </TouchableOpacity>

            {/* Weekly Tasks */}
            {weeklyTasks.length > 0 && (
                <View style={styles.taskSection}>
                    <Text style={styles.sectionLabel}>{t('tasks.weeklyTasks')} ({weeklyTasks.length})</Text>
                    {weeklyTasks.map((task: WeeklyTask) => (
                        <TaskCard key={task.task_id} task={task} />
                    ))}
                </View>
            )}

            {/* Modal */}
            <AddTaskModal
                visible={showAddModal}
                onClose={() => {
                    setShowAddModal(false);
                    setEditingTask(undefined);
                }}
                onCreate={async (title, priority, reminderTime, recurrence) => {
                    const userId = user?.uid || firebaseUser?.uid;

                    if (!userId) {
                        log.warn('Cannot create task: User not authenticated');
                        showToast(t('tasks.loginRequired'), 'error');
                        return;
                    }

                    // Guest check
                    if (user?.isGuest) {
                        // WEB-ALERT: confirmAction fires onConfirm on web too (Alert.alert is a no-op there).
                        confirmAction(
                            t('tasks.modeGuestTitle'),
                            t('tasks.modeGuestMsg'),
                            // W4 #P2: route to the in-place GuestUpgrade (links the anonymous account
                            // via linkWithCredential → PRESERVES the guest's tasks), matching the
                            // appointment gate (NAV-01). Was navigate('AuthChoice') = a fresh register
                            // that orphaned the guest's data. navigationRef is depth-independent.
                            // @ts-ignore - cross-navigator deep link (same pattern as App.tsx routing)
                            () => navigationRef.navigate('Home', { screen: 'GuestUpgrade' }),
                            undefined,
                            t('common.cancel'),
                            t('tasks.createAccount')
                        );
                        return;
                    }

                    try {
                        log.info('Creating task:', { title, priority, hasReminder: !!reminderTime, hasRecurrence: !!recurrence });
                        if (editingTask) {
                            await handleUpdateTask(editingTask.task_id, title, priority, reminderTime, recurrence);
                        } else {
                            const newTask = await createTask(userId, title, priority, reminderTime, recurrence);
                            log.info('Task created successfully:', newTask.task_id);
                            handleTaskCreated(newTask);
                        }
                    } catch (error) {
                        log.error('Error creating/updating task:', error);
                        showToast(t('common.error'), 'error');
                        throw error; // Re-throw so AddTaskModal can handle it
                    }
                }}
                initialTask={editingTask ? {
                    title: editingTask.title,
                    priority: editingTask.priority,
                    reminderTime: editingTask.reminder_time,
                    recurrence: editingTask.recurrence
                } : undefined}
            />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    tabContainer: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    header: {
        padding: 20,
        backgroundColor: theme.colors.white,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.disabled,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    addTaskButton: {
        backgroundColor: theme.colors.accent,
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.m,
    },
    addTaskButtonText: {
        color: theme.colors.white,
        fontSize: 14,
        fontWeight: '600',
    },
    emptyEmoji: {
        fontSize: 64,
        marginBottom: 16,
        textAlign: 'center',
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: theme.colors.textMuted,
        textAlign: 'center',
    },
    completedTasksLink: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.white,
        marginHorizontal: 16,
        marginTop: 16,
        padding: 14,
        borderRadius: 10,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    completedTasksText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    taskSection: {
        marginTop: 24,
        marginHorizontal: 16,
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.textMuted,
        letterSpacing: 0.5,
        marginBottom: 12,
    },
    taskCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: theme.colors.white,
        borderRadius: theme.borderRadius.l,
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
        borderRadius: theme.borderRadius.s,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.white,
        borderWidth: 2,
        borderColor: theme.colors.disabled,
    },
    taskCheckboxEmpty: {
        width: 0,
        height: 0,
    },
    taskCheckboxChecked: {
        fontSize: 14,
        fontWeight: 'bold',
        color: theme.colors.accent,
    },
    taskContent: {
        flex: 1,
    },
    taskTitle: {
        fontSize: 16,
        color: theme.colors.text,
        fontWeight: '600',
    },
    taskTitleCompleted: {
        textDecorationLine: 'line-through',
        color: theme.colors.textMuted,
    },
    taskMeta: {
        fontSize: 13,
        color: theme.colors.textLight,
        marginTop: 4,
    },
    taskActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    taskActionButton: {
        padding: 8,
        marginStart: 4,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.s,
    },
    taskActionText: {
        fontSize: 16,
    },
    reminderText: {
        color: theme.colors.accent,
        fontWeight: '600',
    },
});
