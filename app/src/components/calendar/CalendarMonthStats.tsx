import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../theme';
import { styles } from '../../screens/CalendarScreen.styles';

interface CalendarMonthStatsProps {
    totalEvents: number;
    userEventCount: number;
    suggestionCount: number;
    /** One line instead of a stacked card: on a short screen the card pushed the grid down. */
    compact?: boolean;
    t: (key: string) => string;
}

export const CalendarMonthStats: React.FC<CalendarMonthStatsProps> = ({
    totalEvents,
    userEventCount,
    suggestionCount,
    compact = false,
    t,
}) => compact ? (
    <View style={[styles.statsCard, styles.statsCardCompact]}>
        <Text style={styles.statsCompactText} numberOfLines={2}>
            {`📊 ${t('calendar.thisMonth')} · ${totalEvents} ${t('calendar.total')} · ${userEventCount} ${t('calendar.myAppointments')} · ${suggestionCount} ${t('calendar.suggestions')}`}
        </Text>
    </View>
) : (
    <View style={styles.statsCard}>
        <Text style={styles.statsTitle}>📊 {t('calendar.thisMonth')}</Text>
        <View style={styles.statsRow}>
            <View style={styles.statItem}>
                <Text style={styles.statValue}>{totalEvents}</Text>
                <Text style={styles.statLabel}>{t('calendar.total')}</Text>
            </View>
            <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.colors.accent }]}>{userEventCount}</Text>
                <Text style={styles.statLabel}>{t('calendar.myAppointments')}</Text>
            </View>
            <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.colors.info }]}>{suggestionCount}</Text>
                <Text style={styles.statLabel}>{t('calendar.suggestions')}</Text>
            </View>
        </View>
    </View>
);
