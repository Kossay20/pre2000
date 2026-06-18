import { createLogger } from '../utils/logger';
const log = createLogger('CalendarScreen');
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, ScrollView, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../config/firebase'; // FIX: Import auth and db for direct access
import { doc, getDoc } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import {
    loadCalendarTemplates,
    generateAllEvents,
    loadUserEvents,
    getCombinedEventsForWeek,
    deleteUserEvent,
    GeneratedEvent,
    groupEventsByDate,
    getWeekDates,
    getLocalDateKey,
} from '../services/calendarService';
import { UserEvent, CombinedEvent } from '../types';
import { theme } from '../theme';
import { EventCard } from '../components/calendar/EventCard';
import { WeeklyStrip } from '../components/calendar/WeeklyStrip';
import { CalendarSkeleton } from '../components/calendar/CalendarSkeleton';
import { CalendarHeader } from '../components/calendar/CalendarHeader';
import { CalendarMonthDay } from '../components/calendar/CalendarMonthDay';
import { CalendarMonthStats } from '../components/calendar/CalendarMonthStats';
import { format, addDays, startOfWeek, addWeeks, subWeeks, isSameDay, subMonths, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, parseISO, getDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useDateLocale } from '../hooks/useDateLocale';
import { getLocalizedContent } from '../utils/i18nHelpers';
import { calculateCurrentWeek } from '../utils/pregnancyCalculator';
import { CalendarScreenNavigationProp } from '../types/navigation';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { showAlert } from '../utils/alert';
import { confirmAction } from '../utils/uiUtils';
import { styles } from './CalendarScreen.styles';

type ViewMode = 'suggestions' | 'myEvents' | 'all';
type CalendarView = 'week' | 'month';

export const CalendarScreen = () => {
    useScreenAnalytics('CalendarScreen');
    const { user } = useAuth();
    const navigation = useNavigation();
    const { t, i18n } = useTranslation();
    const dateLocale = useDateLocale();

    // State
    const [currentWeek, setCurrentWeek] = useState(user?.currentWeek || 1);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<ViewMode>('all');
    const [calendarView, setCalendarView] = useState<CalendarView>('week');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showScrollIndicator, setShowScrollIndicator] = useState(true);

    // Data
    const [allTemplateEvents, setAllTemplateEvents] = useState<GeneratedEvent[]>([]);
    const [userEvents, setUserEvents] = useState<UserEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Animation
    const [fadeAnim] = useState(new Animated.Value(0));

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: Platform.OS !== 'web', // Fix for web compatibility
        }).start();
    }, []);

    // Sync currentWeek with user profile when it changes
    // Sync currentWeek with user profile when it changes
    useEffect(() => {
        if (user?.pregnancyStartDate) {
            const today = new Date();
            // FIX: Always default to TODAY on mount/update to prevent jumping back to start date
            setSelectedDate(today);

            // Calculate REAL current week based on Today
            const realCurrentWeek = calculateCurrentWeek(new Date(user.pregnancyStartDate));

            if (realCurrentWeek !== currentWeek) {
                log.debug(`[CalendarScreen] 🔄 Auto-correcting week from ${currentWeek} to ${realCurrentWeek}`);
                setCurrentWeek(realCurrentWeek);
            }
        }
    }, [user?.pregnancyStartDate]);

    // P3.3 FIX: Extract loadData as useCallback so the retry button can re-trigger it
    // (was previously closure-only inside useEffect — retry only flipped loading=true).
    const loadData = useCallback(async () => {
        if (!user?.pregnancyStartDate) {
            log.warn('Missing pregnancyStartDate, stopping load');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const effectiveUid = user?.uid;

            if (!effectiveUid) {
                log.warn('[CalendarScreen] No user UID available, skipping load');
                setLoading(false);
                return;
            }

            log.info(`Loading calendar data for user: ${effectiveUid ? 'found' : 'missing'} (week ${user?.currentWeek})`);

            // Cycle 3 F202 : skip pregnancy templates pour TTC/Curious modes —
            // ces utilisatrices n'ont pas de RDV de grossesse (echo 12SA, etc.).
            // Le calendrier reste utilisable pour leurs propres événements (userEvents).
            const skipPregnancyTemplates = !!(user.isTTC || user.isCurious);

            const [templates, uEvents] = await Promise.all([
                skipPregnancyTemplates ? Promise.resolve([]) : loadCalendarTemplates(),
                // Only load user events if authenticated (not guest)
                (!user.isGuest && effectiveUid) ? loadUserEvents(effectiveUid) : Promise.resolve([])
            ]);

            log.info(
                `Loaded ${templates.length} templates and ${uEvents.length} user events (TTC/Curious=${skipPregnancyTemplates})`
            );

            const generatedEvents = skipPregnancyTemplates
                ? []
                : generateAllEvents(templates, new Date(user.pregnancyStartDate));
            setAllTemplateEvents(generatedEvents);
            setUserEvents(uEvents);
        } catch (err) {
            log.error('Error loading calendar data:', err);
            setError(t('common.errorLoadingData'));
        } finally {
            setLoading(false);
        }
    }, [user?.pregnancyStartDate, user?.uid, user?.isGuest, user?.currentWeek, user?.isTTC, user?.isCurious, t]);

    // Load initial data + reload when deps change
    useEffect(() => {
        loadData();
    }, [loadData]);

    // Refresh user events when screen focuses
    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            if (user?.uid && !user.isGuest) {
                loadUserEvents(user.uid).then(setUserEvents);
            }
        });
        return unsubscribe;
    }, [navigation, user?.uid]);

    // Derived Data
    const weekDates = useMemo(() => {
        if (!user?.pregnancyStartDate) return { start: new Date(), end: new Date() };
        return getWeekDates(new Date(user.pregnancyStartDate), currentWeek);
    }, [user?.pregnancyStartDate, currentWeek]);

    const currentWeekEvents = useMemo(() => {
        const events = getCombinedEventsForWeek(allTemplateEvents, userEvents, currentWeek, weekDates.start, weekDates.end);

        // Localize events for display (Week View Suggestions)
        return events.map(e => ({
            ...e,
            title: getLocalizedContent(e, 'title', i18n.language),
            description: getLocalizedContent(e, 'description', i18n.language)
        }));
    }, [allTemplateEvents, userEvents, currentWeek, weekDates, i18n.language]);

    const eventsByDate = useMemo(() => {
        return groupEventsByDate(currentWeekEvents);
    }, [currentWeekEvents]);

    const allEventsByDate = useMemo(() => {
        const grouped: Record<string, CombinedEvent[]> = {};

        // Add template events
        allTemplateEvents.forEach((event) => {
            const dateKey = getLocalDateKey(new Date(event.date));
            if (!grouped[dateKey]) grouped[dateKey] = [];

            // Localize content here
            const localizedTitle = getLocalizedContent(event, 'title', i18n.language);
            const localizedDesc = getLocalizedContent(event, 'description', i18n.language);

            grouped[dateKey].push({
                id: event.id || event.templateId || `template-${event.week}-${event.title}`,
                title: localizedTitle,
                date: new Date(event.date),
                description: localizedDesc,
                type: event.type,
                week: event.week,
                source: 'template' as const,
            });
        });

        // Add user events
        userEvents.forEach((event) => {
            const dateKey = getLocalDateKey(new Date(event.date));
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push({
                id: event.event_id,
                title: event.title,
                date: new Date(event.date),
                description: event.notes || '',
                type: event.type,
                week: event.week,
                source: 'user' as const,
                category: event.category, // CAL-04: carry Medical/Personal so edit re-opens with it + card can show it
            });
        });

        return grouped;
    }, [allTemplateEvents, userEvents, i18n.language]);

    // Count only USER events this week (not suggestions) - use date range for accuracy
    const eventsThisWeekCount = useMemo(() => {
        const { start, end } = weekDates;
        // Count user events that fall within this week's date range
        const count = userEvents.filter(e => {
            const eventDate = new Date(e.date);
            return eventDate >= start && eventDate <= end;
        }).length;
        return count;
    }, [userEvents, weekDates]);

    // Count suggestions for this week
    const suggestionsThisWeekCount = useMemo(() => {
        return currentWeekEvents.filter(e => e.source === 'template').length;
    }, [currentWeekEvents]);

    // Week suggestions (all for the week, not per day)
    const weekSuggestions = useMemo(() => {
        return currentWeekEvents.filter(e => e.source === 'template');
    }, [currentWeekEvents]);

    // Month suggestions - all template events for the selected month
    const monthSuggestions = useMemo(() => {
        const monthKey = format(selectedDate, 'yyyy-MM', { locale: dateLocale });
        const suggestions: CombinedEvent[] = [];

        Object.entries(allEventsByDate).forEach(([dateKey, events]) => {
            if (dateKey.startsWith(monthKey)) {
                events.filter(e => e.source === 'template').forEach(e => suggestions.push(e));
            }
        });

        const uniqueSuggestions = suggestions.reduce((acc, current) => {
            const x = acc.find(item => item.title === current.title);
            if (!x) {
                return acc.concat([current]);
            } else {
                return acc;
            }
        }, [] as CombinedEvent[]);

        return uniqueSuggestions.sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [allEventsByDate, selectedDate]);

    const suggestionsThisMonthCount = useMemo(() => {
        return monthSuggestions.length;
    }, [monthSuggestions]);

    const filteredEvents = useMemo(() => {
        const dateKey = getLocalDateKey(selectedDate);
        const dayEvents = (calendarView === 'week' ? eventsByDate : allEventsByDate)[dateKey] || [];

        // ALWAYS show only user events - suggestions are accessed via dedicated button
        return dayEvents.filter(e => e.source === 'user');
    }, [eventsByDate, allEventsByDate, selectedDate, calendarView]);

    const eventCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        Object.keys(calendarView === 'week' ? eventsByDate : allEventsByDate).forEach(date => {
            counts[date] = (calendarView === 'week' ? eventsByDate : allEventsByDate)[date].length;
        });
        return counts;
    }, [eventsByDate, allEventsByDate, calendarView]);

    // Month view data - with proper padding for grid alignment
    const monthDays = useMemo(() => {
        const start = startOfMonth(selectedDate);
        const end = endOfMonth(selectedDate);
        const days = eachDayOfInterval({ start, end });

        // Get day of week for first day (0 = Sunday, 1 = Monday, etc.)
        // Convert to Monday-first format (0 = Monday, 6 = Sunday)
        const firstDayOfWeek = getDay(start);
        const paddingDays = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

        // Create padding array with null values
        const padding: (Date | null)[] = Array(paddingDays).fill(null);

        return [...padding, ...days];
    }, [selectedDate]);

    // User-only event counts (excluding suggestions)
    const userEventCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        userEvents.forEach(event => {
            const dateKey = getLocalDateKey(new Date(event.date));
            counts[dateKey] = (counts[dateKey] || 0) + 1;
        });
        return counts;
    }, [userEvents]);

    const monthStats = useMemo(() => {
        const monthKey = format(selectedDate, 'yyyy-MM', { locale: dateLocale });
        let totalEvents = 0;
        let userEventCount = 0;
        let suggestionCount = 0;

        Object.keys(allEventsByDate).forEach(dateKey => {
            if (dateKey.startsWith(monthKey)) {
                const events = allEventsByDate[dateKey];
                totalEvents += events.length;
                userEventCount += events.filter(e => e.source === 'user').length;
                suggestionCount += events.filter(e => e.source === 'template').length;
            }
        });

        return { totalEvents, userEventCount, suggestionCount };
    }, [allEventsByDate, selectedDate]);

    // Handlers
    const handlePrevWeek = useCallback(() => {
        if (currentWeek > 1 && user?.pregnancyStartDate) {
            const newWeek = currentWeek - 1;
            setCurrentWeek(newWeek);
            const { start } = getWeekDates(new Date(user.pregnancyStartDate), newWeek);
            setSelectedDate(start);
        }
    }, [currentWeek, user?.pregnancyStartDate]);

    const handleNextWeek = useCallback(() => {
        if (currentWeek < 40 && user?.pregnancyStartDate) {
            const newWeek = currentWeek + 1;
            setCurrentWeek(newWeek);
            const { start } = getWeekDates(new Date(user.pregnancyStartDate), newWeek);
            setSelectedDate(start);
        }
    }, [currentWeek, user?.pregnancyStartDate]);

    const handlePrevMonth = useCallback(() => {
        setSelectedDate(prev => subMonths(prev, 1));
    }, []);

    const handleNextMonth = useCallback(() => {
        setSelectedDate(prev => addMonths(prev, 1));
    }, []);

    const handleToday = useCallback(() => {
        if (user?.currentWeek) {
            setCurrentWeek(user.currentWeek);
            setSelectedDate(new Date());
        }
    }, [user?.currentWeek]);

    const handleEditEvent = useCallback((item: CombinedEvent) => {
        if (item.source === 'user') {
            navigation.navigate('AddAppointment', { event: item });
        }
    }, [navigation]);

    const handleDeleteEvent = async (eventId: string) => {
        // Guest check
        if (user?.isGuest) {
            // Cycle 3 F203 : Alert avec CTA "Create account" — avant pas de chemin
            // direct, l'utilisatrice savait juste qu'il fallait un compte sans
            // savoir où aller. Maintenant 1-tap vers Register.
            // WEB-ALERT: confirmAction fires the callback on web too (Alert.alert is a no-op there).
            confirmAction(
                t('calendar.guestModeTitle'),
                t('calendar.guestModeMessage'),
                () => navigation.getParent()?.navigate('Home', { screen: 'GuestUpgrade' }),
                undefined,
                t('common.cancel'),
                t('common.createAccount')
            );
            return;
        }

        log.debug('[CalendarScreen] Deleting event with ID:', eventId);

        // WEB-ALERT: confirmAction bridges web (window.confirm) + native (Alert) and
        // fires the callbacks on both, so the destructive confirm works on web too.
        const confirmDelete = await new Promise<boolean>((resolve) => {
            confirmAction(
                t('calendar.deleteEventTitle'),
                t('calendar.deleteEventMessage'),
                () => resolve(true),
                () => resolve(false),
                t('calendar.cancel'),
                t('calendar.delete')
            );
        });

        if (!confirmDelete) {
            log.debug('[CalendarScreen] Delete cancelled');
            return;
        }

        try {
            log.debug('[CalendarScreen] Confirmed delete for:', eventId);
            await deleteUserEvent(eventId);
            log.debug('[CalendarScreen] Delete successful, reloading events...');
            if (user?.uid) {
                const updatedEvents = await loadUserEvents(user.uid);
                setUserEvents(updatedEvents);
                log.debug('[CalendarScreen] Events reloaded:', updatedEvents.length);
            }
        } catch (error) {
            log.error('[CalendarScreen] Delete error:', error);
            // WEB-ALERT: showAlert renders on web (window.alert) and native (Alert.alert).
            showAlert(t('calendar.error'), t('calendar.cannotDeleteEvent'));
        }
    };

    // CB4-FIX: language-derived RTL (I18nManager.isRTL is false on web — forceRTL is skipped there,
    // so the calendar nav chevrons did not mirror in Arabic/Tunisian on web).
    const isRTL = i18n.language === 'ar' || i18n.language === 'tn';
    const monthLabel = format(selectedDate, 'MMMM yyyy', { locale: dateLocale });
    const weekLabel = t('calendar.weekOfPregnancy', { week: currentWeek });

    const handlePressToday = useCallback(() => {
        const today = new Date();
        setSelectedDate(today);
        if (user?.currentWeek) {
            setCurrentWeek(user.currentWeek);
        }
    }, [user?.currentWeek]);

    const handleSelectWeekView = useCallback(() => setCalendarView('week'), []);
    const handleSelectMonthView = useCallback(() => setCalendarView('month'), []);
    const handleToggleSuggestions = useCallback(() => setShowSuggestions(prev => !prev), []);

    if (loading) {
        return <CalendarSkeleton />;
    }

    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>📅</Text>
                <Text style={styles.loadingText}>{error}</Text>
                <TouchableOpacity
                    style={{ marginTop: 16, padding: 14, backgroundColor: theme.colors.accent, borderRadius: theme.borderRadius.m }}
                    onPress={() => loadData()}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.retry')}
                >
                    <Text style={{ color: theme.colors.white, fontWeight: '600' }}>{t('common.retry')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <CalendarHeader
                monthLabel={monthLabel}
                weekLabel={weekLabel}
                calendarView={calendarView}
                isRTL={isRTL}
                showSuggestions={showSuggestions}
                suggestionsThisWeekCount={suggestionsThisWeekCount}
                suggestionsThisMonthCount={suggestionsThisMonthCount}
                onPrevWeek={handlePrevWeek}
                onNextWeek={handleNextWeek}
                onSelectWeekView={handleSelectWeekView}
                onSelectMonthView={handleSelectMonthView}
                onToggleSuggestions={handleToggleSuggestions}
                onPressToday={handlePressToday}
                t={t}
            />

            <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
                <FlatList
                    data={filteredEvents}
                    keyExtractor={(item) => item.id}
                    ListHeaderComponent={
                        <>
                            {calendarView === 'month' ? (
                                <>
                                    <CalendarMonthStats
                                        totalEvents={monthStats.totalEvents}
                                        userEventCount={monthStats.userEventCount}
                                        suggestionCount={monthStats.suggestionCount}
                                        t={t}
                                    />
                                    <View style={styles.monthGrid}>
                                        <View style={styles.weekDaysHeader}>
                                            {[t('calendar.weekDays.monday'), t('calendar.weekDays.tuesday'), t('calendar.weekDays.wednesday'), t('calendar.weekDays.thursday'), t('calendar.weekDays.friday'), t('calendar.weekDays.saturday'), t('calendar.weekDays.sunday')].map((day, index) => (
                                                <Text key={`day-${index}`} style={styles.weekDayLabel}>{day}</Text>
                                            ))}
                                        </View>
                                        <View style={styles.monthDaysGrid}>
                                            {monthDays.map((day, index) => {
                                                const dateKey = day ? getLocalDateKey(day) : '';
                                                const userEventCount = day ? (userEventCounts[dateKey] || 0) : 0;
                                                const isSelected = day ? isSameDay(day, selectedDate) : false;
                                                const isToday = day ? isSameDay(day, new Date()) : false;
                                                const isCurrentMonth = day ? isSameMonth(day, selectedDate) : false;
                                                return (
                                                    <View key={`month-day-${index}`} style={styles.monthDayWrapper}>
                                                        <CalendarMonthDay
                                                            day={day}
                                                            isSelected={isSelected}
                                                            isToday={isToday}
                                                            isCurrentMonth={isCurrentMonth}
                                                            userEventCount={userEventCount}
                                                            onPress={setSelectedDate}
                                                            t={t}
                                                            dateLocale={dateLocale}
                                                        />
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                </>
                            ) : (
                                <WeeklyStrip
                                    weekStartDate={weekDates.start}
                                    selectedDate={selectedDate}
                                    onDateSelect={setSelectedDate}
                                    userEventCounts={userEventCounts}
                                    rdvWeekCount={eventsThisWeekCount}
                                />
                            )}

                            {/* Suggestions Section (Collapsible) - Moved inside ListHeaderComponent */}
                            {showSuggestions && (
                                (calendarView === 'week' && weekSuggestions.length > 0) ||
                                (calendarView === 'month' && monthSuggestions.length > 0)
                            ) && (
                                    <View style={styles.suggestionsSection}>
                                        <View style={styles.suggestionsSectionHeader}>
                                            <Text style={styles.suggestionsSectionTitle}>
                                                💡 {calendarView === 'week' ? t('calendar.suggestionsForWeek') : t('calendar.suggestionsForMonth')}
                                            </Text>
                                            <TouchableOpacity
                                                onPress={() => setShowSuggestions(false)}
                                                accessibilityRole="button"
                                                accessibilityLabel={t('a11y.close')}
                                            >
                                                <Text style={styles.suggestionsSectionClose}>✕</Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={styles.suggestionsContainer}>
                                            {/* Use View instead of ScrollView here to avoid nested virtualization error */}
                                            <View style={styles.suggestionsScrollContent}>
                                                {(calendarView === 'week' ? weekSuggestions : monthSuggestions).map(suggestion => (
                                                    <View key={suggestion.id} style={styles.suggestionItem}>
                                                        <Text style={styles.suggestionItemTitle}>{suggestion.title}</Text>
                                                        {suggestion.description && (
                                                            <Text style={styles.suggestionItemDesc} numberOfLines={2}>{suggestion.description}</Text>
                                                        )}
                                                    </View>
                                                ))}
                                            </View>
                                        </View>
                                    </View>
                                )}
                        </>
                    }
                    renderItem={({ item }) => (
                        <EventCard
                            event={item}
                            onEdit={item.source === 'user' ? () => handleEditEvent(item) : undefined}
                            onDelete={item.source === 'user' ? () => handleDeleteEvent(item.id) : undefined}
                        />
                    )}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyEmoji}>📅</Text>
                            <Text style={styles.emptyStateText}>{t('calendar.noEventsForDay')}</Text>
                            <Text style={styles.emptyStateSubtext}>{t('calendar.enjoyRest')}</Text>
                            <TouchableOpacity
                                style={[styles.todayButton, { marginTop: 16, backgroundColor: theme.colors.accent, paddingHorizontal: 24 }]}
                                onPress={() => navigation.navigate('AddAppointment', { selectedDate: selectedDate.toISOString() })}
                                accessibilityRole="button"
                                accessibilityLabel={t('a11y.addAppointment')}
                                accessibilityHint={t('a11y.addAppointmentHint')}
                            >
                                <Text style={[styles.todayButtonText, { fontSize: 14 }]}>{t('calendar.addAppointment')}</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            </Animated.View>

            <TouchableOpacity
                style={styles.fab}
                onPress={() => navigation.navigate('AddAppointment', { selectedDate: selectedDate.toISOString() })}
                accessibilityRole="button"
                accessibilityLabel={t('a11y.addAppointment')}
                accessibilityHint={t('a11y.addAppointmentHint')}
            >
                <LinearGradient
                    colors={[theme.colors.primary, theme.colors.accent]}
                    style={styles.fabGradient}
                >
                    <Text style={styles.fabIcon}>+</Text>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );
};

