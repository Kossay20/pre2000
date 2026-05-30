import { theme } from '../../theme';
/**
 * ReminderCardV2
 * 
 * A simplified reminder card with:
 * - Toggle switch
 * - Intensity controls (hidden by default, shown when enabled)
 * - "Personnaliser" button (reveals advanced options)
 */

import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Switch,
    TouchableOpacity
} from 'react-native';
import {
    ReminderDefinition,
    ReminderUserSetting,
    ContextProfile
} from '../../types/remindersV2';
import { updateReminderIntensity } from '../../services/remindersV2Service';
import { getLocalizedTrilang } from '../../utils/i18nHelpers';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';

interface ReminderCardV2Props {
    reminder: ReminderDefinition;
    setting?: ReminderUserSetting;
    onToggle: (enabled: boolean) => void;
    onEdit?: () => void; // Opens the edit modal
    profile: ContextProfile;
}

export const ReminderCardV2: React.FC<ReminderCardV2Props> = ({
    reminder,
    setting,
    onToggle,
    onEdit,
    profile,
}) => {
    const { user } = useAuth();
    const { t, i18n } = useTranslation();
    const [showPersonalize, setShowPersonalize] = useState(false);
    const [localIntensity, setLocalIntensity] = useState(
        setting?.intensity ?? reminder.intensity_options[0]
    );

    const isEnabled = setting?.enabled ?? false;

    const getFrequencyLabel = (type: string): string => {
        return t(`reminders.frequency.${type}`, type);
    };

    const frequencyLabel = getFrequencyLabel(reminder.frequency_type);

    const getLocalizedContent = (content: any) => {
        return getLocalizedTrilang(content, i18n.language);
    };

    // Handle intensity change
    const handleIntensityChange = async (newIntensity: number) => {
        setLocalIntensity(newIntensity);
        await updateReminderIntensity(reminder.id, newIntensity, user?.uid);
    };

    const formatTimes = (times: string[]): string => {
        if (!times || times.length === 0) return t('reminders.card.undefined');
        // V2.2: Include labels if set
        const timeLabels = setting?.time_labels || {};
        return times.map(t => {
            const formatted = t.replace(':', 'h');
            const label = timeLabels[t];
            return label ? `${formatted}: ${label}` : formatted;
        }).join(' • ');
    };

    // Format days for per_week display
    const formatDays = (days: number[]): string => {
        if (!days || days.length === 0) return '';
        const dayNames = t('calendar.weekDays', { returnObjects: true }) as string[];
        return days.map(d => dayNames[d % 7]).join(' • ');
    };

    // Get days to display (from setting or preset)
    const getDaysDisplay = (): string => {
        if (reminder.frequency_type !== 'per_week') return '';
        const days = setting?.days || reminder.preset_days?.[localIntensity] || [];
        if (days.length === 0) return '';
        return ` (${formatDays(days)})`;
    };

    return (
        <View style={[styles.card, !isEnabled && styles.cardCompact]}>
            {/* Main row */}
            <View style={styles.mainRow}>
                <View style={styles.iconContainer}>
                    <Text style={styles.icon}>{reminder.ui?.icon || '📌'}</Text>
                </View>
                <View style={styles.infoContainer}>
                    <Text style={styles.title}>{getLocalizedContent(reminder.title)}</Text>
                    {/* V2.1.2: Description only shown when enabled (compact mode OFF) */}
                    {isEnabled && (
                        <Text style={styles.description}>
                            {getLocalizedContent(reminder.description)}
                        </Text>
                    )}
                </View>
                <Switch
                    value={isEnabled}
                    onValueChange={onToggle}
                    trackColor={{ false: theme.colors.neutral300, true: theme.colors.accent }}
                    thumbColor={isEnabled ? theme.colors.white : theme.colors.iosGroupedBackground}
                />
            </View>

            {/* V2.1.2: Compact preview for OFF cards (1 line only) */}
            {!isEnabled && (
                <View style={styles.frequencyPreviewCompact}>
                    <Text style={styles.frequencyPreviewText}>
                        📆 {localIntensity}×/{frequencyLabel}{getDaysDisplay()}
                    </Text>
                </View>
            )}
            {/* V2.1.3: Compact controls when enabled - just summary + small edit link */}
            {isEnabled && (
                <View style={styles.controlsContainer}>
                    {/* Compact summary line */}
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryText}>
                            📆 {localIntensity}×/{frequencyLabel}{getDaysDisplay()} • {formatTimes(setting?.times || reminder.preset_times[localIntensity] || [])}
                        </Text>
                        {/* Small edit link instead of big button */}
                        {onEdit && (
                            <TouchableOpacity
                                onPress={onEdit}
                                style={styles.editLink}
                                accessibilityRole="button"
                                accessibilityLabel={t('a11y.edit')}
                            >
                                <Text style={styles.editLinkText}>⚙️</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {/* Advanced options (hidden by default) */}
            {showPersonalize && (
                <View style={styles.advancedOptions}>
                    <Text style={styles.advancedLabel}>
                        {t('reminders.card.advancedOptions')}
                    </Text>

                    {/* Days selector for per_week */}
                    {reminder.frequency_type === 'per_week' && setting?.days && (
                        <View style={styles.daysRow}>
                            <Text style={styles.daysLabel}>{t('reminders.card.daysLabel')}</Text>
                            <View style={styles.daysContainer}>
                                {(t('calendar.weekDays', { returnObjects: true }) as string[]).map((day, index) => {
                                    const dayNum = index + 1;
                                    const isActive = setting.days?.includes(dayNum);
                                    return (
                                        <View
                                            key={index}
                                            style={[
                                                styles.dayChip,
                                                isActive && styles.dayChipActive
                                            ]}
                                        >
                                            <Text style={[
                                                styles.dayChipText,
                                                isActive && styles.dayChipTextActive
                                            ]}>
                                                {day}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )}
                </View>
            )}
        </View>
    );
};

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
    card: {
        padding: 14,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
    },
    mainRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        marginEnd: 12,
    },
    icon: {
        fontSize: 28,
    },
    infoContainer: {
        flex: 1,
        marginEnd: 12,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.neutral900,
    },
    description: {
        fontSize: 13,
        color: theme.colors.neutral350,
        marginTop: 2,
        lineHeight: 18,
    },

    // Controls
    controlsContainer: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: theme.colors.borderLight,
    },
    intensityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    controlLabel: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginEnd: 10,
    },
    intensityButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    intensityButton: {
        paddingVertical: 6,
        paddingHorizontal: 14,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.accent,
        marginEnd: 8,
    },
    intensityButtonActive: {
        backgroundColor: theme.colors.accent,
    },
    intensityButtonText: {
        fontSize: 14,
        color: theme.colors.accent,
        fontWeight: '600',
    },
    intensityButtonTextActive: {
        color: theme.colors.white,
    },
    frequencyUnit: {
        fontSize: 13,
        color: theme.colors.neutral350,
    },
    frequencyInfo: {
        marginBottom: 10,
    },
    frequencyInfoText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },

    // Times preview
    timesPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
        backgroundColor: theme.colors.surface,
        padding: 10,
        borderRadius: 8,
    },
    timesLabel: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginEnd: 8,
    },
    timesValue: {
        fontSize: 14,
        color: theme.colors.neutral900,
        fontWeight: '500',
        flex: 1,
    },

    // Personnaliser
    personalizeButton: {
        paddingVertical: 8,
    },
    personalizeText: {
        fontSize: 13,
        color: theme.colors.accent,
        fontWeight: '500',
    },

    // Advanced options
    advancedOptions: {
        marginTop: 8,
        padding: 12,
        backgroundColor: theme.colors.neutral100,
        borderRadius: 8,
    },
    advancedLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: 4,
    },
    advancedHint: {
        fontSize: 12,
        color: theme.colors.neutral400,
        fontStyle: 'italic',
    },

    // Days selector
    daysRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
    },
    daysLabel: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginEnd: 8,
    },
    daysContainer: {
        flexDirection: 'row',
    },
    dayChip: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.neutral200,
        justifyContent: 'center',
        alignItems: 'center',
        marginEnd: 4,
    },
    dayChipActive: {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
    },
    dayChipText: {
        fontSize: 12,
        color: theme.colors.neutral350,
        fontWeight: '500',
    },
    dayChipTextActive: {
        color: theme.colors.white,
    },

    // Frequency preview (when card is disabled)
    frequencyPreview: {
        paddingStart: 48,
        paddingBottom: 8,
    },
    frequencyPreviewText: {
        fontSize: 13,
        color: theme.colors.neutral350,
    },

    // Edit button
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        paddingHorizontal: 16,
        marginTop: 8,
        backgroundColor: theme.colors.neutral100,
        borderRadius: 8,
    },
    editButtonText: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        fontWeight: '500',
    },

    // V2.1.2: Compact mode styles for OFF cards
    cardCompact: {
        paddingVertical: 8,
        backgroundColor: theme.colors.neutral25,
    },
    frequencyPreviewCompact: {
        paddingStart: 48,
        paddingBottom: 4,
        paddingTop: 2,
    },
    // V2.1.3: Compact summary styles for ON cards
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingStart: 48,
        paddingTop: 4,
    },
    summaryText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        flex: 1,
    },
    editLink: {
        paddingStart: 8,
    },
    editLinkText: {
        fontSize: 12,
        color: theme.colors.accent,
    },
});
