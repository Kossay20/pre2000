import { createLogger } from '../utils/logger';
const log = createLogger('ArticleDetailScreen');
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import Markdown from 'react-native-markdown-display';
import { db } from '../config/firebase';
import { Article, Supplement, ArticleAntigravity } from '../types';
import { getAntigravityArticle } from '../services/contentService'; // ANTIGRAVITY
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
                const docSnap = await getDoc(docRef);

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
                }
            } catch (err) {
                log.error('[ArticleDetail] ❌ Error fetching article:', err);
                setError(t('common.errorLoadingData'));
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
    backButton: {
        marginBottom: theme.spacing.m,
        alignSelf: 'flex-start',
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
