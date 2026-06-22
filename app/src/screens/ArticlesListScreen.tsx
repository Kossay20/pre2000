import { createLogger } from '../utils/logger';
const log = createLogger('ArticlesListScreen');
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import { db } from '../config/firebase';
import { Article, ArticleAntigravity } from '../types';
import { getLocalizedContent } from '../utils/i18nHelpers';
import { useRtlScrollFix } from '../hooks/useRtlScrollFix';
import { getAntigravityArticlesByCategory } from '../services/contentService'; // ANTIGRAVITY
import { getAllLocalArticles } from '../services/localContentFallback';
import { getBookmarks, subscribeBookmarks } from '../services/bookmarkService';
import { theme } from '../theme';
import { Card } from '../components/common/Card';
import { Tag } from '../components/common/Tag';
import { Skeleton } from '../components/common/Skeleton'; // D4
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

const CATEGORY_ICONS: Record<string, string> = {
    nutrition: '🍎',
    examens: '🩺',
    sante: '❤️',
    developpement: '👶',
    preparation: '🎒',
    lifestyle: '🌸',
    administratif: '📄',
    medical: '⚕️',
};

export const ArticlesListScreen = () => {
    useScreenAnalytics('ArticlesListScreen');
    const [articles, setArticles] = useState<(Article | ArticleAntigravity)[]>([]);
    // W5 #4: keep the category/favoris filter row reachable under RTL (ar/tn) on web.
    const chipScrollRef = useRtlScrollFix();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null); // task 10c: null = "All"
    // task 10b — "Favoris" filter chip: when active, show only bookmarked items.
    const [favoritesActive, setFavoritesActive] = useState(false);
    const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const navigation = useNavigation();
    const route = useRoute<any>();
    const searchInputRef = React.useRef<TextInput>(null);
    const { t, i18n } = useTranslation();

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (route.params?.openSearch && searchInputRef.current) {
            timer = setTimeout(() => {
                searchInputRef.current?.focus();
            }, 500);
        }
        return () => { if (timer) clearTimeout(timer); };
    }, [route.params?.openSearch]);

    // task 10b — load bookmarked article ids + stay live across toggles
    // (e.g. unsaving from the detail screen updates this list immediately).
    useEffect(() => {
        let active = true;
        const sync = () => {
            getBookmarks().then(list => {
                if (!active) return;
                setBookmarkedIds(new Set(list.filter(b => b.type === 'article').map(b => b.id)));
            });
        };
        sync();
        const unsubscribe = subscribeBookmarks(sync);
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    const [error, setError] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const retryLoad = () => setRefreshKey(k => k + 1);

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            setLoading(true);
            setError(false);
            log.debug('[ArticlesListScreen] 📚 Fetching all articles (old + Antigravity)...');
            try {
                const [oldSnapshot, agSnapshot] = await Promise.all([
                    getDocs(collection(db, 'articles')),
                    getDocs(collection(db, 'articlesAntigravity')),
                ]);
                if (!isMounted) return;
                const oldArts = oldSnapshot.docs.map(doc => doc.data() as Article);
                const agArts = agSnapshot.docs.map(doc => doc.data() as ArticleAntigravity);
                // U-FIX-9: dedupe by article_id with Antigravity priority (consistent with
                // ArticleDetailScreen which resolves AG first then falls back to `articles`).
                // Was: simple concat → duplicate FlatList keys + same article shown twice.
                const byId = new Map<string, Article | ArticleAntigravity>();
                for (const a of oldArts) {
                    if (a.article_id) byId.set(a.article_id, a);
                }
                for (const a of agArts) {
                    if (a.article_id) byId.set(a.article_id, a); // overrides legacy entry
                }
                setArticles(Array.from(byId.values()));
            } catch (err) {
                log.error('[ArticlesListScreen] ❌ Error fetching articles:', err);
                // CLUSTER-2: Firestore failed (permission-denied for guests / offline).
                // Fall back to the bundled article list so Resources isn't a dead "Oups".
                const local = getAllLocalArticles();
                if (isMounted) {
                    if (local.length > 0) { setArticles(local); setError(false); }
                    else setError(true);
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        load();
        return () => { isMounted = false; };
    }, [refreshKey]);

    // task 10c: distinct category chips derived from the loaded articles, ranked by
    // frequency and capped so the horizontal row stays usable (21 categories exist
    // in the bundled data). Recomputed only when the article set changes.
    const categoryChips = React.useMemo(() => {
        const counts = new Map<string, number>();
        for (const article of articles) {
            const slug = (article.category || '').trim();
            if (!slug) continue;
            counts.set(slug, (counts.get(slug) || 0) + 1);
        }
        return Array.from(counts.entries())
            .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
            .slice(0, 10)
            .map(([slug]) => slug);
    }, [articles]);

    // task 10c: if the active category disappears from the data (e.g. after a refresh),
    // fall back to "All" so the list never silently shows nothing.
    useEffect(() => {
        if (selectedCategory && !categoryChips.includes(selectedCategory)) {
            setSelectedCategory(null);
        }
    }, [categoryChips, selectedCategory]);

    const filteredArticles = React.useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query && !selectedCategory && !favoritesActive) return articles;

        return articles.filter(article => {
            // task 10b: Favoris chip predicate — keep only bookmarked items.
            if (favoritesActive && !bookmarkedIds.has(article.article_id)) {
                return false;
            }

            const categoryKey = (article.category || '').toLowerCase();

            // task 10c: category chip predicate (combined with the search predicate below).
            if (selectedCategory && categoryKey !== selectedCategory.toLowerCase()) {
                return false;
            }

            if (!query) return true;

            const title = getLocalizedContent(article, 'title', i18n.language).toLowerCase();
            const summary = getLocalizedContent(article, 'summary', i18n.language).toLowerCase();
            const categoryLabel = t(`categories.${categoryKey}`, { defaultValue: article.category }).toLowerCase();

            return title.includes(query) || summary.includes(query) || categoryLabel.includes(query);
        });
    }, [articles, searchQuery, selectedCategory, favoritesActive, bookmarkedIds, i18n.language]);

    const getCategoryIcon = (category: string) => {
        return CATEGORY_ICONS[category] || '📚';
    };

    const handleArticlePress = useCallback((articleId: string) => {
        navigation.navigate('ArticleDetail', { articleId });
    }, [navigation]);

    const renderItem = useCallback(({ item }: { item: Article | ArticleAntigravity }) => {
        // Handle both old and Antigravity article types
        const title = getLocalizedContent(item, 'title', i18n.language);
        // Bundled summaries begin with a markdown heading ("# ..."); strip markdown so the
        // 2-line card preview reads as plain text instead of leaking the raw "#" (all langs).
        const summary = getLocalizedContent(item, 'summary', i18n.language, { stripMarkdown: true });
        const categoryKey = (item.category || '').toLowerCase();
        const categoryLabel = t(`categories.${categoryKey}`, { defaultValue: item.category });

        return (
            <TouchableOpacity
                onPress={() => handleArticlePress(item.article_id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={getLocalizedContent(item, 'title', i18n.language)}
                accessibilityHint={t('a11y.readArticle')}
            >
                <Card style={styles.card}>
                    <View style={styles.iconContainer}>
                        <Text style={styles.categoryIcon}>{getCategoryIcon(item.category)}</Text>
                    </View>
                    <View style={styles.content}>
                        <View style={styles.headerRow}>
                            <Text style={[theme.typography.h3, styles.title] as any}>{title}</Text>
                        </View>
                        <Tag label={categoryLabel} />
                        <Text numberOfLines={2} style={[theme.typography.body, styles.summary]}>
                            {summary || t('common.seeMore')}
                        </Text>
                        <View style={styles.footer}>
                            <Text style={styles.readMore}>{t('common.seeDetails')}</Text>
                        </View>
                    </View>
                </Card>
            </TouchableOpacity>
        );
    }, [handleArticlePress, i18n.language, t]);

    if (loading) {
        // D4: card-list skeleton replaces the spinner
        return (
            <View style={[styles.container, { padding: 16 }]}>
                {[0, 1, 2, 3, 4].map(i => (
                    <Skeleton.Card key={i} style={{ height: 96, marginBottom: 12 }} />
                ))}
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Text style={theme.typography.h3}>{t('common.errorBoundary.title')}</Text>
                <Text style={{ textAlign: 'center', marginVertical: 10, color: theme.colors.textLight }}>
                    {t('common.errorBoundary.message')}
                </Text>
                <TouchableOpacity
                    onPress={retryLoad}
                    style={{ backgroundColor: theme.colors.accent, padding: 10, borderRadius: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.retry')}
                >
                    <Text style={{ color: 'white' }}>{t('common.errorBoundary.retry')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Text style={styles.searchIcon}>🔍</Text>
                    <TextInput
                        ref={searchInputRef}
                        style={styles.searchInput}
                        placeholder={t('common.searchArticlePlaceholder')}
                        placeholderTextColor={theme.colors.neutral400}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity
                            onPress={() => setSearchQuery('')}
                            accessibilityRole="button"
                            accessibilityLabel={t('a11y.close')}
                        >
                            <Text style={styles.clearIcon}>✕</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <ScrollView
                    ref={chipScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                    style={styles.chipScroll}
                >
                    {/* task 10b — leading "Favoris" chip: filters to bookmarked items only. */}
                    <TouchableOpacity
                        onPress={() => setFavoritesActive(v => !v)}
                        activeOpacity={0.7}
                        style={[styles.chip, favoritesActive ? styles.chipActive : styles.chipInactive]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: favoritesActive }}
                        accessibilityLabel={t('common.favorites')}
                    >
                        <Text style={[styles.chipText, favoritesActive ? styles.chipTextActive : styles.chipTextInactive]}>
                            {`★ ${t('common.favorites')}`}
                        </Text>
                    </TouchableOpacity>
                    {categoryChips.length > 0 &&
                        [null, ...categoryChips].map(slug => {
                            const selected = selectedCategory === slug;
                            const label = slug
                                ? t(`categories.${slug}`, { defaultValue: slug })
                                : t('categories.all', { defaultValue: 'Tout' });
                            return (
                                <TouchableOpacity
                                    key={slug ?? '__all__'}
                                    onPress={() => setSelectedCategory(slug)}
                                    activeOpacity={0.7}
                                    style={[styles.chip, selected ? styles.chipActive : styles.chipInactive]}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected }}
                                    accessibilityLabel={label}
                                >
                                    <Text style={[styles.chipText, selected ? styles.chipTextActive : styles.chipTextInactive]}>
                                        {label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
            </View>

            <FlatList<Article | ArticleAntigravity>
                data={filteredArticles}
                renderItem={renderItem}
                keyExtractor={item => item.article_id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyEmoji}>🤷‍♀️</Text>
                        <Text style={styles.emptyText}>{t('common.noResultsFor', { query: searchQuery })}</Text>
                    </View>
                }
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchContainer: {
        padding: 16,
        backgroundColor: theme.colors.white,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.neutral100,
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
    },
    searchIcon: {
        fontSize: 16,
        marginEnd: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: theme.colors.neutral900,
        height: '100%',
    },
    clearIcon: {
        fontSize: 16,
        color: theme.colors.neutral400,
        padding: 4,
    },
    chipScroll: {
        marginTop: 12,
    },
    chipRow: {
        gap: 8,
        paddingEnd: 4,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
    },
    chipActive: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    chipInactive: {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.borderLight,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '600',
    },
    chipTextActive: {
        color: theme.colors.white,
    },
    chipTextInactive: {
        color: theme.colors.textSecondary,
    },
    listContent: {
        padding: theme.spacing.m,
    },
    card: {
        marginBottom: theme.spacing.m,
        flexDirection: 'row',
        overflow: 'hidden',
    },
    iconContainer: {
        width: 70,
        backgroundColor: theme.colors.secondary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryIcon: {
        fontSize: 32,
    },
    content: {
        flex: 1,
        padding: theme.spacing.m,
    },
    headerRow: {
        marginBottom: theme.spacing.xs,
    },
    title: {
        marginBottom: theme.spacing.xs,
    },
    summary: {
        marginTop: theme.spacing.s,
        color: theme.colors.textLight,
        lineHeight: 20,
    },
    footer: {
        marginTop: theme.spacing.s,
        flexDirection: 'row',
        alignItems: 'center',
    },
    readMore: {
        color: theme.colors.accent,
        fontSize: 14,
        fontWeight: 'bold',
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 40,
        padding: 20,
    },
    emptyEmoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
});

