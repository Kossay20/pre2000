import { createLogger } from '../utils/logger';
const log = createLogger('WeekRecommendationsScreen');
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useCurrentWeek } from '../services/useCurrentWeek';
import { Article, Supplement } from '../types';
import { getLocalizedContent } from '../utils/i18nHelpers';
import { normalizeSupplementSafety } from '../utils/supplementSafety';
import { getLocalArticle, getLocalSupplement } from '../services/localContentFallback';
import { withoutUnreviewedContent } from '../config/unreviewedContent';
import { FIRESTORE_GUEST_TIMEOUT_MS, withTimeout } from '../utils/withTimeout';
import { theme } from '../theme';
import { Card } from '../components/common/Card';
import { SectionHeader } from '../components/common/SectionHeader';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { MedicalDisclaimer } from '../components/common/MedicalDisclaimer';
import { SourcesFooter } from '../components/common/SourcesFooter';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

export const WeekRecommendationsScreen = () => {
    useScreenAnalytics('WeekRecommendationsScreen');
    const { weekData, loading: weekLoading } = useCurrentWeek();
    const [articles, setArticles] = useState<Article[]>([]);
    const [supplements, setSupplements] = useState<Supplement[]>([]);
    const [loading, setLoading] = useState(true);
    const navigation = useNavigation();
    const { t, i18n } = useTranslation();

    useEffect(() => {
        const fetchRecommendations = async () => {
            if (!weekData) return;

            const articleIds = (weekData.recommended_articles_ids || '').split(',').filter(Boolean);
            const supplementIds = (weekData.recommended_supplements_ids || '').split(',').filter(Boolean);
            try {
                const articleDocs = await Promise.all(
                    articleIds.map((id: string) =>
                        withTimeout(getDoc(doc(db, 'articles', id.trim())), FIRESTORE_GUEST_TIMEOUT_MS)
                    ),
                );
                setArticles(withoutUnreviewedContent(articleDocs.filter((d: any) => d.exists()).map((d: any) => d.data() as Article)));
                const supplementDocs = await Promise.all(
                    supplementIds.map((id: string) =>
                        withTimeout(getDoc(doc(db, 'supplements', id.trim())), FIRESTORE_GUEST_TIMEOUT_MS)
                    ),
                );
                setSupplements(supplementDocs.filter((d: any) => d.exists()).map((d: any) => d.data() as Supplement));
            } catch (fsErr) {
                log.error('Error fetching recommendations:', fsErr);
                setArticles(articleIds.map((id) => getLocalArticle(id.trim())).filter(Boolean) as Article[]);
                setSupplements(supplementIds.map((id) => getLocalSupplement(id.trim())).filter(Boolean) as Supplement[]);
            } finally {
                setLoading(false);
            }
        };

        // U-FIX-7: was infinite spinner if weekData stayed null (week missing in Firestore
        // or hook errored). Now we drop the local loading flag once the hook is done,
        // even if there's no data to fetch — caller renders the proper empty state.
        if (weekLoading) return;
        if (!weekData) {
            setLoading(false);
            return;
        }
        fetchRecommendations();
    }, [weekData, weekLoading]);

    if (weekLoading || loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    // U-FIX-7: explicit empty state if the week has no recommendations / week data missing.
    if (!weekData) {
        return (
            <View style={styles.centerContainer}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>📭</Text>
                <Text style={{ color: theme.colors.textLight, textAlign: 'center', paddingHorizontal: 24 }}>
                    {t('common.errors.weekDataNotFound') || t('common.errorLoadingData')}
                </Text>
            </View>
        );
    }

    // Every safety lookup goes through the shared normaliser, so an accented or unknown token
    // reads the same (caution) here as in the supplements list and its filter.
    const getSafetyColor = (safety: string) => {
        switch (normalizeSupplementSafety(safety)) {
            case 'ok': return theme.colors.success;
            case 'a_surveiller': return theme.colors.warning;
            case 'deconseille': return theme.colors.error;
            default: return theme.colors.secondary;
        }
    };

    // W5 #2 (a11y): the safety LABEL renders in a DARK token (the pastel getSafetyColor failed WCAG
    // as text on the light card — 1.6–2.6:1). Verified ≥4.5:1 on white. getSafetyColor stays for the
    // decorative icon-container background.
    const getSafetyTextColor = (safety: string) => {
        switch (normalizeSupplementSafety(safety)) {
            case 'ok': return theme.colors.green800;
            case 'a_surveiller': return theme.colors.deepOrange900;
            case 'deconseille': return theme.colors.red800;
            default: return theme.colors.textSecondary;
        }
    };

    // D6-07 a11y: convey safety with an icon + text label, not color alone.
    const getSafetyIcon = (safety: string) => {
        switch (normalizeSupplementSafety(safety)) {
            case 'ok': return '✓';
            case 'a_surveiller': return '⚠';
            case 'deconseille': return '✗';
            default: return 'ℹ';
        }
    };
    const getSafetyLabel = (safety: string) => {
        switch (normalizeSupplementSafety(safety)) {
            case 'ok': return t('common.supplementSafety.safe');
            case 'a_surveiller': return t('common.supplementSafety.caution');
            case 'deconseille': return t('common.supplementSafety.avoid');
            default: return t('common.supplementSafety.unknown');
        }
    };

    // P2: richer empty-state — illustration + gentle "check back" copy + a CTA that
    // sends the user to the Resources tab so they're never stranded on a blank screen.
    if (articles.length === 0 && supplements.length === 0) {
        return (
            <View style={styles.container}>
                <EmptyState
                    icon="🌱"
                    title={t('common.noRecommendation')}
                    subtitle={t('common.noRecommendationSubtitle')}
                    action={
                        <Button
                            title={t('common.exploreResources')}
                            variant="primary"
                            onPress={() => navigation.navigate('Ressources')}
                        />
                    }
                />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            {articles.length > 0 && (
                <View style={styles.section}>
                    <SectionHeader title={t('common.recommendedArticles')} />
                    {articles.map((article) => (
                        <TouchableOpacity
                            key={article.article_id}
                            onPress={() => navigation.navigate('ArticleDetail', { articleId: article.article_id })}
                            activeOpacity={0.7}
                        >
                            <Card style={styles.card}>
                                <View style={styles.iconContainer}>
                                    <Text style={styles.icon}>📚</Text>
                                </View>
                                <View style={styles.content}>
                                    <Text style={[theme.typography.h3, styles.title] as any}>{getLocalizedContent(article, 'title', i18n.language)}</Text>
                                    <Text numberOfLines={2} style={[theme.typography.body, styles.summary]}>
                                        {getLocalizedContent(article, 'summary', i18n.language) || t('common.seeMore')}
                                    </Text>
                                </View>
                            </Card>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {supplements.length > 0 && (
                <View style={styles.section}>
                    <SectionHeader title={t('common.recommendedSupplements')} />
                    {supplements.map((supplement) => (
                        <TouchableOpacity
                            key={supplement.supplement_id}
                            onPress={() => navigation.navigate('SupplementDetail', { supplementId: supplement.supplement_id })}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`${getLocalizedContent(supplement, 'name', i18n.language)} — ${getSafetyLabel(supplement.pregnancy_safety)}`}
                        >
                            <Card style={styles.card}>
                                <View style={[styles.iconContainer, { backgroundColor: getSafetyColor(supplement.pregnancy_safety) }]}>
                                    <Text style={styles.icon}>💊</Text>
                                </View>
                                <View style={styles.content}>
                                    <Text style={[theme.typography.h3, styles.title] as any}>{getLocalizedContent(supplement, 'name', i18n.language)}</Text>
                                    {/* D6-07: explicit safety icon + label so safety isn't conveyed by color alone */}
                                    <View style={styles.safetyRow}>
                                        <Text style={[styles.safetyText, { color: getSafetyTextColor(supplement.pregnancy_safety) }]}>
                                            {getSafetyIcon(supplement.pregnancy_safety)} {getSafetyLabel(supplement.pregnancy_safety)}
                                        </Text>
                                    </View>
                                    <Text numberOfLines={2} style={[theme.typography.body, styles.summary]}>
                                        {getLocalizedContent(supplement, 'short_description', i18n.language)}
                                    </Text>
                                </View>
                            </Card>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <SourcesFooter sources={weekData.sources} />

            <MedicalDisclaimer />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    contentContainer: {
        padding: theme.spacing.m,
        paddingBottom: theme.spacing.xl,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: theme.spacing.l,
    },
    section: {
        marginBottom: theme.spacing.l,
    },
    card: {
        marginBottom: theme.spacing.m,
        flexDirection: 'row',
        overflow: 'hidden',
    },
    iconContainer: {
        width: 60,
        backgroundColor: theme.colors.secondary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        fontSize: 28,
    },
    content: {
        flex: 1,
        padding: theme.spacing.m,
    },
    title: {
        marginBottom: theme.spacing.xs,
    },
    summary: {
        color: theme.colors.textLight,
        lineHeight: 20,
    },
    safetyRow: {
        marginBottom: theme.spacing.xs,
    },
    safetyText: {
        fontSize: 12,
        fontWeight: '700',
    },
});
