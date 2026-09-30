import { createLogger } from '../utils/logger';
const log = createLogger('ArticleDetailScreen');
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import Markdown from 'react-native-markdown-display';
import { MedicalDisclaimer } from '../components/common/MedicalDisclaimer';
import { SourcesFooter } from '../components/common/SourcesFooter';
import { db } from '../config/firebase';
import { Article, Supplement, ArticleAntigravity } from '../types';
import { getAntigravityArticle } from '../services/contentService'; // ANTIGRAVITY
import {
    getLocalArticle,
    getLocalAntigravityArticle,
    getLocalSupplement,
    getAllLocalArticles,
    getAllLocalSupplements,
} from '../services/localContentFallback';
import { FIRESTORE_GUEST_TIMEOUT_MS, withTimeout } from '../utils/withTimeout';
import { theme } from '../theme';
import { Tag } from '../components/common/Tag';
import { SectionHeader } from '../components/common/SectionHeader';
import { Card } from '../components/common/Card';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { trackPositiveAction } from '../services/inAppReviewService';
import { getLocalizedContent } from '../utils/i18nHelpers';
import { isSafeUrl } from '../utils/safeOpenUrl';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { isBookmarked, toggleBookmark, subscribeBookmarks } from '../services/bookmarkService';

/**
 * task 10a content cross-linking — related-id helpers.
 *
 * The bundled content stores related ids as a COMMA-SEPARATED string (e.g.
 * "a01,a02"), even though some app types declare the field as `string[]`. These
 * helpers normalise either shape and resolve short ids (e.g. "a01") against the
 * full bundled id (e.g. "a01_symptômes_de_grossesse") via a prefix match.
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
    // Short id (e.g. "a01") → full bundled id (e.g. "a01_symptômes_de_grossesse").
    return getAllLocalArticles().find(
        a => a.article_id === id || a.article_id.startsWith(`${id}_`),
    );
};

const resolveRelatedSupplement = (id: string): Supplement | undefined => {
    const exact = getLocalSupplement(id);
    if (exact) return exact;
    return getAllLocalSupplements().find(
        s => s.supplement_id === id || s.supplement_id.startsWith(`${id}_`),
    );
};

export const ArticleDetailScreen = () => {
    useScreenAnalytics('ArticleDetailScreen');
    const route = useRoute<any>();
    const navigation = useNavigation();
    const { t, i18n } = useTranslation(); // Hoisted hook
    const { articleId, anchor } = route.params || {};

    // State hooks
    const [article, setArticle] = useState<Article | ArticleAntigravity | null>(null);
    const [isAntigravity, setIsAntigravity] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [relatedSupplements, setRelatedSupplements] = useState<Supplement[]>([]);
    const [anchorPositions, setAnchorPositions] = useState<Record<string, number>>({});
    // task 10b — bookmark/save state. Keyed off the route's articleId (the
    // bundled & Antigravity shapes both navigate with article_id as articleId).
    const [saved, setSaved] = useState(false);

    // RTL detection
    const isRTL = ['ar', 'tn'].includes(i18n.language);

    // Refs
    const scrollViewRef = React.useRef<ScrollView>(null);

    // Effects
    useEffect(() => {
        const fetchArticle = async () => {
            if (!articleId) return; // Guard inside effect, not before hook

            log.debug(`[ArticleDetail] 📰 Fetching article: ${articleId}`);
            try {
                // ANTIGRAVITY: Try Antigravity collection first
                log.debug('[ArticleDetail] 🔍 Trying Antigravity collection...');
                const agArticle = await getAntigravityArticle(articleId);

                if (agArticle) {
                    log.debug('[ArticleDetail] ✅ Found in Antigravity:', agArticle.title_fr);
                    setArticle(agArticle);
                    setIsAntigravity(true);
                    setLoading(false);
                    trackPositiveAction('read_article'); // Engagement
                    return;
                }

                // Fallback to old articles collection
                log.debug('[ArticleDetail] 🔍 Not in Antigravity, trying old articles...');
                const docRef = doc(db, 'articles', articleId);
                const docSnap = await withTimeout(getDoc(docRef), FIRESTORE_GUEST_TIMEOUT_MS);

                if (docSnap.exists()) {
                    const articleData = docSnap.data() as Article;
                    log.debug('[ArticleDetail] ✅ Found in old articles:', articleData.title_fr);
                    setArticle(articleData);
                    setIsAntigravity(false);
                    trackPositiveAction('read_article'); // Engagement

                    // Fetch related supplements (only for old articles)
                    if (articleData.related_supplements_ids && articleData.related_supplements_ids.length > 0) {
                        log.debug('[ArticleDetail] 📦 Fetching', articleData.related_supplements_ids.length, 'supplements');
                        const supplementsPromises = articleData.related_supplements_ids.map(id =>
                            getDoc(doc(db, 'supplements', id))
                        );
                        const supplementsSnaps = await Promise.all(supplementsPromises);
                        const supplements = supplementsSnaps
                            .filter(s => s.exists())
                            .map(s => s.data() as Supplement);
                        log.debug('[ArticleDetail] ✅ Loaded', supplements.length, 'supplements');
                        setRelatedSupplements(supplements);
                    }
                } else {
                    log.warn('[ArticleDetail] ⚠️ Article not found in any collection:', articleId);
                    const local = getLocalAntigravityArticle(articleId) || getLocalArticle(articleId);
                    if (local) setArticle(local);
                }
            } catch (err) {
                log.error('[ArticleDetail] ❌ Error fetching article:', err);
                const local = getLocalAntigravityArticle(articleId) || getLocalArticle(articleId);
                if (local) {
                    setArticle(local);
                    setError(null);
                } else {
                    setError(t('common.errorLoadingData'));
                }
            } finally {
                setLoading(false);
            }
        };

        if (articleId) {
            fetchArticle();
        } else {
            setLoading(false); // No ID, stop loading immediately
        }
    }, [articleId]);

    // Scroll to anchor when positions are ready
    useEffect(() => {
        if (anchor && !loading && scrollViewRef.current && Object.keys(anchorPositions).length > 0) {
            const yPos = anchorPositions[anchor];
            if (yPos !== undefined) {
                log.info(`[ArticleDetail] 🎯 Scrolling to anchor: ${anchor} at y=${yPos}`);
                // Add a small delay to ensure rendering is complete
                setTimeout(() => {
                    scrollViewRef.current?.scrollTo({ y: yPos, animated: true });
                }, 500);
            } else {
                log.warn(`[ArticleDetail] ⚠️ Anchor not found in positions: ${anchor}`);
            }
        }
    }, [anchor, anchorPositions, loading]);

    // task 10b — reflect bookmark state on mount + stay live across toggles
    // (fired from here or elsewhere, e.g. the Favoris chip on the list screen).
    useEffect(() => {
        if (!articleId) return;
        let active = true;
        const sync = () => {
            isBookmarked('article', articleId).then(v => {
                if (active) setSaved(v);
            });
        };
        sync();
        const unsubscribe = subscribeBookmarks(sync);
        return () => {
            active = false;
            unsubscribe();
        };
    }, [articleId]);

    const handleToggleBookmark = React.useCallback(() => {
        if (!articleId) return;
        // Optimistic flip; subscribeBookmarks reconciles with the persisted value.
        toggleBookmark('article', articleId).then(setSaved);
    }, [articleId]);

    // Early returns (AFTER all hooks)
    if (!articleId) {
        log.error('[ArticleDetail] ❌ No articleId provided');
        return (
            <View style={styles.centerContainer}>
                <Text style={theme.typography.body}>{t('article.errorSpecified')}</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
                    <Text style={{ color: theme.colors.accent }}>{t('common.back')}</Text>
                </TouchableOpacity>
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

    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>📝</Text>
                <Text style={[theme.typography.body, { textAlign: 'center', marginHorizontal: 24 }]}>{error}</Text>
                <TouchableOpacity
                    onPress={() => {
                        setError(null);
                        setLoading(true);
                    }}
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

    if (!article) {
        return (
            <View style={styles.centerContainer}>
                <Text style={theme.typography.body}>{t('article.notFound')}</Text>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20, padding: 10 }}>
                    <Text style={{ color: theme.colors.accent, fontWeight: 'bold' }}>{t('common.back')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Use shared helper for consistent localization behavior (supports tn -> ar fallback)


    // Determine if we have content based on locale
    const rawContent = isAntigravity
        ? getLocalizedContent(article as ArticleAntigravity, 'content', i18n.language)
        : getLocalizedContent(article as Article, 'content_markdown', i18n.language);

    const hasContent = rawContent && rawContent.trim().length > 0;

    // Get Title
    const title = getLocalizedContent(article, 'title', i18n.language);

    // Get Content or Summary payload
    const summary = getLocalizedContent(article, 'summary', i18n.language);

    // Helper to sanitizer content (fix escaped newlines from Firestore/JSON import)
    const sanitizeContent = (text: string) => {
        if (!text) return '';
        // Replace literal "\n" strings with actual newlines
        return text.replace(/\\n/g, '\n');
    };

    const content = hasContent
        ? sanitizeContent(rawContent)
        : (summary || t('article.contentComingSoon'));


    const category = article.category;
    // Attempt to localize category if it matches a key
    const categoryLabel = t(`categories.${category.toLowerCase()}`, { defaultValue: category });

    // task 10a — cross-linking. The related-id fields live on the bundled `Article`
    // shape but NOT on `ArticleAntigravity`; read them defensively (sections
    // simply don't render when the fields are absent or empty).
    const articleRelations = article as Partial<Article>;
    const linkedArticles = parseRelatedIds(articleRelations.related_articles_ids)
        .map(resolveRelatedArticle)
        .filter((a): a is Article => Boolean(a))
        // Never link the article to itself.
        .filter(a => a.article_id !== (article as Article).article_id);
    const linkedSupplements = parseRelatedIds(articleRelations.related_supplements_ids)
        .map(resolveRelatedSupplement)
        .filter((s): s is Supplement => Boolean(s));

    // Helper to slugify header text (must match backend logic)
    const slugify = (text: string) => {
        return text.toString().toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-')
            .replace(/^-+/, '')
            .replace(/-+$/, '');
    };

    // Custom rules to capture header positions
    const rules = {
        heading1: (node: any, children: any, parent: any, styles: any) => {
            const text = children[0]?.props?.children || "";
            const slug = slugify(text);
            return (
                <Text
                    key={node.key}
                    style={styles.heading1}
                    onLayout={(event) => {
                        const { y } = event.nativeEvent.layout;
                        setAnchorPositions(prev => ({ ...prev, [slug]: y }));
                    }}
                >
                    {children}
                </Text>
            );
        },
        heading2: (node: any, children: any, parent: any, styles: any) => {
            const text = children[0]?.props?.children || "";
            const slug = slugify(text);
            return (
                <Text
                    key={node.key}
                    style={styles.heading2}
                    onLayout={(event) => {
                        const { y } = event.nativeEvent.layout;
                        setAnchorPositions(prev => ({ ...prev, [slug]: y }));
                    }}
                >
                    {children}
                </Text>
            );
        },
        heading3: (node: any, children: any, parent: any, styles: any) => {
            const text = children[0]?.props?.children || "";
            const slug = slugify(text);
            return (
                <Text
                    key={node.key}
                    style={styles.heading3}
                    onLayout={(event) => {
                        const { y } = event.nativeEvent.layout;
                        setAnchorPositions(prev => ({ ...prev, [slug]: y }));
                    }}
                >
                    {children}
                </Text>
            );
        },
    };

    return (
        <ScrollView
            ref={scrollViewRef}
            style={styles.container}
            contentContainerStyle={styles.contentContainer}
        >
            <View style={styles.header}>
                {/* Back button + bookmark toggle.
                    DOUBLE-FLIP FIX: this used to add `row-reverse` for RTL. Under the
                    document's dir=rtl, plain `flexDirection: 'row'` ALREADY lays children
                    out right-to-left, so the extra reverse cancelled it and Arabic got the
                    LTR arrangement — back arrow on the left, bookmark on the right. The
                    same (correct) reasoning is already documented in ToastContext and
                    OnboardingScreen; these two detail screens had drifted from it. */}
                <View style={styles.headerBar}>
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
                <Tag label={categoryLabel} />
                <Text style={[theme.typography.h1, styles.title] as any}>{title}</Text>
                {!hasContent && (
                    <View style={styles.previewBadge}>
                        <Text style={styles.previewText}>📝 {t('article.preview')}</Text>
                    </View>
                )}
            </View>

            <View style={styles.markdownContainer}>
                {hasContent ? (
                    <Markdown
                        style={markdownStyles}
                        rules={rules}
                        onLinkPress={(url) => {
                            // SAFETY: whitelist scheme before dispatching to native handler
                            // (defense-in-depth even when content is from internal CMS).
                            if (!isSafeUrl(url)) {
                                log.warn('Blocked Markdown link with non-whitelisted scheme:', url);
                                return false;
                            }
                            Linking.openURL(url).catch((err: any) => log.error('Failed to open link:', err));
                            return true;
                        }}
                    >
                        {content}
                    </Markdown>
                ) : (
                    /* F12 FIX: previously displayed `t('common.loading')` for an empty-content
                       state, which was misleading — user thought the article was still loading.
                       Now shows the proper "content coming soon" placeholder. */
                    <View style={styles.fallbackContainer}>
                        <Text style={styles.fallbackText}>
                            {t('article.contentComingSoon')} 🚧
                        </Text>
                        <Text style={theme.typography.body}>
                            {getLocalizedContent(article, 'summary') || t('common.noDataAvailable')}
                        </Text>
                        <View style={styles.fallbackActions}>
                            <Text style={[theme.typography.caption, { textAlign: 'center', marginTop: theme.spacing.m }]}>
                                {t('common.seeMore')}
                            </Text>
                        </View>
                    </View>
                )}
            </View>

            <SourcesFooter sources={article.sources} />

            {/* The article library is medical content: say under every article that it
                does not replace a consultation (review notes promise a permanent disclaimer). */}
            <MedicalDisclaimer />

            {relatedSupplements.length > 0 && (
                <View style={styles.section}>
                    <SectionHeader title={t('common.relatedSupplements')} />
                    {relatedSupplements.map(supplement => (
                        <TouchableOpacity
                            key={supplement.supplement_id}
                            onPress={() => navigation.navigate('SupplementDetail', { supplementId: supplement.supplement_id })}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={getLocalizedContent(supplement, 'name')}
                            accessibilityHint={t('a11y.openSupplement')}
                        >
                            <Card style={styles.supplementCard}>
                                <Text style={theme.typography.h3}>{getLocalizedContent(supplement, 'name')}</Text>
                                <Text style={theme.typography.body} numberOfLines={2}>{getLocalizedContent(supplement, 'short_description')}</Text>
                            </Card>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* task 10a — related ARTICLES (from article.related_articles_ids) */}
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
                                    onPress={() => (navigation as any).push('ArticleDetail', { articleId: linked.article_id })}
                                    activeOpacity={0.7}
                                    style={styles.chip}
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

            {/* task 10a — related SUPPLEMENTS (from article.related_supplements_ids) */}
            {linkedSupplements.length > 0 && (
                <View style={styles.section}>
                    <SectionHeader title={t('common.relatedSupplements')} />
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipRow}
                    >
                        {linkedSupplements.map(linked => {
                            const label = getLocalizedContent(linked, 'name', i18n.language);
                            return (
                                <TouchableOpacity
                                    key={linked.supplement_id}
                                    onPress={() => navigation.navigate('SupplementDetail', { supplementId: linked.supplement_id })}
                                    activeOpacity={0.7}
                                    style={styles.chip}
                                    accessibilityRole="button"
                                    accessibilityLabel={label}
                                    accessibilityHint={t('a11y.openSupplement')}
                                >
                                    <Ionicons name="medkit-outline" size={16} color={theme.colors.accent} />
                                    <Text style={[styles.chipText, isRTL && styles.chipTextRTL]} numberOfLines={2}>{label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
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
    header: {
        marginBottom: theme.spacing.l,
    },
    headerBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.m,
    },
    backButton: {
        alignSelf: 'flex-start',
    },
    bookmarkButton: {
        padding: theme.spacing.xs,
    },
    title: {
        marginTop: theme.spacing.s,
    },
    previewBadge: {
        backgroundColor: theme.colors.secondary,
        paddingHorizontal: theme.spacing.m,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.borderRadius.round,
        alignSelf: 'flex-start',
        marginTop: theme.spacing.s,
    },
    previewText: {
        fontSize: 12,
        color: theme.colors.text,
        fontWeight: 'bold',
    },
    markdownContainer: {
        marginBottom: theme.spacing.l,
    },
    section: {
        marginTop: theme.spacing.l,
    },
    supplementCard: {
        marginBottom: theme.spacing.s,
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
    chipText: {
        ...theme.typography.label,
        color: theme.colors.accent,
        marginStart: theme.spacing.xs,
        flexShrink: 1,
    },
    chipTextRTL: {
        textAlign: 'right',
    },
    fallbackContainer: {
        padding: theme.spacing.l,
        backgroundColor: theme.colors.white,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderStyle: 'dashed',
    },
    fallbackText: {
        ...theme.typography.h3,
        color: theme.colors.textLight,
        marginBottom: theme.spacing.s,
    },
    fallbackActions: {
        width: '100%',
        alignItems: 'center',
    },
});

const markdownStyles = {
    body: {
        ...theme.typography.body,
        color: theme.colors.text,
        lineHeight: 24,
    },
    heading1: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.colors.accent,
        marginTop: theme.spacing.l,
        marginBottom: theme.spacing.m,
        borderBottomWidth: 2,
        borderBottomColor: theme.colors.secondary,
        paddingBottom: theme.spacing.s,
    },
    heading2: {
        fontSize: 20,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginTop: theme.spacing.m,
        marginBottom: theme.spacing.s,
    },
    heading3: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginTop: theme.spacing.m,
        marginBottom: theme.spacing.xs,
    },
    paragraph: {
        marginBottom: theme.spacing.m,
        lineHeight: 24,
    },
    list_item: {
        marginBottom: theme.spacing.xs,
        paddingStart: theme.spacing.s,
    },
    bullet_list: {
        marginBottom: theme.spacing.s,
    },
    code_inline: {
        backgroundColor: theme.colors.secondary,
        color: theme.colors.text,
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 4,
        fontFamily: 'Courier',
    },
    code_block: {
        backgroundColor: theme.colors.secondary,
        padding: theme.spacing.s,
        borderRadius: theme.borderRadius.s,
        marginVertical: theme.spacing.s,
    },
    blockquote: {
        backgroundColor: theme.colors.background,
        borderStartWidth: 4,
        borderStartColor: theme.colors.primary,
        paddingStart: theme.spacing.m,
        paddingVertical: theme.spacing.s,
        marginVertical: theme.spacing.s,
        fontStyle: 'italic',
    },
    link: {
        color: theme.colors.accent,
        textDecorationLine: 'underline' as const,
    },
};
