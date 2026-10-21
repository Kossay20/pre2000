import { theme } from '../../theme';
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { addDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { getShadowStyle } from '../../utils/styleUtils';
import { RtlAwareChevron } from '../common/RtlAwareChevron';

interface HomeHeaderProps {
    displayName: string;
    currentWeekNumber: number;
    currentDay: number;
    overrideDay: number | null;
    trimesterText: string;
    cleanTitle: string;
    emoji: string;
    lmp?: string;
    fadeAnim: Animated.Value;
    scaleAnim: Animated.Value;
    pulseAnim: Animated.Value;
    onProfilePress: () => void;
    onPrevWeek: () => void;
    onNextWeek: () => void;
    onPrevDay: () => void;
    onNextDay: () => void;
    onDaySelect: (day: number) => void;
}

export const HomeHeader: React.FC<HomeHeaderProps> = ({
    displayName,
    currentWeekNumber,
    currentDay,
    overrideDay,
    trimesterText,
    cleanTitle,
    emoji,
    lmp,
    fadeAnim,
    scaleAnim,
    pulseAnim,
    onProfilePress,
    onPrevWeek,
    onNextWeek,
    onPrevDay,
    onNextDay,
    onDaySelect,
}) => {
    const navigation = useNavigation();
    const { t } = useTranslation();
    const displayDay = overrideDay ?? currentDay;

    const renderDayProgressBar = () => (
        <View style={styles.progressContainer}>
            <View style={styles.dayNavContainer}>
                <TouchableOpacity
                    onPress={onPrevDay}
                    disabled={currentWeekNumber === 1 && displayDay === 1}
                    style={styles.dayNavButton}
                >
                    <RtlAwareChevron
                        direction="back"
                        size={24}
                        color={theme.colors.white}
                        style={(currentWeekNumber === 1 && displayDay === 1) ? styles.disabledText : undefined}
                    />
                </TouchableOpacity>

                <View style={styles.progressBarWrapper}>
                    <View style={styles.progressBar}>
                        {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                            <TouchableOpacity
                                key={day}
                                onPress={() => onDaySelect(day)}
                                style={[
                                    styles.progressSegment,
                                    day <= displayDay ? styles.progressSegmentActive : styles.progressSegmentInactive,
                                    day === 1 && styles.roundedLeft,
                                    day === 7 && styles.roundedRight,
                                    day === displayDay && {
                                        backgroundColor: theme.colors.white,
                                        ...getShadowStyle(4, theme.colors.white, 0.8, 4, { width: 0, height: 0 }),
                                    },
                                ]}
                            />
                        ))}
                    </View>
                    <Text style={styles.progressText}>{t('home.dayOf', { day: displayDay })}</Text>
                </View>

                <TouchableOpacity
                    onPress={onNextDay}
                    disabled={currentWeekNumber === 40 && displayDay === 7}
                    style={styles.dayNavButton}
                >
                    <RtlAwareChevron
                        direction="forward"
                        size={24}
                        color={theme.colors.white}
                        style={(currentWeekNumber === 40 && displayDay === 7) ? styles.disabledText : undefined}
                    />
                </TouchableOpacity>
            </View>
        </View>
    );

    return (
        <LinearGradient
            colors={[theme.colors.primary, theme.colors.accent, theme.colors.deepPink]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
        >
            <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
                {/* Profile Button */}
                <Animated.View style={[styles.profileButtonContainer, { transform: [{ scale: pulseAnim }] }]}>
                    <TouchableOpacity
                        style={styles.profileButton}
                        onPress={onProfilePress}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={[theme.colors.whiteAlpha30, theme.colors.whiteAlpha10]}
                            style={styles.profileGradient}
                        >
                            <Text style={styles.profileButtonText}>
                                {displayName.charAt(0).toUpperCase()}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </Animated.View>

                {/* Centered Content */}
                <View style={styles.centerContent}>
                    <View style={styles.headerTextContainer}>
                        <Text style={styles.greeting}>
                            {t('home.greeting', { name: displayName })}
                        </Text>
                        <Text style={styles.weekInfo}>
                            {t('home.weekDayInfo', { week: currentWeekNumber, day: currentDay })}
                        </Text>
                    </View>

                    {/* Week Navigation */}
                    <View style={styles.weekNavContainer}>
                        <TouchableOpacity
                            onPress={onPrevWeek}
                            disabled={currentWeekNumber <= 1}
                            style={styles.navButton}
                            activeOpacity={0.7}
                        >
                            <RtlAwareChevron
                                direction="back"
                                size={32}
                                color={theme.colors.white}
                                style={currentWeekNumber <= 1 ? styles.disabledText : undefined}
                            />
                        </TouchableOpacity>
                        <View style={styles.weekBadge}>
                            <Text style={styles.weekTitle}>{t('common.week')} {currentWeekNumber}</Text>
                            <Text style={styles.trimesterBadge}>{t('home.trimester', { trimester: trimesterText })}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={onNextWeek}
                            disabled={currentWeekNumber >= 40}
                            style={styles.navButton}
                            activeOpacity={0.7}
                        >
                            <RtlAwareChevron
                                direction="forward"
                                size={32}
                                color={theme.colors.white}
                                style={currentWeekNumber >= 40 ? styles.disabledText : undefined}
                            />
                        </TouchableOpacity>
                    </View>

                    {/* Week Subtitle */}
                    <Text style={styles.weekSubtitle}>
                        {cleanTitle} {emoji}
                    </Text>

                    {/* Day Progress */}
                    {renderDayProgressBar()}

                </View>
            </Animated.View>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    headerGradient: {
        paddingTop: 60,
        paddingBottom: 40,
        borderBottomStartRadius: 32,
        borderBottomEndRadius: 32,
    },
    header: {
        paddingHorizontal: 20,
    },
    profileButtonContainer: {
        position: 'absolute',
        // Cycle 2 F311 RTL : `end` flip auto en arabe.
        end: 20,
        top: 0,
        zIndex: 10,
    },
    profileButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        overflow: 'hidden',
    },
    profileGradient: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileButtonText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.white,
    },
    centerContent: {
        alignItems: 'center',
        paddingTop: 20,
    },
    headerTextContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    greeting: {
        fontSize: 26,
        fontWeight: '700',
        color: theme.colors.white,
        marginBottom: 4,
    },
    weekInfo: {
        fontSize: 14,
        color: theme.colors.whiteAlpha80,
    },
    weekNavContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    navButton: {
        padding: 12,
    },
    weekBadge: {
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    weekTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.colors.white,
    },
    trimesterBadge: {
        fontSize: 13,
        color: theme.colors.whiteAlpha90,
        marginTop: 2,
    },
    weekSubtitle: {
        fontSize: 18,
        color: theme.colors.white,
        marginBottom: 20,
        textAlign: 'center',
    },
    quickLinksRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 16,
    },
    quickLink: {
        fontSize: 13,
        color: theme.colors.whiteAlpha90,
        fontWeight: '500',
    },
    linkDivider: {
        color: theme.colors.whiteAlpha50,
        fontSize: 12,
    },
    disabledText: {
        opacity: 0.3,
    },
    progressContainer: {
        width: '100%',
        paddingHorizontal: 10,
    },
    dayNavContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayNavButton: {
        padding: 10,
    },
    progressBarWrapper: {
        flex: 1,
        alignItems: 'center',
    },
    progressBar: {
        flexDirection: 'row',
        width: '100%',
        height: 8,
        gap: 3,
    },
    progressSegment: {
        flex: 1,
        height: 8,
    },
    progressSegmentActive: {
        backgroundColor: theme.colors.whiteAlpha70,
    },
    progressSegmentInactive: {
        backgroundColor: theme.colors.whiteAlpha25,
    },
    roundedLeft: {
        borderTopStartRadius: 4,
        borderBottomStartRadius: 4,
    },
    roundedRight: {
        borderTopEndRadius: 4,
        borderBottomEndRadius: 4,
    },
    progressText: {
        fontSize: 12,
        color: theme.colors.whiteAlpha80,
        marginTop: 6,
    },
});
