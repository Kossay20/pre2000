import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { useNotificationPermissionState } from '../../hooks/useNotificationPermissionState';
import {
    ReminderSyncContext,
    acceptNotificationPrimer,
    dismissNotificationPrimer,
    isNotificationPrimerDismissed,
    shouldShowNotificationPrimer,
} from '../../services/notificationPermissionFlow';

interface NotificationPrimerCardProps {
    syncContext: ReminderSyncContext;
    /** Held back while another first-run card is on screen, so they do not stack. */
    suppressed?: boolean;
}

/**
 * One-time invitation to turn notifications on, explaining what they are for
 * before the OS dialog appears. Reminders are on by default, but nothing is
 * scheduled until permission is granted, and the background sync never asks —
 * without this, a user who never opened the Reminders tab got no reminders and
 * no sign of it.
 */
export const NotificationPrimerCard: React.FC<NotificationPrimerCardProps> = ({ syncContext, suppressed }) => {
    const { t } = useTranslation();
    const { state, refresh } = useNotificationPermissionState();
    const [dismissed, setDismissed] = useState<boolean | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let mounted = true;
        isNotificationPrimerDismissed().then((value) => { if (mounted) setDismissed(value); });
        return () => { mounted = false; };
    }, []);

    if (suppressed || !shouldShowNotificationPrimer(state, dismissed)) return null;

    const onEnable = async () => {
        setBusy(true);
        try {
            await acceptNotificationPrimer(syncContext);
        } finally {
            setDismissed(true);
            setBusy(false);
            refresh();
        }
    };

    const onLater = () => {
        setDismissed(true);
        dismissNotificationPrimer();
    };

    return (
        <View style={styles.card} testID="home_notification_primer">
            <Text style={styles.title} accessibilityRole="header">🔔 {t('home.notificationPrimer.title')}</Text>
            <Text style={styles.body}>{t('home.notificationPrimer.body')}</Text>
            <View style={styles.actions}>
                <TouchableOpacity
                    style={styles.enableButton}
                    onPress={onEnable}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.notificationPrimer.enable')}
                    accessibilityState={{ disabled: busy, busy }}
                    testID="home_notification_primer_enable"
                >
                    {busy
                        ? <ActivityIndicator color={theme.colors.white} />
                        : <Text style={styles.enableText}>{t('home.notificationPrimer.enable')}</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.laterButton}
                    onPress={onLater}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={t('home.notificationPrimer.later')}
                    testID="home_notification_primer_later"
                >
                    <Text style={styles.laterText}>{t('home.notificationPrimer.later')}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

// Same card as the first-run welcome on Home, with a secondary "later" action.
const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.surfaceBlush,
        margin: 16,
        marginBottom: 0,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: theme.colors.borderLight,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: theme.colors.text,
        marginBottom: 6,
    },
    body: {
        fontSize: 14,
        lineHeight: 20,
        color: theme.colors.textSecondary,
        marginBottom: 14,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
    },
    enableButton: {
        backgroundColor: theme.colors.accent,
        paddingVertical: 10,
        paddingHorizontal: 18,
        borderRadius: 24,
        minHeight: 44,
        justifyContent: 'center',
    },
    enableText: {
        color: theme.colors.white,
        fontSize: 14,
        fontWeight: '700',
    },
    laterButton: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        minHeight: 44,
        justifyContent: 'center',
    },
    laterText: {
        color: theme.colors.accent,
        fontSize: 14,
        fontWeight: '600',
    },
});
