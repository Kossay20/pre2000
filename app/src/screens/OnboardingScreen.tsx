import { createLogger } from '../utils/logger';
const log = createLogger('OnboardingScreen');
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    Platform,
    TouchableOpacity,
    ScrollView,
    KeyboardAvoidingView,
    Animated,
    BackHandler,
} from 'react-native';
import { showAlert } from '../utils/alert';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Localization from 'expo-localization';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { usePregnancy } from '../context/PregnancyContext';
import { theme } from '../theme';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { format, subDays } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { analytics, auth } from '../config/firebase';
import { logEvent } from 'firebase/analytics';
import { getFirebaseErrorMessage } from '../utils/firebaseErrors';
import { useAuthLoading } from '../hooks/useAuthLoading';
import { retryOperation } from '../utils/retry';
import { calculatePregnancyWeek } from '../utils/pregnancyCalculator';
import { useDateLocale } from '../hooks/useDateLocale';
import { getPickerLocale } from '../utils/pickerLocale';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateFertileWindow } from '../utils/fertility';
import { validateProfile } from '../utils/validation';
import {
    getStepCount,
    WEEK_COMPARISONS,
    type PregnancyStatus,
    type DateMethod,
} from './onboardingConstants';
import { styles } from './OnboardingScreen.styles';
import { getContentWidth } from '../utils/layout';

const width = getContentWidth();


export const OnboardingScreen = () => {
    useScreenAnalytics('OnboardingScreen');
    const { user, loginAsGuest, register, login } = useAuth();
    const { setProfile } = usePregnancy();
    const navigation = useNavigation();
    const { t, i18n } = useTranslation();
    // W1 #6: language-derived RTL (I18nManager.isRTL is false on web). Used for TEXT alignment
    // only — layout rows mirror automatically via document.dir=rtl (web) / I18nManager (native),
    // so we never row-reverse here (would double-mirror — see reference_rnweb_rtl_gotchas).
    const isRTL = i18n.language === 'ar' || i18n.language === 'tn';
    const rtlText = isRTL ? ({ textAlign: 'right' as const, writingDirection: 'rtl' as const }) : null;
    const reducedMotion = usePrefersReducedMotion();

    // Get date locale using shared hook (handles all languages including tn → arTN)
    const dateLocale = useDateLocale();

    // Step state
    const [step, setStep] = useState(1);
    const fadeAnim = useState(new Animated.Value(1))[0];

    // Data collected
    const [pregnancyStatus, setPregnancyStatus] = useState<PregnancyStatus>(null);
    const [dateMethod, setDateMethod] = useState<DateMethod>('ddr');
    // PHASE 2.5 FIX (E2E audit 2026-05-08): pre-fill date 8 weeks ago instead of
    // today. Previously the absurd "Semaine 1, 0 SA + 1 jour" was shown to every
    // user who landed on step 2 without changing the date. 8 weeks is the median
    // moment users discover their pregnancy and seek tracking apps.
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 8 * 7);
        return d;
    });
    const [firstName, setFirstName] = useState('');
    const [isFirstPregnancy, setIsFirstPregnancy] = useState<boolean | null>(null);

    // TTC-specific state
    const [cycleLength, setCycleLength] = useState(28);
    const [lastPeriodDate, setLastPeriodDate] = useState(() => {
        // For TTC, default to 14 days ago (mid-cycle, common when user starts tracking)
        const d = new Date();
        d.setDate(d.getDate() - 14);
        return d;
    });
    const [showCycleDatePicker, setShowCycleDatePicker] = useState(false);

    // Curious-specific state
    const [exploreWeek, setExploreWeek] = useState(20);

    // Personal info
    const [country, setCountry] = useState('tunisia');
    const [ageRange, setAgeRange] = useState<string>('');

    // Account creation (required at the end)
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // UI
    const [showDatePicker, setShowDatePicker] = useState(false);
    const { loading, withLoading } = useAuthLoading();
    const [error, setError] = useState('');

    useEffect(() => {
        log.debug('[Onboarding] 🚀 V2 Started');
        analytics.then(a => a && logEvent(a, 'onboarding_v2_start'));

        // F7: detect country from device locale instead of remote IP lookup
        // (avoids leaking the user's IP to a third party — see C2 audit).
        try {
            const region = Localization.getLocales?.()[0]?.regionCode || null;
            if (region) {
                const regionMap: { [key: string]: string } = {
                    TN: 'tunisia',
                    FR: 'france',
                    BE: 'belgium',
                    MA: 'morocco',
                    DZ: 'algeria',
                };
                const detected = regionMap[region.toUpperCase()];
                if (detected) {
                    log.debug(`[Onboarding] 🌍 Detected region: ${region} → ${detected}`);
                    setCountry(detected);
                } else {
                    log.debug(`[Onboarding] 🌍 Region ${region} not in map, keeping default country`);
                }
            }
        } catch (e) {
            log.debug('[Onboarding] ⚠️ Could not read locale, using default country');
        }
    }, []);

    // Calculate LMP from selected date based on method
    const getLmpDate = (): Date => {
        if (dateMethod === 'conception') {
            // Conception is ~14 days after DDR, so DDR = conception - 14 days
            const lmp = subDays(selectedDate, 14);
            log.debug(`[Onboarding] 📅 Conception → LMP: ${selectedDate.toISOString()} → ${lmp.toISOString()}`);
            return lmp;
        }
        log.debug(`[Onboarding] 📅 DDR direct: ${selectedDate.toISOString()}`);
        return selectedDate;
    };

    // Real-time pregnancy calculation
    const pregnancyInfo = useMemo(() => {
        const lmp = getLmpDate();
        const result = calculatePregnancyWeek(lmp);
        log.debug(`[Onboarding] 🧮 Calculated: Week ${result.week}, Day ${result.day} (method: ${dateMethod})`);
        return result;
    }, [selectedDate, dateMethod]);

    const weekComparison = WEEK_COMPARISONS[pregnancyInfo.week] || WEEK_COMPARISONS[1];

    // Animation for step transitions
    const stepRef = useRef(step);
    stepRef.current = step;

    const animateTransition = useCallback((callback: () => void) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: Platform.OS !== 'web' }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: Platform.OS !== 'web' }),
        ]).start();
        setTimeout(callback, 150);
    }, [fadeAnim]);

    const prevStep = useCallback(() => {
        animateTransition(() => setStep(s => s - 1));
    }, [animateTransition]);

    const nextStep = useCallback(() => {
        analytics.then(a => a && logEvent(a, 'onboarding_step_complete', { step: stepRef.current }));
        animateTransition(() => setStep(s => s + 1));
    }, [animateTransition]);

    // W1 #7: step-1 status cards auto-advance. Set the status, then let the selected highlight
    // register before transitioning so the tap feels acknowledged (Flo/Glow pattern). The short
    // dwell is skipped under reduced-motion (advance immediately, no artificial wait).
    const selectStatusAndAdvance = useCallback((status: PregnancyStatus) => {
        setPregnancyStatus(status);
        if (reducedMotion) { nextStep(); return; }
        setTimeout(() => nextStep(), 220);
    }, [nextStep, reducedMotion]);

    useEffect(() => {
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (stepRef.current <= 1) return false;
            prevStep();
            return true;
        });
        return () => sub.remove();
    }, [prevStep]);

    const handleDateChange = (event: any, date?: Date) => {
        setShowDatePicker(Platform.OS === 'ios');
        if (date) setSelectedDate(date);
    };

    const handleFinish = async (createAccount: boolean = false) => {
        setError('');
        const lmpDate = getLmpDate();

        // F18: validate the collected profile before creating the account / guest profile.
        // Blocks invalid first names and impossible LMP dates from reaching AuthContext.
        const validation = validateProfile({
            firstName: firstName.trim() || t('onboarding.step4.defaultName'),
            lmp: lmpDate,
        });
        if (!validation.valid) {
            const message = validation.error ? t(validation.error) : t('common.unknownError');
            showAlert(t('common.error'), message);
            return;
        }

        log.debug('[Onboarding] 🎯 handleFinish called', { createAccount });
        log.debug(`[Onboarding] 📊 Profile data:`, {
            firstName: firstName.trim() || t('onboarding.step4.defaultName'),
            lmpDate: lmpDate.toISOString(),
            dateMethod,
            week: pregnancyInfo.week,
            day: pregnancyInfo.day,
            isFirstPregnancy,
            pregnancyStatus,
            country,
            ageRange,
        });

        await withLoading(async () => {
            try {
                let authenticatedUser = null;

                // Create account if requested
                if (createAccount && email && password) {
                    log.debug('[Onboarding] 📝 Creating account...');
                    try {
                        authenticatedUser = await retryOperation(
                            () => register(email.trim(), password),
                            { maxRetries: 1, initialDelay: 500 }
                        );
                    } catch (regError: any) {
                        // CRITICAL FIX: If registration fails because email exists (e.g. previous attempt failed at profile save),
                        // try to log in instead to recover the session and proceed to profile creation.
                        if (regError.code === 'auth/email-already-in-use') {
                            log.warn('[Onboarding] ⚠️ Email already in use, attempting login to recover...');
                            await login(email.trim(), password);
                            // If login succeeds, we continue. The auth state will update.
                            // We need access to the user object. logic inside login sets the state.
                            // But we need the user object returned here to pass to loginAsGuest.
                            // The login function in AuthContext doesn't return the user, it sets state.
                            // But we can get the current user from auth.currentUser immediately after await.
                            authenticatedUser = auth.currentUser;
                        } else {
                            throw regError;
                        }
                    }
                    log.debug('[Onboarding] ✅ Account created/recovered, uid:', authenticatedUser?.uid);
                }

                log.debug('[Onboarding] 👤 Creating profile...');
                log.debug('[Onboarding] 📅 LMP Date being saved:', lmpDate.toISOString());

                // Create profile (guest or authenticated)
                await retryOperation(() => loginAsGuest(
                    firstName.trim() || t('onboarding.step4.defaultName'),
                    lmpDate,
                    country,
                    undefined, // lastName
                    undefined, // city
                    ageRange || undefined,
                    isFirstPregnancy ?? undefined,
                    authenticatedUser ?? undefined
                ));

                log.debug('[Onboarding] ✅ Profile created successfully!');
                log.debug(`[Onboarding] 📅 LMP saved: ${lmpDate.toISOString()}`);
                log.debug(`[Onboarding] 📊 Week ${pregnancyInfo.week}, Day ${pregnancyInfo.day}`);

                analytics.then(a => a && logEvent(a, 'onboarding_v2_complete', {
                    method: dateMethod,
                    is_first_pregnancy: isFirstPregnancy,
                    week: pregnancyInfo.week,
                    country,
                    has_account: createAccount,
                }));

                log.debug('[Onboarding] ✅ Profile created, navigating to Home');
            } catch (err: any) {
                log.error('[Onboarding] ❌ Error during account/profile creation:', err);
                const errorMessage = getFirebaseErrorMessage(err);
                setError(t(errorMessage));
                // Don't re-throw - let withLoading complete and reset loading state
            }
        });
    };

    // ==========================================
    // RENDER STEPS
    // ==========================================

    const renderProgressBar = () => {
        const totalSteps = getStepCount(pregnancyStatus);
        return (
            <View>
                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: `${(step / totalSteps) * 100}%` }]} />
                </View>
                {/* Cycle 5 F901 — Stepper text explicite (Flo/Glow pattern). */}
                <Text style={styles.stepperText}>
                    {t('onboarding.stepper', { current: step, total: totalSteps })}
                </Text>
            </View>
        );
    };

    // STEP 1: Pregnancy Status
    const renderStep1 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepEmoji}>🌸</Text>
            <Text style={styles.stepTitle}>{t('onboarding.step1.title')}</Text>

            <View style={styles.optionsContainer}>
                <TouchableOpacity
                    style={[styles.optionCard, pregnancyStatus === 'pregnant' && styles.optionCardSelected]}
                    onPress={() => selectStatusAndAdvance('pregnant')}
                    accessibilityRole="button"
                    accessibilityLabel={t('onboarding.step1.pregnant')}
                    accessibilityState={{ selected: pregnancyStatus === 'pregnant' }}
                >
                    <Text style={styles.optionEmoji}>🤰</Text>
                    <Text style={styles.optionText}>{t('onboarding.step1.pregnant')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.optionCard, pregnancyStatus === 'trying' && styles.optionCardSelected]}
                    onPress={() => selectStatusAndAdvance('trying')}
                    accessibilityRole="button"
                    accessibilityLabel={t('onboarding.step1.trying')}
                    accessibilityState={{ selected: pregnancyStatus === 'trying' }}
                >
                    <Text style={styles.optionEmoji}>💕</Text>
                    <Text style={styles.optionText}>{t('onboarding.step1.trying')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.optionCard, pregnancyStatus === 'curious' && styles.optionCardSelected]}
                    onPress={() => selectStatusAndAdvance('curious')}
                    accessibilityRole="button"
                    accessibilityLabel={t('onboarding.step1.curious')}
                    accessibilityState={{ selected: pregnancyStatus === 'curious' }}
                >
                    <Text style={styles.optionEmoji}>👀</Text>
                    <Text style={styles.optionText}>{t('onboarding.step1.curious')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    // STEP 2: Date Selection (Smart)
    const renderStep2 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepEmoji}>📅</Text>
            <Text style={styles.stepTitle}>{t('onboarding.step2.title')}</Text>
            <Text style={styles.stepSubtitle}>{t('onboarding.step2.subtitle')}</Text>

            {/* Method Selection */}
            <View style={styles.methodSelector}>
                <TouchableOpacity
                    style={[styles.methodButton, dateMethod === 'ddr' && styles.methodButtonActive]}
                    onPress={() => setDateMethod('ddr')}
                    accessibilityRole="button"
                    accessibilityLabel={t('onboarding.step2.methodDdr')}
                    accessibilityState={{ selected: dateMethod === 'ddr' }}
                >
                    <Text style={[styles.methodText, dateMethod === 'ddr' && styles.methodTextActive]}>
                        {t('onboarding.step2.methodDdr')}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.methodButton, dateMethod === 'conception' && styles.methodButtonActive]}
                    onPress={() => setDateMethod('conception')}
                    accessibilityRole="button"
                    accessibilityLabel={t('onboarding.step2.methodConception')}
                    accessibilityState={{ selected: dateMethod === 'conception' }}
                >
                    <Text style={[styles.methodText, dateMethod === 'conception' && styles.methodTextActive]}>
                        {t('onboarding.step2.methodConception')}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Date Picker */}
            <View style={styles.dateSection}>
                <Text style={styles.dateLabel}>
                    {dateMethod === 'ddr'
                        ? t('onboarding.step2.labelDdr')
                        : t('onboarding.step2.labelConception')}
                </Text>

                {Platform.OS === 'web' ? (
                    <input
                        type="date"
                        value={selectedDate.toISOString().split('T')[0]}
                        onChange={(e) => {
                            const newDate = new Date(e.target.value);
                            if (!isNaN(newDate.getTime())) setSelectedDate(newDate);
                        }}
                        max={new Date().toISOString().split('T')[0]}
                        style={{
                            width: '100%',
                            padding: 16,
                            fontSize: 18,
                            borderRadius: 12,
                            border: `2px solid ${theme.colors.pinkLightPastel}`,
                            backgroundColor: theme.colors.white,
                            textAlign: 'center',
                        }}
                    />
                ) : (
                    <>
                        <TouchableOpacity
                            onPress={() => setShowDatePicker(true)}
                            style={styles.dateInput}
                            accessibilityRole="button"
                            accessibilityLabel={`${t('onboarding.step2.labelDdr')}: ${format(selectedDate, 'd MMMM yyyy', { locale: dateLocale })}`}
                            accessibilityHint={t('a11y.selectDate')}
                        >
                            <Text style={styles.dateText}>
                                {format(selectedDate, 'd MMMM yyyy', { locale: dateLocale })}
                            </Text>
                        </TouchableOpacity>
                        {/* Android Picker inline (since it launches a native dialogue anyway) */}
                        {Platform.OS === 'android' && showDatePicker && (
                            <DateTimePicker
                                value={selectedDate}
                                mode="date"
                                display="default"
                                onChange={handleDateChange}
                                maximumDate={new Date()}
                                locale={getPickerLocale(i18n.language)}
                            />
                        )}
                    </>
                )}

                {/* Live Preview */}
                <View style={styles.previewBox}>
                    {pregnancyInfo.isInvalid ? (
                        <Text style={[styles.previewLabel, { color: theme.colors.red700, textAlign: 'center', fontWeight: 'bold' }]}>
                            {t('onboarding.step2.invalidDate', 'Date invalide : votre grossesse dépasse 40 semaines.')}
                        </Text>
                    ) : (
                        <>
                            <Text style={styles.previewLabel}>{t('onboarding.step2.previewLabel')}</Text>
                            <Text style={styles.previewWeek}>{t('onboarding.step2.week')} {pregnancyInfo.week}</Text>
                            <Text style={styles.previewSa}>
                                {t('onboarding.step2.saDays', { week: pregnancyInfo.week - 1, day: pregnancyInfo.day })}
                            </Text>
                        </>
                    )}
                </View>
            </View>

            <View style={styles.navButtons}>
                <TouchableOpacity
                    onPress={prevStep}
                    style={styles.backButton}
                    accessibilityRole="button"
                    accessibilityLabel={t('a11y.onboardingBack')}
                >
                    <Text style={styles.backButtonText}>{t('common.back')}</Text>
                </TouchableOpacity>
                <Button
                    title={t('common.continue')}
                    onPress={nextStep}
                    style={styles.continueButton}
                    disabled={pregnancyInfo.isInvalid}
                />
            </View>
        </View>
    );

    // STEP 3: Personalization
    const renderStep3 = () => (
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.stepContentContainer}
            showsVerticalScrollIndicator={false}
        >
            <Text style={styles.stepEmoji}>👋</Text>
            <Text style={styles.stepTitle}>{t('onboarding.step3.title')}</Text>

            <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, rtlText]}>{t('onboarding.step3.firstNameLabel')}</Text>
                <TextInput
                    style={[styles.textInput, rtlText]}
                    placeholder={t('onboarding.step3.firstNamePlaceholder')}
                    value={firstName}
                    onChangeText={setFirstName}
                    autoCapitalize="words"
                    placeholderTextColor={theme.colors.neutral400}
                    accessibilityLabel={t('onboarding.step3.firstNameLabel')}
                />
            </View>

            <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, rtlText]}>{t('onboarding.step3.ageLabel')}</Text>
                <View style={styles.ageRangeContainer}>
                    {['18-24', '25-29', '30-34', '35-39', '40+'].map((range) => (
                        <TouchableOpacity
                            key={range}
                            style={[styles.ageRangeButton, ageRange === range && styles.ageRangeButtonSelected]}
                            onPress={() => setAgeRange(range)}
                            accessibilityRole="button"
                            accessibilityLabel={range}
                            accessibilityState={{ selected: ageRange === range }}
                        >
                            <Text style={[styles.ageRangeText, ageRange === range && styles.ageRangeTextSelected]}>
                                {range}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, rtlText]}>{t('onboarding.step3.countryLabel')}</Text>
                <View style={styles.radioGroup}>
                    {[
                        { value: 'tunisia', key: 'common.countries.tunisia' },
                        { value: 'france', key: 'common.countries.france' },
                        { value: 'belgium', key: 'common.countries.belgium' },
                        { value: 'morocco', key: 'common.countries.morocco' },
                        { value: 'algeria', key: 'common.countries.algeria' },
                        { value: 'other', key: 'common.countries.other' },
                    ].map((item) => (
                        <TouchableOpacity
                            key={item.value}
                            style={[styles.radioOption, country === item.value && styles.radioOptionSelected]}
                            onPress={() => setCountry(item.value)}
                            accessibilityRole="button"
                            accessibilityLabel={t(item.key)}
                            accessibilityState={{ selected: country === item.value }}
                        >
                            <Text style={styles.radioText}>{t(item.key)}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, rtlText]}>{t('onboarding.step3.firstPregnancyLabel')}</Text>
                <View style={styles.radioGroup}>
                    <TouchableOpacity
                        style={[styles.radioOption, isFirstPregnancy === true && styles.radioOptionSelected]}
                        onPress={() => setIsFirstPregnancy(true)}
                        accessibilityRole="button"
                        accessibilityLabel={t('onboarding.step3.firstPregnancyYes')}
                        accessibilityState={{ selected: isFirstPregnancy === true }}
                    >
                        <Text style={[styles.radioText, rtlText]}>{t('onboarding.step3.firstPregnancyYes')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.radioOption, isFirstPregnancy === false && styles.radioOptionSelected]}
                        onPress={() => setIsFirstPregnancy(false)}
                        accessibilityRole="button"
                        accessibilityLabel={t('onboarding.step3.firstPregnancyNo')}
                        accessibilityState={{ selected: isFirstPregnancy === false }}
                    >
                        <Text style={[styles.radioText, rtlText]}>{t('onboarding.step3.firstPregnancyNo')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.radioOption, isFirstPregnancy === null && styles.radioOptionSelected]}
                        onPress={() => setIsFirstPregnancy(null)}
                        accessibilityRole="button"
                        accessibilityLabel={t('onboarding.step3.firstPregnancySkip')}
                        accessibilityState={{ selected: isFirstPregnancy === null }}
                    >
                        <Text style={[styles.radioText, rtlText]}>{t('onboarding.step3.firstPregnancySkip')}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.navButtons}>
                <TouchableOpacity onPress={prevStep} style={styles.backButton}>
                    <Text style={styles.backButtonText}>{t('common.back')}</Text>
                </TouchableOpacity>
                <Button title={t('common.continue')} onPress={nextStep} style={styles.continueButton} />
            </View>
        </ScrollView>
    );

    // STEP 4: Final Screen with Account Option ✨
    const renderStep4 = () => {
        // C14-FIX: aligned with C9 password policy (10 chars + 1 digit + 1 uppercase).
        // Was 8 chars only — accepted accounts that the post-C9 validatePassword rejects.
        const canCreateAccount =
            email.trim().length > 0 &&
            password.length >= 10 &&
            /\d/.test(password) &&
            /[A-Z]/.test(password);

        return (
            <LinearGradient
                colors={[theme.colors.surfacePinkWash, theme.colors.background, theme.colors.white]}
                style={styles.finalContainer}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.finalScrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.finalContent}>
                        <Text style={styles.finalEmoji}>{weekComparison.emoji}</Text>

                        <Text style={styles.finalGreeting}>
                            {firstName ? `${firstName},` : t('onboarding.step4.defaultName') + ','}
                        </Text>

                        <Text style={styles.finalWeekLabel}>{t('onboarding.step4.youAreAt')}</Text>

                        <View style={styles.weekBadge}>
                            <Text style={styles.weekNumber}>{t('onboarding.step4.weekCaps')} {pregnancyInfo.week}</Text>
                            <Text style={styles.dayNumber}>{t('onboarding.step4.dayCaps')} {pregnancyInfo.day}</Text>
                        </View>

                        <Text style={styles.comparisonText}>
                            {t('onboarding.step4.babySize', { label: t(`onboarding.comparisons.${weekComparison.label}`), emoji: weekComparison.emoji })}
                        </Text>

                        <View style={styles.divider} />

                        {/* Account Creation Section - Only if not already authenticated */}
                        {!user && (
                            <View style={styles.accountSection}>
                                <Text style={styles.accountTitle}>{t('onboarding.step4.createAccountTitle')}</Text>
                                <Text style={styles.accountSubtitle}>
                                    {t('onboarding.step4.createAccountSubtitle')}
                                </Text>

                                <TextInput
                                    style={styles.accountInput}
                                    placeholder={t('onboarding.step4.emailPlaceholder')}
                                    placeholderTextColor={theme.colors.neutral400}
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    accessibilityLabel={t('email')}
                                    textContentType="emailAddress"
                                    autoComplete="email"
                                    inputMode="email"
                                    testID="onboarding_step4_email"
                                />
                                <TextInput
                                    style={styles.accountInput}
                                    placeholder={t('onboarding.step4.passwordPlaceholder')}
                                    placeholderTextColor={theme.colors.neutral400}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                    accessibilityLabel={t('password')}
                                    textContentType="newPassword"
                                    autoComplete="new-password"
                                    autoCapitalize="none"
                                    testID="onboarding_step4_password"
                                />
                            </View>
                        )}

                        {error ? <ErrorMessage message={error} /> : null}

                        {/* Create account button - REQUIRED */}
                        {/* U-FIX-10: align button gating with the actual policy
                            (8 chars + 1 digit) to match RegisterScreen and validatePassword.
                            Was 6 chars only — created accounts that the prod policy rejects. */}
                        {/* P0-6 FIX (E2E audit 2026-05-08): explicit accessibilityRole
                            so the button is announced/focused by AT and matched as
                            role=button by web a11y tree (TouchableOpacity does not
                            propagate the role automatically on RNWeb). */}
                        <TouchableOpacity
                            style={styles.startButton}
                            onPress={() => handleFinish(!!(!user && canCreateAccount))}
                            disabled={loading || (!user && !canCreateAccount)}
                            accessibilityRole="button"
                            accessibilityLabel={
                                loading
                                    ? t('onboarding.step4.creatingAccount')
                                    : user
                                        ? t('onboarding.step4.finalizeProfile')
                                        : t('onboarding.step4.start')
                            }
                            accessibilityState={{ disabled: loading || (!user && !canCreateAccount), busy: loading }}
                            testID="onboarding_step4_submit"
                        >
                            <LinearGradient
                                colors={loading || (!user && !canCreateAccount)
                                    ? [theme.colors.neutral300, theme.colors.gray500]
                                    : [theme.colors.primary, theme.colors.accent]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.startButtonGradient}
                            >
                                <Text style={styles.startButtonText}>
                                    {loading
                                        ? t('onboarding.step4.creatingAccount')
                                        : user
                                            ? t('onboarding.step4.finalizeProfile')
                                            : t('onboarding.step4.start')}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.skipAccountButton, loading && styles.startButtonDisabled]}
                            onPress={() => handleFinish(false)}
                            disabled={loading}
                            accessibilityRole="button"
                            accessibilityLabel={t('onboarding.step4.skipAccount')}
                            accessibilityState={{ disabled: loading }}
                            testID="onboarding_step4_skip"
                        >
                            <Text style={styles.skipAccountText}>{t('onboarding.step4.skipAccount')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={prevStep}
                            style={[styles.backButtonFinal, loading && styles.startButtonDisabled]}
                            disabled={loading}
                            accessibilityRole="button"
                            accessibilityLabel={t('onboarding.step4.editInfos')}
                            accessibilityState={{ disabled: loading }}
                            testID="onboarding_step4_back"
                        >
                            <Text style={styles.backButtonText}>{t('onboarding.step4.editInfos')}</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </LinearGradient>
        );
    };

    // ==========================================
    // TTC (Trying to Conceive) FLOW STEPS
    // ==========================================

    // STEP 2 for TTC: Cycle Information
    const renderStep2TTC = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepEmoji}>💕</Text>
            <Text style={styles.stepTitle}>{t('onboarding.step2Ttc.title')}</Text>
            <Text style={styles.stepSubtitle}>{t('onboarding.step2Ttc.subtitle')}</Text>

            <View style={styles.dateSection}>
                <Text style={styles.dateLabel}>{t('onboarding.step2Ttc.lastPeriodLabel')}</Text>

                {Platform.OS === 'web' ? (
                    <input
                        type="date"
                        value={lastPeriodDate.toISOString().split('T')[0]}
                        onChange={(e) => {
                            const newDate = new Date(e.target.value);
                            if (!isNaN(newDate.getTime())) setLastPeriodDate(newDate);
                        }}
                        max={new Date().toISOString().split('T')[0]}
                        style={{
                            width: '100%',
                            padding: 16,
                            fontSize: 18,
                            borderRadius: 12,
                            border: `2px solid ${theme.colors.pinkLightPastel}`,
                            backgroundColor: theme.colors.white,
                            textAlign: 'center',
                        }}
                    />
                ) : (
                    <>
                        <TouchableOpacity onPress={() => setShowCycleDatePicker(true)} style={styles.dateInput}>
                            <Text style={styles.dateText}>
                                {format(lastPeriodDate, 'd MMMM yyyy', { locale: dateLocale })}
                            </Text>
                        </TouchableOpacity>
                        {/* Android Picker inline (launches native dialogue) */}
                        {Platform.OS === 'android' && showCycleDatePicker && (
                            <DateTimePicker
                                value={lastPeriodDate}
                                mode="date"
                                display="default"
                                onChange={(event, date) => {
                                    setShowCycleDatePicker(false);
                                    if (date) setLastPeriodDate(date);
                                }}
                                maximumDate={new Date()}
                                locale={getPickerLocale(i18n.language)}
                            />
                        )}
                    </>
                )}
            </View>

            <View style={[styles.inputGroup, { marginTop: 24 }]}>
                <Text style={styles.inputLabel}>{t('onboarding.step2Ttc.cycleLengthLabel')}</Text>
                <View style={styles.cycleLengthContainer}>
                    <TouchableOpacity
                        style={styles.cycleButton}
                        onPress={() => setCycleLength(Math.max(21, cycleLength - 1))}
                    >
                        <Text style={styles.cycleButtonText}>−</Text>
                    </TouchableOpacity>
                    <View style={styles.cycleLengthDisplay}>
                        <Text style={styles.cycleLengthNumber}>{cycleLength}</Text>
                        <Text style={styles.cycleLengthLabel}>{t('onboarding.step2Ttc.days')}</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.cycleButton}
                        onPress={() => setCycleLength(Math.min(35, cycleLength + 1))}
                    >
                        <Text style={styles.cycleButtonText}>+</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.navButtons}>
                <TouchableOpacity onPress={prevStep} style={styles.backButton}>
                    <Text style={styles.backButtonText}>{t('common.back')}</Text>
                </TouchableOpacity>
                <Button title={t('common.continue')} onPress={nextStep} style={styles.continueButton} />
            </View>
        </View>
    );

    // STEP 3 (Final) for TTC: Welcome Screen
    const renderStep3TTC = () => {
        const ovulationDay = cycleLength - 14;
        const ovulationDate = new Date(lastPeriodDate);
        ovulationDate.setDate(ovulationDate.getDate() + ovulationDay);

        return (
            <LinearGradient
                colors={[theme.colors.surfacePinkWash, theme.colors.background, theme.colors.white]}
                style={styles.finalContainer}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.finalScrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.finalContent}>
                        <Text style={styles.finalEmoji}>💕</Text>

                        <Text style={styles.finalGreeting}>
                            {firstName ? `${firstName},` : t('onboarding.step4.defaultName') + ','}
                        </Text>

                        <Text style={styles.finalWeekLabel}>{t('onboarding.step3Ttc.welcome')}</Text>

                        <View style={styles.ttcInfoBox}>
                            <Text style={styles.ttcInfoTitle}>{t('onboarding.step3Ttc.fertileWindowLabel')}</Text>
                            <Text style={styles.ttcInfoDate}>
                                {t('onboarding.step3Ttc.around')} {format(ovulationDate, 'd MMMM', { locale: dateLocale })}
                            </Text>
                            <Text style={styles.ttcInfoNote}>
                                {t('onboarding.step3Ttc.cycleDayNote', { day: ovulationDay })}
                            </Text>
                        </View>

                        <Text style={styles.ttcMessage}>
                            {t('onboarding.step3Ttc.supportMessage')}
                        </Text>

                        <View style={styles.divider} />

                        <View style={styles.accountSection}>
                            <Text style={styles.accountTitle}>{t('onboarding.step3Ttc.createAccountTitle')}</Text>
                            <Text style={styles.accountSubtitle}>
                                {t('onboarding.step3Ttc.createAccountSubtitle')}
                            </Text>

                            <TextInput
                                style={styles.accountInput}
                                placeholder={t('onboarding.step4.emailPlaceholder')}
                                placeholderTextColor={theme.colors.neutral400}
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <TextInput
                                style={styles.accountInput}
                                placeholder={t('onboarding.step4.passwordPlaceholder')}
                                placeholderTextColor={theme.colors.neutral400}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                            />
                        </View>

                        {error ? <ErrorMessage message={error} /> : null}

                        {/* C14-FIX: enforce 10 chars + 1 digit + 1 uppercase (post-C9 policy, same as RegisterScreen + handleFinish step 4) */}
                        {/* TTC-FIX: previously called handleFinish (the pregnancy handler), which
                            (a) used `selectedDate` (today) instead of the user's lastPeriodDate, and
                            (b) created a real pregnancy profile. Now wired to handleFinishTTC. */}
                        <TouchableOpacity
                            style={styles.startButton}
                            onPress={() => handleFinishTTC(true)}
                            disabled={loading || !(email.trim().length > 0 && password.length >= 10 && /\d/.test(password) && /[A-Z]/.test(password))}
                        >
                            <LinearGradient
                                colors={loading || !(email.trim().length > 0 && password.length >= 10 && /\d/.test(password) && /[A-Z]/.test(password))
                                    ? [theme.colors.neutral300, theme.colors.gray500]
                                    : [theme.colors.primary, theme.colors.accent]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.startButtonGradient}
                            >
                                <Text style={styles.startButtonText}>
                                    {loading ? t('onboarding.step4.creatingAccount') : t('onboarding.step3Ttc.start')}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.skipAccountButton}
                            onPress={() => handleFinishTTC(false)}
                        >
                            <Text style={styles.skipAccountText}>{t('onboarding.step4.skipAccount')}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={prevStep} style={styles.backButtonFinal}>
                            <Text style={styles.backButtonText}>{t('onboarding.step4.editInfos')}</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </LinearGradient>
        );
    };

    // ==========================================
    // CURIOUS FLOW STEPS
    // ==========================================

    // STEP 2 for Curious: Explore Week Selection
    const renderStep2Curious = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepEmoji}>👀</Text>
            <Text style={styles.stepTitle}>{t('onboarding.step2Curious.title')}</Text>
            <Text style={styles.stepSubtitle}>{t('onboarding.step2Curious.subtitle')}</Text>

            <View style={styles.exploreSection}>
                <Text style={styles.exploreSemaine}>{t('onboarding.step2.week')} {exploreWeek}</Text>
                <Text style={styles.exploreComparison}>
                    {t('onboarding.step2Curious.sizeComparison', {
                        emoji: WEEK_COMPARISONS[exploreWeek]?.emoji,
                        label: t(`onboarding.comparisons.${WEEK_COMPARISONS[exploreWeek]?.label}`)
                    })}
                </Text>

                <View style={styles.sliderContainer}>
                    <TouchableOpacity
                        style={styles.sliderButton}
                        onPress={() => setExploreWeek(Math.max(1, exploreWeek - 1))}
                    >
                        <Text style={styles.sliderButtonText}>−</Text>
                    </TouchableOpacity>

                    <View style={styles.sliderTrack}>
                        <View style={[styles.sliderFill, { width: `${(exploreWeek / 40) * 100}%` }]} />
                    </View>

                    <TouchableOpacity
                        style={styles.sliderButton}
                        onPress={() => setExploreWeek(Math.min(40, exploreWeek + 1))}
                    >
                        <Text style={styles.sliderButtonText}>+</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.trimesterLabels}>
                    <Text style={styles.trimesterLabel}>{t('onboarding.trimester1')}</Text>
                    <Text style={styles.trimesterLabel}>{t('onboarding.trimester2')}</Text>
                    <Text style={styles.trimesterLabel}>{t('onboarding.trimester3')}</Text>
                </View>
            </View>

            <View style={styles.navButtons}>
                <TouchableOpacity onPress={prevStep} style={styles.backButton}>
                    <Text style={styles.backButtonText}>{t('common.back')}</Text>
                </TouchableOpacity>
                <Button title={t('onboarding.discover')} onPress={nextStep} style={styles.continueButton} />
            </View>
        </View>
    );

    // STEP 3 (Final) for Curious: Welcome Screen
    const renderStep3Curious = () => (
        <LinearGradient
            colors={[theme.colors.surfacePinkWash, theme.colors.background, theme.colors.white]}
            style={styles.finalContainer}
        >
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.finalScrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.finalContent}>
                    <Text style={styles.finalEmoji}>👀</Text>

                    <Text style={styles.finalGreeting}>
                        {t('onboarding.discoverWelcome')}
                    </Text>

                    <Text style={styles.finalWeekLabel}>{t('onboarding.youExplore')}</Text>

                    <View style={styles.weekBadge}>
                        <Text style={styles.weekNumber}>{t('onboarding.step4.weekCaps')} {exploreWeek}</Text>
                    </View>

                    <Text style={styles.comparisonText}>
                        {t('onboarding.babySize', {
                            emoji: WEEK_COMPARISONS[exploreWeek]?.emoji,
                            label: t(`onboarding.comparisons.${WEEK_COMPARISONS[exploreWeek]?.label}`)
                        })}
                    </Text>

                    <View style={styles.curiousInfoBox}>
                        <Text style={styles.curiousInfoText}>
                            {t('onboarding.discoverInfo')}
                        </Text>
                    </View>

                    <View style={styles.divider} />

                    {error ? <ErrorMessage message={error} /> : null}

                    <TouchableOpacity
                        style={styles.startButton}
                        onPress={() => handleFinishCurious()}
                        disabled={loading}
                    >
                        <LinearGradient
                            colors={loading ? [theme.colors.neutral300, theme.colors.gray500] : [theme.colors.primary, theme.colors.accent]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.startButtonGradient}
                        >
                            <Text style={styles.startButtonText}>
                                {loading ? t('home.loadingData') : t('onboarding.discover')}
                            </Text>
                        </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={prevStep} style={styles.backButtonFinal}>
                        <Text style={styles.backButtonText}>{t('onboarding.changeWeek')}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </LinearGradient>
    );

    // ==========================================
    // FINISH HANDLERS FOR DIFFERENT FLOWS
    // ==========================================

    // TTC-FIX: previously this handler stored a fake LMP (today − 7 days) and ignored
    // both `lastPeriodDate` and `cycleLength`. Result: TTC users were silently treated
    // as week 1 of a pregnancy, which is medically wrong and dangerous (ghost pregnancy
    // dashboard, fake DPA, fake baby evolution). Two structural bugs fixed here:
    //   1. Use the REAL `lastPeriodDate` the user entered as the cycle start.
    //   2. Mark the profile with `isTTC: true` so currentWeek is forced to 0 and
    //      downstream UI can branch on the flag.
    // We also persist a standalone `ttcProfile` snapshot in AsyncStorage so the dedicated
    // TTC home (Strategy B) can hydrate from local storage without re-asking the user.
    //
    // TODO (Strategy B — product-coherent): replace the boolean `isTTC` with a real
    // `mode: 'pregnant' | 'ttc' | 'curious'` discriminated union on UserProfile,
    // build a TTC-specific home that shows "Cycle day X" + "Estimated fertile window
    // around <date>" instead of the pregnancy week badge, and add a one-tap conversion
    // path "I'm pregnant!" that promotes the TTC profile to a full pregnancy profile
    // by reusing the stored lastPeriodDate as the LMP.
    const handleFinishTTC = async (createAccount: boolean = false) => {
        setError('');

        // C14-FIX: same validateProfile gate as handleFinish (was missing, F18 partial gap).
        // For TTC the LMP is the user's lastPeriodDate (used to compute the fertility window).
        const ttcValidation = validateProfile({
            firstName: firstName.trim() || t('onboarding.step4.defaultName'),
            lmp: lastPeriodDate,
        });
        if (!ttcValidation.valid) {
            const message = ttcValidation.error ? t(ttcValidation.error) : t('common.unknownError');
            showAlert(t('common.error'), message);
            return;
        }

        log.debug('[Onboarding] 🎯 handleFinishTTC called', { createAccount });

        await withLoading(async () => {
            try {
                let authenticatedUser = null;

                if (createAccount && email && password) {
                    try {
                        authenticatedUser = await retryOperation(
                            () => register(email.trim(), password),
                            { maxRetries: 1, initialDelay: 500 }
                        );
                    } catch (regError: any) {
                        if (regError.code === 'auth/email-already-in-use') {
                            log.warn('[Onboarding] ⚠️ TTC Email already in use, recovering...');
                            await login(email.trim(), password);
                            authenticatedUser = auth.currentUser;
                        } else {
                            throw regError;
                        }
                    }
                }

                // TTC-FIX: compute the fertility window from the REAL last period date,
                // then persist a standalone snapshot in AsyncStorage so that the future
                // dedicated TTC home (Strategy B) can hydrate without re-prompting.
                const fertility = calculateFertileWindow(lastPeriodDate, cycleLength);
                const ttcProfile = {
                    firstName: firstName.trim() || t('onboarding.step4.defaultName'),
                    country,
                    ageRange: ageRange || null,
                    lastPeriodDate: lastPeriodDate.toISOString(),
                    cycleLength,
                    ovulationDate: fertility.ovulationDate.toISOString(),
                    fertileWindowStart: fertility.fertileWindowStart.toISOString(),
                    fertileWindowEnd: fertility.fertileWindowEnd.toISOString(),
                    createdAt: new Date().toISOString(),
                };
                try {
                    await AsyncStorage.setItem('ttcProfile', JSON.stringify(ttcProfile));
                    log.debug('[Onboarding] 💾 TTC profile snapshot saved to AsyncStorage');
                } catch (storageError) {
                    log.warn('[Onboarding] ⚠️ Failed to persist ttcProfile snapshot (non-blocking):', storageError);
                }

                log.warn(
                    '[Onboarding] ⚠️ TTC user created with isTTC=true. ' +
                    'A dedicated TTC home screen is NOT YET implemented — current MainTabs ' +
                    'will render pregnancy-style content with currentWeek=0 until Strategy B ships.'
                );

                // TTC-FIX: pass the REAL lastPeriodDate (NOT a fake today − 7) and signal
                // TTC mode so AuthContext stores currentWeek=0, isTTC=true, cycleLength,
                // and the precomputed fertility window — instead of a ghost pregnancy.
                await retryOperation(() => loginAsGuest(
                    firstName.trim() || t('onboarding.step4.defaultName'),
                    lastPeriodDate,
                    country,
                    undefined,
                    undefined,
                    ageRange || undefined,
                    undefined,
                    authenticatedUser ?? undefined,
                    { isTTC: true, cycleLength },
                ));

                analytics.then(a => a && logEvent(a, 'onboarding_ttc_complete', {
                    cycle_length: cycleLength,
                    country,
                    has_account: createAccount,
                }));

            } catch (err: any) {
                log.error('[Onboarding] ❌ Error during TTC profile creation:', err);
                setError(t(getFirebaseErrorMessage(err)));
            }
        });
    };

    const handleFinishCurious = async () => {
        setError('');

        // C14-FIX: validate the explore-week derived LMP before going further (F18 partial gap).
        // Curious mode uses a synthetic LMP (today − (exploreWeek-1) weeks); name comes from i18n default.
        const today = new Date();
        const fakeLmpForValidation = new Date(today);
        fakeLmpForValidation.setDate(today.getDate() - (exploreWeek - 1) * 7);
        const curiousValidation = validateProfile({
            firstName: t('onboarding.curiousDefaultName'),
            lmp: fakeLmpForValidation,
        });
        if (!curiousValidation.valid) {
            const message = curiousValidation.error ? t(curiousValidation.error) : t('common.unknownError');
            showAlert(t('common.error'), message);
            return;
        }

        log.debug('[Onboarding] 🎯 handleFinishCurious called');

        await withLoading(async () => {
            try {
                // For curious mode, we set a fake LMP to get the explore week
                const today = new Date();
                const fakeLmp = new Date(today);
                fakeLmp.setDate(today.getDate() - (exploreWeek - 1) * 7); // Set LMP to get desired explore week

                await retryOperation(() => loginAsGuest(
                    t('onboarding.curiousDefaultName'),
                    fakeLmp,
                    country,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    // Cycle 3 F201 : passe le marker isCurious + exploreWeek pour
                    // que les screens puissent garder ce mode (cf. F212 banner Wave C).
                    { isCurious: true, exploreWeek }
                ));

                analytics.then(a => a && logEvent(a, 'onboarding_curious_complete', {
                    explore_week: exploreWeek,
                    country,
                }));

            } catch (err: any) {
                log.error('[Onboarding] ❌ Error during Curious profile creation:', err);
                setError(t(getFirebaseErrorMessage(err)));
            }
        });
    };
    // Determine which step to render based on status and step number
    const renderCurrentStep = () => {
        // Step 1 is always the same (status selection)
        if (step === 1) return renderStep1();

        // Step 2 and beyond depend on the status
        switch (pregnancyStatus) {
            case 'pregnant':
                if (step === 2) return renderStep2();
                if (step === 3) return renderStep3();
                if (step === 4) return renderStep4();
                break;
            case 'trying':
                if (step === 2) return renderStep2TTC();
                if (step === 3) return renderStep3TTC();
                break;
            case 'curious':
                if (step === 2) return renderStep2Curious();
                if (step === 3) return renderStep3Curious();
                break;
            default:
                return renderStep1();
        }
        return null;
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {step < getStepCount(pregnancyStatus) && renderProgressBar()}

                <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>
                    {renderCurrentStep()}
                </Animated.View>
            </ScrollView>

            {/* iOS Overlays for Date Pickers */}
            {Platform.OS === 'ios' && showDatePicker && (
                <View style={styles.iosPickerOverlay}>
                    <View style={styles.iosPickerContent}>
                        <View style={styles.iosPickerHeader}>
                            <Text style={styles.iosPickerTitle}>
                                {dateMethod === 'ddr'
                                    ? t('onboarding.step2.labelDdr')
                                    : t('onboarding.step2.labelConception')}
                            </Text>
                            <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                <Text style={styles.iosPickerDoneText}>{t('common.done')}</Text>
                            </TouchableOpacity>
                        </View>
                        <DateTimePicker
                            value={selectedDate}
                            mode="date"
                            display="spinner"
                            onChange={handleDateChange}
                            maximumDate={new Date()}
                            locale={getPickerLocale(i18n.language)}
                            style={{ flex: 1 }}
                        />
                    </View>
                </View>
            )}

            {Platform.OS === 'ios' && showCycleDatePicker && (
                <View style={styles.iosPickerOverlay}>
                    <View style={styles.iosPickerContent}>
                        <View style={styles.iosPickerHeader}>
                            <Text style={styles.iosPickerTitle}>{t('onboarding.step2Ttc.lastPeriodLabel')}</Text>
                            <TouchableOpacity onPress={() => setShowCycleDatePicker(false)}>
                                <Text style={styles.iosPickerDoneText}>{t('common.done')}</Text>
                            </TouchableOpacity>
                        </View>
                        <DateTimePicker
                            value={lastPeriodDate}
                            mode="date"
                            display="spinner"
                            onChange={(event, date) => {
                                if (date) setLastPeriodDate(date);
                            }}
                            maximumDate={new Date()}
                            locale={getPickerLocale(i18n.language)}
                            style={{ flex: 1 }}
                        />
                    </View>
                </View>
            )}
        </KeyboardAvoidingView>
    );
};

