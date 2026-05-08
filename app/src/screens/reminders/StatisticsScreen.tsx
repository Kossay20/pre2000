import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../../theme';
import { hexToRgba } from '../../utils/styleUtils';
import { getHistoricalData } from '../../services/dailyChecklistService';
// F5: use getEssentialReminders (already filters rem_hyd_water + sorts by essential_rank)
import { getReminderCompletions, calculateStreak, getEssentialReminders } from '../../services/remindersV2Service';
import { getLocalizedTrilang } from '../../utils/i18nHelpers';
import { createLogger } from '../../utils/logger';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { useDateLocale } from '../../hooks/useDateLocale';
import { useAuth } from '../../context/AuthContext';
import { format, parseISO } from 'date-fns';
import { useScreenAnalytics } from '../../hooks/useScreenAnalytics';
import { RtlAwareChevron } from '../../components/common/RtlAwareChevron';
// Cycle 5 F702 — EmptyState avec CTA cohérent design system.
import { EmptyState } from '../../components/common/EmptyState';
import { Button } from '../../components/common/Button';

const log = createLogger('StatisticsScreen');
const screenWidth = Dimensions.get('window').width;

export const StatisticsScreen = () => {
    useScreenAnalytics('StatisticsScreen');
    const navigation = useNavigation();
    const { t, i18n } = useTranslation();
    const dateLocale = useDateLocale();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState<'week' | 'month'>('week');
    const [data, setData] = useState<{
        dates: string[];
        completionRates: number[];
        hydration: number[];
        vitamins: number[];
    } | null>(null);
    // STATS-FIX: Streak and reminder stats from remindersV2
    const [overallStreak, setOverallStreak] = useState(0);
    const [bestStreak, setBestStreak] = useState(0);
    const [reminderBadges, setReminderBadges] = useState<Array<{
        id: string;
        emoji: string;
        title: string;
        streak: number;
        unlocked: boolean;
    }>>([]);


    useEffect(() => {
        loadStats();
    }, [timeRange]);

    const loadStats = useCallback(async () => {
        setLoading(true);
        try {
            const days = timeRange === 'week' ? 7 : 30;
            // Checklist historical data (completion rates, hydration, vitamins)
            const stats = await getHistoricalData(days);
            setData(stats);

            // F5: align KEY_REMINDERS with the actual catalogue shown in UI.
            // Was hardcoded list including `rem_hyd_water` which is filtered out
            // everywhere else → user saw a badge for a reminder that doesn't exist.
            // Now derived from `getEssentialReminders` (rank-sorted, water excluded).
            const userId = user?.isGuest ? undefined : user?.uid;
            const essentials = getEssentialReminders().slice(0, 4); // top 4 by essential_rank

            let globalMax = 0;
            const badges = await Promise.all(
                essentials.map(async (reminder) => {
                    const dates = await getReminderCompletions(reminder.id, userId);
                    const streak = calculateStreak(dates);
                    if (streak > globalMax) globalMax = streak;
                    return {
                        id: reminder.id,
                        emoji: reminder.ui?.icon || '⭐',
                        // F5: use the trilang helper instead of forcing .fr — respects user language
                        title: typeof reminder.title === 'string'
                            ? reminder.title
                            : getLocalizedTrilang(reminder.title as any, i18n.language),
                        streak,
                        unlocked: streak >= 3,
                    };
                })
            );

            // Overall streak = max streak across all key reminders
            setOverallStreak(globalMax);
            setBestStreak(prev => Math.max(prev, globalMax));
            setReminderBadges(badges);
        } catch (error) {
            log.error('Error loading stats:', error);
        } finally {
            setLoading(false);
        }
    }, [timeRange, user?.uid, i18n.language]);

    if (loading) {
        return (
            <View testID="statistics_screen_root" style={styles.centerContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>{t('loadingStats')}</Text>
            </View>
        );
    }

    if (!data || data.dates.length === 0) {
        // Cycle 5 F702 — empty state aligné design system + CTA "Aller aux tâches"
        // (avant : juste emoji + texte, l'utilisatrice n'avait aucune action proposée).
        return (
            <View testID="statistics_screen_root" style={{ flex: 1 }}>
                <EmptyState
                    icon="📊"
                    title={t('noDataYet')}
                    subtitle={t('useAppForStats')}
                    action={
                        <Button
                            title={t('goToTasks')}
                            onPress={() => navigation.goBack()}
                        />
                    }
                />
            </View>
        );
    }

    return (
        <ScrollView testID="statistics_screen_root" style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <View style={styles.backRow}>
                        <RtlAwareChevron direction="back" variant="arrow" size={16} color={theme.colors.primary} />
                        <Text style={styles.backButtonText}>{t('back')}</Text>
                    </View>
                </TouchableOpacity>
                <Text style={styles.title}>{t('myStats')}</Text>
            </View>
            {/* Streak Hero Card */}
            <View style={styles.streakContainer}>
                <LinearGradient
                    colors={overallStreak >= 7 ? [theme.colors.orangeDeepAccent, theme.colors.orangeStreakLight] : overallStreak >= 3 ? [theme.colors.accent, theme.colors.pinkAccent] : [theme.colors.purple700, theme.colors.accentPurple]}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                    style={styles.streakCard}
                >
                    <View style={styles.streakContent}>
                        <Text style={styles.streakEmoji}>
                            {overallStreak >= 14 ? '🔥' : overallStreak >= 7 ? '⚡' : overallStreak >= 3 ? '✨' : '💪'}
                        </Text>
                        <View>
                        <Text style={styles.streakCount}>{overallStreak} {t('gamification.days')}</Text>
                            <Text style={styles.streakLabel}>{t('gamification.currentStreak')}</Text>
                        </View>
                    </View>
                </LinearGradient>
            </View>

            {/* Reminder Badges */}
            {reminderBadges.length > 0 && (
                <View style={styles.chartCard}>
                    <Text style={styles.chartTitle}>{t('gamification.reminderStreaks')}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                        {reminderBadges.map(badge => (
                            <View key={badge.id} style={[styles.badgeItem, !badge.unlocked && styles.badgeLocked]}>
                                <View style={[styles.badgeIconContainer, !badge.unlocked && styles.badgeIconLocked]}>
                                    <Text style={styles.badgeIcon}>{badge.emoji}</Text>
                                </View>
                                <Text style={styles.badgeTitle} numberOfLines={2}>{badge.title}</Text>
                                <Text style={[styles.badgeStatus, { color: badge.unlocked ? theme.colors.success : theme.colors.textLight }]}>
                                    {badge.streak}j{badge.unlocked ? ' 🏆' : ''}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            <View style={styles.rangeSelector}>
                <TouchableOpacity
                    style={[styles.rangeButton, timeRange === 'week' && styles.rangeButtonActive]}
                    onPress={() => setTimeRange('week')}
                >
                    <Text style={[styles.rangeText, timeRange === 'week' && styles.rangeTextActive]}>{t('sevenDays')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.rangeButton, timeRange === 'month' && styles.rangeButtonActive]}
                    onPress={() => setTimeRange('month')}
                >
                    <Text style={[styles.rangeText, timeRange === 'month' && styles.rangeTextActive]}>{t('thirtyDays')}</Text>
                </TouchableOpacity>
            </View>

            {/* Global Progress Chart */}
            <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('globalSuccess')}</Text>
                <LineChart
                    data={{
                        labels: data.dates.map(d => format(parseISO(d), 'dd/MM', { locale: dateLocale })),
                        datasets: [{ data: data.completionRates }]
                    }}
                    width={screenWidth - 48}
                    height={220}
                    yAxisSuffix="%"
                    chartConfig={{
                        backgroundColor: theme.colors.white,
                        backgroundGradientFrom: theme.colors.white,
                        backgroundGradientTo: theme.colors.white,
                        decimalPlaces: 0,
                        color: (opacity = 1) => hexToRgba(theme.colors.accent, opacity),
                        labelColor: (opacity = 1) => hexToRgba(theme.colors.black, opacity),
                        style: { borderRadius: 16 },
                        propsForDots: { r: "6", strokeWidth: "2", stroke: theme.colors.accent }
                    }}
                    bezier
                    style={styles.chart}
                />
            </View>



            {/* Hydration Chart */}
            <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('hydrationLiters')}</Text>
                <BarChart
                    data={{
                        labels: data.dates.map(d => format(parseISO(d), 'dd/MM', { locale: dateLocale })),
                        datasets: [{ data: data.hydration }]
                    }}
                    width={screenWidth - 48}
                    height={220}
                    yAxisLabel=""
                    yAxisSuffix="L"
                    chartConfig={{
                        backgroundColor: theme.colors.white,
                        backgroundGradientFrom: theme.colors.white,
                        backgroundGradientTo: theme.colors.white,
                        decimalPlaces: 1,
                        color: (opacity = 1) => hexToRgba(theme.colors.blue600, opacity),
                        labelColor: (opacity = 1) => hexToRgba(theme.colors.black, opacity),
                        barPercentage: 0.5,
                    }}
                    style={styles.chart}
                />
            </View>

            {/* Vitamins Consistency */}
            <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>{t('vitaminIntake')}</Text>
                <View style={styles.vitaminGrid}>
                    {data.dates.map((date, index) => (
                        <View key={index} style={styles.vitaminDay}>
                            <Text style={styles.vitaminDate}>{format(parseISO(date), 'dd/MM', { locale: dateLocale })}</Text>
                            <View style={[
                                styles.vitaminCircle,
                                data.vitamins[index] ? styles.vitaminTaken : styles.vitaminMissed
                            ]}>
                                <Text style={styles.vitaminIcon}>
                                    {data.vitamins[index] ? '✓' : '✗'}
                                </Text>
                            </View>
                        </View>
                    ))}
                </View>
            </View>

            <View style={{ height: 40 }} />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.neutral100,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    header: {
        padding: 20,
        paddingTop: 60,
        backgroundColor: theme.colors.white,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.disabled,
    },
    backButton: {
        marginEnd: 16,
    },
    backRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    backButtonText: {
        fontSize: 16,
        color: theme.colors.primary,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    // New Gamification Styles
    streakContainer: {
        padding: 16,
    },
    streakCard: {
        borderRadius: 16,
        padding: 16,
        elevation: 4,
        shadowColor: theme.colors.accentOrangeDeep,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
    },
    streakContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    streakEmoji: {
        fontSize: 40,
        marginEnd: 16,
    },
    streakCount: {
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.colors.white,
    },
    streakLabel: {
        fontSize: 14,
        color: theme.colors.whiteAlpha90,
        fontWeight: '600',
    },
    badgesContainer: {
        paddingVertical: 8,
    },
    badgeItem: {
        alignItems: 'center',
        marginEnd: 16,
        width: 80,
    },
    badgeLocked: {
        opacity: 0.5,
    },
    badgeIconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: theme.colors.surfaceOrangeTint,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
        borderWidth: 2,
        borderColor: theme.colors.warning,
    },
    badgeIconLocked: {
        backgroundColor: theme.colors.divider,
        borderColor: theme.colors.materialGray400,
    },
    badgeIcon: {
        fontSize: 24,
    },
    badgeTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.neutral900,
        textAlign: 'center',
        marginBottom: 4,
    },
    badgeStatus: {
        fontSize: 10,
        color: theme.colors.textSecondary,
    },
    // Existing Styles
    rangeSelector: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginVertical: 16,
        backgroundColor: theme.colors.white,
        marginHorizontal: 20,
        borderRadius: 12,
        padding: 4,
    },
    rangeButton: {
        paddingVertical: 8,
        paddingHorizontal: 24,
        borderRadius: 8,
    },
    rangeButtonActive: {
        backgroundColor: theme.colors.primary,
    },
    rangeText: {
        color: theme.colors.textSecondary,
        fontWeight: '600',
    },
    rangeTextActive: {
        color: theme.colors.white,
    },
    chartCard: {
        backgroundColor: theme.colors.white,
        marginHorizontal: 16,
        marginBottom: 16,
        padding: 16,
        borderRadius: 16,
        elevation: 2,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    chartTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: theme.colors.neutral900,
        marginBottom: 16,
    },
    chart: {
        marginVertical: 8,
        borderRadius: 16,
    },
    loadingText: {
        marginTop: 12,
        color: theme.colors.textSecondary,
    },
    emptyEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.neutral900,
        marginBottom: 8,
    },
    emptyText: {
        textAlign: 'center',
        color: theme.colors.textSecondary,
        lineHeight: 22,
    },
    vitaminGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 8,
    },
    vitaminDay: {
        alignItems: 'center',
        width: '13%',
    },
    vitaminDate: {
        fontSize: 10,
        color: theme.colors.textLight,
        marginBottom: 4,
    },
    vitaminCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    vitaminTaken: {
        backgroundColor: theme.colors.surfaceGreenTint,
        borderWidth: 1,
        borderColor: theme.colors.green500,
    },
    vitaminMissed: {
        backgroundColor: theme.colors.surfaceRose,
        borderWidth: 1,
        borderColor: theme.colors.redAccentLight,
    },
    vitaminIcon: {
        fontSize: 14,
        fontWeight: 'bold',
        color: theme.colors.neutral900,
    },
});
