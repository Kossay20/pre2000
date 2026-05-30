import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { styles } from '../../screens/CalendarScreen.styles';

type CalendarView = 'week' | 'month';

interface CalendarHeaderProps {
    monthLabel: string;
    weekLabel: string;
    calendarView: CalendarView;
    isRTL: boolean;
    showSuggestions: boolean;
    suggestionsThisWeekCount: number;
    suggestionsThisMonthCount: number;
    onPrevWeek: () => void;
    onNextWeek: () => void;
    onSelectWeekView: () => void;
    onSelectMonthView: () => void;
    onToggleSuggestions: () => void;
    onPressToday: () => void;
    t: (key: string, options?: any) => string;
}

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
    monthLabel,
    weekLabel,
    calendarView,
    isRTL,
    showSuggestions,
    suggestionsThisWeekCount,
    suggestionsThisMonthCount,
    onPrevWeek,
    onNextWeek,
    onSelectWeekView,
    onSelectMonthView,
    onToggleSuggestions,
    onPressToday,
    t,
}) => {
    // AUDIT-FIX (massive-audit 2026-05-30 P1): the original code swapped BOTH the icon glyphs
    // (chevron-forward↔back) AND applied flexDirection:'row-reverse' on the header row. The two
    // mirrors cancelled each other → both arrows pointed INWARD in AR/TN. Standard calendar UX
    // in Arabic/Hebrew keeps the same directional convention as LTR: ← = earlier (prev), → =
    // later (next), matching Apple iOS Calendar Arabic locale. Remove both swaps.
    // The a11y labels were also wrong in RTL (label said "previousWeek" but button called
    // onNextWeek). Removing the onPress swap fixes that too.

    return (
        <LinearGradient
            colors={[theme.colors.primary, theme.colors.accent, theme.colors.deepPink]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
        >
            <View style={styles.headerTop}>
                <TouchableOpacity
                    onPress={onPrevWeek}
                    style={styles.navButton}
                    accessibilityLabel={t('a11y.previousWeek')}
                    accessibilityRole="button"
                >
                    <Ionicons name="chevron-back" size={24} color={theme.colors.white} />
                </TouchableOpacity>

                <View style={styles.headerTitleContainer}>
                    <Text style={[styles.headerTitle, isRTL && { textAlign: 'center' }]}>
                        {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
                    </Text>
                    <Text style={styles.headerSubtitle}>{weekLabel}</Text>
                </View>

                <TouchableOpacity
                    onPress={onNextWeek}
                    style={styles.navButton}
                    accessibilityLabel={t('a11y.nextWeek')}
                    accessibilityRole="button"
                >
                    <Ionicons name="chevron-forward" size={24} color={theme.colors.white} />
                </TouchableOpacity>
            </View>

            <View style={styles.viewSelector}>
                <View style={styles.selectorGroup}>
                    <TouchableOpacity
                        style={[styles.selectorButton, calendarView === 'week' && styles.selectorButtonActive]}
                        onPress={onSelectWeekView}
                        accessibilityRole="button"
                        accessibilityLabel={t('calendar.week')}
                        accessibilityState={{ selected: calendarView === 'week' }}
                    >
                        <Text style={[styles.selectorText, calendarView === 'week' && styles.selectorTextActive]}>
                            {t('calendar.week')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.selectorButton, calendarView === 'month' && styles.selectorButtonActive]}
                        onPress={onSelectMonthView}
                        accessibilityRole="button"
                        accessibilityLabel={t('calendar.month')}
                        accessibilityState={{ selected: calendarView === 'month' }}
                    >
                        <Text style={[styles.selectorText, calendarView === 'month' && styles.selectorTextActive]}>
                            {t('calendar.month')}
                        </Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={styles.suggestionBadge}
                    onPress={onToggleSuggestions}
                    accessibilityRole="button"
                    accessibilityLabel={t('calendar.suggestions')}
                    accessibilityState={{ expanded: showSuggestions }}
                >
                    <Ionicons name="bulb" size={16} color={theme.colors.white} style={{ marginEnd: 4 }} />
                    <Text style={styles.suggestionText}>
                        {calendarView === 'month'
                            ? (suggestionsThisMonthCount > 0 ? t('calendar.suggestionsCount', { count: suggestionsThisMonthCount }) : t('calendar.suggestions'))
                            : (suggestionsThisWeekCount > 0 ? t('calendar.suggestionsCount', { count: suggestionsThisWeekCount }) : t('calendar.suggestions'))
                        }
                    </Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={styles.todayButton}
                onPress={onPressToday}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.today')}
            >
                <Text style={styles.todayButtonText}>{t('calendar.today')}</Text>
            </TouchableOpacity>
        </LinearGradient>
    );
};
