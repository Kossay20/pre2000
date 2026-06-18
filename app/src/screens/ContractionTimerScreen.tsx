import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Linking,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { theme } from '../theme';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { useAuth } from '../context/AuthContext';
import { resolveEmergencyNumber } from '../utils/clinicalChecks';
import { confirmAction } from '../utils/uiUtils';
import {
    ContractionTimerState,
    buildShareSummary,
    clearAll,
    computeStats,
    formatDuration,
    loadState,
    startContraction,
    stopContraction,
} from '../services/contractionTimerService';

export const ContractionTimerScreen: React.FC = () => {
    useScreenAnalytics('ContractionTimerScreen');
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    const emergencyNumber = resolveEmergencyNumber(user?.country, i18n.language);
    const [state, setState] = useState<ContractionTimerState>({ activeStartedAt: null, history: [] });
    const [now, setNow] = useState<number>(Date.now());
    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useFocusEffect(
        useCallback(() => {
            let alive = true;
            loadState().then((s) => {
                if (alive) setState(s);
            });
            return () => {
                alive = false;
            };
        }, []),
    );

    useEffect(() => {
        if (state.activeStartedAt) {
            tickRef.current = setInterval(() => setNow(Date.now()), 1000);
            return () => {
                if (tickRef.current) clearInterval(tickRef.current);
                tickRef.current = null;
            };
        }
        return undefined;
    }, [state.activeStartedAt]);

    const onStart = useCallback(async () => {
        const next = await startContraction();
        setState(next);
    }, []);

    const onStop = useCallback(async () => {
        const next = await stopContraction();
        setState(next);
    }, []);

    const onClear = useCallback(() => {
        confirmAction(
            t('cycle8.contractionTimer.clearConfirmTitle'),
            t('cycle8.contractionTimer.clearConfirmMsg'),
            async () => {
                const next = await clearAll();
                setState(next);
            },
            undefined,
            t('common.cancel', { defaultValue: 'Annuler' }),
            t('cycle8.contractionTimer.clear'),
        );
    }, [t]);

    const stats = computeStats(state.history);

    const onShare = useCallback(async () => {
        if (state.history.length === 0) return;
        const summary = buildShareSummary(stats, state.history, {
            contractionsLabel: t('cycle8.contractionTimer.count'),
            avgDurationLabel: t('cycle8.contractionTimer.avgDuration'),
            avgFrequencyLabel: t('cycle8.contractionTimer.avgFrequency'),
        });
        try {
            await Share.share({ message: summary });
        } catch {
            // user cancelled or platform issue
        }
    }, [state.history, stats, t]);

    const onCallMaternity = useCallback(() => {
        if (!emergencyNumber) return;
        Linking.openURL(`tel:${emergencyNumber}`).catch(() => {});
    }, [emergencyNumber]);

    const elapsedActive = state.activeStartedAt ? now - state.activeStartedAt : 0;

    return (
        <SafeAreaView style={styles.safe} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>{t('cycle8.contractionTimer.title')}</Text>
                <Text style={styles.subtitle}>{t('cycle8.contractionTimer.subtitle')}</Text>

                <Card style={styles.guideCard}>
                    <Text style={styles.guideTitle}>🚨 {t('cycle8.contractionTimer.guidanceTitle')}</Text>
                    <Text style={styles.guideText}>{t('cycle8.contractionTimer.guidanceText')}</Text>
                </Card>

                <View style={styles.controlBlock}>
                    {!state.activeStartedAt ? (
                        <Button
                            title={t('cycle8.contractionTimer.startContraction')}
                            onPress={onStart}
                            variant="primary"
                        />
                    ) : (
                        <View style={styles.activeWrap}>
                            <Text style={styles.activeLabel}>{t('cycle8.contractionTimer.active')}</Text>
                            <Text
                                style={styles.activeTimer}
                                accessibilityLiveRegion="polite"
                                accessibilityLabel={`${t('cycle8.contractionTimer.active')} ${formatDuration(elapsedActive)}`}
                            >
                                {formatDuration(elapsedActive)}
                            </Text>
                            <Button
                                title={t('cycle8.contractionTimer.stopContraction')}
                                onPress={onStop}
                                variant="primary"
                            />
                        </View>
                    )}
                </View>

                {state.history.length === 0 ? (
                    <EmptyState
                        icon="⏱️"
                        title={t('cycle8.contractionTimer.noContractionsYet')}
                        subtitle={t('cycle8.contractionTimer.noContractionsSub')}
                        compact
                    />
                ) : (
                    <>
                        <View style={styles.statsGrid}>
                            <StatBox label={t('cycle8.contractionTimer.count')} value={String(stats.count)} />
                            <StatBox
                                label={t('cycle8.contractionTimer.avgDuration')}
                                value={formatDuration(stats.avgDurationMs)}
                            />
                            <StatBox
                                label={t('cycle8.contractionTimer.avgFrequency')}
                                value={formatDuration(stats.avgFrequencyMs)}
                            />
                            <StatBox
                                label={t('cycle8.contractionTimer.lastFrequency')}
                                value={formatDuration(stats.lastFrequencyMs)}
                            />
                        </View>

                        <Text style={styles.sectionTitle}>{t('cycle8.contractionTimer.history')}</Text>
                        {state.history.slice(0, 20).map((c) => (
                            <View key={c.id} style={styles.historyRow}>
                                <Text style={styles.historyDate}>
                                    {new Date(c.startedAt).toLocaleTimeString()}
                                </Text>
                                <Text style={styles.historyDur}>
                                    {formatDuration(c.endedAt - c.startedAt)}
                                </Text>
                            </View>
                        ))}

                        <View style={styles.actionRow}>
                            <Button
                                title={t('cycle8.contractionTimer.share')}
                                onPress={onShare}
                                variant="secondary"
                            />
                            <View style={{ width: theme.spacing.m }} />
                            <Button
                                title={t('cycle8.contractionTimer.clear')}
                                onPress={onClear}
                                variant="secondary"
                            />
                        </View>
                    </>
                )}

                {emergencyNumber && (
                    <TouchableOpacity
                        style={styles.callRow}
                        onPress={onCallMaternity}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('cycle8.contractionTimer.callMaternity')} ${emergencyNumber}`}
                    >
                        <Text style={styles.callText}>
                            📞 {t('cycle8.contractionTimer.callMaternity')} ({emergencyNumber})
                        </Text>
                    </TouchableOpacity>
                )}

                <Text style={styles.disclaimer}>{t('cycle8.contractionTimer.disclaimer')}</Text>
            </ScrollView>
        </SafeAreaView>
    );
};

const StatBox: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <View style={styles.statBox}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
    </View>
);

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.l },
    title: { ...theme.typography.h2, color: theme.colors.text, marginBottom: theme.spacing.xs },
    subtitle: { ...theme.typography.body, color: theme.colors.textLight, marginBottom: theme.spacing.l },
    guideCard: { padding: theme.spacing.m, marginBottom: theme.spacing.l, backgroundColor: theme.colors.surface },
    guideTitle: { ...theme.typography.h3, marginBottom: theme.spacing.xs, color: theme.colors.text },
    guideText: { ...theme.typography.body, color: theme.colors.textLight, lineHeight: 20 },
    controlBlock: { alignItems: 'center', marginTop: theme.spacing.l, marginBottom: theme.spacing.xl },
    activeWrap: { alignItems: 'center' },
    activeLabel: { ...theme.typography.body, color: theme.colors.accent, marginBottom: theme.spacing.s },
    activeTimer: { fontSize: 56, fontWeight: '700', color: theme.colors.accent, marginBottom: theme.spacing.l },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: theme.spacing.s,
        marginBottom: theme.spacing.l,
    },
    statBox: {
        flexBasis: '47%',
        flexGrow: 1,
        padding: theme.spacing.m,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.borderRadius.m,
        alignItems: 'center',
    },
    statValue: { ...theme.typography.h2, color: theme.colors.accent, fontWeight: '700' },
    statLabel: { ...theme.typography.caption, color: theme.colors.textLight, textAlign: 'center', marginTop: theme.spacing.xs },
    sectionTitle: { ...theme.typography.h3, color: theme.colors.text, marginBottom: theme.spacing.s },
    historyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.s,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
    },
    historyDate: { ...theme.typography.caption, color: theme.colors.textLight },
    historyDur: { ...theme.typography.caption, color: theme.colors.text, fontWeight: '600' },
    actionRow: { flexDirection: 'row', justifyContent: 'center', marginTop: theme.spacing.l },
    callRow: { padding: theme.spacing.m, alignItems: 'center', marginTop: theme.spacing.xl },
    callText: { ...theme.typography.body, color: theme.colors.accent, fontWeight: '600' },
    disclaimer: {
        ...theme.typography.caption,
        color: theme.colors.textLight,
        fontStyle: 'italic',
        marginTop: theme.spacing.l,
        textAlign: 'center',
    },
});
