import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useAccountDeletion } from '../hooks/useAccountDeletion';
import { Button } from '../components/common/Button';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { HealthDataConsentCheck } from '../components/common/HealthDataConsentCheck';
import { recordHealthDataConsent } from '../utils/healthDataConsent';
import { useScreenAnalytics } from '../hooks/useScreenAnalytics';
import { useRtl } from '../hooks/useRtl';
import { theme } from '../theme';

/**
 * The consent question for a profile saved before onboarding asked it
 * (needsHealthDataConsent). The root navigator shows this instead of Home until she
 * answers: agreeing records the consent on her profile (server for an account, device
 * for a guest) and Home opens; declining leaves her the two ways out that do not keep
 * processing her data — erasing it through the same flow as Settings and Profile, or,
 * with an account, signing out.
 */
export const HealthDataConsentScreen = () => {
    useScreenAnalytics('HealthDataConsentScreen');
    const { t } = useTranslation();
    const { user, updateProfile, logout } = useAuth();
    const { requestDeleteAccount, requestResetProfile, busy, reauthModal } = useAccountDeletion();
    const { isRTL } = useRtl();
    const rtlText = isRTL ? ({ textAlign: 'right' as const, writingDirection: 'rtl' as const }) : null;
    const [checked, setChecked] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const accept = async () => {
        if (!checked) return;
        setSaving(true);
        setError('');
        // On success the profile carries the consent and the root navigator swaps to Home.
        const res = await updateProfile({ healthDataConsent: recordHealthDataConsent() });
        if (!res.ok) {
            setError(t('onboarding.healthConsent.saveError'));
            setSaving(false);
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <Text style={[styles.text, rtlText]}>{t('onboarding.healthConsent.sheetText')}</Text>

            <HealthDataConsentCheck checked={checked} onToggle={() => setChecked(!checked)} disabled={saving} />

            {error ? <ErrorMessage message={error} /> : null}

            <Button
                title={t('common.continue')}
                onPress={accept}
                disabled={!checked || saving}
                loading={saving}
                testID="health_consent_continue"
            />

            <View style={styles.divider} />

            <Text style={[styles.declineTitle, rtlText]}>{t('onboarding.healthConsent.declineTitle')}</Text>
            <Button
                title={user?.isGuest ? t('common.privacyData.eraseGuestData') : t('common.privacyData.deleteAccount')}
                variant="outline"
                onPress={user?.isGuest ? requestResetProfile : requestDeleteAccount}
                disabled={busy || saving}
                style={styles.declineButton}
                testID="health_consent_erase"
            />
            {/* A guest has no account to sign out of: signing out would only drop this
                device's copy, while erasing also clears what the servers hold. */}
            {!user?.isGuest && (
                <Button
                    title={t('profile.logout')}
                    variant="ghost"
                    onPress={logout}
                    disabled={busy || saving}
                    style={styles.declineButton}
                    testID="health_consent_logout"
                />
            )}
            {reauthModal}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    content: {
        padding: 20,
        paddingBottom: 40,
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
    },
    text: {
        fontSize: 16,
        lineHeight: 24,
        color: theme.colors.neutral900,
        marginBottom: 20,
    },
    divider: {
        height: 1,
        backgroundColor: theme.colors.neutral150,
        marginVertical: 24,
    },
    declineTitle: {
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
        marginBottom: 12,
    },
    declineButton: {
        marginBottom: 8,
    },
});
