import { theme } from '../../theme';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { UserEvent, UserTask } from '../../types';
import { useTranslation } from 'react-i18next';
import { isToday, isTomorrow, isThisWeek, parseISO } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { RtlAwareChevron } from '../common/RtlAwareChevron';

interface SmartRemindersBannerProps {
    appointments: UserEvent[];
    tasks: UserTask[];
    onPressAppointments: () => void;
    onPressTasks: () => void;
}

export const SmartRemindersBanner: React.FC<SmartRemindersBannerProps> = ({
    appointments,
    tasks,
    onPressAppointments,
    onPressTasks
}) => {
    const { t } = useTranslation();
    const today = new Date();

    // -- APPOINTMENTS LOGIC --
    const upcomingAppointments = appointments.filter(app => new Date(app.date) >= today);
    const todayAppointments = upcomingAppointments.filter(app => isToday(new Date(app.date)));
    const tomorrowAppointments = upcomingAppointments.filter(app => isTomorrow(new Date(app.date)));
    const thisWeekAppointments = upcomingAppointments.filter(app => isThisWeek(new Date(app.date)));

    let appointmentMessage = null;
    let appointmentPriority: 'high' | 'medium' | 'low' = 'low';

    if (todayAppointments.length > 0) {
        appointmentMessage = t('home.reminders.appointmentsToday', { count: todayAppointments.length });
        appointmentPriority = 'high';
    } else if (tomorrowAppointments.length > 0) {
        appointmentMessage = t('home.reminders.appointmentsTomorrow', { count: tomorrowAppointments.length });
        appointmentPriority = 'medium';
    } else if (thisWeekAppointments.length > 0) {
        appointmentMessage = t('home.reminders.appointmentsWeek', { count: thisWeekAppointments.length });
        appointmentPriority = 'low';
    }

    // -- TASKS LOGIC --
    const incompleteTasks = tasks.filter(task => !task.completed);

    // Smart filtering: only care about tasks that need immediate attention
    const todayTasks = incompleteTasks.filter(task => task.reminder_time && isToday(new Date(task.reminder_time)));
    const overdueTasks = incompleteTasks.filter(task => task.reminder_time && new Date(task.reminder_time) < today && !isToday(new Date(task.reminder_time)));
    const highPriorityTasks = incompleteTasks.filter(task => task.priority === 'high');

    let taskMessage = null;
    let taskPriority: 'high' | 'medium' | 'low' = 'low';

    // Prioritize today > overdue > high priority
    if (todayTasks.length > 0) {
        taskMessage = t('home.reminders.tasksToday', { count: todayTasks.length });
        taskPriority = 'high';
    } else if (overdueTasks.length > 0 || highPriorityTasks.length > 0) {
        // Group urgent but not today tasks
        const urgentCount = Array.from(new Set([...overdueTasks, ...highPriorityTasks])).length;
        taskMessage = t('home.reminders.tasksImportant', { count: urgentCount });
        taskPriority = 'medium';
    }
    // We intentionally SKIP normal ongoing tasks so they don't clutter the Home screen

    // Only render if there's something to show
    if (!appointmentMessage && !taskMessage) {
        return null;
    }

    const renderAppointmentLine = (message: string, priority: 'high' | 'medium' | 'low', onPress: () => void) => {
        const color = theme.colors.white; // High contrast white
        const icon = priority === 'high' ? '📅' : (priority === 'medium' ? '🔔' : '📆');

        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={styles.line}>
                <Text style={styles.icon}>{icon}</Text>
                <Text style={[styles.text, { color }]}>{message}</Text>
                <RtlAwareChevron direction="forward" size={18} color={color} style={{ marginStart: 6, opacity: 0.9 }} />
            </TouchableOpacity>
        );
    };

    const renderTaskLine = (message: string, priority: 'high' | 'medium' | 'low', onPress: () => void) => {
        const color = priority === 'high' ? theme.colors.surfaceBlush : theme.colors.white; // Light pink or white
        const icon = priority === 'high' ? '⚠️' : '✓';

        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={styles.line}>
                <Text style={styles.icon}>{icon}</Text>
                <Text style={[styles.text, { color }]}>{message}</Text>
                <RtlAwareChevron direction="forward" size={18} color={color} style={{ marginStart: 6, opacity: 0.9 }} />
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {appointmentMessage && renderAppointmentLine(appointmentMessage, appointmentPriority, onPressAppointments)}
            {taskMessage && renderTaskLine(taskMessage, taskPriority, onPressTasks)}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingHorizontal: 20,
        marginBottom: 8,
        gap: 8,
        zIndex: 5,
        width: '100%',
        alignItems: 'center', // Center the lines
    },
    // Gentle Pill Line Styles for both RDV and Tasks
    line: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.whiteAlpha15, // Very subtle glass effect
        paddingVertical: 6,
        paddingHorizontal: 16,
        borderRadius: 20, // Rounded pill shape
        borderWidth: 1,
        borderColor: theme.colors.whiteAlpha30,
    },
    icon: {
        fontSize: 16,
        // Cycle 2 F308 RTL : marginEnd flip auto.
        marginEnd: 8,
    },
    text: {
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.2, // Slightly more spaced for readability
    },
});
