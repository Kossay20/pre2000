import { collection, addDoc, getDocs, query, where, updateDoc, deleteDoc, doc, Timestamp, orderBy, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../config/firebase';
import { UserTask, RecurrenceRule } from '../types';
import { scheduleOneTimeNotification, cancelReminderNotifications } from './notificationService';
import { getTaskMessage } from '../utils/notificationMessages';
import { createLogger } from '../utils/logger';
import i18n from '../i18n'; // F3: pass current locale to notif messages

const log = createLogger('taskService');

/**
 * Task Service - Manage user-created custom tasks
 * Tasks are stored in Firestore 'userTasks' collection
 */

/**
 * Create a new task for the user
 */
export const createTask = async (
    userId: string,
    title: string,
    priority: 'high' | 'medium' | 'low' = 'medium',
    reminderTime?: Date,
    recurrence?: RecurrenceRule
): Promise<UserTask> => {
    try {
        const now = new Date();
        const taskData = {
            user_id: userId,
            title: title.trim(),
            priority,
            completed: false,
            created_at: Timestamp.fromDate(now),
            updated_at: Timestamp.fromDate(now),
            reminder_time: reminderTime ? Timestamp.fromDate(reminderTime) : null,
            ...(recurrence ? { recurrence, completed_dates: [] } : {}),
        };

        const tasksRef = collection(db, 'userTasks');
        const docRef = await addDoc(tasksRef, taskData);
        const taskId = docRef.id;

        // Schedule notification if reminder time is set
        if (reminderTime) {
            log.debug('⏰ Scheduling notification for new task:', taskId);
            const taskMsg = getTaskMessage(title.trim(), i18n.language);
            await scheduleOneTimeNotification(
                taskId,
                taskMsg.title,
                taskMsg.body,
                reminderTime
            );
        }

        return {
            task_id: taskId,
            user_id: userId,
            title: taskData.title,
            priority: taskData.priority,
            completed: taskData.completed,
            created_at: now,
            updated_at: now,
            reminder_time: reminderTime,
            recurrence,
            completed_dates: recurrence ? [] : undefined,
        };
    } catch (error) {
        log.error('❌ Error creating task:', error);
        throw error;
    }
};

/**
 * Get all tasks for a user
 * Returns tasks sorted by: incomplete first, then by priority (high → low)
 */
export const getUserTasks = async (userId: string): Promise<UserTask[]> => {
    if (!userId || userId.startsWith('guest_')) return [];
    try {
        const tasksRef = collection(db, 'userTasks');
        // SIMPLIFIED: Only filter by user_id to avoid composite index requirement
        // Sorting is done in memory below
        const q = query(
            tasksRef,
            where('user_id', '==', userId)
        );

        const snapshot = await getDocs(q);

        const tasks: UserTask[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                task_id: doc.id,
                user_id: data.user_id,
                title: data.title,
                priority: data.priority,
                completed: data.completed,
                created_at: data.created_at?.toDate() || new Date(),
                updated_at: data.updated_at?.toDate() || new Date(),
                completed_at: data.completed_at?.toDate(),
                reminder_time: data.reminder_time?.toDate(),
                recurrence: data.recurrence,
                completed_dates: data.completed_dates,
            };
        });

        // Sort in memory: incomplete first, then by priority, then by created_at
        const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
        const sortedTasks = tasks.sort((a, b) => {
            // Incomplete tasks first
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            // Then by priority
            if (a.priority !== b.priority) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            // Then by created_at (newest first)
            return b.created_at.getTime() - a.created_at.getTime();
        });

        return sortedTasks;
    } catch (error) {
        log.error('❌ Error fetching tasks:', error);
        return [];
    }
};

/**
 * Update task completion status
 */
export const updateTaskStatus = async (
    taskId: string,
    completed: boolean,
    isRecurring?: boolean,
    dateStr?: string // e.g. "2023-10-25"
): Promise<void> => {

    try {
        const taskRef = doc(db, 'userTasks', taskId);
        const updateData: any = {
            updated_at: Timestamp.fromDate(new Date()),
        };

        if (isRecurring && dateStr) {
            // Modify the completed_dates array for recurring tasks
            updateData.completed_dates = completed ? arrayUnion(dateStr) : arrayRemove(dateStr);
        } else {
            // Standard boolean toggle for one-off tasks
            updateData.completed = completed;
            if (completed) {
                updateData.completed_at = Timestamp.fromDate(new Date());
            } else {
                updateData.completed_at = null;
            }
        }

        await updateDoc(taskRef, updateData);

        // W4 #4: cancel a one-off task's pending notification once it's completed — otherwise an
        // orphaned reminder fires for an already-done task. Best-effort (web/no-perm = harmless
        // no-op). Recurring tasks keep their schedule (their per-date completion is tracked separately).
        if (!isRecurring && completed) {
            try {
                await cancelReminderNotifications(taskId);
            } catch (e) {
                log.warn('Failed to cancel notification for completed task:', e);
            }
        }

    } catch (error) {
        log.error('❌ Error updating task status:', error);
        throw error;
    }
};

/**
 * Update task details (title, priority, reminder)
 */
export const updateTask = async (
    taskId: string,
    title: string,
    priority: 'high' | 'medium' | 'low',
    reminderTime?: Date,
    recurrence?: RecurrenceRule | null
): Promise<void> => {
    try {
        const taskRef = doc(db, 'userTasks', taskId);
        const updateData: any = {
            title: title.trim(),
            priority,
            updated_at: Timestamp.fromDate(new Date()),
            reminder_time: reminderTime ? Timestamp.fromDate(reminderTime) : null,
        };

        if (recurrence !== undefined) {
            if (recurrence === null) {
                // Remove recurrence rules if transitioning to one-off task
                updateData.recurrence = null;
            } else {
                updateData.recurrence = recurrence;
                // Note: we don't automatically clear completed_dates here so history is preserved
            }
        }

        await updateDoc(taskRef, updateData);

        // Handle Notification Update
        log.debug('🔄 Updating notification for task:', taskId);

        // 1. Cancel existing
        await cancelReminderNotifications(taskId);

        // 2. Schedule new if needed
        if (reminderTime) {
            const taskMsg = getTaskMessage(title.trim(), i18n.language);
            await scheduleOneTimeNotification(
                taskId,
                taskMsg.title,
                taskMsg.body,
                reminderTime
            );
        }

    } catch (error) {
        log.error('❌ Error updating task:', error);
        throw error;
    }
};

/**
 * Delete a task
 */
export const deleteTask = async (taskId: string): Promise<void> => {
    try {
        const taskRef = doc(db, 'userTasks', taskId);
        await deleteDoc(taskRef);

        // Cancel Notification
        log.debug('🗑️ Canceling notification for deleted task:', taskId);
        await cancelReminderNotifications(taskId);

    } catch (error) {
        log.error('❌ Error deleting task:', error);
        throw error;
    }
};
