/**
 * RemindersTab V3.0 - Premium Redesign
 * 
 * Features:
 * - Standalone Hydration Hero Card
 * - Clean "Daily Habits" section
 * - Polished Accordion sections
 * - Pink/Peach Theme consistency
 */

import { createLogger } from '../../utils/logger';
const log = createLogger('RemindersTab');

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Switch,
    ActivityIndicator,
    Animated,
    Linking,
    Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { usePregnancy } from '../../context/PregnancyContext';
import { useAuth } from '../../context/AuthContext';
import { requestNotificationPermissions } from '../../services/notificationService';
import { showAlert } from '../../utils/alert';
import {
    getEssentialReminders,
    getCategories,
    getAvailableReminders,
    loadUserSettings,
    enableReminder,
    disableReminder,
    initializeDefaultReminders,
} from '../../services/remindersV2Service';
import { buildContextProfile } from '../../utils/contextMatcher';
import { toContextUserFlags } from '../../utils/medicalFlags';
import {
    ReminderDefinition,
    ReminderUserSetting,
    ReminderCategory,
    ContextProfile
} from '../../types/remindersV2';
import { ReminderCardV2 } from '../../components/reminders/ReminderCardV2';
import { ReminderEditModal } from '../../components/reminders/ReminderEditModal';
import { HydrationCard } from '../../components/reminders/HydrationCard';
import { useTranslation } from 'react-i18next';
import { Trilang } from '../../types/remindersV2';
import { getLocalizedTrilang, formatTime } from '../../utils/i18nHelpers';
import { theme } from '../../theme';
import { RtlAwareChevron } from '../../components/common/RtlAwareChevron';
import { syncRemindersToNotifications } from '../../services/remindersScheduler';
import { useScreenAnalytics } from '../../hooks/useScreenAnalytics';
import { styles } from './RemindersTab.styles';

// ============================================
// PERMISSION BANNER
// ============================================

const PermissionBanner = () => {
    const { t } = useTranslation();
    const [permissionsGranted, setPermissionsGranted] = useState(true);

    useEffect(() => {
        checkPermissions();
    }, []);

    const checkPermissions = async () => {
        const granted = await requestNotificationPermissions();
        setPermissionsGranted(granted);
    };

    // Actionable: reuse the same flow as the Settings "Demander les permissions" handler.
    // Request OS permission; on grant, hide the banner; on denial, offer to open Settings.
    const handlePress = async () => {
        const granted = await requestNotificationPermissions();
        if (granted) {
            setPermissionsGranted(true);
            return;
        }
        showAlert(
            t('common.permissionsDenied'),
            t('common.permissionsDeniedMsg'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.openSettings'), onPress: () => Linking.openSettings() },
            ]
        );
    };

    if (permissionsGranted) return null;

    return (
        <TouchableOpacity
            style={styles.permissionBanner}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={t('common.enableNotifications')}
            accessibilityHint={t('common.requestPermissions')}
        >
            <Text style={styles.permissionText}>
                {t('common.enableNotifications')}
            </Text>
        </TouchableOpacity>
    );
};

// ============================================
// NOTIFICATION CAP BANNER
// ============================================

const MAX_DAILY_NOTIFICATIONS = 8;

interface NotificationCapBannerProps {
    settings: Record<string, ReminderUserSetting>;
    allReminders: ReminderDefinition[];
}

const NotificationCapBanner: React.FC<NotificationCapBannerProps> = ({
    settings,
    allReminders
}) => {
    const { t } = useTranslation();
    const dailyNotifCount = allReminders.reduce((count, reminder) => {
        const setting = settings[reminder.id];
        if (!setting?.enabled) return count;
        if (reminder.frequency_type === 'per_day') {
            return count + (setting.intensity || 1);
        }
        if (reminder.frequency_type === 'per_week') {
            return count + Math.ceil((setting.intensity || 1) / 7);
        }
        return count;
    }, 0);

    if (dailyNotifCount <= MAX_DAILY_NOTIFICATIONS) return null;

    return (
        <View style={styles.capBanner}>
            <Text style={styles.capBannerText}>
                {t('common.notifCapMsg')}
            </Text>
            <Text style={styles.capBannerSubtext}>
                {t('common.notifCapSubMsg')}
            </Text>
        </View>
    );
};

// ============================================
// ESSENTIALS LIST (Redesigned)
// ============================================

interface EssentialsListProps {
    essentials: ReminderDefinition[];
    settings: Record<string, ReminderUserSetting>;
    onToggle: (reminder: ReminderDefinition, enabled: boolean) => void;
    onEdit: (reminder: ReminderDefinition) => void;
}

const EssentialsList: React.FC<EssentialsListProps> = ({
    essentials,
    settings,
    onToggle,
    onEdit
}) => {
    const { t, i18n } = useTranslation();

    const getLocalizedContent = (content: Trilang) => {
        return getLocalizedTrilang(content, i18n.language);
    };

    // Format times for display (same as ReminderCardV2)
    const formatTimes = (times: string[]): string => {
        if (!times || times.length === 0) return '';
        return times.map(time => formatTime(time, i18n.language)).join(' • ');
    };

    // Get frequency label (same as ReminderCardV2)
    const getFrequencyLabel = (reminder: ReminderDefinition): string => {
        return reminder.frequency_type === 'per_day' ? t('common.dayShort') : t('common.weekShort');
    };

    return (
        <View style={styles.essentialsContainer}>
            {essentials.map((reminder, index) => {
                const setting = settings[reminder.id];
                const isEnabled = setting?.enabled ?? false;
                const intensity = setting?.intensity ?? reminder.intensity_options[0];
                const times = setting?.times || reminder.preset_times[intensity] || [];
                const frequencyLabel = getFrequencyLabel(reminder);

                return (
                    <React.Fragment key={reminder.id}>
                        <View style={[
                            styles.essentialCard,
                            index === essentials.length - 1 && { borderBottomWidth: 0 }
                        ]}>
                            {/* Main row - icon, title, description, switch */}
                            <View style={styles.essentialMainRow}>
                                <View style={styles.essentialIconContainer}>
                                    <Text style={styles.essentialIcon}>{reminder.ui?.icon}</Text>
                                </View>
                                <View style={styles.essentialInfo}>
                                    <Text style={styles.essentialName}>{getLocalizedContent(reminder.title)}</Text>
                                    <Text style={styles.essentialDesc}>
                                        {getLocalizedContent(reminder.description)}
                                    </Text>
                                </View>
                                <Switch
                                    value={isEnabled}
                                    onValueChange={(value) => onToggle(reminder, value)}
                                    trackColor={{ false: theme.colors.disabled, true: theme.colors.pinkAccentA100 }}
                                    thumbColor={theme.colors.white}
                                    ios_backgroundColor={theme.colors.disabled}
                                    accessibilityRole="switch"
                                    accessibilityLabel={getLocalizedContent(reminder.title)}
                                    accessibilityHint={t('a11y.toggleReminder')}
                                    accessibilityState={{ checked: isEnabled }}
                                />
                            </View>
                            {/* Summary row when enabled - same as ReminderCardV2 */}
                            {isEnabled && (
                                <View style={styles.essentialSummaryRow}>
                                    <Text style={styles.essentialSummaryText}>
                                        📆 {intensity}×/{frequencyLabel} • {formatTimes(times)}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => onEdit(reminder)}
                                        style={styles.essentialEditButton}
                                        accessibilityRole="button"
                                        accessibilityLabel={t('a11y.edit')}
                                        accessibilityHint={getLocalizedContent(reminder.title)}
                                    >
                                        <Text style={styles.essentialEditIcon}>⚙️</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                        {/* Reassuring text for vitamins */}
                        {reminder.id === 'rem_med_prenatal_vitamins' && (
                            <TouchableOpacity onPress={() => onEdit(reminder)}>
                                <Text style={styles.reassuringText}>
                                    {t('common.vitaminAdjust')}
                                </Text>
                            </TouchableOpacity>
                        )
                        }
                    </React.Fragment>
                );
            })}
        </View >
    );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const RemindersTab = () => {
    useScreenAnalytics('RemindersTab');
    const { t, i18n } = useTranslation(); // ── FIX: destructure i18n for locale-aware sync
    const { pregnancyInfo } = usePregnancy();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null); // ── error/retry state
    const [settings, setSettings] = useState<Record<string, ReminderUserSetting>>({});
    const [profile, setProfile] = useState<ContextProfile | null>(null);
    const initRef = useRef(false);

    const [editModalVisible, setEditModalVisible] = useState(false);
    const [selectedReminder, setSelectedReminder] = useState<ReminderDefinition | null>(null);

    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        recommended: true,
        medical: false,
        wellbeing: false,
    });

    useEffect(() => {
        const week = pregnancyInfo?.week ?? 1;
        // The declared-condition flags ride along: without them every context rule
        // keyed on a diagnosis was evaluated against `undefined` and never matched.
        setProfile(buildContextProfile(week, toContextUserFlags(user)));
    }, [
        pregnancyInfo?.week,
        user?.hasGestationalDiabetes,
        user?.hasHypertension,
        user?.isTwinPregnancy,
    ]);

    const loadData = useCallback(async () => {
        if (!profile) return;
        let isMounted = true; // ── FIX: isMounted guard
        setLoading(true);
        setError(null);
        try {
            const userSettings = await loadUserSettings(user?.uid);
            if (!isMounted) return;
            if (Object.keys(userSettings).length === 0 && !initRef.current) {
                initRef.current = true;
                await initializeDefaultReminders(user?.uid);
                const newSettings = await loadUserSettings(user?.uid);
                if (isMounted) setSettings(newSettings);
            } else {
                setSettings(userSettings);
            }
        } catch (err) {
            log.error('Error loading reminders:', err);
            if (isMounted) setError(t('common.error'));
        } finally {
            if (isMounted) setLoading(false);
        }
        return () => { isMounted = false; };
    }, [profile, user?.uid, t]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleToggle = async (reminder: ReminderDefinition, enabled: boolean) => {
        try {
            if (enabled) {
                const newSetting = await enableReminder(reminder.id, user?.uid);
                if (newSetting) {
                    setSettings(prev => ({ ...prev, [reminder.id]: newSetting }));
                }
            } else {
                await disableReminder(reminder.id, user?.uid);
                setSettings(prev => ({
                    ...prev,
                    [reminder.id]: { ...prev[reminder.id], enabled: false }
                }));
            }
            // ── FIX: Pass userId and locale so auth users and non-FR users sync correctly
            const week = pregnancyInfo?.week ?? 1;
            await syncRemindersToNotifications(week, i18n.language, user?.uid);
        } catch (error) {
            log.error('Error toggling reminder:', error);
        }
    };

    const openEditModal = (reminder: ReminderDefinition) => {
        setSelectedReminder(reminder);
        setEditModalVisible(true);
    };

    const handleModalSave = (newSetting: Partial<ReminderUserSetting>) => {
        if (selectedReminder) {
            setSettings(prev => ({
                ...prev,
                [selectedReminder.id]: {
                    ...prev[selectedReminder.id],
                    ...newSetting
                }
            }));
            // NOTIF-08 FIX: Re-sync after time/intensity edit from modal
            const week = pregnancyInfo?.week ?? 1;
            syncRemindersToNotifications(week, i18n.language, user?.uid).catch(e =>
                log.error('Sync after modal save failed:', e)
            );
        }
    };

    if (error) {
        return (
            <View style={styles.centerContainer}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
                <Text style={{ color: theme.colors.error, fontSize: 15, marginBottom: 16, textAlign: 'center' }}>
                    {error}
                </Text>
                <TouchableOpacity
                    onPress={loadData}
                    style={{ backgroundColor: theme.colors.accent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 20 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.retry')}
                >
                    <Text style={{ color: theme.colors.white, fontWeight: '700' }}>{t('common.retry')}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (loading || !profile) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
        );
    }

    const essentials = getEssentialReminders(profile);
    // Anything already switched on stays listed even if a context rule would now
    // hide it — otherwise the notification keeps firing with no card to stop it.
    const enabledIds = new Set(
        Object.entries(settings).filter(([, v]) => v?.enabled).map(([id]) => id),
    );
    const allReminders = getAvailableReminders(
        profile,
        ['reminders_only', 'both_but_single_entry'],
        enabledIds,
    );
    const essentialIds = new Set(essentials.map(e => e.id));
    const nonEssentialReminders = allReminders.filter(r => !essentialIds.has(r.id));

    const recommendedThisWeek = nonEssentialReminders
        .filter(r => r.ui?.recommended_rank != null || r.ui?.section_group === 'recommended')
        .sort((a, b) => (a.ui?.recommended_rank || 99) - (b.ui?.recommended_rank || 99))
        .slice(0, 5);

    const recommendedIds = new Set(recommendedThisWeek.map(r => r.id));

    const medicalReminders = nonEssentialReminders.filter(r =>
        r.ui?.section_group === 'medical' ||
        (['follow', 'med'].includes(r.category_id) && !recommendedIds.has(r.id))
    );

    const wellbeingReminders = nonEssentialReminders.filter(r =>
        r.ui?.section_group === 'wellbeing' ||
        (['well', 'prep', 'fam'].includes(r.category_id) && !recommendedIds.has(r.id) && !medicalReminders.includes(r))
    );

    const ReminderSection: React.FC<{
        sectionKey: string;
        title: string;
        reminders: ReminderDefinition[];
        icon: string;
    }> = ({ sectionKey, title, reminders, icon }) => {
        const expanded = expandedSections[sectionKey] ?? false;
        const toggleExpanded = () => {
            setExpandedSections(prev => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
        };

        if (reminders.length === 0) return null;
        const enabledCount = reminders.filter(r => settings[r.id]?.enabled).length;

        return (
            <View style={styles.sectionBlock}>
                <TouchableOpacity
                    style={[styles.sectionHeader, expanded && styles.sectionHeaderExpanded]}
                    onPress={toggleExpanded}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={title}
                    accessibilityHint={expanded ? t('a11y.collapseSection') : t('a11y.expandSection')}
                    accessibilityState={{ expanded }}
                    // CAL-R2-03: RN-web 0.21.2 drops accessibilityState.expanded → expose aria explicitly.
                    {...(Platform.OS === 'web' ? { 'aria-expanded': expanded } : {})}
                >
                    <View style={styles.sectionHeaderLeft}>
                        <View style={styles.sectionIconContainer}>
                            <Text style={styles.sectionIcon}>{icon}</Text>
                        </View>
                        <View>
                            <Text style={styles.sectionHeaderTitle}>{title}</Text>
                            <Text style={styles.sectionCount}>
                                {enabledCount > 0 ? t('common.activeCount', { count: enabledCount }) : t('common.optionsCount', { count: reminders.length })}
                            </Text>
                        </View>
                    </View>
                    <RtlAwareChevron
                        direction="forward"
                        size={24}
                        color={expanded ? theme.colors.primary : theme.colors.disabled}
                        style={[styles.sectionArrowBase, expanded ? styles.sectionArrowRotated : styles.sectionArrowCollapsed]}
                    />
                </TouchableOpacity>

                {expanded && (
                    <View style={styles.sectionContent}>
                        {reminders.map(reminder => (
                            <ReminderCardV2
                                key={reminder.id}
                                reminder={reminder}
                                setting={settings[reminder.id]}
                                onToggle={(enabled) => handleToggle(reminder, enabled)}
                                onEdit={() => openEditModal(reminder)}
                                profile={profile}
                            />
                        ))}
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <PermissionBanner />
            <ScrollView
                style={styles.scrollContainer}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>{t('common.myReminders')}</Text>
                    <Text style={styles.headerSubtitle}>
                        {t('common.week')} {pregnancyInfo?.week} • {t('common.trimesterLabel', { trimester: profile.trimester })}
                    </Text>
                </View>

                {/* 1. Hydration Hero */}
                <View style={styles.sectionContainer}>
                    <HydrationCard />
                </View>

                {/* 2. Daily Habits - Using same ReminderCardV2 as categories */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>{t('common.dailyHabits')}</Text>
                    <View style={styles.essentialsContainer}>
                        {essentials.map((reminder) => {
                            const setting = settings[reminder.id];
                            const isEnabled = setting?.enabled ?? false;

                            return (
                                <React.Fragment key={reminder.id}>
                                    <ReminderCardV2
                                        reminder={reminder}
                                        setting={setting}
                                        onToggle={(enabled) => handleToggle(reminder, enabled)}
                                        onEdit={() => openEditModal(reminder)}
                                        profile={profile}
                                    />
                                    {/* Reassuring text for vitamins */}
                                    {reminder.id === 'rem_med_prenatal_vitamins' && (
                                        <TouchableOpacity onPress={() => openEditModal(reminder)}>
                                            <Text style={styles.reassuringText}>
                                                {t('common.vitaminAdjust')}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </View>
                </View>

                {/* Notification Cap Banner */}
                <NotificationCapBanner
                    settings={settings}
                    allReminders={allReminders}
                />

                {/* 3. Categories */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>{t('common.byCategory')}</Text>

                    <ReminderSection
                        sectionKey="recommended"
                        title={t('common.recommendedThisWeek')}
                        icon="✅"
                        reminders={recommendedThisWeek}
                    />

                    <ReminderSection
                        sectionKey="medical"
                        title={t('common.medicalFollowUp')}
                        icon="🩺"
                        reminders={medicalReminders}
                    />

                    <ReminderSection
                        sectionKey="wellbeing"
                        title={t('common.wellbeingFamily')}
                        icon="🌿"
                        reminders={wellbeingReminders}
                    />
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            {selectedReminder && (
                <ReminderEditModal
                    visible={editModalVisible}
                    reminder={selectedReminder}
                    setting={settings[selectedReminder.id]}
                    onClose={() => {
                        setEditModalVisible(false);
                        setSelectedReminder(null);
                    }}
                    onSave={handleModalSave}
                />
            )}
        </View>
    );
};
