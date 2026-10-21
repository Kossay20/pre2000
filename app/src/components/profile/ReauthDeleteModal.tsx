import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Modal, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '../../theme';
import { getShadowStyle } from '../../utils/styleUtils';

interface Props {
    visible: boolean;
    password: string;
    loading: boolean;
    // Differs when her data is already erased and only the account is left to delete.
    message: string;
    onChangePassword: (value: string) => void;
    onCancel: () => void;
    onConfirm: () => void;
    // Sends a password-reset email to the signed-in address; hidden when there is none.
    onForgotPassword?: () => void;
}

/**
 * Password prompt for the account-deletion reauth step on Android and web
 * (Alert.prompt is iOS-only). Rendered by useAccountDeletion's callers.
 */
export const ReauthDeleteModal = ({ visible, password, loading, message, onChangePassword, onCancel, onConfirm, onForgotPassword }: Props) => {
    const { t } = useTranslation();
    // Same show/hide control as the Login form. Hidden again each time the prompt opens.
    const [showPassword, setShowPassword] = useState(false);
    useEffect(() => {
        if (!visible) setShowPassword(false);
    }, [visible]);
    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={() => {
                if (!loading) onCancel();
            }}
        >
            <View style={styles.overlay}>
                <View style={styles.card}>
                    <Text style={styles.title}>{t('profile.reauthTitle')}</Text>
                    <Text style={styles.message}>{message}</Text>
                    <View style={styles.inputRow}>
                        <TextInput
                            style={styles.input}
                            value={password}
                            onChangeText={onChangePassword}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoFocus
                            editable={!loading}
                            // A dotted placeholder read as a password already typed in.
                            placeholder={t('passwordPlaceholder')}
                            placeholderTextColor={theme.colors.textSecondary}
                            accessibilityLabel={t('passwordPlaceholder')}
                            accessibilityHint={message}
                        />
                        <TouchableOpacity
                            style={styles.eyeButton}
                            onPress={() => setShowPassword((v) => !v)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityRole="button"
                            accessibilityLabel={showPassword ? t('hidePassword') : t('showPassword')}
                            accessibilityState={{ selected: showPassword }}
                        >
                            <Text style={styles.eyeIcon} accessibilityElementsHidden importantForAccessibility="no">{showPassword ? '🙈' : '👁'}</Text>
                        </TouchableOpacity>
                    </View>
                    {onForgotPassword && (
                        <TouchableOpacity
                            style={styles.forgotButton}
                            onPress={onForgotPassword}
                            disabled={loading}
                            accessibilityRole="link"
                            accessibilityLabel={t('forgotPassword')}
                        >
                            <Text style={styles.forgotText}>{t('forgotPassword')}</Text>
                        </TouchableOpacity>
                    )}
                    {/* The erase runs for several seconds behind this button's spinner: say so. */}
                    {loading && (
                        <Text style={styles.progressNote} accessibilityLiveRegion="polite">
                            {t('profile.deleteInProgress')}
                        </Text>
                    )}
                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => {
                                if (!loading) onCancel();
                            }}
                            disabled={loading}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.cancel')}
                        >
                            <Text style={styles.cancelText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.confirmButton, loading && styles.confirmButtonDisabled]}
                            onPress={onConfirm}
                            disabled={loading}
                            accessibilityRole="button"
                            accessibilityLabel={t('common.deleteForever')}
                        >
                            {loading ? (
                                <ActivityIndicator color={theme.colors.white} />
                            ) : (
                                <Text style={styles.confirmText}>{t('common.deleteForever')}</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

/**
 * Shown while the account (or a guest's data) is being erased: a dozen collections, then
 * the login itself, take several seconds, and until now only a greyed-out row said so.
 * It blocks the screen, so nothing can be tapped — or the screen left — half-way through.
 */
export const DeletionProgressModal = ({ visible }: { visible: boolean }) => {
    const { t } = useTranslation();
    return (
        // No onRequestClose handler on purpose: Android's back button must not dismiss it.
        <Modal visible={visible} transparent animationType="none" onRequestClose={() => {}}>
            <View
                style={styles.overlay}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={t('profile.deleteInProgress')}
                accessibilityState={{ busy: true }}
                accessibilityLiveRegion="assertive"
                testID="deletion_progress"
            >
                <View style={[styles.card, styles.progressCard]}>
                    <ActivityIndicator size="large" color={theme.colors.primaryStrong} />
                    <Text style={styles.progressText}>{t('profile.deleteInProgress')}</Text>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: theme.colors.overlay,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    card: {
        width: '100%',
        maxWidth: 420,
        backgroundColor: theme.colors.white,
        borderRadius: theme.borderRadius.l,
        padding: 20,
        ...getShadowStyle(4, theme.colors.black, 0.15, 8, { width: 0, height: 4 }),
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: 8,
    },
    message: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginBottom: 16,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.disabled,
        borderRadius: theme.borderRadius.m,
        backgroundColor: theme.colors.white,
    },
    input: {
        flex: 1,
        padding: 14,
        fontSize: 16,
    },
    eyeButton: {
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    eyeIcon: {
        fontSize: 18,
    },
    progressNote: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginTop: 12,
    },
    progressCard: {
        alignItems: 'center',
        gap: 16,
        paddingVertical: 28,
    },
    progressText: {
        fontSize: 16,
        fontWeight: '600',
        color: theme.colors.text,
        textAlign: 'center',
    },
    forgotButton: {
        alignSelf: 'flex-start',
        minHeight: 44,
        justifyContent: 'center',
        marginTop: 4,
    },
    forgotText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.primaryStrong,
        textDecorationLine: 'underline',
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        marginTop: 16,
    },
    cancelButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.m,
        backgroundColor: theme.colors.surface,
    },
    cancelText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    confirmButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: theme.borderRadius.m,
        backgroundColor: theme.colors.error,
        minWidth: 100,
        alignItems: 'center',
    },
    confirmButtonDisabled: {
        opacity: 0.7,
        backgroundColor: theme.colors.neutral300,
    },
    confirmText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.white,
    },
});
