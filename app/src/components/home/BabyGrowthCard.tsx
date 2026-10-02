import { theme } from '../../theme';
import React, { useRef, useEffect } from 'react';
import {
    View,
    Text,
    Image,
    StyleSheet,
    TouchableOpacity,
    Animated,
    } from 'react-native';
import { Week } from '../../types';
import { getLocalizedContent } from '../../utils/i18nHelpers';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getBabyGrowthForWeek } from '../../config/babyGrowthData';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { RtlAwareChevron } from '../common/RtlAwareChevron';
import { babyIllustrationSize, getContentWidth } from '../../utils/layout';
import { pregnancyProgressPercent } from './BabyGrowthCard.helpers';

const width = getContentWidth();

interface BabyGrowthCardProps {
    currentWeek: number;
    /** U-FIX-6: optional day-in-week (1..7) for accurate dayOfPregnancy display.
     *  When omitted, falls back to `currentWeek * 7` (legacy behavior). */
    currentDay?: number;
    /** Her real day of pregnancy (displayedPregnancyAge). Past the due date the content
     *  week stays on 40, so deriving the day from it froze the counter on "Jour 280". */
    dayOfPregnancy?: number;
    babyName?: string;
    dueDate?: Date;
    weekData?: Week;
}

export const BabyGrowthCard = React.memo<BabyGrowthCardProps>(({
    currentWeek,
    currentDay,
    dayOfPregnancy: realDayOfPregnancy,
    babyName,
    dueDate,
    weekData,
}) => {
    const { t, i18n } = useTranslation();
    const navigation = useNavigation();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;

    // Get baby growth data for current week
    const monthData = getBabyGrowthForWeek(currentWeek);

    // U-FIX-6: was `currentWeek * 7` which always overshot by `7 - dayInWeek` days.
    // E.g. week 10 day 3 displayed day 70 instead of day 66 (= (10-1)*7 + 3).
    // Falls back to legacy formula if currentDay isn't passed (no regression).
    const dayOfPregnancy = realDayOfPregnancy
        ?? (currentDay != null
            ? Math.max(1, (currentWeek - 1) * 7 + currentDay)
            : currentWeek * 7);
    const progressPercent = pregnancyProgressPercent(dayOfPregnancy);

    // Animation on mount/update
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 20,
                friction: 7,
                useNativeDriver: true,
            }),
        ]).start();
    }, [monthData.month]);

    return (
        <Animated.View
            style={[
                styles.card,
                {
                    opacity: fadeAnim,
                    transform: [{ scale: scaleAnim }],
                },
            ]}
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.babyName}>
                    👶 {babyName || t('home.yourBaby')}
                </Text>
                <Text style={styles.monthBadge}>
                    {t('home.month')} {monthData.month}
                </Text>
            </View>

            {/* Image Container avec dégradé */}
            <LinearGradient
                colors={[theme.colors.surfaceBlush, theme.colors.lavenderBlush]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.imageContainer}
            >
                <Image
                    source={monthData.image}
                    style={styles.babyImage}
                    resizeMode="contain"
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={t('a11y.babyIllustrationMonth', { month: monthData.month })}
                />


            </LinearGradient>

            {/* Timeline Info */}
            <View style={[styles.timeline, { justifyContent: 'center' }]}>
                <View style={[styles.timelineItem, { justifyContent: 'center' }]}>
                    <Ionicons name="calendar-outline" size={18} color={theme.colors.neutral900} />
                    <Text style={styles.timelineText}>
                        {t('home.day')} {dayOfPregnancy}
                    </Text>
                </View>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                    <LinearGradient
                        colors={[theme.colors.primary, theme.colors.pinkSoft300]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.progressFill, { width: `${progressPercent}%` }]}
                    />
                </View>
                <Text style={styles.progressText}>
                    {progressPercent.toFixed(0)}%
                </Text>
            </View>

            {/* Fun Fact */}
            {monthData.facts && monthData.facts.length > 0 && (
                <View style={styles.factContainer}>
                    <Text style={styles.factIcon}>💡</Text>
                    <Text style={styles.factText} numberOfLines={2}>
                        {t(monthData.facts[0])}
                    </Text>
                </View>
            )}

            {/* CTA Button */}
            <TouchableOpacity
                style={styles.ctaButton}
                onPress={() => {
                    navigation.navigate('BabyEvolution' as never);
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('home.babyEvolution')}
                accessibilityHint={t('a11y.openItem')}
            >
                <Text style={styles.ctaText}>
                    {t('home.babyEvolution')}
                </Text>
                {/* RTL FIX: arrow auto-mirrors via RtlAwareChevron (was hardcoded '→') */}
                <RtlAwareChevron direction="forward" variant="arrow" size={18} color={theme.colors.white} />
            </TouchableOpacity>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.white,
        borderRadius: 24,
        padding: 20,
        marginHorizontal: 16,
        marginVertical: 12,
        shadowColor: theme.colors.primary,
        shadowOpacity: 0.15,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    babyName: {
        fontSize: 20,
        fontWeight: '700',
        color: theme.colors.neutral900,
    },
    monthBadge: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.accent,
        backgroundColor: theme.colors.surfaceBlush,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    imageContainer: {
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 280,
        position: 'relative',
        marginBottom: 16,
    },
    babyImage: babyIllustrationSize(width),
    comparisonBadge: {
        position: 'absolute',
        bottom: 16,
        // Cycle 2 F311 RTL : `end` flip auto en arabe.
        end: 16,
        backgroundColor: theme.colors.whiteAlpha95,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 16,
        shadowColor: theme.colors.black,
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 4,
        alignItems: 'center',
    },
    comparisonEmoji: {
        fontSize: 24,
        marginBottom: 4,
    },
    comparisonText: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.neutral900,
        marginBottom: 2,
    },
    sizeText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
    },
    timeline: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingVertical: 12,
        backgroundColor: theme.colors.surfacePinkMist,
        borderRadius: 12,
        marginBottom: 16,
    },
    timelineItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    timelineText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.neutral900,
    },
    timelineDivider: {
        width: 1,
        height: 20,
        backgroundColor: theme.colors.pinkLightPastel,
        opacity: 0.3,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
    },
    progressBar: {
        flex: 1,
        height: 8,
        backgroundColor: theme.colors.surfaceBlush,
        borderRadius: 4,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: 4,
    },
    progressText: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.accent,
        minWidth: 45,
        textAlign: 'right',
    },
    factContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: theme.colors.surfaceTip,
        padding: 12,
        borderRadius: 12,
        marginBottom: 14,
        gap: 10,
    },
    factIcon: {
        fontSize: 16,
        marginTop: 2,
    },
    factText: {
        flex: 1,
        fontSize: 13,
        color: theme.colors.brownText700,
        lineHeight: 18,
    },
    ctaButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.accent,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 14,
        gap: 8,
        shadowColor: theme.colors.primary,
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 4,
        marginBottom: 12, // Fix: Avoid button cut-off
    },
    ctaText: {
        fontSize: 15,
        fontWeight: '700',
        color: theme.colors.white,
    },
    ctaIcon: {
        fontSize: 18,
        color: theme.colors.white,
    },
});
