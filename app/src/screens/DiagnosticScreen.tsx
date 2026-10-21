import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { collection, getCountFromServer, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../config/firebase';
import { theme } from '../theme';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { analyticsService } from '../services/analyticsService'; // U-FIX-14

interface CollectionStats {
    name: string;
    count: number;
    status: 'ok' | 'warning' | 'error';
    details?: string;
}

export const DiagnosticScreen = () => {
    useScreenAnalytics('DiagnosticScreen');
    const { t } = useTranslation();
    const [stats, setStats] = useState<CollectionStats[]>([]);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    // U-FIX-14: surface analytics health (Firebase Web Analytics is a no-op on RN
    // unless we migrate to @react-native-firebase/analytics — see analyticsService JSDoc).
    const [analyticsOperational, setAnalyticsOperational] = useState<boolean | null>(null);

    useEffect(() => {
        analyticsService.isOperational().then(setAnalyticsOperational);
    }, []);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const runDiagnostic = async () => {
        setLoading(true);
        setStats([]);
        setLogs([]);
        addLog('Starting diagnostic...');

        const collections = [
            { name: 'weeks', expected: 40 },
            { name: 'articles', expected: 20 },
            { name: 'articlesAntigravity', expected: 20 }, // P2.2: was missing — used by ArticlesListScreen + contentService
            { name: 'supplements', expected: 15 },
            { name: 'calendarTemplates', expected: 15 }, // Range 15-25
            { name: 'redFlags', expected: 15 },
            { name: 'chatbotSuggestionsAG', expected: 20 }, // P2.2 FIX: was 'chatbotSuggestions' (no rule, denied) — corrected to match firestore.rules
            { name: 'babyMessages', expected: 30 }, // Critical for Home Screen
            { name: 'tips', expected: 30 }, // Critical for Home Screen
        ];

        const newStats: CollectionStats[] = [];

        for (const col of collections) {
            try {
                addLog(`Checking ${col.name}...`);
                const collRef = collection(db, col.name);
                const snapshot = await getCountFromServer(collRef);
                const count = snapshot.data().count;

                let status: 'ok' | 'warning' | 'error' = 'ok';
                let details = '';

                if (count === 0) {
                    status = 'error';
                    details = 'Collection is empty!';
                } else if (count < col.expected) {
                    status = 'warning';
                    details = `Expected ~${col.expected}, found ${count}`;
                }

                // Deep check for articles
                if (col.name === 'articles' && count > 0) {
                    addLog('Verifying article content...');
                    const q = query(collRef, limit(5));
                    const docs = await getDocs(q);
                    let emptyContentCount = 0;
                    docs.forEach(d => {
                        const data = d.data();
                        if (!data.content_markdown_fr || data.content_markdown_fr.length < 50) {
                            emptyContentCount++;
                            addLog(`⚠️ Article ${d.id} has empty/short content`);
                        }
                    });

                    if (emptyContentCount > 0) {
                        status = 'warning';
                        details += ` | ${emptyContentCount}/5 checked articles have empty content`;
                    } else {
                        details += ' | Content check passed';
                    }
                }

                newStats.push({ name: col.name, count, status, details });
                addLog(`✅ ${col.name}: ${count} docs`);

            } catch (error: any) {
                addLog(`❌ Error checking ${col.name}: ${error.message}`);
                newStats.push({ name: col.name, count: -1, status: 'error', details: error.message });
            }
        }

        setStats(newStats);
        setLoading(false);
        addLog('Diagnostic complete.');
    };

    useEffect(() => {
        runDiagnostic();
    }, []);

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <Text style={theme.typography.h1}>{t('diagnostic.title')}</Text>
                <TouchableOpacity
                    style={styles.button}
                    onPress={runDiagnostic}
                    disabled={loading}
                    accessibilityRole="button"
                    accessibilityLabel={t('a11y.rerunDiagnostic')}
                    accessibilityState={{ disabled: loading, busy: loading }}
                >
                    <Text style={styles.buttonText}>{loading ? t('diagnostic.checking') : t('diagnostic.rerun')}</Text>
                </TouchableOpacity>
            </View>

            {/* U-FIX-14: Analytics operational state (no-op on RN if Firebase Web SDK doesn't load) */}
            <View style={[
                styles.statCard,
                analyticsOperational === null
                    ? styles.status_warning
                    : analyticsOperational
                        ? styles.status_ok
                        : styles.status_error,
            ]}>
                <View style={styles.statHeader}>
                    <Text style={styles.statName}>analytics (firebase/analytics web)</Text>
                    <Text style={styles.statCount}>
                        {analyticsOperational === null ? '…' : analyticsOperational ? 'ok' : 'no-op'}
                    </Text>
                </View>
                {analyticsOperational === false && (
                    <Text style={styles.statDetails}>
                        Web SDK unsupported on this runtime. All telemetry events are dropped.
                        Migrate to @react-native-firebase/analytics for real metrics.
                    </Text>
                )}
            </View>

            <View style={styles.statsContainer}>
                {stats.map((stat) => (
                    <View key={stat.name} style={[styles.statCard, styles[`status_${stat.status}`]]}>
                        <View style={styles.statHeader}>
                            <Text style={styles.statName}>{stat.name}</Text>
                            <Text style={styles.statCount}>{stat.count === -1 ? 'Err' : stat.count}</Text>
                        </View>
                        {stat.details ? <Text style={styles.statDetails}>{stat.details}</Text> : null}
                    </View>
                ))}
            </View>

            <View style={styles.logsContainer}>
                <Text style={theme.typography.h3}>{t('diagnostic.logs')}</Text>
                {logs.map((log, i) => (
                    <Text key={i} style={styles.logText}>{log}</Text>
                ))}
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        padding: theme.spacing.m,
    },
    header: {
        marginBottom: theme.spacing.l,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    button: {
        backgroundColor: theme.colors.accent,
        padding: theme.spacing.s,
        borderRadius: theme.borderRadius.s,
    },
    buttonText: {
        color: theme.colors.white,
        fontWeight: 'bold',
    },
    statsContainer: {
        gap: theme.spacing.m,
        marginBottom: theme.spacing.l,
    },
    statCard: {
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        borderWidth: 1,
    },
    status_ok: {
        backgroundColor: theme.colors.surfaceGreenTint,
        borderColor: theme.colors.success,
    },
    status_warning: {
        backgroundColor: theme.colors.surfaceOrangeTint,
        borderColor: theme.colors.warning,
    },
    status_error: {
        backgroundColor: theme.colors.surfaceRose,
        borderColor: theme.colors.error,
    },
    statHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    statCount: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme.colors.text,
    },
    statDetails: {
        marginTop: theme.spacing.xs,
        fontSize: 14,
        color: theme.colors.textLight,
    },
    logsContainer: {
        backgroundColor: theme.colors.blueGrey900,
        padding: theme.spacing.m,
        borderRadius: theme.borderRadius.m,
        marginBottom: theme.spacing.xl,
    },
    logText: {
        color: theme.colors.blueGrey100,
        fontFamily: 'monospace',
        fontSize: 12,
        marginBottom: 4,
    },
});
