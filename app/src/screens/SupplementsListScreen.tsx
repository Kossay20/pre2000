import { createLogger } from '../utils/logger';
const log = createLogger('SupplementsListScreen');
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, ScrollView, Platform } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Supplement } from '../types';
import { theme } from '../theme';
import { Card } from '../components/common/Card';
import { Tag } from '../components/common/Tag';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getLocalizedContent } from '../utils/i18nHelpers';
import { normalizeSupplementSafety, SUPPLEMENT_SAFETY_LABEL_KEYS, SUPPLEMENT_SAFETY_TAG_COLORS } from '../utils/supplementSafety';
import { emptyListMessage, FilterSelection, isFilterChipSelected, NO_FILTER, pressFilterChip } from '../utils/filterChips';
import { useRtlScrollFix } from '../hooks/useRtlScrollFix';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { getAllLocalSupplements } from '../services/localContentFallback';
import { FIRESTORE_GUEST_TIMEOUT_MS, withTimeout } from '../utils/withTimeout';
import { getBookmarks, subscribeBookmarks } from '../services/bookmarkService';

export const SupplementsListScreen = () => {
    useScreenAnalytics('SupplementsListScreen');
    const { t, i18n } = useTranslation();
    const [supplements, setSupplements] = useState<Supplement[]>([]);
    // W5 #4: keep the safety/category/favoris filter row reachable under RTL (ar/tn) on web.
    const chipScrollRef = useRtlScrollFix();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    // task 10b/10c — one filter at a time: "Favoris" (bookmarked only), "All" (value null)
    // or one pregnancy_safety rating. See utils/filterChips.
    const [filter, setFilter] = useState<FilterSelection<Supplement['pregnancy_safety']>>(NO_FILTER);
    const selectedSafety = filter.value;
    const favoritesActive = filter.favorites;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
    const navigation = useNavigation();

    // task 10b — load bookmarked supplement ids + stay live across toggles
    // (e.g. unsaving from the detail screen updates this list immediately).
    useEffect(() => {
        let active = true;
        const sync = () => {
            getBookmarks().then(list => {
                if (!active) return;
                setBookmarkedIds(new Set(list.filter(b => b.type === 'supplement').map(b => b.id)));
            });
        };
        sync();
        const unsubscribe = subscribeBookmarks(sync);
        return () => {
            active = false;
            unsubscribe();
        };
    }, []);

    // ── Inside component so t() is never stale (language change safe) ──
    // W5 #2 (a11y/safety): the pill ICON+LABEL render in DARK tokens (not the pastel success/warning/
    // error) so the safety signal is legible on its light tint — verified ≥4.5:1 (green800/greenTint
    // 4.56, deepOrange900/orangeTint 5.11, red800/rose 4.91). Was 1.6–2.6:1 (illegible).
    // Label and colours are the shared ones, so the card says what the filter chip says.
    const SAFETY_ICONS = { ok: '✓', a_surveiller: '⚠', deconseille: '✗' } as const;
    const safetyConfig = (token: Supplement['pregnancy_safety']) => ({
        icon: SAFETY_ICONS[token],
        label: t(SUPPLEMENT_SAFETY_LABEL_KEYS[token]),
        color: SUPPLEMENT_SAFETY_TAG_COLORS[token].text,
        bgColor: SUPPLEMENT_SAFETY_TAG_COLORS[token].background,
    });

    useEffect(() => {
        let isMounted = true;
        const fetchSupplements = async () => {
            setLoading(true);
            setError(false);
            try {
                const snapshot = await withTimeout(
                    getDocs(collection(db, 'supplements')),
                    FIRESTORE_GUEST_TIMEOUT_MS,
                );
                if (!isMounted) return;
                const fetchedSupplements = snapshot.docs.map(doc => doc.data() as Supplement);
                setSupplements(fetchedSupplements);
            } catch (err) {
                log.error('Error fetching supplements:', err);
                // CLUSTER-2: fall back to bundled supplements (guest/offline) instead of "Oups".
                const local = getAllLocalSupplements();
                if (isMounted) {
                    if (local.length > 0) { setSupplements(local); setError(false); }
                    else setError(true);
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchSupplements();
        return () => { isMounted = false; };
    }, [refreshKey]);

    // task 10c: safety filter chips. Reuses the existing supplementSafety.* labels.
    // Built inside the component so t() is never stale on language change.
    // W5 #3 (a11y): `color` = the inactive chip's accent dot; `fill` = the DARK selected background so
    // the white active label is legible (white on green800 5.13:1 / deepOrange900 5.60:1 / red800 ≥5:1).
    // Was selected={backgroundColor: pastel color} + white text → 1.7–3.0:1 (illegible active label).
    const SAFETY_FILTERS: { value: Supplement['pregnancy_safety']; label: string; color: string; fill: string }[] = [
        { value: 'ok', label: t(SUPPLEMENT_SAFETY_LABEL_KEYS.ok), color: theme.colors.success, fill: theme.colors.green800 },
        { value: 'a_surveiller', label: t(SUPPLEMENT_SAFETY_LABEL_KEYS.a_surveiller), color: theme.colors.warning, fill: theme.colors.deepOrange900 },
        { value: 'deconseille', label: t(SUPPLEMENT_SAFETY_LABEL_KEYS.deconseille), color: theme.colors.error, fill: theme.colors.red800 },
    ];

    const filteredSupplements = React.useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query && !selectedSafety && !favoritesActive) return supplements;

        return supplements.filter(supplement => {
            // task 10b: Favoris chip predicate — keep only bookmarked items.
            if (favoritesActive && !bookmarkedIds.has(supplement.supplement_id)) {
                return false;
            }

            // task 10c: safety chip predicate (combined with the search predicate below).
            if (selectedSafety && normalizeSupplementSafety(supplement.pregnancy_safety) !== selectedSafety) {
                return false;
            }

            if (!query) return true;

            const name = (getLocalizedContent(supplement, 'name', i18n.language) || '').toLowerCase();
            const description = (getLocalizedContent(supplement, 'short_description', i18n.language) || '').toLowerCase();
            const category = (supplement.category || '').toLowerCase();

            return name.includes(query) || description.includes(query) || category.includes(query);
        });
    }, [supplements, searchQuery, selectedSafety, favoritesActive, bookmarkedIds, i18n.language]);

    const getSafetyConfig = (safety: string) => {
        // W5 #1 (PATIENT-SAFETY): the shared normaliser maps 'à_surveiller' → 'a_surveiller' and
        // FAILS SAFE to caution (⚠) for any unrecognized token — NEVER to 'ok'/green. The old
        // `|| SAFETY_CONFIG.ok` silently rendered mislabeled supplements (incl. Vitamine A,
        // teratogenic) as ✓ Safe.
        return safetyConfig(normalizeSupplementSafety(safety));
    };

    const renderItem = ({ item }: { item: Supplement }) => {
        const safetyConfig = getSafetyConfig(item.pregnancy_safety);

        return (
            <TouchableOpacity
                onPress={() => navigation.navigate('SupplementDetail', { supplementId: item.supplement_id })}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={getLocalizedContent(item, 'name', i18n.language)}
                accessibilityHint={t('a11y.openSupplement')}
            >
                <Card style={styles.card}>
                    <View style={[styles.safetyIndicator, { backgroundColor: safetyConfig.bgColor }]}>
                        <Text style={[styles.safetyIcon, { color: safetyConfig.color }]}>{safetyConfig.icon}</Text>
                        <Text style={[styles.safetyLabel, { color: safetyConfig.color }]}>{safetyConfig.label}</Text>
                    </View>
                    <View style={styles.content}>
                        <View style={styles.headerRow}>
                            <Text style={[theme.typography.h3, styles.title] as any}>
                                {getLocalizedContent(item, 'name', i18n.language)}
                            </Text>
                        </View>
                        <View style={styles.categoryRow}>
                            <Text style={styles.categoryEmoji}>💊</Text>
                            <Text style={theme.typography.caption}>{t(`supplementCategories.${item.category}`, { defaultValue: item.category })}</Text>
                        </View>
                        <Text numberOfLines={2} style={[theme.typography.body, styles.description]}>
                            {getLocalizedContent(item, 'short_description', i18n.language)}
                        </Text>
                        <View style={styles.footer}>
                            <Text style={styles.readMore}>{t('common.seeDetails')}</Text>
                        </View>
                    </View>
                </Card>
            </TouchableOpacity>
        );
    };

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
                <Text style={{ fontSize: 48, marginBottom: 16 }}>💊</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 8, textAlign: 'center' }}>
                    {t('common.errorBoundary.title')}
                </Text>
                <Text style={[{ textAlign: 'center', marginVertical: 10, color: theme.colors.textLight }]}>
                    {t('common.errorBoundary.message')}
                </Text>
                <TouchableOpacity
                    onPress={() => setRefreshKey(k => k + 1)}
                    style={{ backgroundColor: theme.colors.accent, padding: 12, borderRadius: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.retry')}
                >
                    <Text style={{ color: 'white', fontWeight: '600' }}>{t('common.retry')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const emptyMessage = emptyListMessage(filter, searchQuery);
    const favoritesEmpty = emptyMessage.key === 'favoritesEmpty';
    const emptyText = favoritesEmpty
        ? t('common.favoritesEmpty.title')
        : emptyMessage.key === 'noResultsFor'
            ? t('common.noSupplementFound', { query: searchQuery.trim() })
            : t('common.noResults');
    const emptyHint = favoritesEmpty ? t('common.favoritesEmpty.hint') : null;

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <View style={[styles.searchBar, searchFocused && styles.searchBarFocused]}>
                    <Text style={styles.searchIcon}>🔍</Text>
                    <TextInput
                        style={styles.searchInput}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setSearchFocused(false)}
                        placeholder={t('common.searchSupplement')}
                        placeholderTextColor={theme.colors.textMuted}
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
                        onPress={() => setFilter(f => pressFilterChip(f, { type: 'favorites' }))}
                        activeOpacity={0.7}
                        style={[
                            styles.chip,
                            favoritesActive
                                ? { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }
                                : styles.chipInactive,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: favoritesActive }}
                        // react-native-web drops accessibilityState, so on web the lit chip is
                        // exposed as aria-pressed (the ARIA state for an on/off button).
                        {...(Platform.OS === 'web' ? { 'aria-pressed': favoritesActive } : {})}
                        accessibilityLabel={t('common.favorites')}
                    >
                        <Text style={[styles.chipText, favoritesActive ? styles.chipTextActive : styles.chipTextInactive]}>
                            {`★ ${t('common.favorites')}`}
                        </Text>
                    </TouchableOpacity>
                    {(() => {
                        const allSelected = isFilterChipSelected(filter, { type: 'all' });
                        return (
                            <TouchableOpacity
                                onPress={() => setFilter(f => pressFilterChip(f, { type: 'all' }))}
                                activeOpacity={0.7}
                                style={[
                                    styles.chip,
                                    allSelected
                                        ? { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }
                                        : styles.chipInactive,
                                ]}
                                accessibilityRole="button"
                                accessibilityState={{ selected: allSelected }}
                                {...(Platform.OS === 'web' ? { 'aria-pressed': allSelected } : {})}
                                accessibilityLabel={t('categories.all', { defaultValue: 'Tout' })}
                            >
                                <Text style={[styles.chipText, allSelected ? styles.chipTextActive : styles.chipTextInactive]}>
                                    {t('categories.all', { defaultValue: 'Tout' })}
                                </Text>
                            </TouchableOpacity>
                        );
                    })()}
                    {SAFETY_FILTERS.map(safetyFilter => {
                        const selected = isFilterChipSelected(filter, { type: 'value', value: safetyFilter.value });
                        return (
                            <TouchableOpacity
                                key={safetyFilter.value}
                                onPress={() => setFilter(f => pressFilterChip(f, { type: 'value', value: safetyFilter.value }))}
                                activeOpacity={0.7}
                                style={[
                                    styles.chip,
                                    selected
                                        ? { backgroundColor: safetyFilter.fill, borderColor: safetyFilter.fill }
                                        : styles.chipInactive,
                                ]}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                {...(Platform.OS === 'web' ? { 'aria-pressed': selected } : {})}
                                accessibilityLabel={safetyFilter.label}
                            >
                                <Text style={[styles.chipText, selected ? styles.chipTextActive : styles.chipTextInactive]}>
                                    {safetyFilter.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            <FlatList
                data={filteredSupplements}
                renderItem={renderItem}
                keyExtractor={item => item.supplement_id}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyEmoji}>{favoritesEmpty ? '⭐' : '🤷‍♀️'}</Text>
                        <Text style={styles.emptyText}>{emptyText}</Text>
                        {emptyHint ? <Text style={styles.emptyHint}>{emptyHint}</Text> : null}
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
        // 44 + the 1 pt focus border on each side: the input fills the inner box, and a
        // 44-high bar left it at 42 pt, under the touch-target minimum (E-006).
        height: 46,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    searchBarFocused: {
        borderColor: theme.colors.accent,
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
        paddingHorizontal: 4,
        // The bar draws its own focus border (searchBarFocused): the browser's square default
        // outline sat inside the rounded bar with the text flush against it (C-069). Native has none.
        ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0 } as object) : {}),
    },
    clearIcon: {
        fontSize: 16,
        color: theme.colors.textMuted,
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
    safetyIndicator: {
        // 84 + paddingHorizontal: the status word is the card's one safety cue, at 12pt it needs
        // the room ('With caution' / 'يجب تجنبه' wrap on a second line instead of shrinking).
        width: 84,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.s,
        paddingHorizontal: 4,
    },
    safetyIcon: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    safetyLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        textAlign: 'center',
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
    categoryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: theme.spacing.s,
    },
    categoryEmoji: {
        fontSize: 14,
        marginEnd: 4,
    },
    description: {
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
    emptyHint: {
        marginTop: 8,
        fontSize: 14,
        color: theme.colors.textLight,
        textAlign: 'center',
    },
});
