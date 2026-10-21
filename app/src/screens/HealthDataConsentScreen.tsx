import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { usePregnancy } from '../context/PregnancyContext';
import { exportUserData } from '../services/dataExportService';
import { confirmAction } from '../utils/uiUtils';
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
 * for a guest) and Home opens; declining leaves her the ways out that do not keep
 * processing her data — erasing it through the same flow as Settings and Profile, or,
 * with an account, signing out.
 *
 * Settings cannot be reached from here, so the export is offered on this screen too:
 * declining must not cost her the copy of her data she is entitled to before erasing it.
 * Erasing is the last and quietest of the choices, not the one control that stands out.
 */
export const HealthDataConsentScreen = () => {
    useScreenAnalytics('HealthDataConsentScreen');
    const { t } = useTranslation();
    const { user, updateProfile, logout } = useAuth();
    const { profile } = usePregnancy();
    const { requestDeleteAccount, requestResetProfile, busy, reauthModal } = useAccountDeletion({ exportOnThisScreen: true });
    const [exporting, setExporting] = useState(false);
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

    // Same warning and same service as Settings → "Exporter mes données".
    const exportData = () => {
        confirmAction(
            t('export.warningTitle'),
            t('export.warningMessage'),
            async () => {
                setExporting(true);
                try {
                    await exportUserData(user, profile, t);
                } finally {
                    setExporting(false);
                }
            },
            undefined,
            t('common.cancel'),
            t('common.continue'),
        );
    };

    const eraseLabel = user?.isGuest ? t('common.privacyData.eraseGuestData') : t('common.privacyData.deleteAccount');

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
                title={t('common.privacyData.export')}
                variant="outline"
                onPress={exportData}
                disabled={busy || saving}
                loading={exporting}
                style={styles.declineButton}
                testID="health_consent_export"
            />
            {/* A guest has no account to sign out of: signing out would only drop this
                device's copy, while erasing also clears what the servers hold. */}
            {!user?.isGuest && (
                <>
                    <Button
                        title={t('profile.logout')}
                        variant="ghost"
                        // Not `onPress={logout}`: the press event would be passed as its options.
                        onPress={() => { logout(); }}
                        disabled={busy || saving || exporting}
                        style={styles.declineButton}
                        testID="health_consent_logout"
                    />
                    {/* Signing out sits under "you do not want to agree?" but refuses
                        nothing: everything stays on the servers. */}
                    <Text style={[styles.note, rtlText]} testID="health_consent_logout_note">
                        {t('onboarding.healthConsent.logoutNote', { deleteLabel: eraseLabel })}
                    </Text>
                </>
            )}
            <Button
                title={eraseLabel}
                variant="ghost"
                onPress={user?.isGuest ? requestResetProfile : requestDeleteAccount}
                disabled={busy || saving || exporting}
                style={styles.declineButton}
                // Only while enabled: a disabled button keeps the muted disabled colour.
                textStyle={busy || saving || exporting ? undefined : styles.eraseText}
                testID="health_consent_erase"
            />
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
    note: {
        fontSize: 13,
        lineHeight: 19,
        color: theme.colors.textSecondary,
        marginBottom: 16,
    },
    eraseText: {
        color: theme.colors.error,
    },
});
