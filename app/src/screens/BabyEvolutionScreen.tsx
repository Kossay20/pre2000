/**
 * BabyEvolutionScreen
 * 
 * Affiche l'évolution du bébé sur 9 mois avec images 3D
 * et comparaisons fruits/légumes
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getAllBabyGrowthData, getBabyGrowthForWeek, BabyGrowthMonth } from '../config/babyGrowthData';
import { usePregnancy } from '../context/PregnancyContext';
import { theme } from '../theme';
import { RtlAwareChevron } from '../components/common/RtlAwareChevron';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { getContentWidth } from '../utils/layout';
import {
    fetalLengthLabelKey,
    formatFetalLength,
    getFetalComparisonName,
    getFetalGrowth,
    monthComparisonWeek,
} from '../utils/fetalGrowth';

const width = getContentWidth();
const CARD_WIDTH = width - 48;

export const BabyEvolutionScreen = () => {
    useScreenAnalytics('BabyEvolutionScreen');
    const navigation = useNavigation();
    const { t, i18n } = useTranslation();
    const { pregnancyInfo } = usePregnancy();
    const currentWeek = pregnancyInfo?.week || 1;
    const isRTL = ['ar', 'tn'].includes(i18n.language);


    // F7 FIX: Calculate current month using the SAME logic as `getBabyGrowthForWeek`
    // (which uses real weekStart/weekEnd bounds). Previous formula `Math.ceil(currentWeek / 4.4)`
    // was approximate and shifted by ±1 month around boundaries (e.g. week 13 fell in month 4
    // instead of month 3). This ensures the highlighted card always matches the data.
    const currentMonth = getBabyGrowthForWeek(currentWeek).month;

    const allMonths = getAllBabyGrowthData();
    const [activeMonth, setActiveMonth] = useState(currentMonth);

    React.useEffect(() => {
        setActiveMonth(currentMonth);
    }, [currentMonth]);

    const goToMonth = (month: number) => {
        setActiveMonth(Math.min(allMonths.length, Math.max(1, month)));
    };

    const renderMonthCard = (monthData: BabyGrowthMonth, index: number) => {
        const isCurrentMonth = monthData.month === currentMonth;
        // The card quotes one week of the weekly table (the user's own week on the
        // current month), so its fruit and size are exactly what Home shows for it.
        const comparisonWeek = monthComparisonWeek(monthData.weekStart, monthData.weekEnd, currentWeek);
        const growth = getFetalGrowth(comparisonWeek);

        return (
            <View key={monthData.month} style={styles.cardWrapper}>
                <LinearGradient
                    colors={isCurrentMonth ? [theme.colors.surfaceBlush, theme.colors.lavenderBlush] : [theme.colors.surface, theme.colors.white]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.card, isCurrentMonth && styles.currentCard]}
                >
                    {/* Month Header */}
                    <View style={styles.monthHeader}>
                        <Text style={styles.monthNumber}>{t('common.monthLabel', { number: monthData.month })}</Text>
                        <Text style={styles.weekRange}>
                            {t('home.weeks', { start: monthData.weekStart, end: monthData.weekEnd })}
                        </Text>
                        {isCurrentMonth && (
                            <View style={styles.currentBadge}>
                                <Text style={styles.currentBadgeText}>{t('home.youAreHere')}</Text>
                            </View>
                        )}
                    </View>

                    {/* 3D Baby Image */}
                    <View style={styles.imageContainer}>
                        <Image
                            source={monthData.image}
                            style={styles.babyImage}
                            resizeMode="contain"
                            accessible
                            accessibilityRole="image"
                            accessibilityLabel={t('a11y.babyIllustrationMonth', { month: monthData.month })}
                        />
                    </View>

                    {/* Size Comparison */}
                    <View style={styles.comparisonContainer}>
                        <Text style={styles.comparisonEmoji}>{growth.emoji}</Text>
                        <View style={styles.comparisonInfo}>
                            <Text style={styles.comparisonItem}>{getFetalComparisonName(comparisonWeek, i18n.language)}</Text>
                            <Text style={styles.comparisonSize}>{formatFetalLength(growth, i18n.language, t)}</Text>
                            <Text style={styles.comparisonCaption}>
                                {t('common.weekLabel', { number: comparisonWeek })} · {t(fetalLengthLabelKey(growth))}
                            </Text>
                        </View>
                    </View>

                    {/* Development Facts */}
                    <View style={styles.factsContainer}>
                        <Text style={styles.factsTitle}>🌟 {t('babyEvolution.development')}</Text>
                        {monthData.facts.slice(0, 2).map((fact, i) => (
                            <View key={i} style={[styles.factRow, isRTL && styles.factRowRtl]}>
                                <Text style={[styles.factBullet, isRTL && styles.factBulletRtl]}>•</Text>
                                <Text style={[styles.factText, isRTL && styles.factTextRtl]}>{t(fact)}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Highlights */}
                    <View style={styles.highlightsContainer}>
                        {monthData.developmentHighlights.slice(0, 2).map((highlight, i) => (
                            <View key={i} style={styles.highlightChip}>
                                <Text style={styles.highlightText}>{t(highlight)}</Text>
                            </View>
                        ))}
                    </View>
                </LinearGradient>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('a11y.back')}
                >
                    <View style={styles.backRow}>
                        <RtlAwareChevron direction="back" variant="arrow" size={18} color={theme.colors.primary} />
                        <Text style={styles.backText}>{t('common.back')}</Text>
                    </View>
                </TouchableOpacity>
                <Text style={styles.title}>{t('home.babyEvolution')}</Text>
                <View style={styles.placeholder} />
            </View>

            {/* Progress Indicator.
                DIRECTION-CONSISTENCY FIX: the card scroller is deliberately forced to
                LTR geometry on web (see the effect above — RTL gave Chromium a negative
                scrollLeft that clamped scrollTo to 0 and stranded ar/tn on Month 9), so
                Month 1 sits leftmost. These dots, being a plain row, mirrored with the
                document and put Month 1's dot on the RIGHT — the active dot travelled
                the opposite way to the cards. Pin the row to the same LTR order as the
                cards it indexes. With the cards now reversed for RTL, the dots' own
                natural mirroring (index 0 rightmost under dir=rtl) already lines up
                with Month 1 on the right — no override needed. */}
            <View style={styles.progressContainer}>
                {allMonths.map((_, index) => (
                    <TouchableOpacity
                        key={index}
                        onPress={() => goToMonth(index + 1)}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.monthLabel', { number: index + 1 })}
                        accessibilityState={{ selected: activeMonth === index + 1 }}
                        // react-native-web drops accessibilityState; without this every dot
                        // is the same "Month n" button and none is announced as the open one.
                        {...(Platform.OS === 'web' ? { 'aria-pressed': activeMonth === index + 1 } : {})}
                        style={styles.progressDotTouch}
                    >
                        <View
                            style={[
                                styles.progressDot,
                                activeMonth === index + 1 && styles.progressDotActive,
                                index + 1 <= currentMonth && styles.progressDotPassed,
                            ]}
                        />
                    </TouchableOpacity>
                ))}
            </View>

            {/* Month Label */}
            <Text style={styles.monthLabel}>
                {allMonths[activeMonth - 1]
                    ? getFetalGrowth(monthComparisonWeek(allMonths[activeMonth - 1].weekStart, allMonths[activeMonth - 1].weekEnd, currentWeek)).emoji
                    : ''} {t('common.monthLabel', { number: activeMonth })} / 9
            </Text>

            <View style={styles.singleCardWrap} accessibilityLabel={t('common.monthLabel', { number: activeMonth })}>
                {allMonths[activeMonth - 1]
                    ? renderMonthCard(allMonths[activeMonth - 1], activeMonth - 1)
                    : null}
            </View>

            {/* Bottom Info */}
            <View style={styles.bottomInfo}>
                <Text style={styles.bottomText}>
                    {t('home.tapDotToSee')}
                </Text>
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backButton: {
        padding: 8,
        minHeight: 44,
        justifyContent: 'center',
    },
    backRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    backText: {
        fontSize: 16,
        color: theme.colors.accent,
        fontWeight: '600',
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.colors.text,
    },
    placeholder: {
        width: 60,
    },
    progressContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    // The dot stays 10pt; its pressable box is 44pt tall and shares the row's width
    // (9 × 44pt does not fit a phone, so each box gets up to 44pt — ~37pt on a 375pt
    // phone, the full 44pt on a tablet). hitSlop alone is ignored on web.
    progressDotTouch: {
        flex: 1,
        maxWidth: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    progressDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: theme.colors.disabled,
    },
    progressDotActive: {
        backgroundColor: theme.colors.accent,
        transform: [{ scale: 1.3 }],
    },
    progressDotPassed: {
        backgroundColor: theme.colors.pink200,
    },
    monthLabel: {
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: 12,
    },
    singleCardWrap: {
        alignItems: 'center',
        paddingBottom: 20,
    },
    cardWrapper: {
        width: CARD_WIDTH,
    },
    card: {
        borderRadius: 24,
        padding: 20,
        shadowColor: theme.colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
    },
    currentCard: {
        borderWidth: 2,
        borderColor: theme.colors.accent,
    },
    monthHeader: {
        alignItems: 'center',
        marginBottom: 16,
    },
    monthNumber: {
        fontSize: 24,
        fontWeight: '800',
        color: theme.colors.neutral900,
    },
    weekRange: {
        fontSize: 14,
        color: theme.colors.textLight,
        marginTop: 4,
    },
    currentBadge: {
        backgroundColor: theme.colors.accent,
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        marginTop: 8,
    },
    currentBadgeText: {
        color: theme.colors.white,
        fontSize: 12,
        fontWeight: '600',
    },
    imageContainer: {
        alignItems: 'center',
        marginVertical: 16,
    },
    babyImage: {
        width: CARD_WIDTH - 60,
        height: 200,
        borderRadius: 16,
    },
    comparisonContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.white,
        padding: 12,
        borderRadius: 16,
        marginBottom: 16,
    },
    comparisonEmoji: {
        fontSize: 40,
        marginEnd: 12,
    },
    comparisonInfo: {
        alignItems: 'flex-start',
    },
    comparisonItem: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.neutral900,
    },
    comparisonSize: {
        fontSize: 14,
        color: theme.colors.textLight,
    },
    comparisonCaption: {
        fontSize: 12,
        color: theme.colors.textMuted,
        marginTop: 2,
    },
    factsContainer: {
        marginBottom: 12,
    },
    factsTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: theme.colors.neutral900,
        marginBottom: 8,
    },
    factRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    // RTL: the carousel scroller is forced to dir=ltr (scroll fix), so the card internals
    // need explicit mirroring — bullet on the trailing (right) side next to the Arabic text.
    factRowRtl: {
        flexDirection: 'row-reverse',
    },
    factBullet: {
        fontSize: 14,
        color: theme.colors.accent,
        marginEnd: 8,
    },
    factBulletRtl: {
        marginEnd: 0,
        marginStart: 8,
    },
    factText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        flex: 1,
    },
    factTextRtl: {
        textAlign: 'right',
    },
    highlightsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    highlightChip: {
        backgroundColor: theme.colors.surfacePurpleTint,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    highlightText: {
        fontSize: 12,
        color: theme.colors.purple700,
    },
    bottomInfo: {
        padding: 16,
        alignItems: 'center',
    },
    bottomText: {
        fontSize: 13,
        color: theme.colors.textMuted,
        fontStyle: 'italic',
    },
});

export default BabyEvolutionScreen;
