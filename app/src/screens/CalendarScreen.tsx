import { createLogger } from '../utils/logger';
const log = createLogger('CalendarScreen');
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, ScrollView, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { auth, db } from '../config/firebase'; // FIX: Import auth and db for direct access
import { doc, getDoc } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import { getReducedMotionSync } from '../hooks/usePrefersReducedMotion';
import {
    loadCalendarTemplates,
    generateAllEvents,
    loadUserEvents,
    getCombinedEventsForWeek,
    deleteUserEvent,
    GeneratedEvent,
    groupEventsByDate,
    getWeekDates,
    pregnancyWeekOfDate,
    displayedCalendarWeek,
    LAST_CALENDAR_WEEK,
    getLocalDateKey,
    countEventsInRange,
    distinctSuggestions,
    summariseMonth,
} from '../services/calendarService';
import { UserEvent, CombinedEvent } from '../types';
import { theme } from '../theme';
import { Ionicons } from '@expo/vector-icons';
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
    // The pregnancy week the strip shows. It opens on the week holding TODAY (her local
    // day), never on the profile's currentWeek: that is the content week, which stops at 40,
    // so at 40+3 SA the strip showed a week in the past and today was off screen.
    const [currentWeek, setCurrentWeek] = useState(() =>
        user?.pregnancyStartDate ? pregnancyWeekOfDate(new Date(user.pregnancyStartDate)) : 1);
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
        // W3 #4: respect OS "reduce motion" — show content instantly instead of a 500ms fade.
        if (getReducedMotionSync()) {
            fadeAnim.setValue(1);
            return;
        }
        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: Platform.OS !== 'web', // Fix for web compatibility
        }).start();
    }, []);

    // A new LMP moves the strip back to the week holding today.
    useEffect(() => {
        if (user?.pregnancyStartDate) {
            setSelectedDate(new Date());
            setCurrentWeek(pregnancyWeekOfDate(new Date(user.pregnancyStartDate)));
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

            log.info(`Loading calendar data for user: ${effectiveUid ? 'found' : 'missing'}`);

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
    }, [user?.pregnancyStartDate, user?.uid, user?.isGuest, user?.isTTC, user?.isCurious, t]);

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
                // The week list carried these and the month list did not, so the month card
                // had no address.
                location: event.location,
                notes: event.notes,
            });
        });

        return grouped;
    }, [allTemplateEvents, userEvents, i18n.language]);

    // Count only USER events this week (not suggestions). Same counter and, for the current
    // week, the same range (getCurrentPregnancyWeekRange) as Home's "this week" pill.
    const eventsThisWeekCount = useMemo(
        () => countEventsInRange(userEvents, weekDates),
        [userEvents, weekDates],
    );

    // Week suggestions (all for the week, not per day), each piece of advice once.
    const weekSuggestions = useMemo(() => distinctSuggestions(currentWeekEvents), [currentWeekEvents]);
    const suggestionsThisWeekCount = weekSuggestions.length;

    // The month's pill, opened list and "this month" card share one summary, so the pill and
    // the card show the same Suggestions number. The key is the local date key's 'yyyy-MM'
    // (a locale-formatted month could carry non-Latin digits and match nothing).
    const monthSummary = useMemo(
        () => summariseMonth(allEventsByDate, getLocalDateKey(selectedDate).slice(0, 7)),
        [allEventsByDate, selectedDate],
    );
    const monthSuggestions = monthSummary.suggestions;
    const suggestionsThisMonthCount = monthSummary.suggestionCount;

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
        // Past week 40 too: there are no suggestions there, but her own appointments are.
        if (currentWeek < LAST_CALENDAR_WEEK && user?.pregnancyStartDate) {
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

    const handleEditEvent = useCallback((item: CombinedEvent) => {
        if (item.source === 'user') {
            // Only the id: the form reads the event from the server, so a web reload of the
            // edit URL still has it (an object param does not survive the URL).
            navigation.navigate('AddAppointment', { eventId: item.id });
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
                t('common.screen.createAccount')
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
    const weekLabel = t('calendar.weekOfPregnancy', { week: displayedCalendarWeek(currentWeek) });

    const handlePressToday = useCallback(() => {
        const today = new Date();
        setSelectedDate(today);
        if (user?.pregnancyStartDate) {
            setCurrentWeek(pregnancyWeekOfDate(new Date(user.pregnancyStartDate), today));
        }
    }, [user?.pregnancyStartDate]);

    const handleSelectWeekView = useCallback(() => setCalendarView('week'), []);
    const handleSelectMonthView = useCallback(() => setCalendarView('month'), []);
    const handleToggleSuggestions = useCallback(() => setShowSuggestions(prev => !prev), []);

    if (loading) {
        return <CalendarSkeleton />;
    }

    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Ionicons name="calendar-outline" size={48} color={theme.colors.textMuted} style={styles.emptyIcon} />
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
                onPrevWeek={calendarView === 'month' ? handlePrevMonth : handlePrevWeek}
                onNextWeek={calendarView === 'month' ? handleNextMonth : handleNextWeek}
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
                                        totalEvents={monthSummary.totalEvents}
                                        userEventCount={monthSummary.userEventCount}
                                        suggestionCount={monthSummary.suggestionCount}
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

                            {/* Suggestions opened with nothing to show: say so. The panel used to
                                render nothing at all, so the button looked broken. */}
                            {showSuggestions && (calendarView === 'week' ? weekSuggestions : monthSuggestions).length === 0 && (
                                <View style={styles.suggestionsSection}>
                                    <View style={styles.suggestionsSectionHeader}>
                                        <Text style={styles.suggestionsSectionTitle} accessibilityLiveRegion="polite">
                                            💡 {calendarView === 'week' ? t('calendar.noSuggestionsWeek') : t('calendar.noSuggestionsMonth')}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => setShowSuggestions(false)}
                                            accessibilityRole="button"
                                            accessibilityLabel={t('a11y.close')}
                                        >
                                            <Text style={styles.suggestionsSectionClose}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
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
                            {/* A drawn calendar, not the 📅 emoji: that glyph has a date printed
                                on it ("JUL 17" on Apple), under an October header. */}
                            <Ionicons name="calendar-outline" size={48} color={theme.colors.textMuted} style={styles.emptyIcon} />
                            <Text style={styles.emptyStateText}>{t('calendar.noEventsForDay')}</Text>
                            <Text style={styles.emptyStateSubtext}>{t('calendar.enjoyRest')}</Text>
                        </View>
                    }
                />
            </Animated.View>

            <TouchableOpacity
                style={styles.fab}
                onPress={() => navigation.navigate('AddAppointment', { selectedDate: getLocalDateKey(selectedDate) })}
                accessibilityRole="button"
                accessibilityLabel={t('a11y.addAppointment')}
                accessibilityHint={t('a11y.addAppointmentHint')}
            >
                <LinearGradient
                    colors={[theme.colors.primaryStrong, theme.colors.accent]}
                    style={styles.fabGradient}
                >
                    <Text style={styles.fabIcon}>+</Text>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );
};

