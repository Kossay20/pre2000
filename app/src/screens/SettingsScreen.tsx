import { createLogger, logger } from '../utils/logger';
import { RtlAwareChevron } from '../components/common/RtlAwareChevron';
const log = createLogger('SettingsScreen');
import React, { useState, useEffect } from 'react';
import { theme } from '../theme';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Switch,
    Linking,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { showAlert } from '../utils/alert';
import { confirmAction } from '../utils/uiUtils';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { usePregnancy } from '../context/PregnancyContext';
import { useAuth } from '../context/AuthContext';
import { MEDICAL_FLAG_KEYS, MedicalFlagKey, hasAnsweredMedicalProfile } from '../utils/medicalFlags';
import { auth } from '../config/firebase';
import {
    loadBabyMessageEnabled,
    saveBabyMessageEnabled,
    loadBabyMessageHour,
    saveBabyMessageHour,
} from '../services/reminderPersistence';
import { updateBabyMessageSchedule } from '../services/babyMessageService';
import { Skeleton } from '../components/common/Skeleton';
import { useTranslation } from 'react-i18next';
import { exportUserData } from '../services/dataExportService';
import { useDateLocale } from '../hooks/useDateLocale';
// DEAD-CODE-FIX: DemoDataService import removed — was imported but never used.
// DemoDataService should only ever be called in __DEV__ contexts.
import { requestNotificationPermissions } from '../services/notificationService';
import { sendTestNotification, getScheduledNotifications } from '../services/rdvNotificationService';
import { generateAndSharePDF } from '../services/pdfExportService';
import { getWeightHistory } from '../services/weightService';
import { getAppointments } from '../services/appointmentService';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { useAccountDeletion } from '../hooks/useAccountDeletion';

/**
 * SettingsScreen - V1.2 Feature
 * Manage notification settings
 */
export const SettingsScreen = () => {
    useScreenAnalytics('SettingsScreen');
    const { t, i18n } = useTranslation();

    const dateLocale = useDateLocale();
    // P3.6 FIX: also pull `profile` (firstName, lmp, country) — was missing,
    // causing exports to receive `pregnancyInfo` (week+day) where a Profile was expected.
    const { pregnancyInfo, profile } = usePregnancy();
    const { user, updateProfile } = useAuth();
    const { requestDeleteAccount, requestResetProfile, busy: deletionBusy, reauthModal } = useAccountDeletion();
    const navigation = useNavigation();
    const [babyMessageEnabled, setBabyMessageEnabled] = useState(true);
    const [babyMessageHour, setBabyMessageHour] = useState(10);
    const [loading, setLoading] = useState(true);

    log.debug('[SettingsScreen] Rendering...');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        log.debug('[SettingsScreen] Loading settings...');
        setLoading(true);

        try {
            const enabled = await loadBabyMessageEnabled();
            const hour = await loadBabyMessageHour();

            setBabyMessageEnabled(enabled);
            setBabyMessageHour(hour);

            log.debug('[SettingsScreen] Loaded settings:', { enabled, hour });
        } catch (error) {
            log.error('[SettingsScreen] Error loading settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleBabyMessageToggle = async (value: boolean) => {
        log.debug('[SettingsScreen] Baby message toggle:', value);
        setBabyMessageEnabled(value);

        try {
            await saveBabyMessageEnabled(value);

            if (pregnancyInfo) {
                await updateBabyMessageSchedule(
                    pregnancyInfo.week,
                    value,
                    babyMessageHour
                );
            }

            log.debug('[SettingsScreen] ✅ Baby message setting saved');
        } catch (error) {
            log.error('[SettingsScreen] Error toggling baby message:', error);
        }
    };

    const handleHourChange = async (newHour: number) => {
        log.debug('[SettingsScreen] Hour change:', newHour);
        setBabyMessageHour(newHour);

        try {
            await saveBabyMessageHour(newHour);

            if (pregnancyInfo && babyMessageEnabled) {
                await updateBabyMessageSchedule(
                    pregnancyInfo.week,
                    babyMessageEnabled,
                    newHour
                );
            }

            log.debug('[SettingsScreen] ✅ Hour setting saved');
        } catch (error) {
            log.error('[SettingsScreen] Error changing hour:', error);
        }
    };

    if (loading) {
        return (
            <ScrollView
                style={styles.container}
                contentContainerStyle={styles.skeletonContent}
                accessibilityLabel={t('common.loading')}
            >
                <Skeleton.Title width={240} />
                <Skeleton.Line width="78%" style={{ marginTop: theme.spacing.m }} />
                <Skeleton.Line width="62%" style={{ marginTop: theme.spacing.s }} />
                <View style={{ height: theme.spacing.xl }} />
                <Skeleton.Line width="40%" />
                <Skeleton width="100%" height={88} radius={theme.borderRadius.card} style={{ marginTop: theme.spacing.m }} />
                <Skeleton width="100%" height={88} radius={theme.borderRadius.card} style={{ marginTop: theme.spacing.s }} />
                <Skeleton width="100%" height={56} radius={theme.borderRadius.m} style={{ marginTop: theme.spacing.l }} />
            </ScrollView>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.header}>
                <View style={styles.headerTitleRow}>
                    <Ionicons name="settings-outline" size={26} color={theme.colors.text} style={styles.headerIcon} />
                    <Text style={styles.headerTitle}>{t('common.settings')}</Text>
                </View>
                <Text style={styles.headerSubtitle}>{t('common.notifications')}</Text>
            </View>

            {/* Baby Message Section */}
            <View style={styles.section}>
                <View style={[styles.sectionHeader, styles.sectionHeaderRow]}>
                    <Ionicons name="heart-outline" size={20} color={theme.colors.accent} style={styles.sectionIcon} />
                    <Text style={styles.sectionTitle}>{t('common.babyMessage')}</Text>
                </View>

                <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                        <Text style={styles.settingLabel}>{t('common.dailyMessage')}</Text>
                        <Text style={styles.settingDescription}>
                            {t('common.dailyMessageDesc')}
                        </Text>
                    </View>
                    <Switch
                        value={babyMessageEnabled}
                        onValueChange={handleBabyMessageToggle}
                        trackColor={{ false: theme.colors.neutral300, true: theme.colors.accent }}
                        thumbColor={babyMessageEnabled ? theme.colors.white : theme.colors.iosGroupedBackground}
                        accessibilityLabel={t('common.a11y.toggleBabyMessage')}
                        accessibilityRole="switch"
                        accessibilityState={{ checked: babyMessageEnabled }}
                        {...(Platform.OS === 'web' ? { 'aria-checked': babyMessageEnabled } : {})}
                    />
                </View>

                {babyMessageEnabled && (
                    <View style={styles.hourSelector}>
                        <Text style={styles.hourLabel}>{t('common.notifHour')}</Text>
                        <View style={styles.hourButtons}>
                            {[8, 9, 10, 11, 12].map(hour => (
                                <TouchableOpacity
                                    key={hour}
                                    style={[
                                        styles.hourButton,
                                        babyMessageHour === hour && styles.hourButtonActive
                                    ]}
                                    onPress={() => handleHourChange(hour)}
                                    accessibilityLabel={t('common.a11y.selectHour', { hour })}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: babyMessageHour === hour }}
                                    {...(Platform.OS === 'web' ? { 'aria-selected': babyMessageHour === hour } : {})}
                                >
                                    <Text style={[
                                        styles.hourButtonText,
                                        babyMessageHour === hour && styles.hourButtonTextActive
                                    ]}>
                                        {hour}:00
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}
            </View>

            {/* Declared conditions — the reminders catalogue keys context rules on
                these, so an answer given once at onboarding has to stay editable:
                a gestational-diabetes diagnosis usually arrives around week 24,
                long after the question was asked. Pregnant users only — the
                onboarding question is not asked in the TTC or exploring flows, and
                offering a "twin pregnancy" switch to someone who is not pregnant is
                not a neutral thing to do. */}
            {!user?.isTTC && !user?.isCurious && (
            <View style={styles.section}>
                <View style={[styles.sectionHeader, styles.sectionHeaderRow]}>
                    <Ionicons name="medkit-outline" size={20} color={theme.colors.accent} style={styles.sectionIcon} />
                    <Text style={styles.sectionTitle}>{t('common.medicalProfile.settingsTitle')}</Text>
                </View>

                {/* The clinician framing travels with the switches. Without it a user
                    self-declares "Gestational diabetes" with no context, which is the
                    one thing this question must never ask her to do. */}
                <Text style={styles.sectionCopy}>{t('common.medicalProfile.intro')}</Text>
                <Text style={styles.sectionCopy}>
                    {hasAnsweredMedicalProfile(user ?? undefined)
                        ? t('common.medicalProfile.settingsSubtitle')
                        : t('common.medicalProfile.notAnswered')}
                </Text>

                {MEDICAL_FLAG_KEYS.map((key) => {
                    const labelKey: Record<MedicalFlagKey, string> = {
                        hasGestationalDiabetes: 'gestationalDiabetes',
                        hasHypertension: 'hypertension',
                        isTwinPregnancy: 'twins',
                    };
                    const value = user?.[key] === true;
                    return (
                        <View style={styles.settingRow} key={key}>
                            <View style={styles.settingInfo}>
                                <Text style={styles.settingLabel}>
                                    {t(`common.medicalProfile.${labelKey[key]}`)}
                                </Text>
                            </View>
                            <Switch
                                value={value}
                                onValueChange={async (next) => {
                                    // updateProfile reports cloud-sync failure on
                                    // purpose. Discarding it left the switch snapping
                                    // silently back to the old value, since `value`
                                    // reads from the profile.
                                    const res = await updateProfile({
                                        [key]: next,
                                        medicalProfileAnsweredAt: new Date().toISOString(),
                                    });
                                    if (!res.ok) showAlert(t('common.error'), t('common.medicalProfile.syncWarning'));
                                }}
                                trackColor={{ false: theme.colors.neutral300, true: theme.colors.accent }}
                                thumbColor={value ? theme.colors.white : theme.colors.iosGroupedBackground}
                                accessibilityRole="switch"
                                accessibilityLabel={t(`common.medicalProfile.${labelKey[key]}`)}
                                accessibilityState={{ checked: value }}
                                {...(Platform.OS === 'web' ? { 'aria-checked': value } : {})}
                            />
                        </View>
                    );
                })}

                <Text style={styles.sectionCopy}>
                    {t('common.medicalProfile.privacyNote')}
                </Text>
            </View>
            )}

            {/* Notification permission */}
            <View style={styles.section}>
                <View style={[styles.sectionHeader, styles.sectionHeaderRow]}>
                    <Ionicons name="notifications-outline" size={20} color={theme.colors.text} style={styles.sectionIcon} />
                    <Text style={styles.sectionTitle}>{t('common.permissions')}</Text>
                </View>
                <TouchableOpacity
                    style={[styles.settingRow, !__DEV__ && { borderBottomWidth: 0 }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.requestPermissions')}
                    accessibilityHint={t('common.requestPermissionsDesc')}
                    onPress={async () => {
                        const granted = await requestNotificationPermissions();

                        if (granted) {
                            alert(t('common.permissionsGranted'));
                        } else {
                            // On iOS, if permission is already denied, we must open settings.
                            // showAlert fires the confirm callback on web too (window.confirm).
                            showAlert(
                                t('common.permissionsDenied'),
                                t('common.permissionsDeniedMsg'),
                                [
                                    { text: t('common.cancel'), style: "cancel" },
                                    {
                                        text: t('common.openSettings'),
                                        onPress: () => Linking.openSettings()
                                    }
                                ]
                            );
                        }
                    }}
                >
                    <View style={styles.settingRowLeft}>
                        <Ionicons name="hand-right-outline" size={24} color={theme.colors.accent} style={styles.menuIcon} />
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingLabel}>{t('common.requestPermissions')}</Text>
                            <Text style={styles.settingDescription}>
                                {t('common.requestPermissionsDesc')}
                            </Text>
                        </View>
                    </View>
                    <RtlAwareChevron direction="forward" size={20} color={theme.colors.neutral300} />
                </TouchableOpacity>

                {/* Test notifications is a developer tool: it schedules three fake
                    reminders (a made-up appointment among them) a few seconds out. It
                    has no place in a release build. */}
                {__DEV__ && (
                <TouchableOpacity
                    style={[styles.settingRow, { borderBottomWidth: 0 }]}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.testNotifications')}
                    accessibilityHint={t('common.testNotificationsDesc')}
                    onPress={async () => {
                        // sendTestNotification, getScheduledNotifications already imported at top
                        const success = await sendTestNotification();
                        if (success) {
                            alert(t('common.testNotificationsSent'));
                            // Also show how many notifications are scheduled
                            const scheduled = await getScheduledNotifications();
                            log.debug('Scheduled notifications:', scheduled.length);
                        } else {
                            alert(t('common.testNotificationsFailed'));
                        }
                    }}
                >
                    <View style={styles.settingRowLeft}>
                        <Ionicons name="play-circle-outline" size={24} color={theme.colors.accent} style={styles.menuIcon} />
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingLabel}>{t('common.testNotifications')}</Text>
                            <Text style={styles.settingDescription}>
                                {t('common.testNotificationsDesc')}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
                )}
            </View>

            {/* Info Section */}
            <View style={styles.infoSection}>
                <Text style={styles.infoText}>
                    {t('common.reminderInfo')}
                </Text>
            </View>

            {/* Data & Privacy Section */}
            <View style={styles.section}>
                <View style={[styles.sectionHeader, styles.sectionHeaderRow]}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={theme.colors.green700} style={styles.sectionIcon} />
                    <Text style={styles.sectionTitle}>{t('common.privacyData.title')}</Text>
                </View>

                {/* PDF Journal Export - ENABLED */}
                <TouchableOpacity
                    style={styles.settingRow}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.privacyData.exportPDF')}
                    accessibilityHint={t('common.privacyData.exportPDFDesc')}
                    accessibilityState={{ disabled: loading, busy: loading }}
                    onPress={async () => {
                        try {
                            setLoading(true);
                            const userId = auth.currentUser?.uid;
                            if (!userId) {
                                showAlert(t('common.error'), t('common.loginRequired'));
                                return;
                            }

                            const weightHistoryData = await getWeightHistory(userId);
                            const appointmentsData = await getAppointments();

                            // P3.6 FIX: pass the real Profile (firstName, lmp, country) — was passing
                            // pregnancyInfo (just week/day) which produced a structurally invalid PDF profile block.
                            if (!profile) {
                                showAlert(t('common.error'), t('common.profileRequired') || t('common.error'));
                                return;
                            }
                            await generateAndSharePDF({
                                profile,
                                weightHistory: weightHistoryData,
                                appointments: appointmentsData as any,
                                notes: []
                            }, t, dateLocale, 'Journal_Grossesse.pdf', i18n.language);
                        } catch (e) {
                            logger.error("SettingsScreen", "PDF Export Error", e);
                            showAlert(t('common.error'), t('export.errorMessage') || t('common.error'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    <View style={styles.settingRowLeft}>
                        <Ionicons name="document-text-outline" size={24} color={theme.colors.accent} style={styles.menuIcon} />
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingLabel}>{t('common.privacyData.exportPDF')}</Text>
                            <Text style={styles.settingDescription}>
                                {t('common.privacyData.exportPDFDesc')}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.settingRow}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.privacyData.export')}
                    accessibilityHint={t('common.privacyData.exportDesc')}
                    // P3.6 FIX: pass real Profile, not pregnancyInfo (week/day only).
                    // C3/F6: explicit confirmation — exported file contains ALL medical data in plain text.
                    onPress={() => {
                        // C3/F6: explicit destructive confirm — exported file is plaintext medical data.
                        // confirmAction fires onConfirm on web too (Alert.alert is a no-op there).
                        confirmAction(
                            t('export.warningTitle'),
                            t('export.warningMessage'),
                            () => exportUserData(user, profile, t),
                            undefined,
                            t('common.cancel'),
                            t('common.continue'),
                        );
                    }}
                >
                    <View style={styles.settingRowLeft}>
                        <Ionicons name="share-outline" size={24} color={theme.colors.accent} style={styles.menuIcon} />
                        <View style={styles.settingInfo}>
                            <Text style={styles.settingLabel}>{t('common.privacyData.export')}</Text>
                            <Text style={styles.settingDescription}>
                                {t('common.privacyData.exportDesc')}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>

                {/* The privacy policy and the store listings send people here to delete their
                    data, so this is the same flow as Profile → danger zone (useAccountDeletion).
                    A guest has no account: her data lives on this device, and the reset erases it. */}
                <TouchableOpacity
                    style={[styles.settingRow, { borderBottomWidth: 0 }]}
                    accessibilityRole="button"
                    accessibilityLabel={user?.isGuest ? t('common.privacyData.eraseGuestData') : t('common.privacyData.deleteAccount')}
                    accessibilityHint={user?.isGuest ? t('common.privacyData.eraseGuestDataDesc') : t('common.privacyData.deleteAccountDesc')}
                    accessibilityState={{ disabled: deletionBusy, busy: deletionBusy }}
                    disabled={deletionBusy}
                    onPress={user?.isGuest ? requestResetProfile : requestDeleteAccount}
                >
                    <View style={styles.settingRowLeft}>
                        <Ionicons name="trash-outline" size={24} color={theme.colors.materialRedDark} style={styles.menuIcon} />
                        <View style={styles.settingInfo}>
                            <Text style={[styles.settingLabel, { color: theme.colors.error }]}>
                                {user?.isGuest ? t('common.privacyData.eraseGuestData') : t('common.privacyData.deleteAccount')}
                            </Text>
                            <Text style={styles.settingDescription}>
                                {user?.isGuest ? t('common.privacyData.eraseGuestDataDesc') : t('common.privacyData.deleteAccountDesc')}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
            </View>

            {/* Legal Section */}
            <View style={styles.section}>
                <View style={[styles.sectionHeader, styles.sectionHeaderRow]}>
                    <Ionicons name="document-text-outline" size={20} color={theme.colors.text} style={styles.sectionIcon} />
                    <Text style={styles.sectionTitle}>{t('common.legal')}</Text>
                </View>
                <TouchableOpacity
                    style={styles.legalRow}
                    onPress={() => navigation.navigate('PrivacyPolicy')}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.privacyPolicy')}
                >
                    <View style={styles.settingRowLeft}>
                        <Ionicons name="lock-closed-outline" size={24} color={theme.colors.text} style={styles.menuIcon} />
                        <Text style={styles.legalText}>{t('common.privacyPolicy')}</Text>
                    </View>
                    <RtlAwareChevron direction="forward" size={20} color={theme.colors.neutral300} />
                </TouchableOpacity>
            </View>

            {/* Developer Section (Only in DEV) */}
            {__DEV__ && (
                <View style={[styles.section, { borderColor: theme.colors.purple700, borderWidth: 1 }]}>
                    <View style={[styles.sectionHeader, styles.sectionHeaderRow, { backgroundColor: theme.colors.surfacePurpleTint }]}>
                        <Ionicons name="code-slash-outline" size={20} color={theme.colors.purple700} style={styles.sectionIcon} />
                        <Text style={[styles.sectionTitle, { color: theme.colors.purple700 }]}>Developer Tools</Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.settingRow, { borderTopWidth: 1, borderTopColor: theme.colors.purpleBorderLight, borderBottomWidth: 0 }]}
                        onPress={() => navigation.navigate('Diagnostic')}
                    >
                        <View style={styles.settingRowLeft}>
                            <Ionicons name="medkit-outline" size={24} color={theme.colors.purple700} style={styles.menuIcon} />
                            <View style={styles.settingInfo}>
                                <Text style={styles.settingLabel}>Run Diagnostics</Text>
                                <Text style={styles.settingDescription}>
                                    Check database integrity and content status.
                                </Text>
                            </View>
                        </View>
                        <RtlAwareChevron direction="forward" size={20} color={theme.colors.neutral300} />
                    </TouchableOpacity>
                </View >
            )}
            {reauthModal}
        </ScrollView >
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    skeletonContent: {
        paddingHorizontal: theme.spacing.l,
        paddingTop: 56,
        paddingBottom: theme.spacing.xl,
    },
    header: {
        padding: 20,
        backgroundColor: theme.colors.white,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.disabled,
    },
    headerTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10, // direction-agnostic gap — marginEnd didn't flip under web RTL (⚙️الإعدادات)
    },
    headerIcon: {
        marginEnd: 0,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    section: {
        marginTop: 16,
        backgroundColor: theme.colors.white,
        borderRadius: theme.borderRadius.m,
        marginHorizontal: 16,
        overflow: 'hidden',
    },
    sectionHeader: {
        padding: 16,
        backgroundColor: theme.colors.surfaceGrayStripe,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.disabled,
    },
    sectionHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10, // direction-agnostic gap (RTL-safe, matches headerTitleRow)
    },
    sectionIcon: {
        marginEnd: 0,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: theme.colors.text,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    settingRowLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    menuIcon: {
        fontSize: 22,
        marginEnd: 16,
        width: 28,
        textAlign: 'center',
    },
    menuArrow: {
        fontSize: 20,
        color: theme.colors.neutral300,
        marginStart: 8,
    },
    settingInfo: {
        flex: 1,
        marginEnd: 16,
    },
    settingLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
        marginBottom: 4,
    },
    settingDescription: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        lineHeight: 20,
    },
    // Section-level copy sits directly inside `section`, which has no padding of
    // its own — every other description in this screen is nested in settingRow's
    // inset and inherits it. Without this it renders flush against the card edge.
    sectionCopy: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        lineHeight: 20,
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    hourSelector: {
        padding: 16,
    },
    hourLabel: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginBottom: 12,
    },
    hourButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    hourButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: theme.borderRadius.s,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        backgroundColor: theme.colors.white,
        alignItems: 'center',
    },
    hourButtonActive: {
        backgroundColor: theme.colors.accent,
    },
    hourButtonText: {
        fontSize: 14,
        color: theme.colors.accent,
        fontWeight: '600',
    },
    hourButtonTextActive: {
        color: theme.colors.white,
    },
    infoSection: {
        margin: 16,
        padding: 16,
        backgroundColor: theme.colors.surfaceTip,
        borderRadius: theme.borderRadius.m,
        borderWidth: 1,
        borderColor: theme.colors.amberSurfaceSoft,
    },
    infoText: {
        fontSize: 14,
        color: theme.colors.warningTextDark,
        lineHeight: 20,
    },
    legalRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    legalText: {
        fontSize: 16,
        color: theme.colors.text,
    },
    legalArrow: {
        fontSize: 20,
        color: theme.colors.neutral400,
    },
});
