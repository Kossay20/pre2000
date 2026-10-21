import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { useRtl } from '../../hooks/useRtl';

/**
 * The explicit consent to the processing of pregnancy/health data (utils/healthDataConsent.ts),
 * shared by onboarding's last step and the consent sheet shown to profiles saved before it
 * existed, so the question reads the same wherever it is asked.
 *
 * Unticked until she ticks it. The policy link is a separate control, not text inside the
 * checkbox: a link nested in the checkbox's label would toggle the box when tapped, and a
 * screen reader would read the two as one control.
 */
export const HealthDataConsentCheck = ({
    checked,
    onToggle,
    disabled,
}: {
    checked: boolean;
    onToggle: () => void;
    disabled?: boolean;
}) => {
    const { t } = useTranslation();
    const navigation = useNavigation<any>();
    const { isRTL } = useRtl();
    const rtlText = isRTL ? ({ textAlign: 'right' as const, writingDirection: 'rtl' as const }) : null;

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={[styles.row, checked && styles.rowChecked]}
                onPress={onToggle}
                disabled={disabled}
                accessibilityRole="checkbox"
                accessibilityLabel={t('onboarding.healthConsent.label')}
                accessibilityState={{ checked, disabled: !!disabled }}
                // react-native-web drops accessibilityState: without aria-checked the web
                // checkbox never says whether it is ticked.
                {...(Platform.OS === 'web' ? { 'aria-checked': checked } : {})}
                testID="health_consent_checkbox"
            >
                <View style={[styles.box, checked && styles.boxChecked]}>
                    {checked && <Text style={styles.mark}>{'✓'}</Text>}
                </View>
                <Text style={[styles.label, rtlText]}>{t('onboarding.healthConsent.label')}</Text>
            </TouchableOpacity>
            <Text style={[styles.hint, rtlText]}>{t('onboarding.healthConsent.hint')}</Text>
            <TouchableOpacity
                onPress={() => navigation.navigate('PrivacyPolicy')}
                accessibilityRole="link"
                accessibilityLabel={t('onboarding.healthConsent.policyLink')}
                style={styles.link}
                testID="health_consent_policy_link"
            >
                <Text style={[styles.linkText, rtlText]}>{t('onboarding.healthConsent.policyLink')}</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        marginBottom: 16,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 44,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: theme.colors.neutral150,
        backgroundColor: theme.colors.neutral25,
    },
    rowChecked: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.background,
    },
    box: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: theme.colors.neutral300,
        alignItems: 'center',
        justifyContent: 'center',
    },
    boxChecked: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primary,
    },
    mark: {
        color: theme.colors.white,
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 16,
    },
    label: {
        flex: 1,
        fontSize: 15,
        lineHeight: 21,
        color: theme.colors.neutral900,
    },
    hint: {
        fontSize: 13,
        lineHeight: 18,
        color: theme.colors.textSecondary,
        marginTop: 8,
    },
    link: {
        minHeight: 44,
        justifyContent: 'center',
        alignSelf: 'flex-start',
    },
    linkText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.accent,
        textDecorationLine: 'underline',
    },
});
