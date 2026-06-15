import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ScrollView,
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
import { confirmAction } from '../utils/uiUtils';
import {
    KickCounterState,
    cancelSession,
    countInLastHour,
    countToday,
    endSession,
    loadState,
    recordKick,
    startSession,
} from '../services/kickCounterService';

const formatElapsed = (ms: number): string => {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

export const KickCounterScreen: React.FC = () => {
    useScreenAnalytics('KickCounterScreen');
    const { t } = useTranslation();
    const [state, setState] = useState<KickCounterState>({ activeSession: null, history: [] });
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
        if (state.activeSession) {
            tickRef.current = setInterval(() => setNow(Date.now()), 1000);
            return () => {
                if (tickRef.current) clearInterval(tickRef.current);
                tickRef.current = null;
            };
        }
        return undefined;
    }, [state.activeSession]);

    const onTap = useCallback(async () => {
        if (!state.activeSession) {
            const session = await startSession();
            const updated = await recordKick();
            setState((prev) => ({ ...prev, activeSession: updated ?? session }));
            return;
        }
        const updated = await recordKick();
        setState((prev) => ({ ...prev, activeSession: updated }));
    }, [state.activeSession]);

    const onEnd = useCallback(async () => {
        const next = await endSession();
        setState(next);
    }, []);

    const onCancel = useCallback(() => {
        confirmAction(
            t('cycle8.kickCounter.cancelSession'),
            '',
            async () => {
                const next = await cancelSession();
                setState(next);
            },
            undefined,
            t('common.cancel', { defaultValue: 'Annuler' }),
            t('cycle8.kickCounter.cancelSession'),
        );
    }, [t]);

    const lastHourCount = state.activeSession ? countInLastHour(state.activeSession) : 0;
    const totalToday = countToday(state.history, state.activeSession);
    const elapsed = state.activeSession ? now - state.activeSession.startedAt : 0;

    return (
        <SafeAreaView style={styles.safe} edges={['bottom']}>
            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.title}>{t('cycle8.kickCounter.title')}</Text>
                <Text style={styles.subtitle}>{t('cycle8.kickCounter.subtitle')}</Text>

                <Card style={styles.guideCard}>
                    <Text style={styles.guideTitle}>💡 {t('cycle8.kickCounter.guidanceTitle')}</Text>
                    <Text style={styles.guideText}>{t('cycle8.kickCounter.guidanceText')}</Text>
                </Card>

                {!state.activeSession ? (
                    <View style={styles.emptyWrap}>
                        <EmptyState
                            icon="👶"
                            title={t('cycle8.kickCounter.noSessionYet')}
                            subtitle={t('cycle8.kickCounter.noSessionSub')}
                            action={
                                <Button
                                    title={t('cycle8.kickCounter.startSession')}
                                    onPress={onTap}
                                />
                            }
                        />
                    </View>
                ) : (
                    <View style={styles.activeWrap}>
                        <Text
                            style={styles.bigCount}
                            accessibilityLiveRegion="polite"
                            accessibilityLabel={`${lastHourCount} ${t('cycle8.kickCounter.kicksLastHour')}`}
                        >
                            {lastHourCount}
                        </Text>
                        <Text style={styles.bigCountLabel}>{t('cycle8.kickCounter.kicksLastHour')}</Text>
                        <Text
                            style={styles.elapsed}
                            accessibilityLiveRegion="polite"
                        >
                            {t('cycle8.kickCounter.elapsed')} : {formatElapsed(elapsed)}
                        </Text>
                        <TouchableOpacity
                            style={styles.tapButton}
                            onPress={onTap}
                            accessibilityRole="button"
                            accessibilityLabel={t('cycle8.kickCounter.tapToCount')}
                        >
                            <Text style={styles.tapButtonEmoji}>👶</Text>
                            <Text style={styles.tapButtonText}>{t('cycle8.kickCounter.tapToCount')}</Text>
                        </TouchableOpacity>
                        <View style={styles.actionRow}>
                            <Button
                                title={t('cycle8.kickCounter.endSession')}
                                onPress={onEnd}
                                variant="primary"
                            />
                            <View style={{ width: theme.spacing.m }} />
                            <Button
                                title={t('cycle8.kickCounter.cancelSession')}
                                onPress={onCancel}
                                variant="secondary"
                            />
                        </View>
                    </View>
                )}

                <Card style={styles.todayCard}>
                    <Text style={styles.todayLabel}>{t('cycle8.kickCounter.kicksToday')}</Text>
                    <Text style={styles.todayValue}>{totalToday}</Text>
                </Card>

                {state.history.length > 0 && (
                    <View style={styles.historyWrap}>
                        <Text style={styles.sectionTitle}>{t('cycle8.kickCounter.history')}</Text>
                        {state.history.slice(0, 10).map((session) => (
                            <View key={session.id} style={styles.historyRow}>
                                <Text style={styles.historyDate}>
                                    {new Date(session.startedAt).toLocaleString()}
                                </Text>
                                <Text style={styles.historyCount}>
                                    {session.kicks.length} {t('cycle8.kickCounter.kicks')}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                <Text style={styles.disclaimer}>{t('cycle8.kickCounter.disclaimer')}</Text>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.background },
    content: { padding: theme.spacing.l },
    title: { ...theme.typography.h2, color: theme.colors.text, marginBottom: theme.spacing.xs },
    subtitle: { ...theme.typography.body, color: theme.colors.textLight, marginBottom: theme.spacing.l },
    guideCard: { padding: theme.spacing.m, marginBottom: theme.spacing.l, backgroundColor: theme.colors.surface },
    guideTitle: { ...theme.typography.h3, marginBottom: theme.spacing.xs, color: theme.colors.text },
    guideText: { ...theme.typography.body, color: theme.colors.textLight, lineHeight: 20 },
    emptyWrap: { minHeight: 220, justifyContent: 'center' },
    activeWrap: { alignItems: 'center', paddingVertical: theme.spacing.l },
    bigCount: { fontSize: 72, fontWeight: '700', color: theme.colors.accent },
    bigCountLabel: { ...theme.typography.body, color: theme.colors.textLight, marginBottom: theme.spacing.s },
    elapsed: { ...theme.typography.caption, color: theme.colors.textLight, marginBottom: theme.spacing.l },
    tapButton: {
        backgroundColor: theme.colors.accent,
        paddingVertical: theme.spacing.l,
        paddingHorizontal: theme.spacing.xl,
        borderRadius: 100,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: theme.spacing.l,
        minWidth: 200,
    },
    tapButtonEmoji: { fontSize: 56, marginBottom: theme.spacing.xs },
    tapButtonText: { ...theme.typography.h3, color: theme.colors.background, fontWeight: '700' },
    actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
    todayCard: { padding: theme.spacing.m, marginVertical: theme.spacing.l, alignItems: 'center', backgroundColor: theme.colors.surface },
    todayLabel: { ...theme.typography.caption, color: theme.colors.textLight, marginBottom: theme.spacing.xs },
    todayValue: { fontSize: 36, fontWeight: '700', color: theme.colors.text },
    historyWrap: { marginTop: theme.spacing.m },
    sectionTitle: { ...theme.typography.h3, color: theme.colors.text, marginBottom: theme.spacing.s },
    historyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.s,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.border,
    },
    historyDate: { ...theme.typography.caption, color: theme.colors.textLight },
    historyCount: { ...theme.typography.caption, color: theme.colors.text, fontWeight: '600' },
    disclaimer: {
        ...theme.typography.caption,
        color: theme.colors.textLight,
        fontStyle: 'italic',
        marginTop: theme.spacing.l,
        textAlign: 'center',
    },
});
