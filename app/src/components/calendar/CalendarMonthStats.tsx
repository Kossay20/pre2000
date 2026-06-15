import React from 'react';
import { View, Text } from 'react-native';
import { theme } from '../../theme';
import { styles } from '../../screens/CalendarScreen.styles';

interface CalendarMonthStatsProps {
    totalEvents: number;
    userEventCount: number;
    suggestionCount: number;
    t: (key: string) => string;
}

export const CalendarMonthStats: React.FC<CalendarMonthStatsProps> = ({
    totalEvents,
    userEventCount,
    suggestionCount,
    t,
}) => (
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
