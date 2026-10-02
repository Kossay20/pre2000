import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { theme } from '../../theme';
import { getShadowStyle } from '../../utils/styleUtils';
import { useTranslation } from 'react-i18next';
import { getDateLocale } from '../../utils/i18nHelpers';
import { CALENDAR_LIST_GUTTER, MIN_TAP_TARGET } from '../../screens/CalendarScreen.styles';

interface WeeklyStripProps {
    weekStartDate: Date;
    selectedDate: Date;
    onDateSelect: (date: Date) => void;
    userEventCounts?: Record<string, number>; // date string -> count (user RDV only)
    rdvWeekCount?: number; // Total RDV this week
}

export const WeeklyStrip: React.FC<WeeklyStripProps> = React.memo(({
    weekStartDate,
    selectedDate,
    onDateSelect,
    userEventCounts,
    rdvWeekCount = 0,
}) => {
    const { t, i18n } = useTranslation();
    const { format } = require('date-fns');
    const dateLocale = getDateLocale(i18n.language);

    const renderDay = (dayIndex: number) => {
        const date = new Date(weekStartDate);
        date.setDate(weekStartDate.getDate() + dayIndex);

        // FIX: Use local date key instead of UTC toISOString to avoid timezone issues
        // e.g., Dec 12 at 17:00 local time should NOT become Dec 13 when converted
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        const isSelected = date.toDateString() === selectedDate.toDateString();
        const isToday = new Date().toDateString() === date.toDateString();
        // Use userEventCounts for dots (only real RDV, not suggestions)
        const hasRDV = userEventCounts ? (userEventCounts[dateString] || 0) > 0 : false;

        // Capitalize first letter of day
        const dayName = format(date, 'EEE', { locale: dateLocale }).replace('.', '');
        const formattedDayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);

        const a11yLabel = format(date, 'EEEE dd MMMM', { locale: dateLocale });

        return (
            <TouchableOpacity
                key={dayIndex}
                style={[
                    styles.dayContainer,
                    isSelected && styles.selectedDayContainer,
                    isToday && !isSelected && styles.todayContainer,
                ]}
                onPress={() => onDateSelect(date)}
                accessibilityRole="button"
                accessibilityLabel={a11yLabel}
                accessibilityState={{ selected: isSelected }}
                // CAL-R2-03: RN-web 0.21.2 drops accessibilityState.selected → expose aria explicitly.
                {...(Platform.OS === 'web' ? { 'aria-selected': isSelected } : {})}
                accessibilityHint={hasRDV ? t('a11y.openAppointment') : undefined}
            >
                <Text style={[styles.dayName, isSelected && styles.selectedText]}>
                    {formattedDayName}
                </Text>
                <Text style={[styles.dayNumber, isSelected && styles.selectedText]}>
                    {date.getDate()}
                </Text>
                {hasRDV && (
                    <View style={[styles.dot, isSelected && styles.selectedDot]} />
                )}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.root}>
            {/* RDV Count Header */}
            <View style={styles.rdvHeader}>
                <Text style={styles.rdvHeaderText}>
                    {rdvWeekCount === 0
                        ? t('calendar.noAppointments')
                        : t('calendar.appointmentsThisWeek', { count: rdvWeekCount })}
                </Text>
            </View>
            <View style={styles.container}>
                <View style={styles.daysRow}>
                    {[0, 1, 2, 3, 4, 5, 6].map(renderDay)}
                </View>
            </View>
        </View>
    );
});

const styles = StyleSheet.create({
    // Full-bleed: undo the list gutter so the 44pt chips fit a 320pt screen (see daysRow).
    root: {
        marginHorizontal: -CALENDAR_LIST_GUTTER,
    },
    container: {
        paddingVertical: theme.spacing.m,
        paddingHorizontal: 6,
        backgroundColor: theme.colors.white,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    // The days share a row of at most 520pt, centred. In the 720pt iPad column, spread
    // edge to edge, today's chip sat alone far left with 100pt gaps between days.
    daysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: 520,
        alignSelf: 'center',
    },
    // Seven fixed 45pt cells (315pt + gutters) ran off a 320pt screen (iPad Slide
    // Over, iPhone SE 1st gen): share the row instead, between the 44pt tap minimum
    // (7 x 44 = 308 = 320 minus the 6pt paddings) and the old 45pt cap.
    dayContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 1,
        flexBasis: 0,
        minWidth: MIN_TAP_TARGET,
        maxWidth: 45,
        height: 60,
        borderRadius: 12,
    },
    selectedDayContainer: {
        backgroundColor: theme.colors.accent,
        ...getShadowStyle(4, theme.colors.primary, 0.3, 4, { width: 0, height: 2 }),
    },
    todayContainer: {
        backgroundColor: theme.colors.sky50, // today highlight
        borderWidth: 1,
        borderColor: theme.colors.primary,
    },
    dayName: {
        fontSize: 12,
        color: theme.colors.textLight,
        marginBottom: 4,
    },
    dayNumber: {
        fontSize: 16,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    selectedText: {
        color: theme.colors.white,
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: theme.colors.primary,
        marginTop: 4,
    },
    selectedDot: {
        backgroundColor: theme.colors.white,
    },
    rdvHeader: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: theme.colors.white,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    rdvHeaderText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        fontWeight: '500',
    },
});
