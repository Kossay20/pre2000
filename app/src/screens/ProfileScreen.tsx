import { createLogger } from '../utils/logger';
const log = createLogger('ProfileScreen');
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { showAlert } from '../utils/alert';
import { confirmAction } from '../utils/uiUtils';
import { useAuth } from '../context/AuthContext';
import { usePregnancy } from '../context/PregnancyContext';
import { useCurrentWeek } from '../services/useCurrentWeek';
import { theme } from '../theme';
import { styles } from './ProfileScreen.styles';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation } from '@react-navigation/native';
import { addDays, format } from 'date-fns';
import { useDateLocale } from '../hooks/useDateLocale';
import { LanguageSelector } from '../components/common/LanguageSelector';
import { RtlAwareChevron } from '../components/common/RtlAwareChevron';
import { Button } from '../components/common/Button';
import { useRtl } from '../hooks/useRtl';
import { useTranslation } from 'react-i18next';
import { COUNTRY_OPTIONS } from '../utils/clinicalChecks';
import { EmergencyContactsSection } from '../components/profile/EmergencyContactsSection';
import { openSupportEmail } from '../services/supportService';
import { getPickerLocale } from '../utils/pickerLocale';
import { calculatePregnancyWeek, calculateCurrentWeek } from '../utils/pregnancyCalculator';

import { LineChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { useAccountDeletion } from '../hooks/useAccountDeletion';
import { validateProfile } from '../utils/validation';
import { changedFormFields } from '../context/profileSync';

// Same physical bounds WeightTrackerScreen enforces (see its handleSetup), so the
// two screens cannot disagree about what a plausible height/weight is.
const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 200;

export const ProfileScreen = () => {
    useScreenAnalytics('ProfileScreen');
    const { user, firebaseUser, logout, updateProfile } = useAuth();
    const { requestDeleteAccount, requestResetProfile, busy: deletionBusy, reauthModal } = useAccountDeletion();
    const { profile, setProfile } = usePregnancy();
    const { currentWeekNumber } = useCurrentWeek();
    const navigation = useNavigation();
    const { t, i18n } = useTranslation();
    const { isRTL } = useRtl();
    const [loading, setLoading] = useState(false);

    // Get date locale using shared hook (handles all languages including tn → arTN)
    const dateLocale = useDateLocale();

    const [firstName, setFirstName] = useState(profile?.firstName || '');
    const [lastName, setLastName] = useState(profile?.lastName || '');
    // Never default to a country: it picks the emergency number the app dials, and
    // a default here would be written back on the next save.
    const [country, setCountry] = useState(profile?.country || '');
    const [lmp, setLmp] = useState(
        profile?.lmp ? new Date(profile.lmp) : new Date()
    );
    const [showDatePicker, setShowDatePicker] = useState(false);
    // PROFILE-FIX: Physical data for BMI + weight gain tracking
    const [height, setHeight] = useState(
        profile?.height ? String(profile.height) : ''
    );
    const [prePregnancyWeight, setPrePregnancyWeight] = useState(
        profile?.prePregnancyWeight ? String(profile.prePregnancyWeight) : ''
    );

    // Update local state when the stored profile changes — only the fields that changed.
    // Adding an emergency contact publishes a new profile object with the same name, and
    // re-syncing every field on that wiped whatever she had typed and not saved yet.
    const syncedProfileRef = useRef(profile);
    useEffect(() => {
        if (!profile) return;
        const changed = changedFormFields(syncedProfileRef.current, profile);
        syncedProfileRef.current = profile;
        if (changed.includes('firstName')) setFirstName(profile.firstName || '');
        if (changed.includes('lastName')) setLastName(profile.lastName || '');
        if (changed.includes('country')) setCountry(profile.country || '');
        if (changed.includes('lmp') && profile.lmp) setLmp(new Date(profile.lmp));
        // PROFILE-FIX: Sync physical fields from profile
        if (changed.includes('height') && profile.height) setHeight(String(profile.height));
        if (changed.includes('prePregnancyWeight') && profile.prePregnancyWeight) {
            setPrePregnancyWeight(String(profile.prePregnancyWeight));
        }
    }, [profile]);

    // Calculate DPA (Due Date) = LMP + 280 days
    const calculateDPA = (lmpDate: Date): Date => {
        return addDays(lmpDate, 280);
    };

    const dpa = calculateDPA(lmp);

    const handleSave = async () => {
        // VALIDATION FIX: this screen only checked "firstName is non-empty".
        // validateProfile — which caps both names at 50 chars and rejects a future
        // LMP — was imported nowhere but OnboardingScreen, so the edit path bypassed
        // it entirely and wrote unbounded values straight to Firestore.
        const profileValidation = validateProfile({
            firstName,
            lastName,
            lmp,
        });
        if (!profileValidation.valid) {
            showAlert(t('common.error'), t(profileValidation.error || 'profile.errorFirstName'));
            return;
        }

        // Height/weight were bounded only by maxLength (3 and 5 chars), so 999 cm and
        // 99999 kg persisted and then fed the BMI and weight-gain calculations.
        // WeightTracker already gates the same two fields at 100-250 cm / 30-200 kg;
        // apply the identical range here so one screen cannot poison the other.
        if (height.trim()) {
            const h = parseFloat(height);
            if (!isFinite(h) || h < MIN_HEIGHT_CM || h > MAX_HEIGHT_CM) {
                showAlert(t('common.error'), t('profile.errorHeightRange', { min: MIN_HEIGHT_CM, max: MAX_HEIGHT_CM }));
                return;
            }
        }
        if (prePregnancyWeight.trim()) {
            const w = parseFloat(prePregnancyWeight);
            if (!isFinite(w) || w < MIN_WEIGHT_KG || w > MAX_WEIGHT_KG) {
                showAlert(t('common.error'), t('profile.errorWeightRange', { min: MIN_WEIGHT_KG, max: MAX_WEIGHT_KG }));
                return;
            }
        }

        const { isInvalid } = calculatePregnancyWeek(lmp);
        if (isInvalid) {
            showAlert(
                t('common.error'),
                t('profile.errorInvalidDate')
            );
            return;
        }

        setLoading(true);
        try {
            const heightNum = parseFloat(height);
            const weightNum = parseFloat(prePregnancyWeight);

            const profilePayload = {
                firstName: firstName.trim(),
                lastName: lastName.trim() || undefined,
                country,
                lmp: lmp.toISOString(),
                dpa: dpa.toISOString(),
                // F-PROF-01 FIX: include physical data so the guest 'guestProfile'
                // AsyncStorage write (PregnancyContext.setProfile) persists height &
                // prePregnancyWeight. Without these, guest BMI/weight-gain break and
                // the WeightTracker setup gate re-triggers after reload.
                ...(isFinite(heightNum) && heightNum > 0 ? { height: heightNum } : {}),
                ...(isFinite(weightNum) && weightNum > 0 ? { prePregnancyWeight: weightNum } : {}),
            };

            // 1. AuthContext + Firestore first (single write). An emptied last name goes out
            // as `undefined`, which updateProfile clears on the server. Its result decides
            // what she is told: "Succès" only when the account really holds the edit.
            const result = await updateProfile({
                firstName: firstName.trim(),
                lastName: lastName.trim() || undefined,
                country,
                pregnancyStartDate: lmp.toISOString(),
                lmp: lmp.toISOString(),
                dpa: dpa.toISOString(),
                currentWeek: calculateCurrentWeek(lmp),
                // PROFILE-FIX: Persist physical data for BMI and weight gain calculations
                ...(isFinite(heightNum) && heightNum > 0 ? { height: heightNum } : {}),
                ...(isFinite(weightNum) && weightNum > 0 ? { prePregnancyWeight: weightNum } : {}),
            });
            if (!result.ok) {
                log.warn('Profile not saved:', result.error);
                showAlert(t('common.error'), t('profile.errorUpdate'));
                return;
            }

            // 2. A guest's device-only copy ('guestProfile', read by WeightTracker). For an
            // account PregnancyContext re-derives the profile from the updated user.
            if (!user || user.isGuest) {
                await setProfile({ ...profilePayload, emergencyContacts: profile?.emergencyContacts });
            }

            showAlert(t('common.success'), t('profile.successUpdate'));
        } catch (error) {
            showAlert(t('common.error'), t('profile.errorUpdate'));
            log.error('Error updating profile:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        confirmAction(
            t('profile.logoutConfirmTitle'),
            t('profile.logoutConfirmMsg'),
            async () => {
                try {
                    await logout();
                } catch (error) {
                    log.error('Logout error:', error);
                }
            },
            undefined,
            t('common.cancel'),
            t('profile.logout')
        );
    };

    const COUNTRIES = COUNTRY_OPTIONS.map((key) => ({ key, label: t(`common.countries.${key}`) }));

    const renderCountrySelector = () => {
        return (
            <View style={styles.countrySelector}>
                {COUNTRIES.map((c) => (
                    <TouchableOpacity
                        key={c.key}
                        style={[
                            styles.countryButton,
                            country === c.key && styles.countryButtonSelected,
                        ]}
                        onPress={() => setCountry(c.key)}
                        accessibilityRole="button"
                        accessibilityLabel={c.label}
                        accessibilityState={{ selected: country === c.key }}
                        {...(Platform.OS === 'web' ? { 'aria-selected': country === c.key } : {})}
                    >
                        <Text
                            style={[
                                styles.countryButtonText,
                                country === c.key && styles.countryButtonTextSelected,
                            ]}
                        >
                            {c.label}
                        </Text>
                    </TouchableOpacity>
                ))
                }
            </View >
        );
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView style={styles.container}>
                {/* Header with Gradient */}
                <LinearGradient
                    colors={[theme.colors.primaryStrong, theme.colors.accent]}
                    style={styles.header}
                >
                    <View style={styles.profileCircle}>
                        <Text style={styles.profileLetter}>
                            {(typeof firstName === 'string' && firstName.length > 0) ? firstName.charAt(0).toUpperCase() : 'U'}
                        </Text>
                    </View>
                    <Text style={styles.headerTitle}>{firstName || t('profile.title')} {lastName}</Text>
                    <Text style={[styles.headerSubtitle, { fontWeight: 'bold' }]}>
                        {t('common.week')} {currentWeekNumber || '—'}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        {/* GUEST-LABEL FIX: this read only the Firestore profile's `email`
                            field. A profile document written without that field — which is
                            what the guest-upgrade and cold-start bootstrap paths produce —
                            made a fully registered, signed-in user read "Utilisateur invité"
                            under their own name. Firebase auth always knows the address, so
                            fall back to it before calling anyone a guest. */}
                        {user?.email || firebaseUser?.email || t('profile.guestUser')}
                    </Text>
                    {user?.isGuest && (
                        <Button
                            title={t('common.screen.createAccount', 'Créer un compte')}
                            variant="primary"
                            size="small"
                            onPress={() => navigation.navigate('GuestUpgrade' as never)}
                            style={{ marginTop: 16, alignSelf: 'center' }}
                            accessibilityHint={t('a11y.openItem')}
                            {...(Platform.OS === 'web' ? { dir: isRTL ? 'rtl' : 'ltr' } : {})}
                        />
                    )}
                </LinearGradient>

                <View style={styles.content}>

                    {/* Section 1: Mon Compte (Inline Edit) */}
                    <Text style={styles.sectionTitle}>{t('profile.personalInfo')}</Text>
                    <View style={styles.card}>
                        <View style={styles.form}>
                            {/* UNBOUNDED-INPUT FIX: these two had no maxLength (unlike
                                height/weight below), and handleSave only checks that
                                firstName is non-empty — validateProfile, which caps both
                                at 50 chars, is never called on this edit path. A pasted
                                megabyte was persisted to Firestore, mirrored to
                                AsyncStorage, re-read on every cold start and rendered
                                untruncated in the header. Bounded here and in
                                firestore.rules, matching validation.ts:182-188. */}
                            <Text style={styles.label}>{t('common.firstName')} *</Text>
                            <TextInput
                                style={styles.input}
                                value={firstName}
                                onChangeText={setFirstName}
                                placeholder={t('common.enterFirstName')}
                                maxLength={50}
                                accessibilityLabel={t('common.firstName')}
                            />

                            <Text style={styles.label}>{t('common.lastName')}</Text>
                            <TextInput
                                style={styles.input}
                                value={lastName}
                                onChangeText={setLastName}
                                placeholder={t('common.enterLastName')}
                                maxLength={50}
                                accessibilityLabel={t('common.lastName')}
                            />

                            <Text style={styles.label}>{t('common.country')}</Text>
                            {renderCountrySelector()}

                            {/* PROFILE-FIX: Physical data section */}
                            <View style={styles.physicalRow}>
                                <View style={{ flex: 1, marginEnd: 8 }}>
                                    <Text style={styles.label}>{t('profile.height', 'Taille (cm)')}</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={height}
                                        onChangeText={setHeight}
                                        placeholder={t('profile.heightPlaceholder')}
                                        keyboardType="numeric"
                                        maxLength={3}
                                        accessibilityLabel={t('profile.height', 'Taille (cm)')}
                                    />
                                </View>
                                <View style={{ flex: 1, marginStart: 8 }}>
                                    <Text style={styles.label}>{t('profile.prePregnancyWeight', 'Poids avant (kg)')}</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={prePregnancyWeight}
                                        onChangeText={setPrePregnancyWeight}
                                        placeholder={t('profile.weightPlaceholderShort')}
                                        keyboardType="numeric"
                                        maxLength={5}
                                        accessibilityLabel={t('profile.prePregnancyWeight', 'Poids avant (kg)')}
                                    />
                                </View>
                            </View>

                            <View style={styles.dateRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.label}>{t('profile.lmpLabel')}</Text>
                                    <Text style={styles.dateHint}>{t('profile.lmpHint')}</Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.dateButton}
                                    onPress={() => setShowDatePicker(true)}
                                    accessibilityRole="button"
                                    accessibilityLabel={`${t('profile.lmpLabel')}: ${format(lmp, 'dd MMM yyyy', { locale: dateLocale })}`}
                                    accessibilityHint={t('a11y.selectDate')}
                                >
                                    <Text style={styles.dateButtonText}>
                                        {format(lmp, 'dd MMM yyyy', { locale: dateLocale })}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {showDatePicker && (
                                <DateTimePicker
                                    value={lmp}
                                    mode="date"
                                    display="spinner"
                                    onChange={(event, selectedDate) => {
                                        setShowDatePicker(false);
                                        if (selectedDate) {
                                            setLmp(selectedDate);
                                        }
                                    }}
                                    maximumDate={new Date()}
                                    locale={getPickerLocale(i18n.language)}
                                />
                            )}

                            <View style={styles.separator} />

                            <View style={styles.dpaContainer}>
                                <Text style={styles.label}>{t('profile.dpaLabel')}</Text>
                                <Text style={styles.dpaText}>
                                    {format(dpa, 'dd MMMM yyyy', { locale: dateLocale })}
                                </Text>
                                <Text style={styles.dpaSubtext}>{t('profile.dpaSubtext')}</Text>
                            </View>

                            <TouchableOpacity
                                style={[styles.saveButton, loading && styles.saveButtonDisabled]}
                                onPress={handleSave}
                                disabled={loading}
                                accessibilityRole="button"
                                accessibilityLabel={t('a11y.saveChanges')}
                                accessibilityHint={t('a11y.saveChangesHint')}
                                accessibilityState={{ disabled: loading, busy: loading }}
                            >
                                {loading ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text style={styles.saveButtonText}>{t('profile.save')}</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Emergency Contacts — a safety feature, so near the top: it used to sit
                        at the very bottom, below logout / reset / delete. */}
                    <EmergencyContactsSection />

                    {/* Section 2: Tableaux de bord */}
                    <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('common.dashboard')}</Text>
                    <View style={styles.menuSection}>
                        <TouchableOpacity
                            style={[styles.menuRow, { borderBottomWidth: 0 }]}
                            onPress={() => navigation.navigate('HealthDashboard')}
                            accessibilityRole="button"
                            accessibilityLabel={t('profile.health')}
                            accessibilityHint={t('a11y.openItem')}
                        >
                            <View style={styles.menuRowLeft}>
                                <Ionicons name="heart-outline" size={24} color={theme.colors.accent} style={styles.menuIcon} />
                                <Text style={styles.menuLabel}>{t('profile.health')}</Text>
                            </View>
                            <RtlAwareChevron direction="forward" size={20} color={theme.colors.neutral300} />
                        </TouchableOpacity>
                    </View>

                    {/* Section 3: Préférences */}
                    <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('common.preferences')}</Text>
                    <View style={styles.menuSection}>
                        <View style={styles.menuRow}>
                            <View style={styles.menuRowLeft}>
                                <Ionicons name="globe-outline" size={24} color={theme.colors.info} style={styles.menuIcon} />
                                <Text style={styles.menuLabel}>{t('profile.languageSection')}</Text>
                            </View>
                            <LanguageSelector isCompact={true} />
                        </View>
                        <TouchableOpacity
                            style={[styles.menuRow, { borderBottomWidth: 0 }]}
                            onPress={() => navigation.navigate('Settings')}
                            accessibilityRole="button"
                            accessibilityLabel={t('profile.notifications')}
                            accessibilityHint={t('a11y.openSettings')}
                        >
                            <View style={styles.menuRowLeft}>
                                <Ionicons name="notifications-outline" size={24} color={theme.colors.accentOrangeDeep} style={styles.menuIcon} />
                                <Text style={styles.menuLabel}>{t('profile.notifications')}</Text>
                            </View>
                            <RtlAwareChevron direction="forward" size={20} color={theme.colors.neutral300} />
                        </TouchableOpacity>
                    </View>

                    {/* Section 4: Légal & Support */}
                    <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('common.legal')}</Text>
                    <View style={styles.menuSection}>
                        <TouchableOpacity
                            style={styles.menuRow}
                            onPress={() => navigation.navigate('PrivacyPolicy')}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.privacyPolicy')}
                            accessibilityHint={t('a11y.openItem')}
                        >
                            <View style={styles.menuRowLeft}>
                                <Ionicons name="shield-checkmark-outline" size={24} color={theme.colors.green700} style={styles.menuIcon} />
                                <Text style={styles.menuLabel}>{t('common.privacyPolicy')}</Text>
                            </View>
                            <RtlAwareChevron direction="forward" size={20} color={theme.colors.neutral300} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.menuRow}
                            onPress={() => openSupportEmail(t)}
                            accessibilityRole="button"
                            accessibilityLabel={t('support.reportProblem')}
                        >
                            <View style={styles.menuRowLeft}>
                                <Ionicons name="headset-outline" size={24} color={theme.colors.purple700} style={styles.menuIcon} />
                                <Text style={styles.menuLabel}>{t('support.reportProblem')}</Text>
                            </View>
                            <RtlAwareChevron direction="forward" size={20} color={theme.colors.neutral300} />
                        </TouchableOpacity>
                    </View>

                    {/* User Type Badge */}
                    <View style={styles.userTypeBadge}>
                        <Text style={styles.userTypeText}>
                            {user?.isGuest ? t('profile.guestMode') : t('profile.secureAccount')}
                        </Text>
                        <Text style={styles.userTypeSubtext}>
                            {user?.isGuest
                                ? t('profile.guestData')
                                : t('profile.cloudData')}
                        </Text>
                    </View>

                    {/* Section 5: Zone de danger -> Sécurité */}
                    <Text style={[styles.sectionTitle, { marginTop: 24, color: theme.colors.error }]}>{t('common.dangerZone')}</Text>
                    <View style={styles.menuSection}>
                        <TouchableOpacity
                            style={styles.menuRow}
                            onPress={handleLogout}
                            accessibilityRole="button"
                            accessibilityLabel={t('a11y.logout')}
                            accessibilityHint={t('a11y.logoutHint')}
                        >
                            <View style={styles.menuRowLeft}>
                                {/* Signing out erases nothing: neutral, so the red is left to the
                                    rows that do (reset, delete). */}
                                <Ionicons name="log-out-outline" size={24} color={theme.colors.textSecondary} style={styles.menuIcon} />
                                <Text style={styles.menuLabel}>{t('profile.logout')}</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.menuRow}
                            onPress={requestResetProfile}
                            accessibilityRole="button"
                            accessibilityLabel={t('profile.reset')}
                        >
                            <View style={styles.menuRowLeft}>
                                <Ionicons name="refresh-circle-outline" size={24} color={theme.colors.orange900} style={styles.menuIcon} />
                                <Text style={[styles.menuLabel, { color: theme.colors.deepOrange900 }]}>{t('profile.reset')}</Text>
                            </View>
                        </TouchableOpacity>

                        {!user?.isGuest && (
                            <TouchableOpacity
                                style={[styles.menuRow, { borderBottomWidth: 0 }]}
                                accessibilityRole="button"
                                accessibilityLabel={t('a11y.deleteAccount')}
                                accessibilityHint={t('a11y.deleteAccountHint')}
                                accessibilityState={{ disabled: deletionBusy, busy: deletionBusy }}
                                disabled={deletionBusy}
                                onPress={requestDeleteAccount}
                            >
                                <View style={styles.menuRowLeft}>
                                    <Ionicons name="trash-outline" size={24} color={theme.colors.materialRedDark} style={styles.menuIcon} />
                                    <Text style={[styles.menuLabel, { color: theme.colors.error }]}>{t('profile.deleteAccount')}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    </View>


                </View>
            </ScrollView>

            {/* F4: reauth prompt for Android/web (Alert.prompt is iOS-only) */}
            {reauthModal}
        </KeyboardAvoidingView>
    );
};
