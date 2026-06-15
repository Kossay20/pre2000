import { createLogger } from '../utils/logger';
const log = createLogger('SupplementsListScreen');
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Supplement } from '../types';
import { theme } from '../theme';
import { Card } from '../components/common/Card';
import { Tag } from '../components/common/Tag';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getLocalizedContent } from '../utils/i18nHelpers';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

export const SupplementsListScreen = () => {
    useScreenAnalytics('SupplementsListScreen');
    const { t, i18n } = useTranslation();
    const [supplements, setSupplements] = useState<Supplement[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const navigation = useNavigation();

    // ── Inside component so t() is never stale (language change safe) ──
    const SAFETY_CONFIG = {
        ok: { icon: '✓', label: t('common.safetyOk'), color: theme.colors.success, bgColor: theme.colors.surfaceGreenTint },
        a_surveiller: { icon: '⚠', label: t('common.safetyMonitor'), color: theme.colors.warning, bgColor: theme.colors.surfaceOrangeTint },
        deconseille: { icon: '✗', label: t('common.safetyNotRecommended'), color: theme.colors.error, bgColor: theme.colors.surfaceRose },
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
                if (isMounted) setError(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchSupplements();
        return () => { isMounted = false; };
    }, [refreshKey]);

    const filteredSupplements = React.useMemo(() => {
        if (!searchQuery.trim()) return supplements;

        const query = searchQuery.toLowerCase().trim();
        return supplements.filter(supplement => {
            const name = (getLocalizedContent(supplement, 'name', i18n.language) || '').toLowerCase();
            const description = (getLocalizedContent(supplement, 'short_description', i18n.language) || '').toLowerCase();
            const category = (supplement.category || '').toLowerCase();

            return name.includes(query) || description.includes(query) || category.includes(query);
        });
    }, [supplements, searchQuery, i18n.language]);

    const getSafetyConfig = (safety: string) => {
        return SAFETY_CONFIG[safety as keyof typeof SAFETY_CONFIG] || SAFETY_CONFIG.ok;
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
                            <Text style={theme.typography.caption}>{item.category}</Text>
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
