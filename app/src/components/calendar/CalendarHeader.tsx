import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { styles } from '../../screens/CalendarScreen.styles';

type CalendarView = 'week' | 'month';

// The header chips stay visually compact (~28pt); the slop brings their touch
// area to the 44pt minimum without making the pink header taller.
const HEADER_CHIP_HIT_SLOP = { top: 8, bottom: 8, left: 4, right: 4 };

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
    // CAL-R2-04 (P2): on web the flex row auto-reverses for RTL (ar/tn) via document.dir, but
    // Ionicons glyphs are NOT mirrored there (I18nManager.isRTL stays false on web, so Ionicons'
    // built-in RTL flip never kicks in) → prev/next chevrons end up pointing the wrong way.
    // On NATIVE, Ionicons already mirrors chevron-back/forward automatically, so we must swap
    // ONLY on web to avoid double-mirroring. Handlers + a11y labels stay put (previousWeek stays
    // on onPrevWeek, nextWeek on onNextWeek) — only the visual glyph swaps.
    const swapChevrons = Platform.OS === 'web' && isRTL;
    const prevChevron = swapChevrons ? 'chevron-forward' : 'chevron-back';
    const nextChevron = swapChevrons ? 'chevron-back' : 'chevron-forward';
    const suggestionsCount = calendarView === 'month' ? suggestionsThisMonthCount : suggestionsThisWeekCount;
    const suggestionsLabel = suggestionsCount > 0
        ? t('calendar.suggestionsCount', { count: suggestionsCount })
        : t('calendar.suggestions');

    return (
        <LinearGradient
            colors={[theme.colors.primaryStrong, theme.colors.accent]}
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
                    <Ionicons name={prevChevron} size={24} color={theme.colors.white} />
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
                    <Ionicons name={nextChevron} size={24} color={theme.colors.white} />
                </TouchableOpacity>
            </View>

            <View style={styles.viewSelector}>
                <View style={styles.selectorGroup}>
                    <TouchableOpacity
                        style={[styles.selectorButton, calendarView === 'week' && styles.selectorButtonActive]}
                        hitSlop={HEADER_CHIP_HIT_SLOP}
                        onPress={onSelectWeekView}
                        accessibilityRole="button"
                        accessibilityLabel={t('calendar.week')}
                        accessibilityState={{ selected: calendarView === 'week' }}
                        // CAL-R2-03: RN-web 0.21.2 drops accessibilityState.selected → expose aria explicitly.
                        {...(Platform.OS === 'web' ? { 'aria-selected': calendarView === 'week' } : {})}
                    >
                        <Text style={[styles.selectorText, calendarView === 'week' && styles.selectorTextActive]}>
                            {t('calendar.week')}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.selectorButton, calendarView === 'month' && styles.selectorButtonActive]}
                        hitSlop={HEADER_CHIP_HIT_SLOP}
                        onPress={onSelectMonthView}
                        accessibilityRole="button"
                        accessibilityLabel={t('calendar.month')}
                        accessibilityState={{ selected: calendarView === 'month' }}
                        // CAL-R2-03: RN-web 0.21.2 drops accessibilityState.selected → expose aria explicitly.
                        {...(Platform.OS === 'web' ? { 'aria-selected': calendarView === 'month' } : {})}
                    >
                        <Text style={[styles.selectorText, calendarView === 'month' && styles.selectorTextActive]}>
                            {t('calendar.month')}
                        </Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity
                    style={styles.suggestionBadge}
                    hitSlop={HEADER_CHIP_HIT_SLOP}
                    onPress={onToggleSuggestions}
                    accessibilityRole="button"
                    // The name carries the count the pill shows (WCAG 2.5.3: the visible label is in the name).
                    accessibilityLabel={suggestionsLabel}
                    accessibilityState={{ expanded: showSuggestions }}
                    // CAL-R2-03: RN-web 0.21.2 drops accessibilityState.expanded → expose aria explicitly.
                    {...(Platform.OS === 'web' ? { 'aria-expanded': showSuggestions } : {})}
                >
                    <Ionicons name="bulb" size={16} color={theme.colors.text} style={{ marginEnd: 4 }} />
                    <Text style={styles.suggestionText}>{suggestionsLabel}</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity
                style={styles.todayButton}
                hitSlop={HEADER_CHIP_HIT_SLOP}
                onPress={onPressToday}
                accessibilityRole="button"
                accessibilityLabel={t('calendar.today')}
            >
                <Text style={styles.todayButtonText}>{t('calendar.today')}</Text>
            </TouchableOpacity>
        </LinearGradient>
    );
};
