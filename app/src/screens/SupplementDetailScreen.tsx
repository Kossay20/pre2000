import { createLogger } from '../utils/logger';
const log = createLogger('SupplementDetailScreen');
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { getLocalSupplement, getLocalArticle, getAllLocalArticles } from '../services/localContentFallback';
import { db } from '../config/firebase';
import { Supplement, Article } from '../types';
import { theme } from '../theme';
import { Tag } from '../components/common/Tag';
import { Card } from '../components/common/Card';
import { SectionHeader } from '../components/common/SectionHeader';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getLocalizedContent } from '../utils/i18nHelpers';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { isBookmarked, toggleBookmark, subscribeBookmarks } from '../services/bookmarkService';

/**
 * task 10a content cross-linking — resolve a supplement's `related_article_ids`.
 *
 * The field is a COMMA-SEPARATED string (e.g. "a01,a02") with SHORT ids, while
 * bundled articles use full ids (e.g. "a01_symptômes_de_grossesse"). Normalise
 * either shape and resolve via exact-then-prefix match.
 */
const parseRelatedIds = (value: unknown): string[] => {
    if (Array.isArray(value)) {
        return value.map(v => String(v).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value.split(',').map(s => s.trim()).filter(Boolean);
    }
    return [];
};

const resolveRelatedArticle = (id: string): Article | undefined => {
    const exact = getLocalArticle(id);
    if (exact) return exact;
    return getAllLocalArticles().find(
        a => a.article_id === id || a.article_id.startsWith(`${id}_`),
    );
};

export const SupplementDetailScreen = () => {
    useScreenAnalytics('SupplementDetailScreen');
    const { t, i18n } = useTranslation();
    const navigation = useNavigation();
    const route = useRoute<any>();
    const { supplementId } = route.params || {};
    // AUDIT-FIX (page-by-page validation 2026-06-02): language-derived RTL — I18nManager.isRTL is
    // false on web (forceRTL skipped to avoid reload loop), breaking absolute-positioned mirroring.
    const isRTL = i18n.language === 'ar' || i18n.language === 'tn';

    // ── ALL HOOKS BEFORE ANY EARLY RETURN ──
    const [supplement, setSupplement] = useState<Supplement | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);
    // task 10b — bookmark/save state. Keyed off the route's supplementId so the
    // icon reflects saved-state immediately (no need to wait for the fetch).
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!supplementId) return;
        let isMounted = true;
        const fetchSupplement = async () => {
            setLoading(true);
            setError(null);
            try {
                const docRef = doc(db, 'supplements', supplementId);
                const docSnap = await getDoc(docRef);
                if (!isMounted) return;
                if (docSnap.exists()) {
                    setSupplement(docSnap.data() as Supplement);
                } else {
                    // CLUSTER-2: not in Firestore — try the bundled supplement before erroring.
                    const local = getLocalSupplement(supplementId);
                    if (local) setSupplement(local);
                    else setError(t('common.supplementNotFound'));
                }
            } catch (err) {
                log.error('Error fetching supplement details:', err);
                // CLUSTER-2: Firestore failed (permission-denied for guests / offline).
                const local = getLocalSupplement(supplementId);
                if (isMounted) {
                    if (local) setSupplement(local);
                    else setError(t('common.errorLoadingData'));
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchSupplement();
        return () => { isMounted = false; };
    }, [supplementId, refreshKey]);

    // task 10b — reflect bookmark state on mount + stay live across toggles
    // (fired from this screen or anywhere else, e.g. the Favoris list chip).
    useEffect(() => {
        if (!supplementId) return;
        let active = true;
        const sync = () => {
            isBookmarked('supplement', supplementId).then(v => {
                if (active) setSaved(v);
            });
        };
        sync();
        const unsubscribe = subscribeBookmarks(sync);
        return () => {
            active = false;
            unsubscribe();
        };
    }, [supplementId]);

    const handleToggleBookmark = React.useCallback(() => {
        if (!supplementId) return;
        // Optimistic flip; subscribeBookmarks will reconcile with the persisted value.
        toggleBookmark('supplement', supplementId).then(setSaved);
    }, [supplementId]);

    // ── EARLY RETURNS (after hooks) ──
    if (!supplementId) {
        log.error('[SupplementDetail] ❌ No supplementId provided');
        return (
            <View style={styles.centerContainer}>
                <Text style={theme.typography.body}>{t('common.supplementNotSpecified')}</Text>
            </View>
        );
    }

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    if (error || !supplement) {
        return (
            <View style={styles.centerContainer}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>💊</Text>
                <Text style={[theme.typography.body, { textAlign: 'center', marginHorizontal: 24 }]}>
                    {error || t('common.supplementNotFound')}
                </Text>
                <TouchableOpacity
                    onPress={() => setRefreshKey(k => k + 1)}
                    style={{ marginTop: 16, padding: 14, backgroundColor: theme.colors.accent, borderRadius: theme.borderRadius.m }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.retry')}
                >
                    <Text style={{ color: theme.colors.white, fontWeight: '600' }}>{t('common.retry')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
                    <Text style={{ color: theme.colors.accent }}>{t('common.back')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const getSafetyColor = (safety: string) => {
        switch (safety) {
            case 'ok': return theme.colors.success;
            case 'a_surveiller': return theme.colors.warning;
            case 'deconseille': return theme.colors.error;
            default: return theme.colors.secondary;
        }
    };

    const getSafetyLabel = (safety: string) => {
        switch (safety) {
            case 'ok': return t('common.supplementSafety.safe');
            case 'a_surveiller': return t('common.supplementSafety.caution');
            case 'deconseille': return t('common.supplementSafety.avoid');
            default: return t('common.supplementSafety.unknown');
        }
    };

    // task 10a — cross-linking. Resolve related articles (skip related_symptoms_ids:
    // there is no symptom screen). Section renders only when ≥1 id resolves.
    const linkedArticles = parseRelatedIds(supplement.related_article_ids)
        .map(resolveRelatedArticle)
        .filter((a): a is Article => Boolean(a));

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            {/* Back button + bookmark toggle. RTL-safe: row-reverse flips the
                bookmark to the opposite side of the back arrow (task 10b). */}
            <View style={[styles.headerBar, isRTL && styles.headerBarRTL]}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={styles.backButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('a11y.back')}
                >
                    <Ionicons
                        name={isRTL ? 'arrow-forward' : 'arrow-back'}
                        size={24}
                        color={theme.colors.text}
                    />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={handleToggleBookmark}
                    style={styles.bookmarkButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={saved ? t('common.saved') : t('common.addToFavorites')}
                    accessibilityState={{ selected: saved }}
                >
                    <Ionicons
                        name={saved ? 'bookmark' : 'bookmark-outline'}
                        size={24}
                        color={saved ? theme.colors.accent : theme.colors.text}
                    />
                </TouchableOpacity>
            </View>

            <View style={styles.header}>
                <Tag label={getSafetyLabel(supplement.pregnancy_safety)} color={getSafetyColor(supplement.pregnancy_safety)} />
                <Text style={[theme.typography.h1, styles.title] as any}>
                    {getLocalizedContent(supplement, 'name', i18n.language)}
                </Text>
                <Text style={theme.typography.caption}>{t(`supplementCategories.${supplement.category}`, { defaultValue: supplement.category })}</Text>
            </View>

            {getLocalizedContent(supplement, 'short_description', i18n.language) !== '' && (
                <Card style={styles.card}>
                    <Text style={theme.typography.body}>
                        {getLocalizedContent(supplement, 'short_description', i18n.language)}
                    </Text>
                </Card>
            )}

            {getLocalizedContent(supplement, 'pregnancy_notes', i18n.language) !== '' && (
                <Card style={styles.card}>
                    <Text style={[theme.typography.h3, styles.sectionTitle] as any}>{t('common.about')}</Text>
                    <Text style={theme.typography.body}>
                        {getLocalizedContent(supplement, 'pregnancy_notes', i18n.language)}
                    </Text>
                </Card>
            )}

            {getLocalizedContent(supplement, 'typical_dose_text', i18n.language) !== '' && (
                <Card style={styles.card}>
                    <Text style={[theme.typography.h3, styles.sectionTitle] as any}>{t('common.typicalDose')}</Text>
                    <Text style={theme.typography.body}>
                        {getLocalizedContent(supplement, 'typical_dose_text', i18n.language)}
                    </Text>
                </Card>
            )}

            {getLocalizedContent(supplement, 'precautions', i18n.language) !== '' && (
                <Card style={[styles.card, { borderColor: theme.colors.warning, borderWidth: 1 }]}>
                    <Text style={[theme.typography.h3, styles.sectionTitle, { color: theme.colors.warning }] as any}>{t('common.precautions')}</Text>
                    <Text style={theme.typography.body}>
                        {getLocalizedContent(supplement, 'precautions', i18n.language)}
                    </Text>
                </Card>
            )}

            {/* task 10a — related ARTICLES (from supplement.related_article_ids) */}
            {linkedArticles.length > 0 && (
                <View style={styles.section}>
                    <SectionHeader title={t('common.relatedArticles')} />
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipRow}
                    >
                        {linkedArticles.map(linked => {
                            const label = getLocalizedContent(linked, 'title', i18n.language);
                            return (
                                <TouchableOpacity
                                    key={linked.article_id}
                                    onPress={() => navigation.navigate('ArticleDetail', { articleId: linked.article_id })}
                                    activeOpacity={0.7}
                                    style={[styles.chip, isRTL && styles.chipRTL]}
                                    accessibilityRole="button"
                                    accessibilityLabel={label}
                                    accessibilityHint={t('a11y.readArticle')}
                                >
                                    <Ionicons name="document-text-outline" size={16} color={theme.colors.accent} />
                                    <Text style={[styles.chipText, isRTL && styles.chipTextRTL]} numberOfLines={2}>{label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            )}

            {supplement.sources && (
                <Text style={[theme.typography.caption, styles.source]}>{`${t('common.source')} : ${supplement.sources}`}</Text>
            )}
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
    },
    headerBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.m,
    },
    headerBarRTL: {
        flexDirection: 'row-reverse',
    },
    backButton: {
        alignSelf: 'flex-start',
    },
    bookmarkButton: {
        padding: theme.spacing.xs,
    },
    header: {
        marginBottom: theme.spacing.l,
    },
    title: {
        marginTop: theme.spacing.s,
        marginBottom: theme.spacing.xs,
    },
    card: {
        marginBottom: theme.spacing.m,
    },
    sectionTitle: {
        marginBottom: theme.spacing.s,
    },
    section: {
        marginTop: theme.spacing.s,
        marginBottom: theme.spacing.m,
    },
    chipRow: {
        flexDirection: 'row',
        paddingVertical: theme.spacing.xs,
        gap: theme.spacing.s,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        maxWidth: 220,
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.s,
        borderRadius: theme.borderRadius.round,
        backgroundColor: theme.colors.cardBackground,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },
    chipRTL: {
        flexDirection: 'row-reverse',
    },
    chipText: {
        ...theme.typography.label,
        color: theme.colors.accent,
        marginStart: theme.spacing.xs,
        flexShrink: 1,
    },
    chipTextRTL: {
        textAlign: 'right',
    },
    source: {
        textAlign: 'center',
        marginTop: theme.spacing.m,
        fontStyle: 'italic',
    },
});
