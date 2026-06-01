import { createLogger } from '../utils/logger';
const log = createLogger('SupplementDetailScreen');
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Supplement } from '../types';
import { theme } from '../theme';
import { Tag } from '../components/common/Tag';
import { Card } from '../components/common/Card';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getLocalizedContent } from '../utils/i18nHelpers';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';

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
                    setError(t('common.supplementNotFound'));
                }
            } catch (err) {
                log.error('Error fetching supplement details:', err);
                if (isMounted) setError(t('common.errorLoadingData'));
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchSupplement();
        return () => { isMounted = false; };
    }, [supplementId, refreshKey]);

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
                    style={{ marginTop: 16, padding: 14, backgroundColor: theme.colors.primary, borderRadius: theme.borderRadius.m }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.retry')}
                >
                    <Text style={{ color: theme.colors.white, fontWeight: '600' }}>{t('common.retry')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 12 }}>
                    <Text style={{ color: theme.colors.primary }}>{t('common.back')}</Text>
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

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            {/* Back button + RTL aware */}
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

            <View style={styles.header}>
                <Tag label={getSafetyLabel(supplement.pregnancy_safety)} color={getSafetyColor(supplement.pregnancy_safety)} />
                <Text style={[theme.typography.h1, styles.title] as any}>
                    {getLocalizedContent(supplement, 'name', i18n.language)}
                </Text>
                <Text style={theme.typography.caption}>{getLocalizedContent(supplement, 'category', i18n.language) || supplement.category}</Text>
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
    backButton: {
        marginBottom: theme.spacing.m,
        alignSelf: 'flex-start',
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
    source: {
        textAlign: 'center',
        marginTop: theme.spacing.m,
        fontStyle: 'italic',
    },
});
