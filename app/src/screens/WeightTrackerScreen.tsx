/**
 * WeightTrackerScreen
 * 
 * Track maternal weight during pregnancy with:
 * - Visual graph showing weight evolution
 * - Color zones (green=normal, orange=attention, red=outside norm)
 * - Add new weight entry
 * - History list
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import { usePregnancy } from '../context/PregnancyContext';
import { theme } from '../theme';
import { styles } from './WeightTrackerScreen.styles';
import {
    WeightEntry,
    saveWeightEntry,
    getAllWeightEntries,
    latestWeighingPerDay,
    deleteWeightEntry,
    saveWeightSetup,
    getRecommendedWeightRange,
    evaluateWeightStatus,
    calculateBMICategory,
} from '../services/weightService';
import { detectTrend, getSmartSuggestions, getTrimesterMessage } from '../services/weightIntelligence';
import { createLogger } from '../utils/logger';
import { showAlert } from '../utils/alert';
import { confirmAction } from '../utils/uiUtils';
import { useDateLocale } from '../hooks/useDateLocale';
import { isOnLocalDay, toLocalDateKey } from '../utils/localDate';
import { useTranslation } from 'react-i18next';
import { trackPositiveAction } from '../services/inAppReviewService';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { WeightIntelligenceCard } from '../components/weight/WeightIntelligenceCard';
import { WeightMiniChart } from '../components/weight/WeightMiniChart';

const log = createLogger('WeightTrackerScreen');

export const WeightTrackerScreen = () => {
    useScreenAnalytics('WeightTrackerScreen');
    const { t } = useTranslation(); // Initialize t
    const navigation = useNavigation();
    const { user, updateProfile: updateAccountProfile } = useAuth();
    const { pregnancyInfo, profile, setProfile } = usePregnancy();
    const dateLocale = useDateLocale();

    const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newWeight, setNewWeight] = useState('');
    const [saving, setSaving] = useState(false);
    const [showEducation, setShowEducation] = useState(false);

    // Setup form state
    const [showSetup, setShowSetup] = useState(false);
    const [setupWeight, setSetupWeight] = useState('');
    const [setupHeight, setSetupHeight] = useState('');
    const [savingSetup, setSavingSetup] = useState(false);

    // Debug & Testing utilities
    const [tapCount, setTapCount] = useState(0);
    const [showDebugMode, setShowDebugMode] = useState(false);



    // Check if profile needs setup (no pre-pregnancy weight or height)
    const needsSetup = !profile?.prePregnancyWeight || !profile?.height;

    // User's pre-pregnancy data - NO DEFAULT VALUES for safety
    const prePregnancyWeight = profile?.prePregnancyWeight || 0;
    const height = profile?.height || 0;

    // P0.5: No silent fallback - null if unavailable
    const currentWeek = pregnancyInfo?.week ?? null;
    const hasWeekInfo = currentWeek !== null && currentWeek > 0;

    // Safety check: don't calculate if essential data is missing
    const hasValidData = prePregnancyWeight > 0 && height > 0 && hasWeekInfo;

    // Show setup form automatically if needed.
    // BUG #3 FIX: prefill the inputs from the profile values already collected
    // (Profile screen → prePregnancyWeight / height) so a user who provided ONE
    // of the two facts is never asked for it again. Genuinely-missing fields
    // (value 0) stay empty so the manual entry path still works. When BOTH are
    // known `needsSetup` is false, so the card is skipped entirely (unchanged).
    React.useEffect(() => {
        if (needsSetup && !loading) {
            if (prePregnancyWeight > 0) setSetupWeight(prePregnancyWeight.toString());
            if (height > 0) setSetupHeight(height.toString());
            setShowSetup(true);
        }
    }, [needsSetup, loading, prePregnancyWeight, height]);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [user?.uid])
    );

    const loadData = async () => {
        setLoading(true);
        let isMounted = true;
        try {
            const userId = user?.uid;
            if (!userId) {
                setLoading(false);
                return;
            }
            // Health-dashboard weighings included, so both screens show the same history,
            // one weighing per day like the tracker's own entries.
            const history = latestWeighingPerDay(await getAllWeightEntries(userId));
            if (isMounted) setWeightHistory(history);
        } catch (error) {
            log.error('Error loading weight history:', error);
        } finally {
            if (isMounted) setLoading(false);
        }
        return () => { isMounted = false; };
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const handleAddWeight = async () => {
        const weight = parseFloat(newWeight.replace(',', '.'));

        // P0.2: Détection douce lb/kg pour 120-200 kg (zone ambiguë) - AVANT validation
        if (!isNaN(weight) && weight >= 120 && weight <= 200) {
            confirmAction(
                t('weight.unitCheckTitle'),
                t('weight.unitCheckMsg', { weight, converted: (weight * 0.453592).toFixed(1) }),
                // Confirm = "Yes it's kg" → continue normal validation
                () => {
                    continueValidation(weight);
                },
                // Cancel = "Oops it's lb" → convert lb → kg
                () => {
                    const convertedWeight = parseFloat((weight * 0.453592).toFixed(1));
                    setNewWeight(convertedWeight.toString());
                    showAlert(t('weight.convertedTitle'), t('weight.convertedMsg', { original: weight, converted: convertedWeight }));
                },
                t('weight.oopsLb'),
                t('weight.yesKg'),
            );
            return;
        }

        continueValidation(weight);
    };

    const continueValidation = async (weight: number) => {
        // Validation basique
        if (isNaN(weight) || weight < 35 || weight > 200) {
            // Si > 200, probablement des livres (lb)
            if (weight > 200) {
                showAlert(
                    t('weight.verifyTitle'),
                    t('weight.highWeightMsg', { weight, converted: (weight * 0.453592).toFixed(1) }),
                    [{ text: t('weight.understood') }]
                );
            } else {
                showAlert(t('weight.verifyTitle'), t('weight.invalidWeight'));
            }
            return;
        }

        // Vérifier doublon même jour — her local day. The entry dates are UTC instants, and
        // comparing their first ten characters with the UTC day missed a morning weighing
        // in Tunis or asked to replace yesterday evening's in New York.
        const today = toLocalDateKey();
        const existingToday = weightHistory.find((e: WeightEntry) => isOnLocalDay(e.date, today));
        if (existingToday) {
            confirmAction(
                t('weight.entryExistsTitle'),
                t('weight.entryExistsMsg', { weight: existingToday.weight }),
                async () => {
                    try {
                        const userId = user?.uid;
                        if (!userId) return;
                        await deleteWeightEntry(userId, existingToday.id!, existingToday.source);
                        await saveAndConfirm(weight);
                    } catch (error) {
                        log.error('Error replacing entry:', error);
                    }
                },
                undefined,
                t('common.cancel'),
                t('weight.replace'),
            );
            return;
        }

        // P0: Bloquer dates futures (Note: actuellement on accepte aujourd'hui)
        // Si besoin futur: vérifier que la date saisie n'est pas > aujourd'hui

        // P1: Vérifier perte de poids excessive (>3kg = possible complication)
        if (weightHistory.length > 0) {
            const lastEntry = weightHistory[0];
            const weightLoss = lastEntry.weight - weight;

            if (weightLoss > 3) {
                confirmAction(
                    t('weight.lossTitle'),
                    t('weight.lossMsg', { loss: weightLoss.toFixed(1) }),
                    () => saveAndConfirm(weight),
                    undefined,
                    t('weight.correctInput'),
                    t('weight.saveAnyway'),
                );
                return;
            }
        }

        // Vérifier variation importante (>2kg en 24h)
        if (weightHistory.length > 0) {
            const lastEntry = weightHistory[0];
            const variation = Math.abs(weight - lastEntry.weight);
            if (variation > 2) {
                confirmAction(
                    t('weight.variationTitle'),
                    t('weight.variationMsg', { variation: variation.toFixed(1), last: lastEntry.weight }),
                    () => saveAndConfirm(weight),
                    undefined,
                    t('weight.correct'),
                    t('weight.isCorrect'),
                );
                return;
            }
        }

        await saveAndConfirm(weight);
    };

    const saveAndConfirm = async (weight: number) => {
        setSaving(true);
        try {
            const userId = user?.uid;
            if (!userId) {
                showAlert(t('common.error'), t('weight.errorSave'));
                return;
            }
            await saveWeightEntry({
                user_id: userId,
                weight,
                date: new Date().toISOString(),
                week_of_pregnancy: currentWeek ?? 0,
            });
            setNewWeight('');
            setShowAddForm(false);
            await loadData();

            // Engagement: Track positive action
            trackPositiveAction('add_weight');

            showAlert(t('weight.savedTitle'), t('weight.savedMsg'));
        } catch (error) {
            log.error('Error saving weight:', error);
            showAlert(t('common.error'), t('weight.errorSave'));
        } finally {
            setSaving(false);
        }
    };

    const handleSaveSetup = async () => {
        const weight = parseFloat(setupWeight.replace(',', '.'));
        const heightNum = parseFloat(setupHeight.replace(',', '.'));

        if (isNaN(weight) || weight < 30 || weight > 200) {
            showAlert(t('common.error'), t('weight.invalidWeight'));
            return;
        }
        if (isNaN(heightNum) || heightNum < 100 || heightNum > 250) {
            showAlert(t('common.error'), t('weight.invalidHeight'));
            return;
        }

        setSavingSetup(true);
        try {
            // P0.4: works even while the profile is still null.
            const result = await saveWeightSetup({
                profile,
                prePregnancyWeight: weight,
                height: heightNum,
                signedIn: !!user && !user.isGuest,
                updateAccountProfile,
                setLocalProfile: setProfile,
            });
            if (!result.ok) {
                // The card stays open with her values, so she can simply try again.
                log.error('Weight setup not saved:', result.error);
                showAlert(t('common.error'), t('weight.setupSaveFailed'));
                return;
            }
            setShowSetup(false);
            showAlert(t('common.configSaved'), t('common.configSavedMsg'));
        } catch (error) {
            log.error('Error saving setup:', error);
            showAlert(t('common.error'), t('weight.errorSave'));
        } finally {
            setSavingSetup(false);
        }
    };

    const handleDeleteEntry = (entry: WeightEntry) => {
        confirmAction(
            t('weight.resetConfirmTitle'),
            t('weight.resetConfirmMsg'),
            async () => {
                try {
                    const userId = user?.uid;
                    if (!userId) return;
                    await deleteWeightEntry(userId, entry.id!, entry.source);
                    await loadData();
                    showAlert(t('weight.resetDoneTitle'), t('weight.resetDoneMsg'));
                } catch (error) {
                    log.error('Error resetting data:', error);
                    showAlert(t('common.error'), t('weight.errorReset'));
                }
            },
            undefined,
            t('common.cancel'),
            t('weight.delete'),
        );
    };

    // Edit profile info (re-open setup)
    const handleEditProfile = () => {
        setSetupWeight(prePregnancyWeight > 0 ? prePregnancyWeight.toString() : '');
        setSetupHeight(height > 0 ? height.toString() : '');
        setShowSetup(true);
    };

    // Triple-tap to toggle debug mode (DEV-only feature)
    // MS6: Alert is debug-only, no need to i18n the lock emoji label.
    // Wrapped to log only in dev so prod build doesn't show this Alert if user triple-taps.
    const handleTitlePress = () => {
        if (!__DEV__) return;
        const newCount = tapCount + 1;
        setTapCount(newCount);
        if (newCount >= 3) {
            setShowDebugMode(!showDebugMode);
            showAlert('', showDebugMode ? 'Debug OFF' : 'Debug ON');
            setTapCount(0);
        }
        setTimeout(() => setTapCount(0), 1500);
    };

    // Reset all weight data
    const handleResetData = async () => {
        confirmAction(
            t('common.resetConfirmShort'),
            t('common.resetConfirmMsgShort'),
            async () => {
                const userId = user?.uid;
                if (!userId) return;
                const history = await getAllWeightEntries(userId);
                for (const e of history) await deleteWeightEntry(userId, e.id!, e.source);
                await loadData();
            },
            undefined,
            t('common.no'),
            t('common.yes'),
        );
    };

    // Get current status (use real data only)
    const latestWeight = weightHistory.length > 0 ? weightHistory[0].weight : null;
    const weightStatus = latestWeight && hasValidData
        ? evaluateWeightStatus(latestWeight, prePregnancyWeight, height, currentWeek)
        : null;
    const recommendedRange = hasValidData
        ? getRecommendedWeightRange(prePregnancyWeight, height, currentWeek)
        : { min: 0, max: 0, targetGain: { min: 0, max: 0 } };
    const bmiCategory = hasValidData
        ? calculateBMICategory(prePregnancyWeight, height)
        : { category: 'normal' as const, minGain: 0, maxGain: 0, weeklyGainT2T3: 0 };

    // PERFECT-FIX-2: derive BMI numeric value + map OMS category → semantic theme color.
    // bmiCategory was previously computed but never surfaced in the UI; users now
    // see both their pre-pregnancy BMI and the WHO/OMS classification.
    const bmiValue = hasValidData
        ? prePregnancyWeight / Math.pow(height / 100, 2)
        : null;
    const BMI_CATEGORY_COLOR: Record<typeof bmiCategory.category, string> = {
        underweight: theme.colors.warning,
        normal: theme.colors.success,
        overweight: theme.colors.warning,
        obese: theme.colors.error,
    };

    // Intelligence: Detect trend and generate smart suggestions
    const trend = React.useMemo(() => detectTrend(weightHistory), [weightHistory]);
    const suggestions = React.useMemo(() => {
        if (!currentWeek) return [];
        const status = weightStatus?.status || 'normal';
        // Filter out 'unknown' status
        const validStatus = status === 'unknown' ? 'normal' : status as 'normal' | 'low' | 'high';
        return getSmartSuggestions(currentWeek, validStatus, trend || undefined);
    }, [currentWeek, weightStatus?.status, trend]);
    const trimesterMessage = currentWeek ? getTrimesterMessage(currentWeek) : null;

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            {/* Header with triple-tap */}
            <View style={styles.header}>
                {/* The triple-tap debug toggle only exists in dev builds. In a release build
                    the title is plain text — a focusable, nameless control that does nothing
                    would just be a dead stop for screen-reader and keyboard users. */}
                {__DEV__ ? (
                    <TouchableOpacity onPress={handleTitlePress}>
                        <Text style={styles.title}>{t('weight.title')}</Text>
                        <Text style={styles.subtitle}>{t('common.weekLabel', { number: currentWeek || '?' })}</Text>
                    </TouchableOpacity>
                ) : (
                    <View>
                        <Text style={styles.title} accessibilityRole="header">{t('weight.title')}</Text>
                        <Text style={styles.subtitle}>{t('common.weekLabel', { number: currentWeek || '?' })}</Text>
                    </View>
                )}

                {/* Debug controls */}
                {showDebugMode && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TouchableOpacity
                            onPress={handleEditProfile}
                            style={{ padding: 8, backgroundColor: theme.colors.blue600, borderRadius: 4 }}
                        >
                            <Text style={{ color: 'white', fontSize: 12 }}>{t('weight.edit')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleResetData}
                            style={{ padding: 8, backgroundColor: theme.colors.critical, borderRadius: 4 }}
                        >
                            <Text style={{ color: 'white', fontSize: 12 }}>{t('weight.reset')}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Setup Form - shown when weight/height not configured */}
            {showSetup && (
                <View style={styles.setupCard}>
                    <Text style={styles.setupTitle}>{t('weight.setupTitle')}</Text>
                    <Text style={styles.setupDescription}>
                        {t('weight.setupDesc')}
                    </Text>

                    <View style={styles.setupField}>
                        <Text style={styles.setupLabel}>{t('weight.setupWeight')}</Text>
                        <TextInput
                            style={styles.setupInput}
                            placeholder={t('common.weightPlaceholder')}
                            placeholderTextColor={theme.colors.neutral400}
                            keyboardType="decimal-pad"
                            value={setupWeight}
                            onChangeText={setSetupWeight}
                            accessibilityLabel={t('weight.setupWeight')}
                        />
                    </View>

                    <View style={styles.setupField}>
                        <Text style={styles.setupLabel}>{t('weight.setupHeight')}</Text>
                        <TextInput
                            style={styles.setupInput}
                            placeholder={t('common.heightPlaceholder')}
                            placeholderTextColor={theme.colors.neutral400}
                            keyboardType="decimal-pad"
                            value={setupHeight}
                            onChangeText={setSetupHeight}
                            accessibilityLabel={t('weight.setupHeight')}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.setupButton, savingSetup && styles.saveButtonDisabled]}
                        onPress={handleSaveSetup}
                        disabled={savingSetup}
                        accessibilityRole="button"
                        accessibilityLabel={t('weight.save')}
                        accessibilityState={{ disabled: savingSetup, busy: savingSetup }}
                    >
                        <Text style={styles.setupButtonText}>
                            {savingSetup ? t('common.saving') : `✓ ${t('weight.save')}`}
                        </Text>
                    </TouchableOpacity>

                    <Text style={styles.setupNote}>
                        {t('weight.confidential')}
                    </Text>
                </View>
            )}


            {/* Only show content if setup is complete */}
            {!needsSetup && (
                <>

                    {/* SIMPLIFIED: Huge Weight Display */}
                    <View style={styles.weightDisplay}>
                        {latestWeight && hasValidData ? (
                            <>
                                <Text style={styles.hugeWeight}>{latestWeight} {t('weight.hugeWeight')}</Text>
                                <View style={styles.weightMeta}>
                                    <Text style={styles.weightGainText}>
                                        {weightStatus!.gain >= 0 ? '+' : ''}{weightStatus!.gain.toFixed(1)} {t('weight.hugeWeight')} {t('weight.sinceStart')}
                                    </Text>
                                    {weightStatus?.status !== 'normal' && (
                                        <Text style={styles.miniStatus}>
                                            {weightStatus?.status === 'low' && t('weight.below')}
                                            {weightStatus?.status === 'high' && t('weight.above')}
                                        </Text>
                                    )}
                                </View>

                                {/* Visual Gauge */}
                                <View style={styles.gaugeContainer}>
                                    <Text style={styles.gaugeLabel}>{t('weight.indicativeZone')}</Text>
                                    <View style={styles.gaugeBar}>
                                        <View style={styles.gaugeRange} />
                                        <View
                                            style={[
                                                styles.gaugeDot,
                                                {
                                                    left: `${Math.min(Math.max(
                                                        ((latestWeight - recommendedRange.min) / (recommendedRange.max - recommendedRange.min)) * 100,
                                                        0
                                                    ), 100)}%`
                                                }
                                            ]}
                                        />
                                    </View>
                                    <View style={styles.gaugeLabels}>
                                        <Text style={styles.gaugeLabelText}>{recommendedRange.min.toFixed(0)}{t('common.kg')}</Text>
                                        <Text style={styles.gaugeIcon}>👍</Text>
                                        <Text style={styles.gaugeLabelText}>{recommendedRange.max.toFixed(0)}{t('common.kg')}</Text>
                                    </View>
                                </View>
                            </>
                        ) : (
                            <Text style={styles.noDataText}>{t('weight.noData')}</Text>
                        )}
                    </View>

                    {/* Recommended Range Info - SIMPLIFIED */}
                    <View style={styles.infoCard}>
                        <View style={styles.infoHeader}>
                            <Text style={styles.infoTitle}>{t('weight.targetWeekNumber', { week: currentWeek })}</Text>
                            <TouchableOpacity
                                style={styles.infoButton}
                                onPress={() => showAlert(
                                    t('weight.howItWorks'),
                                    t('weight.howItWorksDesc'),
                                    [{ text: t('weight.understood') }]
                                )}
                                accessibilityRole="button"
                                accessibilityLabel={t('weight.howItWorks')}
                            >
                                <Text style={styles.infoIcon}>ℹ️</Text>
                            </TouchableOpacity>
                        </View>
                        {/* PERFECT-FIX-2: surface pre-pregnancy BMI + OMS/WHO category badge */}
                        {bmiValue !== null && (
                            <View style={styles.bmiRow}>
                                <Text style={styles.bmiLabel}>
                                    {t('weight.bmi')}: <Text style={styles.bmiValue}>{bmiValue.toFixed(1)}</Text>
                                </Text>
                                <View
                                    style={[
                                        styles.bmiCategoryBadge,
                                        {
                                            backgroundColor: BMI_CATEGORY_COLOR[bmiCategory.category] + '22',
                                            borderColor: BMI_CATEGORY_COLOR[bmiCategory.category],
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.bmiCategoryText,
                                            { color: BMI_CATEGORY_COLOR[bmiCategory.category] },
                                        ]}
                                    >
                                        {t(`weight.bmiCategory.${bmiCategory.category}`)}
                                    </Text>
                                </View>
                            </View>
                        )}
                        <Text style={{ fontSize: 22, fontWeight: '700', color: theme.colors.info, marginTop: 8 }}>
                            {recommendedRange.min.toFixed(1)} - {recommendedRange.max.toFixed(1)} {t('common.kg')}
                        </Text>
                        <Text style={styles.infoDetail}>
                            {t('weight.about')} +{recommendedRange.targetGain.min.toFixed(1)} - +{recommendedRange.targetGain.max.toFixed(1)} {t('common.kg')} {t('weight.sinceStart')}
                        </Text>
                    </View>

                    {/* Mini Chart */}
                    <WeightMiniChart
                        weightHistory={weightHistory}
                        prePregnancyWeight={prePregnancyWeight}
                        t={t}
                    />

                    {/* Add Weight Button / Form */}
                    {showAddForm ? (
                        <View style={styles.addForm}>
                            <Text style={styles.addFormTitle}>{t('weight.addWeightTitle')}</Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    style={styles.weightInput}
                                    placeholder={t('common.decimalWeightPlaceholder')}
                                    placeholderTextColor={theme.colors.neutral400}
                                    keyboardType="decimal-pad"
                                    value={newWeight}
                                    onChangeText={setNewWeight}
                                    autoFocus
                                    accessibilityLabel={t('weight.addWeightTitle')}
                                />
                                <Text style={styles.kgLabel}>{t('common.kg')}</Text>
                            </View>
                            <View style={styles.formButtons}>
                                <TouchableOpacity
                                    style={styles.cancelButton}
                                    onPress={() => { setShowAddForm(false); setNewWeight(''); }}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('a11y.cancel')}
                                >
                                    <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                                    onPress={handleAddWeight}
                                    disabled={saving}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('a11y.save')}
                                    accessibilityState={{ disabled: saving, busy: saving }}
                                >
                                    <Text style={styles.saveButtonText}>
                                        {saving ? t('common.saving') : t('weight.save')}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={styles.addButton}
                            onPress={() => setShowAddForm(true)}
                            accessibilityRole="button"
                            accessibilityLabel={t('a11y.addWeight')}
                        >
                            <Text style={styles.addButtonText}>{t('weight.addDailyWeight')}</Text>
                        </TouchableOpacity>
                    )}

                    {/* History */}
                    <View style={styles.historySection}>
                        <Text style={styles.historyTitle}>{t('weight.history')}</Text>
                        {weightHistory.length === 0 ? (
                            <View style={{ alignItems: 'center', padding: 32 }}>
                                <Text style={{ fontSize: 48, marginBottom: 12 }}>📊</Text>
                                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.neutral900, marginBottom: 8 }}>{t('weight.startTracking')}</Text>
                                <Text style={{ fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' }}>{t('weight.startTrackingDesc')}</Text>
                            </View>
                        ) : (
                            weightHistory.slice(0, 10).map((entry: WeightEntry) => {
                                const entryStatus = evaluateWeightStatus(entry.weight, prePregnancyWeight, height, entry.week_of_pregnancy);
                                return (
                                    <View key={`${entry.source ?? 'weight_entries'}-${entry.id}`} style={styles.historyItem}>
                                        <View style={styles.historyLeft}>
                                            <Text style={styles.historyWeight}>{entry.weight} {t('common.kg')}</Text>
                                            <Text style={styles.historyDate}>
                                                {format(new Date(entry.date), 'dd MMM yyyy', { locale: dateLocale })} • {t('common.weekLabel', { number: entry.week_of_pregnancy })}
                                            </Text>
                                        </View>
                                        <View style={styles.historyRight}>
                                            <View style={[
                                                styles.historyBadge,
                                                entryStatus.status === 'normal' && styles.badgeNormal,
                                                entryStatus.status !== 'normal' && styles.badgeWarning,
                                            ]}>
                                                <Text style={styles.historyBadgeText}>
                                                    {entryStatus.status === 'normal' ? '✓' : '≈'}
                                                </Text>
                                            </View>
                                            <TouchableOpacity
                                                style={styles.deleteButton}
                                                onPress={() => handleDeleteEntry(entry)}
                                                accessibilityRole="button"
                                                accessibilityLabel={t('a11y.deleteWeight')}
                                                accessibilityHint={`${entry.weight} ${t('common.kg')}, ${format(new Date(entry.date), 'dd MMM yyyy', { locale: dateLocale })}`}
                                            >
                                                <Text style={styles.deleteButtonText}>🗑️</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </View>

                    {/* ── IA Locale: Trimester message + trend + suggestions ── */}
                    <WeightIntelligenceCard
                        hasValidData={hasValidData}
                        historyCount={weightHistory.length}
                        trimesterMessage={trimesterMessage}
                        trend={trend}
                        suggestions={suggestions}
                        t={t}
                    />

                    {/* Educational Section - SIMPLIFIED */}
                    <TouchableOpacity
                        style={styles.educationHeader}
                        onPress={() => setShowEducation(!showEducation)}
                        accessibilityRole="button"
                        accessibilityLabel={t('weight.whyTrack')}
                        accessibilityHint={showEducation ? t('a11y.collapseSection') : t('a11y.expandSection')}
                        accessibilityState={{ expanded: showEducation }}
                    >
                        <Text style={styles.educationHeaderText}>{t('weight.whyTrack')}</Text>
                        <Text style={styles.educationToggle}>{showEducation ? '▲' : '▼'}</Text>
                    </TouchableOpacity>

                    {showEducation && (
                        <View style={styles.educationContent}>
                            {/* Simple explanation */}
                            <View style={styles.eduCard}>
                                <Text style={styles.eduCardText}>
                                    {t('weight.bodyChanges')}
                                </Text>
                                <View style={styles.eduTips}>
                                    <Text style={styles.eduTip}>{t('weight.babyGrowing')}</Text>
                                    <Text style={styles.eduTip}>{t('weight.moreBlood')}</Text>
                                    <Text style={styles.eduTip}>{t('weight.energyReserves')}</Text>
                                </View>
                            </View>

                            {/* What to do */}
                            <View style={[styles.eduCard, styles.eduCardImportant]}>
                                <Text style={styles.eduCardTitle}>{t('weight.goal')}</Text>
                                <Text style={styles.eduCardText}>
                                    {t('weight.goalDesc')}
                                </Text>
                                <View style={styles.eduTips}>
                                    <Text style={styles.eduTip}>{t('weight.weighWeekly')}</Text>
                                    <Text style={styles.eduTip}>{t('weight.shareDoctor')}</Text>
                                    <Text style={styles.eduTip}>{t('weight.noDiet')}</Text>
                                </View>
                            </View>
                        </View>
                    )}

                    {/* Medical Disclaimer */}
                    <View style={styles.disclaimer}>
                        <Text style={styles.disclaimerText}>
                            {t('weight.consultDoctor')}
                        </Text>
                    </View>
                </>
            )}
        </ScrollView>
    );
};

