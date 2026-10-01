import { theme } from '../../theme';
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { createLogger } from '../../utils/logger';
const log = createLogger('DailyRoutinesTracker');
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { DailyChecklistItem, UserTask, UserEvent } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { usePregnancy } from '../../context/PregnancyContext';
import { generateDailyChecklist, loadDailyProgress } from '../../services/dailyChecklistService';
import { getUserTasks } from '../../services/taskService';
import { countEventsInRange, getCurrentPregnancyWeekRange } from '../../services/calendarService';
import { isToday, isTomorrow, isThisWeek, format } from 'date-fns';
import { RtlAwareChevron } from '../common/RtlAwareChevron';

interface UnifiedDaySummaryProps {
    appointments?: UserEvent[];
}

export const DailyRoutinesTracker: React.FC<UnifiedDaySummaryProps> = ({
    appointments = []
}) => {
    const { t } = useTranslation();
    const navigation = useNavigation();
    const { user } = useAuth();
    const { pregnancyInfo, profile } = usePregnancy();

    const [totalItems, setTotalItems] = useState(0);
    const [completedItems, setCompletedItems] = useState(0);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const currentWeek = pregnancyInfo?.week || 1;

            // 1. Load Routines
            // P3.4 FIX: Pass appointments through so today's RDV appear in the routine.
            // Was hardcoded [] → checklist never knew about RDV (only the summary line did).
            const generatedItems = await generateDailyChecklist(appointments, currentWeek, user?.uid, undefined, user);
            const routineItems = generatedItems.filter(item => item.type !== 'appointment');
            const itemsWithProgress = await loadDailyProgress(routineItems);

            // 2. Load Tasks
            let userTasks: UserTask[] = [];
            if (user?.uid) {
                userTasks = await getUserTasks(user.uid);
            }

            // Filter tasks for today
            const todayStr = format(new Date(), 'yyyy-MM-dd');
            const now = new Date();
            const todayTasks = userTasks.filter(task => {
                let shouldShowToday = true;
                if (task.recurrence) {
                    const rule = task.recurrence;
                    const dayOfWeek = now.getDay();
                    if (rule.type === 'specific_days' && rule.days) {
                        shouldShowToday = rule.days.includes(dayOfWeek);
                    } else if (rule.type === 'interval' && rule.interval) {
                        if (task.created_at) {
                            const createdDate = task.created_at instanceof Date ? task.created_at :
                                (task.created_at && typeof (task.created_at as any).toDate === 'function') ? (task.created_at as any).toDate() :
                                    new Date(task.created_at as any);
                            const diffTime = Math.abs(now.getTime() - createdDate.getTime());
                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                            shouldShowToday = diffDays % rule.interval === 0;
                        }
                    }
                } else if (task.reminder_time) {
                    // One-off task with reminder
                    const date = task.reminder_time instanceof Date ? task.reminder_time :
                        (task.reminder_time && typeof (task.reminder_time as any).toDate === 'function') ? (task.reminder_time as any).toDate() :
                            new Date(task.reminder_time as any);
                    shouldShowToday = isToday(date);
                }
                return shouldShowToday;
            });

            // Calculate Routines Progress
            const completedRoutines = itemsWithProgress.filter(item => item.completed || (item.type === 'hydration' && item.current !== undefined && item.target !== undefined && item.current >= item.target)).length;

            // Calculate Tasks Progress
            const completedTasks = todayTasks.filter(task => {
                if (task.recurrence) {
                    return task.completed_dates ? task.completed_dates.includes(todayStr) : false;
                }
                return task.completed;
            }).length;

            setTotalItems(itemsWithProgress.length + todayTasks.length);
            setCompletedItems(completedRoutines + completedTasks);

        } catch (error) {
            log.error('Error loading daily tracking:', error);
        } finally {
            setLoading(false);
        }
    }, [user?.uid, pregnancyInfo?.week, appointments]);

    useFocusEffect(
        useCallback(() => {
            let isActive = true;

            const fetchRoutines = async () => {
                if (isActive) {
                    await loadData();
                }
            };

            fetchRoutines();

            return () => {
                isActive = false;
            };
        }, [loadData])
    );

    // -- APPOINTMENTS LOGIC --
    const todayAppointments = appointments.filter(app => isToday(new Date(app.date)));
    const tomorrowAppointments = appointments.filter(app => isTomorrow(new Date(app.date)));

    // For this week, we only want upcoming ones, not ones from Monday if today is Thursday, 
    // unless we want to show "X RDV cette semaine" inclusively. Let's keep it inclusive for simplicity
    // or strictly future. Let's do strictly future this week.
    const today = new Date();
    today.setHours(0, 0, 0, 0); // start of day

    const upcomingAppointments = appointments.filter(app => new Date(app.date) >= today);
    // "Cette semaine" is the pregnancy week the Calendar shows and counts (same range, same
    // counter), so the two numbers cannot disagree. `appointments` must be the uncapped
    // upcoming list — HomeScreen used to pass the 3 it displays. Without a pregnancy date
    // (TTC / curious) it falls back to the calendar week.
    const lmp = user?.pregnancyStartDate || profile?.lmp;
    const lmpDate = lmp ? new Date(lmp) : null;
    const thisWeekCount = lmpDate && !isNaN(lmpDate.getTime())
        ? countEventsInRange(upcomingAppointments, getCurrentPregnancyWeekRange(lmpDate))
        : upcomingAppointments.filter(app => isThisWeek(new Date(app.date))).length;

    let appointmentMessage = null;
    let appointmentPriority: 'high' | 'medium' | 'low' = 'low';

    // Simplified, less visually loaded text strings for better psychology
    if (todayAppointments.length > 0) {
        appointmentMessage = t('home.reminders.appointmentsToday', { count: todayAppointments.length });
        appointmentPriority = 'high';
    } else if (tomorrowAppointments.length > 0) {
        appointmentMessage = t('home.reminders.appointmentsTomorrow', { count: tomorrowAppointments.length });
        appointmentPriority = 'medium';
    } else if (thisWeekCount > 0) {
        appointmentMessage = t('home.reminders.appointmentsWeek', { count: thisWeekCount });
        appointmentPriority = 'low';
    }

    const hasTasks = totalItems > 0; // Only show if there are actual tasks
    const hasAppointments = !!appointmentMessage;

    if (loading) {
        return null; // Don't show while loading
    }

    // Nothing to show at all — don't render an empty ghost pill
    if (!hasTasks && !hasAppointments) {
        return null;
    }

    const progressPercent = totalItems > 0 ? (completedItems / totalItems) * 100 : 0;

    const renderAppointmentRow = (isSharedContext: boolean) => {
        if (!appointmentMessage) return null;
        const icon = appointmentPriority === 'high' ? '📅' : (appointmentPriority === 'medium' ? '🔔' : '📆');
        return (
            <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => navigation.navigate('Calendrier')}
                style={[styles.contentRow, isSharedContext && styles.sharedContentRow]}
                accessibilityRole="button"
                accessibilityLabel={appointmentMessage}
            >
                <View style={styles.leftContent}>
                    <Text style={styles.emoji}>{icon}</Text>
                    <Text style={[styles.title, { color: theme.colors.white }]}>
                        {appointmentMessage}
                    </Text>
                </View>
                <View style={styles.rightContent}>
                    <RtlAwareChevron direction="forward" size={22} color={theme.colors.white} />
                </View>
            </TouchableOpacity>
        );
    };

    const renderTasksRow = (isSharedContext: boolean) => {
        if (!hasTasks) return null;
        return (
            <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => navigation.navigate('Rappels', { screen: 'RemindersMain', params: { screen: 'TasksTab' } })}
                style={[styles.contentRow, isSharedContext && styles.sharedContentRow]}
                accessibilityRole="button"
                accessibilityLabel={`${t('reminders.myDay.title')} ${completedItems}/${totalItems}`}
            >
                <View style={[isSharedContext && { flex: 1 }, !isSharedContext && { width: '100%', alignItems: 'center' }]}>
                    <View style={styles.topTaskRow}>
                        <View style={styles.leftContent}>
                            <Text style={styles.emoji}>✨</Text>
                            <Text style={[styles.title, { color: theme.colors.white }]}>
                                {t('reminders.myDay.title')} {completedItems}/{totalItems}
                            </Text>
                        </View>
                        <View style={styles.rightContent}>
                            <RtlAwareChevron direction="forward" size={22} color={theme.colors.white} />
                        </View>
                    </View>
                    {/* Micro Progress Bar at the bottom of the tasks line */}
                    <View style={styles.progressBarBackground}>
                        <View
                            style={[
                                styles.progressBarFill,
                                { width: `${progressPercent}%`, backgroundColor: progressPercent === 100 ? theme.colors.green500 : theme.colors.white }
                            ]}
                        />
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const isSharedContext = hasAppointments && hasTasks;

    return (
        <View style={styles.container}>
            <View style={[styles.cardContainer, styles.cardContainerRow]}>
                {hasAppointments && renderAppointmentRow(isSharedContext)}

                {isSharedContext && (
                    <View style={styles.verticalDivider} />
                )}

                {hasTasks && renderTasksRow(isSharedContext)}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center', // Centers the card horizontally
        marginBottom: 8,
        paddingHorizontal: 16,
        paddingVertical: 4,
    },
    cardContainer: {
        backgroundColor: theme.colors.headerChipBg, // Darkening glass: a white wash drops the white labels below AA
        borderRadius: 20, // Modern card shape
        paddingVertical: 12,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: theme.colors.whiteAlpha25, // Very subtle border
        width: '100%', // Take full available width of container
        maxWidth: 400, // Keep it from being too wide on large screens
    },
    cardContainerRow: {
        flexDirection: 'row',
        alignItems: 'center', // Changed from stretch so it limits height naturally
        justifyContent: 'center',
    },
    verticalDivider: {
        width: 1,
        height: '80%', // Limit height of the divider instead of spanning stretch
        backgroundColor: theme.colors.whiteAlpha20,
        marginHorizontal: 8, // slightly more breathing room
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.whiteAlpha20,
        marginVertical: 10,
    },
    sharedContentRow: {
        flex: 1, // Space evenly
        marginHorizontal: 4,
    },
    contentRow: {
        flexDirection: 'row',
        justifyContent: 'center', // Center entire block if solitary, or within flex:1 if shared
        alignItems: 'center',
        paddingVertical: 4,
    },
    topTaskRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    leftContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1, // Allow text wrapping/shrinking if needed gracefully
        // Cycle 2 F309 RTL : marginEnd flip auto.
        marginEnd: 4,
    },
    rightContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    emoji: {
        fontSize: 13,
        // Cycle 2 F309 RTL.
        marginEnd: 4,
    },
    title: {
        fontSize: 11,
        fontWeight: '600',
        color: theme.colors.white,
        flexShrink: 1, // Allow shrinking within leftContent
    },
    progressBarBackground: {
        height: 4,
        backgroundColor: theme.colors.whiteAlpha20,
        borderRadius: 2,
        overflow: 'hidden',
        marginTop: 6, // Space between text and bar
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 2,
    }
});
