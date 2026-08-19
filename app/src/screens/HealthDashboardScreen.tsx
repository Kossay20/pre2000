import { createLogger } from '../utils/logger';
const log = createLogger('HealthDashboardScreen');
import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Linking,
} from 'react-native';
import { showAlert } from '../utils/alert';
import { LineChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { usePregnancy } from '../context/PregnancyContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next'; // Import useTranslation
import {
    getHealthStats,
    getMergedWeightHistory, // P3.7: unified weight source (merge healthMetrics + weight_entries)
    getBloodPressureHistory,
    saveWeightEntry,
    saveBloodPressureEntry,
    saveGlucoseEntry,
    getGlucoseHistory,
    saveDailySymptoms,
    getDailySymptoms,
    type GlucoseEntry,
    type SymptomKey,
} from '../services/healthService';
import { HealthStats, HealthMetric } from '../types';
import { theme } from '../theme';
import { hexToRgba } from '../utils/styleUtils';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { validateHealthEntry } from '../utils/validation'; // U-FIX-5
import { Skeleton } from '../components/common/Skeleton'; // D4
import {
    checkGlucose,
    checkBloodPressure,
    checkWeightChange,
    resolveEmergencyNumber,
    type ClinicalAlert,
} from '../utils/clinicalChecks'; // SAFETY-CRITICAL: clinical alerts on dangerous values
import { HealthWeightModal } from '../components/health/HealthWeightModal';
import { HealthBPModal } from '../components/health/HealthBPModal';
import { HealthGlucoseModal } from '../components/health/HealthGlucoseModal';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { styles } from './HealthDashboardScreen.styles';
import { getContentWidth } from '../utils/layout';

const screenWidth = getContentWidth();

export const HealthDashboardScreen = () => {
    useScreenAnalytics('HealthDashboardScreen');
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    const { pregnancyInfo } = usePregnancy();
    const navigation = useNavigation();

    const [stats, setStats] = useState<HealthStats | null>(null);
    const [weightHistory, setWeightHistory] = useState<HealthMetric[]>([]);
    const [bpHistory, setBpHistory] = useState<HealthMetric[]>([]);
    const [glucoseHistory, setGlucoseHistory] = useState<GlucoseEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modals
    const [showWeightModal, setShowWeightModal] = useState(false);
    const [showBPModal, setShowBPModal] = useState(false);
    const [showGlucoseModal, setShowGlucoseModal] = useState(false);
    const [newWeight, setNewWeight] = useState('');
    const [newBPSystolic, setNewBPSystolic] = useState('');
    const [newBPDiastolic, setNewBPDiastolic] = useState('');
    const [newGlucose, setNewGlucose] = useState('');
    const [symptoms, setSymptoms] = useState<string[]>([]);

    // Common symptoms chips for quick-add
    const SYMPTOM_CHIPS = [
        { key: 'nausea', label: t('dashboard.symptomNausea'), emoji: '🤢' },
        { key: 'fatigue', label: t('dashboard.symptomFatigue'), emoji: '😴' },
        { key: 'backPain', label: t('dashboard.symptomBackPain'), emoji: '🧘' },
        { key: 'headache', label: t('dashboard.symptomHeadache'), emoji: '🤕' },
        { key: 'swelling', label: t('dashboard.symptomSwelling'), emoji: '👣' },
        { key: 'insomnia', label: t('dashboard.symptomInsomnia'), emoji: '🌙' },
    ];

    // GUARD: Guest users cannot use Firestore health tracking
    const isGuest = (user as any)?.isGuest === true;

    useEffect(() => {
        if (isGuest) {
            setLoading(false);
            return;
        }
        let isMounted = true;
        const safeLoadData = async () => {
            if (!user?.uid || !pregnancyInfo?.week || isGuest) {
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const [healthStats, weights, bps, glucoses, todaySymptoms] = await Promise.all([
                    // F-HS-04: pass pre-pregnancy weight so weight-gain uses the clinical
                    // baseline (matches WeightTracker) instead of the first logged entry.
                    getHealthStats(user.uid, pregnancyInfo.week, user.prePregnancyWeight),
                    // P3.7 FIX: use merged source — was reading healthMetrics only,
                    // weight_entries (WeightTrackerScreen inputs) appeared in stats but not in graph.
                    getMergedWeightHistory(user.uid),
                    getBloodPressureHistory(user.uid),
                    getGlucoseHistory(user.uid),
                    getDailySymptoms(user.uid), // ── now parallel (was sequential)
                ]);
                if (!isMounted) return;
                setStats(healthStats);
                setWeightHistory(weights);
                setBpHistory(bps);
                setGlucoseHistory(glucoses);
                if (todaySymptoms?.symptoms) {
                    setSymptoms(todaySymptoms.symptoms as string[]);
                }
            } catch (err) {
                if (!isMounted) return;
                log.error('[HealthDashboard] Error loading data:', err);
                setError(t('dashboard.errorLoading'));
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        safeLoadData();
        return () => { isMounted = false; };
    }, [user?.uid, pregnancyInfo?.week, isGuest]);

    // U-FIX-13: refresh on focus so deletions/edits made in WeightTracker (which writes to
    // a different collection — `weight_entries`) are reflected immediately in the dashboard.
    // Was previously stale until the user navigated away & back to a different week.
    useFocusEffect(
        useCallback(() => {
            if (user?.uid && pregnancyInfo?.week && !isGuest) {
                loadData();
            }
        }, [user?.uid, pregnancyInfo?.week, isGuest])
    );

    // P3.7 + P3.8 FIX: aligned refresh — same sources as initial load (merged weights + symptoms).
    // Was missing getDailySymptoms → after symptoms save+reload, UI was stale.
    // Was using getWeightHistory only → graph desynced from stats.
    const loadData = async () => {
        if (!user?.uid || !pregnancyInfo?.week || isGuest) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const [healthStats, weights, bps, glucoses, todaySymptoms] = await Promise.all([
                // F-HS-04: clinical pre-pregnancy baseline for weight-gain (see initial load).
                getHealthStats(user.uid, pregnancyInfo.week, user.prePregnancyWeight),
                getMergedWeightHistory(user.uid),
                getBloodPressureHistory(user.uid),
                getGlucoseHistory(user.uid),
                getDailySymptoms(user.uid),
            ]);
            setStats(healthStats);
            setWeightHistory(weights);
            setBpHistory(bps);
            setGlucoseHistory(glucoses);
            if (todaySymptoms?.symptoms) {
                setSymptoms(todaySymptoms.symptoms as string[]);
            }
        } catch (err) {
            log.error('[HealthDashboard] Error loading data:', err);
            setError(t('dashboard.errorLoading'));
        } finally {
            setLoading(false);
        }
    };

    /**
     * SAFETY-CRITICAL helper.
     *
     * Surfaces a clinical alert before persisting a value that the pure checks
     * in `clinicalChecks` flagged as risky, while preserving patient autonomy:
     * the user can always proceed ("save anyway") or cancel.
     *
     * For `critical` severity with `emergencyAction: 'call'` we add a tertiary
     * button that opens the dialer to the country's medical emergency number.
     * If we don't know the number for the user's country we silently omit the
     * button — we NEVER make up a number.
     */
    const showClinicalAlert = (clinicalAlert: ClinicalAlert, onProceed: () => void) => {
        const buttons: Array<{
            text: string;
            style?: 'default' | 'cancel' | 'destructive';
            onPress?: () => void;
        }> = [
                { text: t('dashboard.alerts.cancel'), style: 'cancel' },
            ];

        if (
            clinicalAlert.severity === 'critical' &&
            clinicalAlert.emergencyAction === 'call'
        ) {
            // H2-FIX: use locale fallback (ar/tn→190, fr→15) so an AR/TN user whose profile
            // country is empty (e.g. account created via login, not full onboarding) still gets
            // the emergency-call button — matching ContractionTimerScreen / ChatbotScreen.
            const number = resolveEmergencyNumber((user as any)?.country, i18n.language);
            if (number) {
                buttons.push({
                    text: `${t('dashboard.alerts.callEmergency')} (${number})`,
                    onPress: () => {
                        Linking.openURL(`tel:${number}`).catch(err =>
                            log.error('[HealthDashboard] Failed to open dialer:', err),
                        );
                    },
                });
            }
        }

        const isHigh =
            clinicalAlert.severity === 'severe' || clinicalAlert.severity === 'critical';
        buttons.push({
            text: t('dashboard.alerts.proceed'),
            style: isHigh ? 'destructive' : 'default',
            onPress: onProceed,
        });

        // SAFETY-CRITICAL: showAlert fires the proceed callback on web (Alert.alert is a
        // no-op there) so "save anyway" is never silently lost.
        showAlert(t(clinicalAlert.titleKey), t(clinicalAlert.messageKey), buttons);
    };

    const handleAddWeight = async () => {
        if (!user?.uid || !pregnancyInfo?.week || !newWeight) return;
        // U-FIX-5: validate weight bounds (0 < value <= 300) before persisting
        const weightValue = parseFloat(newWeight.replace(',', '.'));
        const validation = validateHealthEntry({ type: 'weight', value: weightValue });
        if (!validation.valid) {
            showAlert(t('common.error'), t(validation.error || 'common.error'));
            return;
        }

        const userId = user.uid;
        const week = pregnancyInfo.week;
        const persist = async () => {
            try {
                await saveWeightEntry(userId, weightValue, new Date(), week);
                setNewWeight('');
                setShowWeightModal(false);
                loadData();
            } catch (err) {
                log.error('[HealthDashboard] Error saving weight:', err);
                showAlert(t('common.error'), t('dashboard.errorSaving'));
            }
        };

        // SAFETY: detect rapid loss / large variation against most recent entry.
        // weightHistory is sorted ascending by date → latest is the last item.
        const lastWeight =
            weightHistory.length > 0
                ? (weightHistory[weightHistory.length - 1].value as number)
                : undefined;
        const alert = checkWeightChange(weightValue, lastWeight);
        if (alert) {
            showClinicalAlert(alert, persist);
            return;
        }
        await persist();
    };

    const handleAddBP = async () => {
        if (!user?.uid || !pregnancyInfo?.week || !newBPSystolic || !newBPDiastolic) return;
        // U-FIX-5: validate BP ranges + sys >= dia before persisting
        const sys = parseInt(newBPSystolic, 10);
        const dia = parseInt(newBPDiastolic, 10);
        const validation = validateHealthEntry({ type: 'blood_pressure', systolic: sys, diastolic: dia });
        if (!validation.valid) {
            showAlert(t('common.error'), t(validation.error || 'common.error'));
            return;
        }

        const userId = user.uid;
        const week = pregnancyInfo.week;
        const persist = async () => {
            try {
                await saveBloodPressureEntry(userId, sys, dia, new Date(), week);
                setNewBPSystolic('');
                setNewBPDiastolic('');
                setShowBPModal(false);
                loadData();
            } catch (err) {
                log.error('[HealthDashboard] Error saving BP:', err);
                showAlert(t('common.error'), t('dashboard.errorSaving'));
            }
        };

        // SAFETY: severe hypertension is a pre-eclampsia red flag.
        const alert = checkBloodPressure(sys, dia);
        if (alert) {
            showClinicalAlert(alert, persist);
            return;
        }
        await persist();
    };

    /**
     * Save glucose entry to Firestore and refresh history.
     * SAFETY: warns on hypo/hyperglycemia before persisting (patient autonomy
     * preserved — they can always save anyway).
     */
    const handleAddGlucose = async () => {
        if (!user?.uid || !pregnancyInfo?.week || !newGlucose) return;
        const value = parseFloat(newGlucose.replace(',', '.'));
        if (isNaN(value) || value <= 0 || value > 30) {
            showAlert(t('common.error'), t('dashboard.glucoseTarget'));
            return;
        }

        const userId = user.uid;
        const week = pregnancyInfo.week;
        const persist = async () => {
            try {
                await saveGlucoseEntry(userId, {
                    value,
                    meal_context: 'fasting',
                    date: new Date().toISOString(),
                    week,
                });
                setNewGlucose('');
                setShowGlucoseModal(false); // ── fixed: was double toggle (true+false)
                loadData();
            } catch (err) {
                log.error('[HealthDashboard] Error saving glucose:', err);
                showAlert(t('common.error'), t('dashboard.errorSaving'));
            }
        };

        const alert = checkGlucose(value);
        if (alert) {
            showClinicalAlert(alert, persist);
            return;
        }
        await persist();
    };

    /**
     * Toggle a symptom chip and auto-save to Firestore.
     * PERFECT-FIX-1: optimistic update with rollback on save failure
     * to prevent UI ↔ persisted state desync.
     */
    const handleToggleSymptom = async (key: string) => {
        if (!user?.uid || !pregnancyInfo?.week) return;
        const prev = symptoms;
        const updated = prev.includes(key)
            ? prev.filter(s => s !== key)
            : [...prev, key];
        setSymptoms(updated);
        try {
            await saveDailySymptoms(user.uid, pregnancyInfo.week, updated as SymptomKey[]);
        } catch (err) {
            log.error('[HealthDashboard] Error saving symptoms:', err);
            setSymptoms(prev);
            showAlert(t('common.error'), t('dashboard.errorSaving'));
        }
    };

    // GUEST GUARD: value-oriented upgrade prompt (was a bare 🔒 + one line floating
    // in an empty void). EmptyState is flex:1 + vertically centered; the CTA routes to
    // the in-MainTabs GuestUpgrade route (RegisterScreen in link mode) — same pattern as
    // the other HomeStack locked screens. RTL flows from the active language via theme/i18n.
    if (isGuest) {
        return (
            <View style={styles.container}>
                <EmptyState
                    icon="🔒"
                    title={t('dashboard.guestLockTitle')}
                    subtitle={t('dashboard.guestLockSubtitle')}
                    action={
                        <Button
                            title={t('common.screen.createAccount', 'Créer un compte')}
                            onPress={() => navigation.getParent()?.navigate('Home', { screen: 'GuestUpgrade' })}
                        />
                    }
                />
            </View>
        );
    }

    if (loading) {
        // D4: Skeleton mimics the dashboard structure (header + stat tiles + chart + chips)
        return (
            <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
                <Skeleton.Card style={{ height: 120, marginBottom: 16 }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Skeleton.Card style={{ flex: 1, height: 80, marginEnd: 8 }} />
                    <Skeleton.Card style={{ flex: 1, height: 80 }} />
                </View>
                <Skeleton.Card style={{ height: 220, marginBottom: 16 }} />
                <Skeleton width="40%" height={18} style={{ marginBottom: 12 }} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <Skeleton key={i} width={88} height={32} radius={16} style={{ marginEnd: 8, marginBottom: 8 }} />
                    ))}
                </View>
            </ScrollView>
        );
    }

    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>⚠️</Text>
                <Text style={styles.loadingText}>{error}</Text>
                <TouchableOpacity
                    style={{ marginTop: 16, padding: 12, backgroundColor: theme.colors.accent, borderRadius: theme.borderRadius.m }}
                    onPress={loadData}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.retry')}
                >
                    <Text style={{ color: theme.colors.white, fontWeight: '600' }}>{t('common.retry')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const weightData = weightHistory.map(w => w.value as number);
    const weightLabels = weightHistory.map(w => `${t('weight.weekShort')}${w.week}`);

    return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <LinearGradient colors={[theme.colors.primary, theme.colors.accent]} style={styles.header}>
                <Text style={styles.headerTitle}>{t('dashboard.title')}</Text>
                <Text style={styles.headerSubtitle}>{t('dashboard.week')} {pregnancyInfo?.week || '—'}</Text>
            </LinearGradient>

            {/* Section 1: Poids */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{t('dashboard.weightTracking')}</Text>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => setShowWeightModal(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('a11y.addWeight')}
                    >
                        <Text style={styles.addButtonText}>{t('dashboard.add')}</Text>
                    </TouchableOpacity>
                </View>

                {weightHistory.length > 0 ? (
                    <>
                        <View style={styles.statsRow}>
                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>{t('dashboard.current')}</Text>
                                <Text style={styles.statValue}>{stats?.weightCurrent || '—'} {t('dashboard.kg')}</Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>{t('dashboard.gain')}</Text>
                                {/* U-FIX-5: was always prefixed '+' even for losses → showed '+-2.0 kg'.
                                    Now formats with proper sign and colors loss differently. */}
                                <Text style={[
                                    styles.statValue,
                                    { color: (stats?.weightGain ?? 0) < 0 ? theme.colors.warning : theme.colors.success }
                                ]}>
                                    {stats?.weightGain != null
                                        ? `${stats.weightGain >= 0 ? '+' : ''}${stats.weightGain.toFixed(1)} ${t('dashboard.kg')}`
                                        : `— ${t('dashboard.kg')}`}
                                </Text>
                            </View>
                        </View>

                        {weightData.length >= 2 && (
                            <LineChart
                                data={{
                                    labels: weightLabels.slice(-6), // Last 6 weeks
                                    datasets: [{ data: weightData.slice(-6) }],
                                }}
                                width={screenWidth - 48}
                                height={180}
                                chartConfig={{
                                    backgroundColor: theme.colors.white,
                                    backgroundGradientFrom: theme.colors.white,
                                    backgroundGradientTo: theme.colors.white,
                                    decimalPlaces: 1,
                                    color: (opacity = 1) => hexToRgba(theme.colors.primary, opacity),
                                    labelColor: (opacity = 1) => hexToRgba(theme.colors.black, opacity),
                                    style: { borderRadius: theme.borderRadius.l },
                                    propsForDots: {
                                        r: '4',
                                        strokeWidth: '2',
                                        stroke: theme.colors.primary,
                                    },
                                }}
                                bezier
                                style={styles.chart}
                            />
                        )}
                    </>
                ) : (
                    <Text style={styles.emptyText}>{t('dashboard.noDataWeight')}</Text>
                )}
            </View>

            {/* Section 2: Tension */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{t('dashboard.bloodPressure')}</Text>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => setShowBPModal(true)}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('dashboard.bloodPressure')}, ${t('a11y.addNew')}`}
                    >
                        <Text style={styles.addButtonText}>{t('dashboard.add')}</Text>
                    </TouchableOpacity>
                </View>

                {bpHistory.length > 0 ? (
                    <>
                        <View style={styles.bpCard}>
                            <Text style={styles.bpLabel}>{t('dashboard.lastMeasurement')}</Text>
                            <Text style={styles.bpValue}>
                                {stats?.lastBP?.systolic || '—'} / {stats?.lastBP?.diastolic || '—'}
                            </Text>
                            <Text style={styles.bpDate}>
                                {stats?.lastBP?.date
                                    ? new Date(stats.lastBP.date).toLocaleDateString(i18n.language)
                                    : ''}
                            </Text>
                        </View>

                        {bpHistory.slice(0, 3).map((bp, index) => {
                            const value = bp.value as { systolic: number; diastolic: number };
                            return (
                                <View key={bp.metric_id} style={styles.bpHistoryItem}>
                                    <Text style={styles.bpHistoryValue}>
                                        {value.systolic} / {value.diastolic}
                                    </Text>
                                    <Text style={styles.bpHistoryDate}>
                                        {new Date(bp.date).toLocaleDateString(i18n.language)} • S{bp.week}
                                    </Text>
                                </View>
                            );
                        })}
                    </>
                ) : (
                    <Text style={styles.emptyText}>{t('dashboard.noDataBP')}</Text>
                )}
            </View>

            {/* Section 3: Glycémie */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>🩸 {t('dashboard.glucose')}</Text>
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => setShowGlucoseModal(true)}
                        accessibilityRole="button"
                        accessibilityLabel={`${t('dashboard.glucose')}, ${t('a11y.addNew')}`}
                    >
                        <Text style={styles.addButtonText}>{t('dashboard.add')}</Text>
                    </TouchableOpacity>
                </View>
                {glucoseHistory.length > 0 ? (
                    <>
                        <View style={styles.statsRow}>
                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>{t('dashboard.glucose')}</Text>
                                <Text style={[styles.statValue, { color: theme.colors.accentOrangeDeep }]}>
                                    {glucoseHistory[0].value} {t('dashboard.mmolL')}
                                </Text>
                            </View>
                            <View style={styles.statBox}>
                                <Text style={styles.statLabel}>{t('dashboard.glucoseNormal')}</Text>
                                <Text style={{ fontSize: 11, color: theme.colors.neutral400, textAlign: 'center', maxWidth: 120 }}>
                                    {t('dashboard.glucoseTarget')}
                                </Text>
                            </View>
                        </View>
                        {glucoseHistory.slice(1, 3).map((g, i) => (
                            <View key={i} style={styles.bpHistoryItem}>
                                <Text style={styles.bpHistoryValue}>{g.value} {t('dashboard.mmolL')}</Text>
                                <Text style={styles.bpHistoryDate}>
                                    {new Date(g.date).toLocaleDateString(i18n.language)}
                                </Text>
                            </View>
                        ))}
                    </>
                ) : (
                    <>
                        <Text style={styles.emptyText}>{t('dashboard.glucoseNormal')}</Text>
                        <Text style={[styles.emptyText, { color: theme.colors.neutral400, fontSize: 12, marginTop: 4 }]}>
                            {t('dashboard.glucoseTarget')}
                        </Text>
                    </>
                )}
            </View>

            {/* Section 4: Symptômes du jour */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>🗒️ {t('dashboard.symptomsToday')}</Text>
                <View style={styles.symptomsGrid}>
                    {SYMPTOM_CHIPS.map(chip => (
                        <TouchableOpacity
                            key={chip.key}
                            style={[
                                styles.symptomChip,
                                symptoms.includes(chip.key) && styles.symptomChipActive,
                            ]}
                            onPress={() => handleToggleSymptom(chip.key)}
                            accessibilityRole="button"
                            accessibilityLabel={chip.label}
                            accessibilityState={{ selected: symptoms.includes(chip.key) }}
                            accessibilityHint={symptoms.includes(chip.key) ? t('a11y.removeSymptom') : t('a11y.addSymptom', { name: chip.label })}
                        >
                            <Text style={styles.symptomEmoji}>{chip.emoji}</Text>
                            <Text style={[
                                styles.symptomLabel,
                                symptoms.includes(chip.key) && styles.symptomLabelActive,
                            ]}>{chip.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                {symptoms.length === 0 && (
                    <Text style={styles.emptyText}>{t('dashboard.noSymptomsToday')}</Text>
                )}
            </View>

            {/* Section 5: Rendez-vous */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{t('dashboard.appointments')}</Text>
                    <TouchableOpacity
                        onPress={() => showAlert(t('dashboard.soonAvailable'), t('dashboard.soonAvailableDesc'))}
                        accessibilityRole="button"
                        accessibilityLabel={t('dashboard.seeAll')}
                    >
                        <Text style={styles.linkText}>{t('dashboard.seeAll')}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.appointmentsRow}>
                    <View style={[styles.appointmentBox, { backgroundColor: theme.colors.surfaceBlueTint }]}>
                        <Text style={styles.appointmentNumber}>{stats?.upcomingAppointments || 0}</Text>
                        <Text style={styles.appointmentLabel}>{t('dashboard.upcoming')}</Text>
                    </View>
                    <View style={[styles.appointmentBox, { backgroundColor: theme.colors.surfacePurpleTint }]}>
                        <Text style={styles.appointmentNumber}>{stats?.pastAppointments || 0}</Text>
                        <Text style={styles.appointmentLabel}>{t('dashboard.past')}</Text>
                    </View>
                </View>
            </View>

            {/* Section 4: Rappels */}
            <View style={[styles.section, { marginBottom: 40 }]}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{t('dashboard.remindersThisWeek')}</Text>
                    <TouchableOpacity
                        onPress={() => navigation.navigate('Rappels')}
                        accessibilityRole="button"
                        accessibilityLabel={t('dashboard.seeAll')}
                    >
                        <Text style={styles.linkText}>{t('dashboard.seeAll')}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.progressContainer}>
                    <Text style={styles.progressText}>
                        {stats?.remindersCompletedThisWeek || 0} / {stats?.remindersTotalThisWeek || 0} {t('dashboard.completed')}
                    </Text>
                    <View style={styles.progressBar}>
                        <View
                            style={[
                                styles.progressFill,
                                {
                                    width: `${((stats?.remindersCompletedThisWeek || 0) /
                                        (stats?.remindersTotalThisWeek || 1)) *
                                        100}%`,
                                },
                            ]}
                        />
                    </View>
                    <Text style={styles.progressPercentage}>
                        {Math.round(
                            ((stats?.remindersCompletedThisWeek || 0) / (stats?.remindersTotalThisWeek || 1)) * 100
                        )}
                        %
                    </Text>
                </View>
            </View>

            {/* Modal: Add Weight */}
            <HealthWeightModal
                visible={showWeightModal}
                weightInput={newWeight}
                onChangeWeight={setNewWeight}
                onClose={() => {
                    setShowWeightModal(false);
                    setNewWeight('');
                }}
                onSave={handleAddWeight}
                t={t}
            />

            {/* Modal: Add Blood Pressure */}
            <HealthBPModal
                visible={showBPModal}
                systolicInput={newBPSystolic}
                diastolicInput={newBPDiastolic}
                onChangeSystolic={setNewBPSystolic}
                onChangeDiastolic={setNewBPDiastolic}
                onClose={() => {
                    setShowBPModal(false);
                    setNewBPSystolic('');
                    setNewBPDiastolic('');
                }}
                onSave={handleAddBP}
                t={t}
            />

            {/* Modal: Add Glucose */}
            <HealthGlucoseModal
                visible={showGlucoseModal}
                glucoseInput={newGlucose}
                onChangeGlucose={setNewGlucose}
                onClose={() => { setShowGlucoseModal(false); setNewGlucose(''); }}
                onSave={handleAddGlucose}
                t={t}
            />

            {/* U-FIX-5: Medical disclaimer — health data shown is indicative only. */}
            <View style={styles.disclaimer}>
                <Text style={styles.disclaimerText}>
                    {t('dashboard.disclaimer')}
                </Text>
            </View>
        </ScrollView>
    );
};

