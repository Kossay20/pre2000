import { createLogger } from '../utils/logger';
const log = createLogger('HomeScreen');
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Image,
    RefreshControl,
    Modal,
    Alert,
    ActivityIndicator,
    Animated,
    Platform,
    AccessibilityInfo,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { HomeHeader } from '../components/home/HomeHeader';
import { BabyGrowthCard } from '../components/home/BabyGrowthCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCurrentWeek } from '../services/useCurrentWeek';
import { useAuth } from '../context/AuthContext';
import { usePregnancy } from '../context/PregnancyContext';
import { theme } from '../theme';
import { styles } from './HomeScreen.styles';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { SectionHeader } from '../components/common/SectionHeader';
import { Skeleton } from '../components/common/Skeleton'; // D4
import { EmptyState } from '../components/common/EmptyState'; // D5
import { RtlAwareChevron } from '../components/common/RtlAwareChevron';
import { MedicalDisclaimer } from '../components/common/MedicalDisclaimer';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getArticlesByIds, getSupplementsByIds } from '../services/contentService';
import { getUpcomingAppointments } from '../services/calendarService';
import { getTipForDay } from '../services/tipsService'; // ANTIGRAVITY
import { getMessageForDay } from '../services/babyMessageService'; // BABY MESSAGES
import { Article, Supplement, UserEvent, Tip, BabyMessage } from '../types';
import { format, differenceInCalendarDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { getLocalizedContent } from '../utils/i18nHelpers';
import { fetalLengthLabelKey, formatFetalComparison, formatFetalLength, formatFetalWeight, getFetalGrowth } from '../utils/fetalGrowth';
import { displayedPregnancyAge, trimesterFromWeek } from '../utils/pregnancyCalculator';
import { quickAddDateKey } from '../utils/appointmentDate';
import { formatGestationalAge } from '../utils/gestationalAge';
import { getReducedMotionSync } from '../hooks/usePrefersReducedMotion';
import { useRtl } from '../hooks/useRtl';
import { useDateLocale } from '../hooks/useDateLocale';
// V3 NEW COMPONENTS
import { BabyFactsCard } from '../components/home/BabyFactsCard';
import { MomTipsCard } from '../components/home/MomTipsCard';

import { BabyMessageCard } from '../components/home/BabyMessageCard'; // Quick Win #1
import { NotificationPrimerCard } from '../components/home/NotificationPrimerCard';
import { CollapsibleCard } from '../components/common/CollapsibleCard'; // Reorganization
import { DailyRoutinesTracker } from '../components/home/DailyRoutinesTracker'; // Unified Tracker
import { UserTask } from '../types';
import { trackPositiveAction } from '../services/inAppReviewService';
import { getUserTasks } from '../services/taskService';
import { HomeScreenNavigationProp } from '../types/navigation';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getContentWidth } from '../utils/layout';
import { RAMADAN_GUIDANCE_CLINICALLY_REVIEWED } from '../config/featureFlags';
import { useRefetchOnReconnect } from '../hooks/useRefetchOnReconnect';

const width = getContentWidth();
const HOME_WELCOME_SEEN_KEY = '@home_welcome_seen_v1';

export const HomeScreen = () => {
    useScreenAnalytics('HomeScreen');
    const [overrideWeek, setOverrideWeek] = useState<number | null>(null);
    const [overrideDay, setOverrideDay] = useState<number | null>(null);
    const { weekData, loading, error, currentWeekNumber, currentDay, displayWeek, dayOfPregnancy, isInvalid, isPostTerm, completedWeeks, completedDays, refetch } = useCurrentWeek(overrideWeek ?? undefined);
    // The week the header prints: the previewed week, or her real week — uncapped, so 40+3
    // SA reads "Semaine 41" like onboarding and the post-term note (currentWeekNumber stays
    // on 40 there: it only picks the week content).
    const shownWeek = overrideWeek ?? displayWeek;
    // Reads here are one-shot getDocs, so nothing re-delivers when the network
    // returns: without this, coming out of a tunnel leaves the error card up while
    // the offline banner disappears and implies everything is fine again.
    useRefetchOnReconnect(refetch);
    const { t, i18n } = useTranslation();
    const { isRTL } = useRtl();
    // W2 #3: ref to the horizontal recommendations carousel so we can apply the documented
    // RN-Web RTL fix (see BabyEvolutionScreen) — set dir=ltr on the scroll node so scrollLeft
    // stays positive/standard under document.dir=rtl (ar/tn). Cards keep logical paddingEnd.
    const recScrollRef = useRef<ScrollView>(null);
    const dateLocale = useDateLocale();
    const { user } = useAuth();
    const { profile, pregnancyInfo } = usePregnancy();
    const navigation = useNavigation();

    const [articles, setArticles] = useState<Article[]>([]);
    const [supplements, setSupplements] = useState<Supplement[]>([]);
    const [appointments, setAppointments] = useState<UserEvent[]>([]);
    const [tasks, setTasks] = useState<UserTask[]>([]); // Tasks for SmartReminders
    const [dailyTip, setDailyTip] = useState<Tip | null>(null); // ANTIGRAVITY
    const [babyMessage, setBabyMessage] = useState<BabyMessage | null>(null); // BABY MESSAGES
    const [showFullWarnings, setShowFullWarnings] = useState(false); // UI Refinement
    const [showFullBodyText, setShowFullBodyText] = useState(false); // UI Refinement
    // D3-03: first-run welcome — orient a brand-new user instead of dropping them on the full wall.
    const [showWelcome, setShowWelcome] = useState(false);

    // Animation values
    const [fadeAnim] = useState(new Animated.Value(0));
    const [scaleAnim] = useState(new Animated.Value(0.95));
    const [pulseAnim] = useState(new Animated.Value(1));

    useEffect(() => {
        // Entrance animation
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 600,
                useNativeDriver: false,
            }),
            Animated.spring(scaleAnim, {
                toValue: 1,
                tension: 50,
                friction: 7,
                useNativeDriver: false,
            }),
        ]).start();

        // Pulse animation for profile button — #11/DS-3: skip the perpetual loop when the
        // OS prefers reduced motion (the animation is decorative, not informational).
        const pulseLoop = getReducedMotionSync()
            ? null
            : Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.05,
                        duration: 1000,
                        useNativeDriver: false,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: false,
                    }),
                ])
            );
        pulseLoop?.start();

        // Engagement: Track daily check
        trackPositiveAction('daily_check');

        return () => {
            pulseLoop?.stop();
        };
    }, []);

    // D3-03: show the first-run welcome once (guest-safe via AsyncStorage/localStorage).
    useEffect(() => {
        let mounted = true;
        AsyncStorage.getItem(HOME_WELCOME_SEEN_KEY)
            .then((seen) => { if (mounted && !seen) setShowWelcome(true); })
            .catch(() => {/* default hidden on read error */});
        return () => { mounted = false; };
    }, []);

    const dismissWelcome = useCallback(() => {
        setShowWelcome(false);
        AsyncStorage.setItem(HOME_WELCOME_SEEN_KEY, '1').catch(() => {});
    }, []);

    // ── PERF: Articles + Supplements in parallel (was sequential) ──────────
    useEffect(() => {
        let isMounted = true;
        const fetchRecommendations = async () => {
            try {
                if (weekData) {
                    const articleIds = (weekData.recommended_articles_ids && typeof weekData.recommended_articles_ids === 'string')
                        ? weekData.recommended_articles_ids.split(',').map(id => id.trim()).filter(id => id)
                        : [];
                    const supplementIds = (weekData.recommended_supplements_ids && typeof weekData.recommended_supplements_ids === 'string')
                        ? weekData.recommended_supplements_ids.split(',').map(id => id.trim()).filter(id => id)
                        : [];

                    const [arts, supps] = await Promise.all([
                        articleIds.length > 0 ? getArticlesByIds(articleIds) : Promise.resolve([]),
                        supplementIds.length > 0 ? getSupplementsByIds(supplementIds) : Promise.resolve([]),
                    ]);

                    if (isMounted) {
                        log.debug('[HomeScreen] 📰 Loaded', arts.length, 'articles + 💊', supps.length, 'supplements for week', currentWeekNumber);
                        setArticles(arts);
                        setSupplements(supps);
                    }
                }
            } catch (error: any) {
                if (error.name !== 'AbortError') {
                    log.error('Error fetching recommendations:', error);
                }
            }
        };
        fetchRecommendations();
        return () => { isMounted = false; };
    }, [weekData]);

    // ── PERF: Appointments + Tasks in parallel (was sequential) ────────────
    useFocusEffect(
        useCallback(() => {
            const fetchAppointmentsAndTasks = async () => {
                if (user?.uid) {
                    // Uncapped: the list below shows 3, but the "this week" pill counts them all.
                    const [apps, userTasks] = await Promise.all([
                        getUpcomingAppointments(user.uid, Number.POSITIVE_INFINITY),
                        getUserTasks(user.uid),
                    ]);
                    setAppointments(apps);
                    setTasks(userTasks);
                }
            };
            fetchAppointmentsAndTasks();
        }, [user?.uid])
    );

    // ── PERF: Tip + BabyMessage in parallel (same deps, was 2 separate effects) ──
    useEffect(() => {
        let isMounted = true;
        const fetchDailyContent = async () => {
            if (currentWeekNumber && (overrideDay || currentDay)) {
                const dayToUse = overrideDay || currentDay;
                const [tip, message] = await Promise.all([
                    getTipForDay(currentWeekNumber, dayToUse),
                    getMessageForDay(currentWeekNumber, dayToUse),
                ]);
                if (isMounted) {
                    setDailyTip(tip);
                    setBabyMessage(message);
                }
            }
        };
        fetchDailyContent();
        return () => { isMounted = false; };
    }, [currentWeekNumber, currentDay, overrideDay]);

    const handlePrevWeek = useCallback(() => {
        if (shownWeek > 1) {
            // Past term the header reads 41-43 but the content ends at 40.
            const newWeek = Math.min(shownWeek - 1, 40);
            setOverrideWeek(newWeek);
            // W2 #5: the week badge updates silently — announce the new week to screen readers.
            AccessibilityInfo.announceForAccessibility(`${t('common.week')} ${newWeek}`);
            // Animate transition
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 0.7, duration: 150, useNativeDriver: false }),
                Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
            ]).start();
        }
    }, [shownWeek, fadeAnim, t]);

    const handleNextWeek = useCallback(() => {
        if (shownWeek < 40) {
            const newWeek = shownWeek + 1;
            setOverrideWeek(newWeek);
            setOverrideDay(null); // Reset day when changing week
            // W2 #5: announce the new week to screen readers.
            AccessibilityInfo.announceForAccessibility(`${t('common.week')} ${newWeek}`);
            // Animate transition
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 0.7, duration: 150, useNativeDriver: false }),
                Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
            ]).start();
        }
    }, [shownWeek, fadeAnim, t]);

    // #9 — Return to the user's *real* current week after time-travelling with the
    // week chevrons. Clearing the overrides hands control back to useCurrentWeek,
    // which recomputes from pregnancyInfo (the real week/day).
    const handleReturnToToday = useCallback(() => {
        setOverrideWeek(null);
        setOverrideDay(null);
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0.7, duration: 150, useNativeDriver: false }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
        ]).start();
    }, [fadeAnim]);

    // W2 #3: keep the horizontal recommendations carousel scrolling correctly under RTL.
    // RN-Web gives a horizontal ScrollView a NEGATIVE scrollLeft when document.dir=rtl, which
    // breaks geometry; forcing dir=ltr on the scroll node (cards keep logical order + paddingEnd)
    // restores standard scrolling. Same fix already proven in BabyEvolutionScreen.
    useEffect(() => {
        if (Platform.OS === 'web' && isRTL) {
            const node = recScrollRef.current?.getScrollableNode?.();
            if (node && typeof node.setAttribute === 'function') node.setAttribute('dir', 'ltr');
        }
    }, [isRTL, articles.length, supplements.length]);

    // Cycle 3 F211 — Mode TTC : home dédié minimal (pas de grossesse en cours).
    // Avant : aucun guard côté HomeScreen pour TTC → l'utilisatrice voyait un
    // BabyGrowthCard "semaine 0" + RDV grossesse (incohérent). Maintenant :
    // un screen simple "Vous essayez de concevoir" + cycle day count.
    if (user?.isTTC) {
        // W2 #7: derive the cycle day DST-safely (calendar days, not raw ms/86400 which drifts a
        // day across a DST boundary), and DON'T fabricate "Day 1" when no last-period date exists —
        // omit the day line instead of asserting a wrong count.
        const lmpDate = profile?.lmp ? new Date(profile.lmp) : null;
        const cycleDay = lmpDate ? Math.max(1, differenceInCalendarDays(new Date(), lmpDate) + 1) : null;
        const cycleLength = user?.cycleLength || 28;
        return (
            <ScrollView
                style={styles.container}
                contentContainerStyle={{ paddingTop: 64, paddingHorizontal: 16 }}
            >
                <EmptyState
                    icon="💕"
                    title={t('home.ttcTitle')}
                    subtitle={cycleDay ? t('home.ttcDay', { day: cycleDay, total: cycleLength }) : undefined}
                />
            </ScrollView>
        );
    }

    if (loading) {
        // D4: Skeleton-based loading replaces opaque ActivityIndicator. Mimics the
        // structure of the ready-state hero card → user perceives the screen as fast.
        return (
            <ScrollView style={styles.container} contentContainerStyle={{ paddingTop: 24, paddingHorizontal: 16 }}>
                <Skeleton.Title width="60%" />
                <Skeleton width="40%" height={14} style={{ marginTop: 8, marginBottom: 24 }} />
                <Skeleton.Card style={{ height: 200, marginBottom: 16 }} />
                <Skeleton.Card style={{ height: 120, marginBottom: 16 }} />
                <Skeleton width="50%" height={18} style={{ marginTop: 8, marginBottom: 12 }} />
                <Skeleton.Card style={{ height: 80, marginBottom: 8 }} />
                <Skeleton.Card style={{ height: 80 }} />
            </ScrollView>
        );
    }

    if (error || !weekData) {
        // T7-FIX-F63 : aligner sur le pattern errorBoundary (Articles) avec retry —
        // évite le pattern "stranded user" du EmptyState minimaliste pré-T7.
        const isRealError = !!error;
        return (
            <EmptyState
                icon={isRealError ? '😔' : '🤰'}
                title={isRealError ? t('errorBoundary.title') : t('common.noDataAvailable')}
                // STRANDED-USER FIX: the non-error branch used to render no action at
                // all. Any account whose profile has no LMP — a signup that skipped
                // onboarding, a cold start before the profile syncs — landed on a bare
                // "no data available" screen with nothing to tap and no way to enter a
                // date, i.e. a permanently bricked Home. Send them where the date is set.
                action={
                    isRealError ? (
                        <Button title={t('errorBoundary.retry')} onPress={refetch} />
                    ) : (
                        <Button
                            title={t('home.completeProfileCta')}
                            onPress={() => navigation.navigate('Profile' as never)}
                        />
                    )
                }
                subtitle={isRealError ? t('errorBoundary.message') : t('home.completeProfileHint')}
            />
        );
    }

    const cleanTitle = getLocalizedContent(weekData, 'title', i18n.language).replace(/#{1,4}\s*/g, '').trim();
    // Size, weight, fruit and emoji come from the bundled weekly table, not the fetched
    // week document, so they match the evolution screen and onboarding (see fetalGrowth.ts).
    const growth = getFetalGrowth(currentWeekNumber);
    const babyFacts = getLocalizedContent(weekData, 'baby_facts', i18n.language)?.split('•').filter(f => f.trim()).map(f => f.trim()) || [];
    const momTips = getLocalizedContent(weekData, 'mom_tips', i18n.language)?.split('•').filter(t => t.trim()).map(t => t.trim()) || [];

    // W2 #29: trim so a whitespace-only first name doesn't yield a blank avatar initial + "Bonjour   👋".
    const displayName = (profile?.firstName || user?.firstName || '').trim() || t('home.futureMom');
    const userEmail = user?.email || t('profile.guestUser');
    // Trimester label is derived from the week number (T1 ≤13, T2 ≤27, else T3), NOT
    // the raw `trimester` data field — that field is a localized ordinal ("2ème") which
    // builds a non-existent key (common.trimester_2ème) and leaks the raw key in the UI.
    const trimesterNum = trimesterFromWeek(currentWeekNumber);
    const trimesterText = t('common.trimester_' + trimesterNum);

    // #9 — "Preview" state: the chevrons turned Home into a time-machine and the
    // displayed week is NOT the user's real current week (pregnancyInfo.week).
    // Drives the "return to this week" pill + a subtle preview cue on the badge.
    // Compared with her real week as printed: past term that is 41+, so stepping back to
    // 40 is a preview too.
    const isPreviewingWeek =
        overrideWeek !== null && !!pregnancyInfo?.week && overrideWeek !== displayWeek;
    // The pregnancy tools (kick counter, contraction timer, hospital bag) are for HER, so
    // they follow her real week, not the week being previewed: previewing week 27 at 32
    // used to hide the labour tools she needs now.
    const toolsWeek = pregnancyInfo?.week ?? currentWeekNumber;
    // Her own week, past 40+0 SA (post-term, or beyond 42+0): the content shown is week
    // 40's, clamped, so what it says about "this week" must not be printed as today's.
    const isPastDueToday = overrideWeek === null && (isPostTerm || isInvalid);
    const todayAge = completedWeeks != null && completedDays != null
        ? displayedPregnancyAge(completedWeeks, completedDays)
        : null;



    const renderRecommendationCard = ({ item }: { item: Article | Supplement }) => {
        const isArticle = 'article_id' in item;
        const title = getLocalizedContent(item, isArticle ? 'title' : 'name', i18n.language);
        const subtitle = isArticle ? t(`categories.${((item as Article).category || '').toLowerCase()}`, { defaultValue: (item as Article).category }) : t('common.supplements');

        return (
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                    if (isArticle) {
                        navigation.navigate('ArticleDetail', { articleId: (item as Article).article_id });
                    } else {
                        navigation.navigate('SupplementDetail', { supplementId: (item as Supplement).supplement_id });
                    }
                }}
                accessibilityRole="button"
                accessibilityLabel={`${title}, ${subtitle}`}
                accessibilityHint={isArticle ? t('a11y.readArticle') : t('a11y.openSupplement')}
            >
                <View style={styles.recommendationCard}>
                    <LinearGradient
                        colors={isArticle ? [theme.colors.gradientPinkStart, theme.colors.gradientPinkEnd] : [theme.colors.surfaceBlueTint, theme.colors.surfaceBluePale]}
                        style={styles.recommendationGradient}
                    >
                        <View style={styles.recHeader}>
                            <Text style={styles.recEmoji}>{isArticle ? '📰' : '💊'}</Text>
                        </View>
                        <Text style={styles.recTitle} numberOfLines={2}>{title}</Text>
                        <View style={styles.recBadge}>
                            <Text style={styles.recBadgeText}>{subtitle}</Text>
                        </View>
                    </LinearGradient>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            {/* D3-03: dismissible first-run welcome — orients a brand-new user (shown once). */}
            {showWelcome && (
                <View style={styles.welcomeCard} accessibilityRole="summary">
                    <Text style={styles.welcomeTitle}>{t('home.welcomeTitle')}</Text>
                    <Text style={styles.welcomeBody}>{t('home.welcomeBody')}</Text>
                    <TouchableOpacity
                        style={styles.welcomeDismiss}
                        onPress={dismissWelcome}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.welcomeDismiss')}
                    >
                        <Text style={styles.welcomeDismissText}>{t('home.welcomeDismiss')}</Text>
                    </TouchableOpacity>
                </View>
            )}
            {/* One-time invitation to allow notifications, after the welcome card. */}
            <NotificationPrimerCard
                suppressed={showWelcome}
                syncContext={{ week: pregnancyInfo?.week, locale: i18n.language, userId: user?.uid }}
            />
            {/* Cycle 3 F212 — Banner Mode découverte (Curious mode).
                Avertit l'utilisatrice que les données affichées correspondent à
                une exploration (pas une vraie grossesse). CTA pour basculer si
                grossesse réelle survient (vise Profile pour reset onboarding). */}
            {user?.isCurious && (
                <View style={styles.curiousBanner}>
                    <Text style={styles.curiousBannerEmoji}>👀</Text>
                    <View style={styles.curiousBannerTextContainer}>
                        <Text style={styles.curiousBannerTitle}>{t('home.curiousTitle')}</Text>
                        <Text style={styles.curiousBannerDesc}>
                            {t('home.curiousDesc', { week: user?.exploreWeek || currentWeekNumber })}
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={styles.curiousBannerCta}
                        onPress={() => navigation.navigate('Profile')}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.curiousCta')}
                    >
                        <Text style={styles.curiousBannerCtaText}>{t('home.curiousCta')}</Text>
                    </TouchableOpacity>
                </View>
            )}
            {/* Gradient Header: the same rose-to-magenta pair as every other header (Calendar,
                Profile, Health, Language). The third deepPink stop made Home alone heavier. */}
            <LinearGradient
                colors={[theme.colors.primaryStrong, theme.colors.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerGradient}
            >
                <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
                    {/* Profile Button - Absolute Top Right */}
                    <Animated.View style={[styles.profileButtonContainer, { transform: [{ scale: pulseAnim }] }]}>
                        <TouchableOpacity
                            style={styles.profileButton}
                            onPress={() => navigation.navigate('Profile')}
                            activeOpacity={0.8}
                            accessibilityLabel={t('a11y.profile')}
                            accessibilityRole="button"
                        >
                            <LinearGradient
                                colors={[theme.colors.headerChipBg, theme.colors.blackAlpha10]}
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
                        </View>
                        {/* Week Navigation */}
                        {/* MA7-FIX: hide pregnancy week badge + navigation for TTC users.
                            They are not pregnant, so showing "Semaine X" is medically wrong. */}
                        {!user?.isTTC && (
                            <View style={styles.weekNavContainer}>
                                <TouchableOpacity
                                    onPress={handlePrevWeek}
                                    disabled={shownWeek <= 1}
                                    style={styles.navButton}
                                    activeOpacity={0.7}
                                    accessibilityLabel={t('a11y.previousWeek')}
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: shownWeek <= 1 }}
                                >
                                    <RtlAwareChevron
                                        direction="back"
                                        size={36}
                                        color={shownWeek <= 1 ? theme.colors.whiteAlpha30 : theme.colors.white}
                                        style={{ fontWeight: 'bold' }}
                                    />
                                </TouchableOpacity>
                                <View style={[styles.weekBadge, isPreviewingWeek && styles.weekBadgePreview]}>
                                    <Text style={styles.weekTitle}>{t('common.week')} {shownWeek}</Text>
                                    <Text style={styles.trimesterBadge}>{trimesterText}</Text>
                                </View>
                                <TouchableOpacity
                                    onPress={handleNextWeek}
                                    disabled={shownWeek >= 40}
                                    style={styles.navButton}
                                    activeOpacity={0.7}
                                    accessibilityLabel={t('a11y.nextWeek')}
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: shownWeek >= 40 }}
                                >
                                    <RtlAwareChevron
                                        direction="forward"
                                        size={36}
                                        color={shownWeek >= 40 ? theme.colors.whiteAlpha30 : theme.colors.white}
                                        style={{ fontWeight: 'bold' }}
                                    />
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* #9 — Time-machine "preview" affordance: when the displayed week is
                            not the real current week, show a cue + a one-tap return pill. */}
                        {!user?.isTTC && isPreviewingWeek && (
                            <TouchableOpacity
                                onPress={handleReturnToToday}
                                activeOpacity={0.85}
                                testID="home_return_to_today"
                                accessibilityRole="button"
                                accessibilityLabel={t('home.currentWeek')}
                                style={styles.todayPill}
                            >
                                <Text style={styles.todayPillIcon}>👁️</Text>
                                <Text style={styles.todayPillText}>{t('home.currentWeek')}</Text>
                            </TouchableOpacity>
                        )}

                        {/* Week Title (without repeating 'Semaine X'). Past the due date her own
                            week still shows the week-40 content, but not its title: "Le grand
                            jour approche" sat right above "la date prévue … est passée".
                            Beyond 42+0 the "have you had your baby?" banner speaks alone. */}
                        {!(isPastDueToday && isInvalid) && (
                            <Text style={styles.weekSubtitle}>
                                {isPastDueToday
                                    ? t('home.postTermTitle')
                                    : cleanTitle.replace(/^(Semaine|Week|الأسبوع)\s*\d+\s*[-–]\s*/i, '').trim()} {growth.emoji}
                            </Text>
                        )}



                        {/* Quick Actions — real pressable pill buttons (#9). The icons are white
                            line icons: the ➕ emoji painted dark grey on the dark tile (≈1.3:1),
                            so "➕ RDV" read as a second "Mes RDV".
                            Cycle 3 F305 : a11y labels explicites pour VoiceOver/TalkBack.
                            Each pill is min 44x44, RTL-safe (icon/label flip), keeps its
                            original onPress/testID/accessibilityLabel. */}
                        <View style={styles.quickActionsRow}>
                            <TouchableOpacity
                                onPress={() => navigation.navigate('Calendrier')}
                                activeOpacity={0.85}
                                testID="home_quick_appointments"
                                accessibilityRole="button"
                                accessibilityLabel={t('home.myAppointments')}
                                style={styles.quickActionPill}
                            >
                                <Ionicons name="calendar-outline" size={18} color={theme.colors.white} style={styles.quickActionPillIcon} />
                                <Text style={styles.quickActionPillLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('home.myAppointments')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => navigation.navigate('Rappels', { screen: 'RemindersMain', params: { screen: 'TasksTab', params: { action: 'add' } } })}
                                activeOpacity={0.85}
                                testID="home_quick_add_task"
                                accessibilityRole="button"
                                accessibilityLabel={t('home.addTask', 'Tâche')}
                                style={styles.quickActionPill}
                            >
                                <Ionicons name="add-circle-outline" size={18} color={theme.colors.white} style={styles.quickActionPillIcon} />
                                <Text style={styles.quickActionPillLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('home.addTask', 'Tâche')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => {
                                    // `initial: false` keeps CalendarMain under the form: with the
                                    // form as the stack's only route, Save's goBack() left the
                                    // Calendar tab stuck on a stale "Nouveau Rendez-vous" form.
                                    navigation.navigate('Calendrier', {
                                        screen: 'AddAppointment',
                                        params: { selectedDate: quickAddDateKey(currentWeekNumber, pregnancyInfo?.week) },
                                        initial: false,
                                    });
                                }}
                                activeOpacity={0.85}
                                testID="home_quick_add_appointment"
                                accessibilityRole="button"
                                accessibilityLabel={t('home.addAppointment', 'RDV')}
                                style={styles.quickActionPill}
                            >
                                <Ionicons name="add-circle-outline" size={18} color={theme.colors.white} style={styles.quickActionPillIcon} />
                                <Text style={styles.quickActionPillLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('home.addAppointment', 'RDV')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => navigation.navigate('Ressources', { screen: 'ResourcesMain', params: { openSearch: true } })}
                                activeOpacity={0.85}
                                testID="home_quick_search"
                                accessibilityRole="button"
                                accessibilityLabel={t('common.search')}
                                style={styles.quickActionPill}
                            >
                                <Ionicons name="search-outline" size={18} color={theme.colors.white} style={styles.quickActionPillIcon} />
                                <Text style={styles.quickActionPillLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t('common.search')}</Text>
                            </TouchableOpacity>
                        </View>

                        {/* GROUP 2.5: UNIFIED DAILY TRACKER (RDV + Tasks) */}
                        <View style={{ marginTop: 12 }}>
                            <DailyRoutinesTracker appointments={appointments} />
                        </View>

                    </View>
                </Animated.View>
            </LinearGradient>

            <View style={[styles.contentContainer, { marginTop: -60 }]}>
                {/* POST-PARTUM / ETERNAL PREGNANCY BANNER */}
                {isInvalid && (
                    <View style={styles.postpartumBanner}>
                        <Text style={styles.postpartumEmoji}>🍼</Text>
                        <View style={styles.postpartumTextContainer}>
                            <Text style={styles.postpartumTitle}>{t('home.postpartumTitle')}</Text>
                            <Text style={styles.postpartumDesc}>{t('home.postpartumDesc')}</Text>
                            <TouchableOpacity 
                                style={styles.postpartumButton}
                                onPress={() => navigation.navigate('Profile')}
                                accessibilityRole="button"
                                accessibilityLabel={t('home.updateStatus')}
                            >
                                <Text style={styles.postpartumButtonText}>{t('home.postpartumCta')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}

                {/* Past the due date (40+0..42+0 SA) is still a pregnancy: the week-40
                    content stays, with the real age and a gentle nudge. Only beyond
                    42+0 does the "did you deliver?" banner above take over. */}
                {isPostTerm && completedWeeks != null && completedDays != null && (
                    <View style={styles.postpartumBanner} testID="home_postterm_note">
                        <Text style={styles.postpartumEmoji}>🤍</Text>
                        <View style={styles.postpartumTextContainer}>
                            <Text style={styles.postpartumDesc}>
                                {t('home.postTermNote', { ga: formatGestationalAge(t, completedWeeks, completedDays) })}
                            </Text>
                        </View>
                    </View>
                )}

                {/* HERO CARD #1: Baby Growth 3D (NEW) */}
                {/* U-FIX-6: pass currentDay so the displayed "day of pregnancy" is exact
                    (was ~7 days too high before because it used currentWeek * 7).
                    MA7-FIX: skip baby-growth card for TTC users — they are not pregnant. */}
                {/* W2 #6: hide fetal growth/size visuals once the pregnancy is past-term (isInvalid)
                    so they don't contradict the "did you deliver?" banner above. */}
                {!user?.isTTC && !isInvalid && (
                    <BabyGrowthCard
                        currentWeek={currentWeekNumber}
                        currentDay={currentDay}
                        dayOfPregnancy={overrideWeek === null ? dayOfPregnancy : undefined}
                        weekData={weekData}
                    />
                )}

                {/* SECTION 1: HERO CARD PREMIUM (Phase 1) */}
                {weekData && !isInvalid && (
                    // No negative top margin: -50 pulled this card 38pt up over the bottom
                    // of the BabyGrowthCard, hiding the lower edge of its "see the evolution" CTA.
                    <View style={[styles.sectionContainer, { paddingTop: 24 }]}>
                        {/* Title outside the card for cleaner look */}
                        <Text style={styles.sectionTitleMain}>🍼 {t('common.heroTitle')}</Text>

                        <LinearGradient
                            colors={[theme.colors.gradientPeachStart, theme.colors.gradientPeachEnd]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroCardGradient}
                        >
                            {/* 1. Giant Emoji Centered */}
                            <View style={styles.heroEmojiContainer}>
                                <Text style={styles.heroEmoji}>{growth.emoji}</Text>
                            </View>

                            {/* 2. Size & Weight Mini-Cards */}
                            <View style={styles.heroStatsRow}>
                                <View style={styles.heroStatCard}>
                                    <Text style={styles.heroStatValue}>{formatFetalLength(growth, i18n.language, t)}</Text>
                                    <Text style={styles.heroStatLabel}>{t(fetalLengthLabelKey(growth))}</Text>
                                </View>
                                <View style={styles.heroStatCard}>
                                    <Text style={styles.heroStatValue}>{formatFetalWeight(growth, i18n.language, t)}</Text>
                                    <Text style={styles.heroStatLabel}>{t('common.weight')}</Text>
                                </View>
                            </View>

                            {/* 3. Comparison Box */}
                            <View style={styles.heroComparisonBox}>
                                {/* No label while the embryo is still microscopic. The label is its own
                                    string: cutting the onboarding sentence before its {{label}} left
                                    "Votre bébé fait la taille / d'" above a bare "Concombre". */}
                                {growth.lengthCm !== null && (
                                    <Text style={styles.heroComparisonLabel}>{t('home.sizeComparisonLabel')}</Text>
                                )}
                                <Text style={styles.heroComparisonValue}>
                                    {formatFetalComparison(currentWeekNumber, i18n.language, t)}
                                </Text>
                            </View>

                            {/* 4. Development Text */}
                            <Text style={styles.heroDevText}>
                                {getLocalizedContent(weekData, 'baby_dev_text', i18n.language, { stripMarkdown: true })}
                            </Text>
                        </LinearGradient>
                    </View>
                )}



                {/* GROUP 2: L'ESSENTIEL DU JOUR (Message + Tip) */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitleMain}>🌟 {t('home.dailyEssentials')}</Text>

                    {/* Baby Message */}
                    {babyMessage && (
                        <BabyMessageCard
                            message={getLocalizedContent(babyMessage, 'message', i18n.language)}
                            // Past term the message is week 40's last, but the footer names
                            // her real week and day, like the hero ("Semaine 43", not 40).
                            week={isPastDueToday && todayAge ? todayAge.week : currentWeekNumber}
                            day={isPastDueToday && todayAge ? todayAge.day : overrideDay || currentDay}
                        />
                    )}

                    {/* Daily Tip - Premium Design (Phase 2) */}
                    {dailyTip && babyMessage && (
                        <View style={{ height: 24 }} /> // Increased spacing
                    )}
                    {dailyTip && (
                        <LinearGradient
                            colors={[theme.colors.gradientAmberStart, theme.colors.gradientAmberEnd]} // Light Amber/Cream gradient
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.tipCardGradient}
                        >
                            <View style={styles.tipHeader}>
                                <Text style={styles.tipEmoji}>💡</Text>
                                <Text style={styles.tipTitle}>{t('home.dailyTip')}</Text>
                            </View>
                            <Text style={styles.tipShort}>{getLocalizedContent(dailyTip, 'short', i18n.language)}</Text>
                            <View style={styles.tipCategory}>
                                <Text style={styles.tipCategoryText}>🏷️ {dailyTip.category}</Text>
                            </View>
                        </LinearGradient>
                    )}
                </View>

                {/* GROUP 3: CETTE SEMAINE (Premium Info Cards) */}
                {weekData && (
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitleMain}>📅 {t('common.thisWeek')}</Text>

                        {/* Mom Body Changes - Premium Card */}
                        <View style={styles.infoCardPremium}>
                            <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setShowFullBodyText(!showFullBodyText)}
                                style={[styles.infoCardHeader, styles.infoCardHeaderToggle]}
                                accessibilityRole="button"
                                accessibilityLabel={t('common.yourBody')}
                                accessibilityHint={showFullBodyText ? t('a11y.collapseSection') : t('a11y.expandSection')}
                                accessibilityState={{ expanded: showFullBodyText }}
                                {...(Platform.OS === 'web' ? { 'aria-expanded': showFullBodyText } : {})}
                            >
                                <Text style={styles.infoCardEmoji}>🤰</Text>
                                <Text style={styles.infoCardTitle}>{t('common.yourBody')}</Text>
                                <Text style={{ marginStart: 'auto', fontSize: 12, color: theme.colors.accentPurple, fontWeight: '600' }}>
                                    {showFullBodyText ? t('common.seeLess') : t('common.seeMore')}
                                </Text>
                            </TouchableOpacity>
                            <Text
                                style={[styles.infoCardText, { lineHeight: 24, marginBottom: 8 }]}
                                numberOfLines={showFullBodyText ? undefined : 3}
                            >
                                {getLocalizedContent(weekData, 'mom_body_text', i18n.language, { stripMarkdown: true })}
                            </Text>
                        </View>

                        {/* Warnings / Medical Info - Redesigned List */}
                        <View style={[styles.infoCardPremium, styles.infoCardPremiumAlert, { marginTop: 16 }]}>
                            <View style={styles.infoCardHeader}>
                                <Text style={styles.infoCardEmoji}>⚠️</Text>
                                <Text style={styles.infoCardTitle}>{t('common.toMonitor')}</Text>
                            </View>

                            <View style={{ marginTop: 8 }}>
                                {(getLocalizedContent(weekData, 'warnings_text', i18n.language, { stripMarkdown: true }) || t('home.defaultWarning')).split('\n').map((line, index) => {
                                    const trimmed = line.trim();
                                    if (!trimmed) return null;

                                    // Headers (bold)
                                    if (trimmed.startsWith('**') || trimmed.endsWith(':')) {
                                        return (
                                            <Text key={index} style={{ fontSize: 15, fontWeight: '700', color: theme.colors.error, marginTop: 12, marginBottom: 6 }}>
                                                {trimmed.replace(/\*\*/g, '')}
                                            </Text>
                                        );
                                    }

                                    // Bullet points
                                    if (trimmed.startsWith('*') || trimmed.startsWith('•') || trimmed.startsWith('-')) {
                                        return (
                                            <View key={index} style={{ flexDirection: 'row', marginBottom: 6, paddingStart: 8 }}>
                                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.critical, marginTop: 8, marginEnd: 10 }} />
                                                <Text style={{ flex: 1, fontSize: 14, color: theme.colors.neutral800, lineHeight: 22 }}>
                                                    {trimmed.replace(/^[\*\•\-]\s*/, '')}
                                                </Text>
                                            </View>
                                        );
                                    }

                                    // Normal text
                                    return (
                                        <Text key={index} style={{ fontSize: 14, color: theme.colors.neutral800, lineHeight: 22, marginBottom: 4 }}>
                                            {trimmed}
                                        </Text>
                                    );
                                })}
                            </View>
                        </View>
                        {/* The week's "to monitor" list is medical content. */}
                        <MedicalDisclaimer style={{ marginTop: 12 }} />
                    </View>
                )}

                {/* GROUP 4: ORGANISATION (Grid Layout) */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitleMain}>📝 {t('common.organization')}</Text>

                    <View style={styles.toolsGrid}>
                        {/* Rappels Card */}
                        <TouchableOpacity
                            style={styles.toolCard}
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('Rappels')}
                            accessibilityLabel={t('common.reminders')}
                            accessibilityRole="button"
                        >
                            <LinearGradient
                                colors={[theme.colors.surfaceBlueTint, theme.colors.blue100]}
                                style={styles.toolIconContainer}
                            >
                                <Text style={styles.toolEmoji}>🔔</Text>
                            </LinearGradient>
                            <Text style={styles.toolTitle}>{t('common.reminders')}</Text>
                            <Text style={styles.toolSubtitle}>{t('home.medicines')}</Text>
                        </TouchableOpacity>

                        {/* Calendrier Card */}
                        <TouchableOpacity
                            style={styles.toolCard}
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('Calendrier')}
                            accessibilityLabel={t('home.calendar')}
                            accessibilityRole="button"
                        >
                            <LinearGradient
                                colors={[theme.colors.gradientGreenStart, theme.colors.gradientGreenEnd]}
                                style={styles.toolIconContainer}
                            >
                                <Text style={styles.toolEmoji}>📅</Text>
                            </LinearGradient>
                            <Text style={styles.toolTitle}>{t('home.calendar')}</Text>
                            <Text style={styles.toolSubtitle}>{t('common.appointments')}</Text>
                        </TouchableOpacity>

                        {/* Suivi du Poids Card */}
                        <TouchableOpacity
                            style={styles.toolCard}
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('WeightTracker')}
                            accessibilityLabel={t('home.myWeight')}
                            accessibilityRole="button"
                        >
                            <LinearGradient
                                colors={[theme.colors.gradientRoseStart, theme.colors.gradientRoseEnd]}
                                style={styles.toolIconContainer}
                            >
                                <Text style={styles.toolEmoji}>⚖️</Text>
                            </LinearGradient>
                            <Text style={styles.toolTitle}>{t('home.myWeight')}</Text>
                            <Text style={styles.toolSubtitle}>{t('home.weeklyTracking')}</Text>
                        </TouchableOpacity>

                        {/* Aliments Interdits Card */}
                        <TouchableOpacity
                            style={styles.toolCard}
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('ForbiddenFoods')}
                            accessibilityLabel={t('home.foods')}
                            accessibilityRole="button"
                        >
                            <LinearGradient
                                colors={[theme.colors.gradientOrangeStart, theme.colors.gradientOrangeEnd]}
                                style={styles.toolIconContainer}
                            >
                                <Text style={styles.toolEmoji}>🍽️</Text>
                            </LinearGradient>
                            <Text style={styles.toolTitle}>{t('home.foods')}</Text>
                            <Text style={styles.toolSubtitle}>{t('home.toAvoid')}</Text>
                        </TouchableOpacity>

                        {/* Cycle 8 — Kick Counter: surfaced from week 16, when fetal
                            movements become countable (trimester-aware Home). */}
                        {toolsWeek >= 16 && (
                            <TouchableOpacity
                                style={styles.toolCard}
                                activeOpacity={0.7}
                                onPress={() => navigation.navigate('KickCounter')}
                                accessibilityLabel={t('cycle8.kickCounter.title')}
                                accessibilityRole="button"
                            >
                                <LinearGradient
                                    colors={[theme.colors.gradientPinkStart, theme.colors.gradientPinkEnd]}
                                    style={styles.toolIconContainer}
                                >
                                    <Text style={styles.toolEmoji}>👶</Text>
                                </LinearGradient>
                                <Text style={styles.toolTitle}>{t('cycle8.kickCounter.title')}</Text>
                                <Text style={styles.toolSubtitle}>{t('cycle8.kickCounter.kicksLastHour')}</Text>
                            </TouchableOpacity>
                        )}

                        {/* Cycle 8 — Contraction Timer + Hospital Bag: third-trimester
                            labour prep, surfaced from week 28. */}
                        {toolsWeek >= 28 && (
                            <TouchableOpacity
                                style={styles.toolCard}
                                activeOpacity={0.7}
                                onPress={() => navigation.navigate('ContractionTimer')}
                                accessibilityLabel={t('cycle8.contractionTimer.title')}
                                accessibilityRole="button"
                            >
                                <LinearGradient
                                    colors={[theme.colors.gradientPeachStart, theme.colors.gradientPeachEnd]}
                                    style={styles.toolIconContainer}
                                >
                                    <Text style={styles.toolEmoji}>⏱️</Text>
                                </LinearGradient>
                                <Text style={styles.toolTitle}>{t('cycle8.contractionTimer.title')}</Text>
                                <Text style={styles.toolSubtitle}>{t('cycle8.contractionTimer.subtitle')}</Text>
                            </TouchableOpacity>
                        )}

                        {toolsWeek >= 28 && (
                            <TouchableOpacity
                                style={styles.toolCard}
                                activeOpacity={0.7}
                                onPress={() => navigation.navigate('HospitalBag')}
                                accessibilityLabel={t('cycle8.hospitalBag.title')}
                                accessibilityRole="button"
                            >
                                <LinearGradient
                                    colors={[theme.colors.gradientAmberStart, theme.colors.gradientAmberEnd]}
                                    style={styles.toolIconContainer}
                                >
                                    <Text style={styles.toolEmoji}>🧳</Text>
                                </LinearGradient>
                                <Text style={styles.toolTitle}>{t('cycle8.hospitalBag.title')}</Text>
                                <Text style={styles.toolSubtitle}>{t('cycle8.hospitalBag.subtitle')}</Text>
                            </TouchableOpacity>
                        )}

                        {/* Cycle 8 — Ramadan & Pregnancy. Hidden until the guidance is
                            clinically signed off: the screen renders its own "content
                            pending clinical review" banner, and shipping that to a store
                            reviewer is App Review 2.1 territory. See featureFlags.ts. */}
                        {RAMADAN_GUIDANCE_CLINICALLY_REVIEWED && (
                            <TouchableOpacity
                                style={styles.toolCard}
                                activeOpacity={0.7}
                                onPress={() => navigation.navigate('RamadanPregnancy')}
                                accessibilityLabel={t('cycle8.ramadan.title')}
                                accessibilityRole="button"
                            >
                                <LinearGradient
                                    colors={[theme.colors.surfacePurpleTint, theme.colors.gradientRoseStart]}
                                    style={styles.toolIconContainer}
                                >
                                    <Text style={styles.toolEmoji}>🌙</Text>
                                </LinearGradient>
                                <Text style={styles.toolTitle}>{t('cycle8.ramadan.title')}</Text>
                                <Text style={styles.toolSubtitle}>{t('cycle8.ramadan.subtitle')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* GROUP 5: APPOINTMENTS (Restored) */}
                {appointments.length > 0 && (
                    <View style={styles.sectionContainer}>
                        <SectionHeader
                            title={`📅 ${t('home.upcomingAppointments')}`}
                            actionLabel={t('common.seeAll')}
                            onAction={() => navigation.navigate('Calendrier')}
                        />
                        {appointments.slice(0, 3).map((app) => (
                            <TouchableOpacity
                                key={app.event_id}
                                style={styles.unifiedCard}
                                onPress={() => navigation.navigate('Calendrier')}
                                accessibilityRole="button"
                                accessibilityLabel={`${app.title}, ${format(new Date(app.date), 'dd MMMM, HH:mm', { locale: dateLocale })}`}
                                accessibilityHint={t('a11y.openAppointment')}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.m }}>
                                    <View style={{ width: 4, height: 40, backgroundColor: theme.colors.success, borderRadius: 2, marginEnd: 12 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text }}>{app.title}</Text>
                                        <Text style={{ fontSize: 14, color: theme.colors.textSecondary, marginTop: 2 }}>
                                            {format(new Date(app.date), 'dd MMMM', { locale: dateLocale })} • {format(new Date(app.date), 'HH:mm', { locale: dateLocale })}
                                        </Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}


                {/* 9. RECOMMENDATIONS (All Articles + Supplements) */}
                {
                    ([...articles, ...supplements].length > 0) && (
                        <Animated.View style={{ opacity: fadeAnim }}>
                            <View style={styles.recommendationsHeader}>
                                <SectionHeader
                                    title={t('common.recommendationsTitle')}
                                    actionLabel={t('common.seeAll')}
                                    onAction={() => navigation.navigate('Ressources')}
                                />
                            </View>

                            <ScrollView
                                ref={recScrollRef}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                style={styles.recommendationsList}
                                contentContainerStyle={styles.recommendationsContent}
                            >
                                {[...articles, ...supplements].map((item, index) => (
                                    <View key={index} style={{ marginEnd: 12 }}>
                                        {renderRecommendationCard({ item })}
                                    </View>
                                ))}
                            </ScrollView>
                        </Animated.View>
                    )
                }
            </View >
        </ScrollView >
    );
};

