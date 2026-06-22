import { createLogger } from '../utils/logger';
const log = createLogger('SupplementsListScreen');
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Supplement } from '../types';
import { theme } from '../theme';
import { Card } from '../components/common/Card';
import { Tag } from '../components/common/Tag';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getLocalizedContent } from '../utils/i18nHelpers';
import { useRtlScrollFix } from '../hooks/useRtlScrollFix';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { getAllLocalSupplements } from '../services/localContentFallback';
import { getBookmarks, subscribeBookmarks } from '../services/bookmarkService';

export const SupplementsListScreen = () => {
    useScreenAnalytics('SupplementsListScreen');
    const { t, i18n } = useTranslation();
    const [supplements, setSupplements] = useState<Supplement[]>([]);
    // W5 #4: keep the safety/category/favoris filter row reachable under RTL (ar/tn) on web.
    const chipScrollRef = useRtlScrollFix();
    const [searchQuery, setSearchQuery] = useState('');
    // task 10c: null = "All". Constrained to the pregnancy_safety union.
    const [selectedSafety, setSelectedSafety] = useState<Supplement['pregnancy_safety'] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    // task 10b — "Favoris" filter chip: when active, show only bookmarked items.
    const [favoritesActive, setFavoritesActive] = useState(false);
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
    const SAFETY_CONFIG = {
        ok: { icon: '✓', label: t('common.safetyOk'), color: theme.colors.green800, bgColor: theme.colors.surfaceGreenTint },
        a_surveiller: { icon: '⚠', label: t('common.safetyMonitor'), color: theme.colors.deepOrange900, bgColor: theme.colors.surfaceOrangeTint },
        deconseille: { icon: '✗', label: t('common.safetyNotRecommended'), color: theme.colors.red800, bgColor: theme.colors.surfaceRose },
    };

    useEffect(() => {
        let isMounted = true;
        const fetchSupplements = async () => {
            setLoading(true);
            setError(false);
            try {
                const snapshot = await getDocs(collection(db, 'supplements'));
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
        { value: 'ok', label: t('common.supplementSafety.safe'), color: theme.colors.success, fill: theme.colors.green800 },
        { value: 'a_surveiller', label: t('common.supplementSafety.caution'), color: theme.colors.warning, fill: theme.colors.deepOrange900 },
        { value: 'deconseille', label: t('common.supplementSafety.avoid'), color: theme.colors.error, fill: theme.colors.red800 },
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
            if (selectedSafety && supplement.pregnancy_safety !== selectedSafety) {
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
        // W5 #1 (PATIENT-SAFETY): normalize accents so a data token like 'à_surveiller' resolves to
        // 'a_surveiller', and FAIL SAFE to caution (⚠) for any unrecognized token — NEVER to 'ok'/green.
        // The old `|| SAFETY_CONFIG.ok` silently rendered mislabeled supplements (incl. Vitamine A,
        // teratogenic) as ✓ Safe. Defaulting an unknown safety to "à surveiller" is the conservative
        // failure mode (over-caution, never under-caution).
        const key = (safety || '').normalize('NFD').replace(/[̀-ͯ]/g, '') as keyof typeof SAFETY_CONFIG;
        return SAFETY_CONFIG[key] || SAFETY_CONFIG.a_surveiller;
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

    return (
        <View style={styles.container}>
            <View style={styles.searchContainer}>
                <View style={styles.searchBar}>
                    <Text style={styles.searchIcon}>🔍</Text>
                    <TextInput
                        style={styles.searchInput}
                        placeholder={t('common.searchSupplement')}
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
                        style={[
                            styles.chip,
                            favoritesActive
                                ? { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }
                                : styles.chipInactive,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: favoritesActive }}
                        accessibilityLabel={t('common.favorites')}
                    >
                        <Text style={[styles.chipText, favoritesActive ? styles.chipTextActive : styles.chipTextInactive]}>
                            {`★ ${t('common.favorites')}`}
                        </Text>
                    </TouchableOpacity>
                    {(() => {
                        const allSelected = selectedSafety === null;
                        return (
                            <TouchableOpacity
                                onPress={() => setSelectedSafety(null)}
                                activeOpacity={0.7}
                                style={[
                                    styles.chip,
                                    allSelected
                                        ? { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }
                                        : styles.chipInactive,
                                ]}
                                accessibilityRole="button"
                                accessibilityState={{ selected: allSelected }}
                                accessibilityLabel={t('categories.all', { defaultValue: 'Tout' })}
                            >
                                <Text style={[styles.chipText, allSelected ? styles.chipTextActive : styles.chipTextInactive]}>
                                    {t('categories.all', { defaultValue: 'Tout' })}
                                </Text>
                            </TouchableOpacity>
                        );
                    })()}
                    {SAFETY_FILTERS.map(filter => {
                        const selected = selectedSafety === filter.value;
                        return (
                            <TouchableOpacity
                                key={filter.value}
                                onPress={() => setSelectedSafety(selected ? null : filter.value)}
                                activeOpacity={0.7}
                                style={[
                                    styles.chip,
                                    selected
                                        ? { backgroundColor: filter.fill, borderColor: filter.fill }
                                        : styles.chipInactive,
                                ]}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                accessibilityLabel={filter.label}
                            >
                                <Text style={[styles.chipText, selected ? styles.chipTextActive : styles.chipTextInactive]}>
                                    {filter.label}
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
                        <Text style={styles.emptyEmoji}>🤷‍♀️</Text>
                        <Text style={styles.emptyText}>{t('common.noSupplementFound', { query: searchQuery })}</Text>
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
        width: 70,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: theme.spacing.s,
    },
    safetyIcon: {
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    safetyLabel: {
        fontSize: 10,
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
});
